'use client';

import { useEffect, useState } from 'react';
import { calendarClient, type ConnectionStatus } from '@/lib/calendarClient';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';

type CalendarConnectionProps = {
    onConnectionChange?: (connected: boolean) => void;
};

export default function CalendarConnection({ onConnectionChange }: CalendarConnectionProps) {
    const { themeMode } = useThemeMode();
    const { t } = useLanguage();
    const isLight = themeMode === 'light';
    const [status, setStatus] = useState<ConnectionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadStatus = async () => {
        try {
            setLoading(true);
            setError(null);
            const connectionStatus = await calendarClient.getConnectionStatus();
            setStatus(connectionStatus);
            onConnectionChange?.(connectionStatus.connected);
        } catch (err) {
            console.error('Error loading calendar status:', err);
            setError((err as Error).message || t('calendar.failedToLoadStatus'));
            setStatus({ connected: false, syncEnabled: false });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStatus();
    }, []);

    const handleConnect = async () => {
        try {
            setConnecting(true);
            setError(null);

            // Request auth URL with popup parameter
            const { authUrl } = await calendarClient.getAuthUrl(true);

            // Open OAuth in a popup window
            const width = 500;
            const height = 600;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;

            const popup = window.open(
                authUrl,
                'Google Calendar OAuth',
                `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
            );

            if (!popup) {
                throw new Error(t('calendar.popupBlocked'));
            }

            // Listen for messages from the popup
            // Note: We don't check popup.closed because Cross-Origin-Opener-Policy blocks
            // access when the popup navigates to Google's OAuth page (different origin).
            // We rely entirely on the message listener to detect OAuth completion.
            let timeoutId: NodeJS.Timeout | null = null;
            let statusCheckDelay: NodeJS.Timeout | null = null;
            let isOAuthComplete = false;

            const messageListener = (event: MessageEvent) => {
                // Log all messages for debugging
                console.log('[CalendarConnection] Received message:', {
                    type: event.data?.type,
                    origin: event.origin,
                    expectedOrigin: window.location.origin,
                    data: event.data,
                });

                // Verify origin for security - allow same origin or localhost variations
                const frontendUrl = window.location.origin;
                const isSameOrigin = event.origin === frontendUrl;
                const isLocalhostVariant =
                    (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')) &&
                    (event.origin.includes('localhost') || event.origin.includes('127.0.0.1'));

                if (!isSameOrigin && !isLocalhostVariant) {
                    console.warn('[CalendarConnection] Message rejected - origin mismatch:', {
                        received: event.origin,
                        expected: frontendUrl,
                    });
                    return;
                }

                // Only process Google Calendar OAuth messages
                if (event.data?.type !== 'GOOGLE_CALENDAR_OAUTH_SUCCESS' &&
                    event.data?.type !== 'GOOGLE_CALENDAR_OAUTH_ERROR') {
                    return;
                }

                // Mark OAuth as complete and clean up
                isOAuthComplete = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                if (statusCheckDelay) {
                    clearTimeout(statusCheckDelay);
                    statusCheckDelay = null;
                }
                window.removeEventListener('message', messageListener);

                if (event.data.type === 'GOOGLE_CALENDAR_OAUTH_SUCCESS') {
                    console.log('[CalendarConnection] OAuth success - closing popup and reloading status');
                    // Try to close popup, but don't fail if COOP blocks access
                    try {
                        if (popup) {
                            popup.close();
                        }
                    } catch (e) {
                        // Ignore errors - popup might already be closed or COOP might block access
                        // The popup will close itself via the backend's setTimeout
                    }
                    setConnecting(false);
                    // Reload connection status
                    loadStatus();
                } else if (event.data.type === 'GOOGLE_CALENDAR_OAUTH_ERROR') {
                    console.error('[CalendarConnection] OAuth error:', event.data);
                    // Try to close popup, but don't fail if COOP blocks access
                    try {
                        if (popup) {
                            popup.close();
                        }
                    } catch (e) {
                        // Ignore errors - popup might already be closed or COOP might block access
                        // The popup will close itself via the backend's setTimeout
                    }
                    setConnecting(false);
                    setError(event.data.message || event.data.error || t('calendar.failedToConnect'));
                }
            };

            window.addEventListener('message', messageListener);

            // Add a fallback check: poll connection status after a delay
            // This handles cases where the message isn't received due to origin issues
            statusCheckDelay = setTimeout(async () => {
                if (!isOAuthComplete) {
                    console.log('[CalendarConnection] Checking connection status as fallback...');
                    try {
                        const status = await calendarClient.getConnectionStatus();
                        if (status.connected) {
                            // Connection succeeded but message wasn't received
                            console.log('[CalendarConnection] Connection successful (detected via status check)');
                            isOAuthComplete = true;
                            if (timeoutId) {
                                clearTimeout(timeoutId);
                                timeoutId = null;
                            }
                            window.removeEventListener('message', messageListener);
                            setConnecting(false);
                            loadStatus();
                        }
                    } catch (err) {
                        // Status check failed - connection probably didn't succeed
                        console.warn('[CalendarConnection] Status check failed:', err);
                    }
                }
            }, 3000); // Check after 3 seconds

            // Add timeout to handle case where user closes popup without completing OAuth
            // This prevents the connecting state from being stuck indefinitely
            timeoutId = setTimeout(() => {
                if (!isOAuthComplete) {
                    // OAuth didn't complete within timeout - user likely closed the popup
                    if (statusCheckDelay) {
                        clearTimeout(statusCheckDelay);
                    }
                    window.removeEventListener('message', messageListener);
                    setConnecting(false);
                    setError(t('calendar.connectionTimedOut'));
                }
            }, 5 * 60 * 1000); // 5 minutes max

        } catch (err) {
            console.error('Error initiating connection:', err);
            setError((err as Error).message || t('calendar.failedToConnect'));
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm(t('calendar.disconnectConfirm'))) {
            return;
        }

        try {
            setLoading(true);
            setError(null);
            await calendarClient.disconnect();
            await loadStatus();
        } catch (err) {
            console.error('Error disconnecting:', err);
            setError((err as Error).message || t('calendar.failedToDisconnect'));
        } finally {
            setLoading(false);
        }
    };

    // Check for OAuth callback
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const connected = urlParams.get('connected');
        const error = urlParams.get('error');

        if (connected === 'true') {
            // Success - remove query params and reload status
            window.history.replaceState({}, '', window.location.pathname);
            loadStatus();
        } else if (error) {
            // Error - show error message
            setError(decodeURIComponent(error));
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    if (loading && !status) {
        return (
            <div
                className={`rounded-2xl border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${isLight ? 'border-slate-500' : 'border-emerald-500'}`}></div>
                    <span className={`text-sm ${isLight ? 'text-slate-600' : 'text-white/70'}`}>{t('calendar.loadingConnectionStatus')}</span>
                </div>
            </div>
        );
    }

    const isConnected = status?.connected ?? false;

    return (
        <div
            className={`rounded-2xl border p-4 ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <svg
                        className={`w-5 h-5 ${isConnected ? 'text-emerald-400' : isLight ? 'text-slate-500' : 'text-white/60'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                    </svg>
                    <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {t('calendar.googleCalendar')}
                    </h3>
                </div>
                <div
                    className={`px-2 py-1 rounded-full text-xs font-medium ${isConnected
                        ? isLight
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-emerald-500/20 text-emerald-200'
                        : isLight
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-white/10 text-white/60'
                        }`}
                >
                    {isConnected ? t('calendar.connected') : t('calendar.notConnected')}
                </div>
            </div>

            {error && (
                <div
                    className={`mb-3 rounded-xl border px-3 py-2 text-xs space-y-2 ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                        }`}
                >
                    <p className="font-semibold">⚠️ {t('calendar.connectionError')}</p>
                    {error.includes('redirect_uri_mismatch') || error.toLowerCase().includes('redirect') ? (
                        <div className="space-y-2 mt-2">
                            <p className="font-medium">{t('calendar.redirectUriMismatch')}</p>
                            <p className="text-[11px] opacity-90">
                                {t('calendar.redirectUriDescription')}
                            </p>
                            <div className="bg-black/10 p-2 rounded text-[10px] font-mono break-all">
                                {error.includes('http')
                                    ? error.split('redirect_uri_mismatch: Please add ')[1]?.split(' to Google Cloud Console')[0] || 'Check backend logs'
                                    : 'http://localhost:3001/api/calendar/callback'
                                }
                            </div>
                            <div className="text-[10px] space-y-1 opacity-90">
                                <p><strong>{t('calendar.stepsToFix')}</strong></p>
                                <ol className="list-decimal list-inside space-y-0.5 ml-2">
                                    <li>{t('calendar.goToGoogleConsole')} <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                                    <li>{t('calendar.selectYourProject')}</li>
                                    <li>{t('calendar.apisServicesCredentials')}</li>
                                    <li>{t('calendar.clickOAuthClient')}</li>
                                    <li>{t('calendar.authorizedRedirectUris')}</li>
                                    <li>{t('calendar.pasteUri')}</li>
                                    <li>{t('calendar.clickSave')}</li>
                                </ol>
                            </div>
                            <p className="text-[10px] opacity-75 mt-2">
                                {t('calendar.noteLoginPage')}
                            </p>
                        </div>
                    ) : (
                        <p>{error}</p>
                    )}
                </div>
            )}

            {isConnected ? (
                <div className="space-y-3">
                    <div className={`text-xs ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                        {status?.lastSyncAt ? (
                            <p>
                                {t('calendar.lastSynced')}: {new Date(status.lastSyncAt).toLocaleString()}
                            </p>
                        ) : (
                            <p>{t('calendar.connectedAndReady')}</p>
                        )}
                        {status?.needsRefresh && (
                            <p className={`mt-1 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                                {t('calendar.tokenNeedsRefresh')}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleDisconnect}
                        disabled={loading}
                        className={`w-full rounded-xl border px-3 py-2 text-sm font-medium transition ${isLight
                            ? 'border-slate-200 text-slate-700 hover:bg-slate-50'
                            : 'border-white/20 text-white/80 hover:bg-white/10'
                            } disabled:opacity-50`}
                    >
                        {loading ? t('calendar.disconnecting') : t('calendar.disconnect')}
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                        {t('calendar.connectDescription')}
                    </p>
                    <button
                        onClick={handleConnect}
                        disabled={connecting || loading}
                        className={`w-full rounded-xl bg-[linear-gradient(135deg,_#10b981,_#059669)] text-white font-semibold px-4 py-2 text-sm shadow-[0_10px_20px_rgba(16,185,129,0.35)] hover:brightness-105 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                    >
                        {connecting ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>{t('calendar.connecting')}</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" viewBox="0 0 48 48">
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.91-6.91C35.9 2.16 30.47 0 24 0 14.62 0 6.43 5.38 2.58 13.22l8.04 6.24C12.57 13.28 17.78 9.5 24 9.5z" />
                                    <path fill="#34A853" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9.04h12.7c-.55 2.92-2.18 5.39-4.65 7.04l7.24 5.62C43.44 37.04 46.5 31.28 46.5 24.5z" />
                                    <path fill="#4A90E2" d="M13.54 28.46a9.46 9.46 0 010-8.92l-8.04-6.32C2.05 15.21 0 19.35 0 24s2.05 8.79 5.5 11.78l8.04-6.32z" />
                                    <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.93-5.76l-7.24-5.62C30.67 38.7 27.54 39.5 24 39.5c-6.22 0-11.43-3.78-13.38-9.96l-8.04 6.24C6.43 42.62 14.62 48 24 48z" />
                                </svg>
                                <span>{t('calendar.connectGoogleCalendar')}</span>
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}

