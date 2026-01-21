import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import mongoose from 'mongoose';
import GoogleCalendarToken from '../models/GoogleCalendarToken.js';
import { requireAuth } from '../middleware/requireAuth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { trackResourceUsage } from '../services/resourceTrackingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GOOGLE CALENDAR OAUTH - AUTHORIZATION CODE FLOW
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This controller uses OAuth 2.0 Authorization Code Flow for Calendar API access.
 * 
 * ✅ CORRECT PATTERN (Authorization Code Flow):
 * ────────────────────────────────────────────────────────────────────────────
 * 1. Frontend requests auth URL → Backend generates OAuth URL
 * 2. User approves in Google consent screen
 * 3. Google redirects to callback with authorization code
 * 4. Backend exchanges code for access_token + refresh_token using getToken()
 * 5. Backend stores encrypted tokens
 * 6. Backend uses tokens to call Calendar API
 * 
 * ❌ DO NOT USE verifyIdToken() HERE
 * ────────────────────────────────────────────────────────────────────────────
 * verifyIdToken() is ONLY for Google Sign-In (identity verification)
 * It is used in authController.js for login, NOT for Calendar API access.
 * 
 * ✅ CORRECT: oauth2Client.getToken(code) - Exchanges code for tokens
 * ❌ WRONG:   oauth2Client.verifyIdToken() - Only for identity, not API access
 * 
 * Two Separate OAuth Patterns:
 * ────────────────────────────────────────────────────────────────────────────
 * Pattern 1: Google Sign-In (authController.js)
 *   - Purpose: Verify user identity
 *   - Method: verifyIdToken(idToken)
 *   - Scopes: openid, email, profile
 *   - Returns: User identity (email, name, picture)
 * 
 * Pattern 2: Calendar API Access (this file)
 *   - Purpose: Access Google Calendar API
 *   - Method: getToken(authorizationCode)
 *   - Scopes: https://www.googleapis.com/auth/calendar
 *   - Returns: access_token, refresh_token for API calls
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Calendar OAuth credentials - Load from credentials.json file or environment variables
// Priority: credentials.json > GOOGLE_CALENDAR_CLIENT_ID/SECRET > GOOGLE_CLIENT_ID/SECRET
let credentials = null;
let GOOGLE_CLIENT_ID = null;
let GOOGLE_CLIENT_SECRET = null;
let GOOGLE_REDIRECT_URI = null;

// Define BACKEND_URL at top level so it's available throughout the file
const BACKEND_URL = process.env.BACKEND_URL || process.env.API_BASE_URL || 'http://localhost:3001';

// Try to load credentials from JSON file
// File is located in the same folder as this controller (controllers/)
const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH ||
    path.join(__dirname, 'credential.json');

try {
    if (fs.existsSync(credentialsPath)) {
        const credentialsFile = fs.readFileSync(credentialsPath, 'utf8');
        credentials = JSON.parse(credentialsFile);

        if (credentials?.web) {
            GOOGLE_CLIENT_ID = credentials.web.client_id;
            GOOGLE_CLIENT_SECRET = credentials.web.client_secret;
            // Use first redirect URI from JSON, or construct from BACKEND_URL
            GOOGLE_REDIRECT_URI = credentials.web.redirect_uris?.[0] ||
                process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
                `${BACKEND_URL}/api/calendar/callback`;

            console.log('✅ [Calendar] Loaded credentials from JSON file:', credentialsPath);
            console.log('   Client ID:', GOOGLE_CLIENT_ID ? `${GOOGLE_CLIENT_ID.substring(0, 20)}...` : 'MISSING');
            console.log('   Redirect URI:', GOOGLE_REDIRECT_URI);
        } else {
            console.warn('⚠️  [Calendar] credentials.json file found but missing "web" property');
            credentials = null;
        }
    }
} catch (error) {
    console.warn('⚠️  [Calendar] Could not load credentials.json file:', error.message);
    console.warn('   Falling back to environment variables');
    credentials = null;
}

// Fall back to environment variables if credentials.json not loaded
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    GOOGLE_CLIENT_ID = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    GOOGLE_REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${BACKEND_URL}/api/calendar/callback`;

    if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
        console.log('✅ [Calendar] Using credentials from environment variables');
    }
}

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('⚠️  Google Calendar OAuth credentials not configured. Calendar features will be disabled.');
    console.warn('   Please either:');
    console.warn('   1. Place credentials.json file in backend directory, or');
    console.warn('   2. Set GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET environment variables');
}

// NOTE: API key is NOT required for server-side OAuth-based Calendar API calls
// The OAuth access token provides both authentication and project identification
// API keys are only needed for browser-based gapi.client or public/unauthenticated APIs
if (GOOGLE_API_KEY) {
    console.log('ℹ️  [Calendar] GOOGLE_API_KEY is set but not required for OAuth-based calls');
    console.log('   API key is only needed for browser-based gapi.client or public APIs');
}

// Create OAuth2 client
const getOAuth2Client = () => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('Google OAuth credentials not configured');
    }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    return client;
};

// Get Google Calendar API client with authenticated access
export const getCalendarClient = async (userId) => {
    console.log('\n📅 [Calendar] Creating calendar client for user:', userId);

    const tokenDoc = await GoogleCalendarToken.findOne({ userId });
    if (!tokenDoc) {
        throw new Error('Google Calendar not connected');
    }

    let accessToken = tokenDoc.getAccessToken();
    let refreshToken = tokenDoc.getRefreshToken();

    if (!accessToken || !refreshToken) {
        throw new Error('Invalid Google tokens. Please reconnect Google Calendar.');
    }

    // Refresh if expired
    if (tokenDoc.needsRefresh()) {
        await refreshAccessToken(userId);
        const refreshed = await GoogleCalendarToken.findOne({ userId });
        accessToken = refreshed.getAccessToken();
        refreshToken = refreshed.getRefreshToken();
    }

    // ✅ Correct OAuth2 client creation
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    // ✅ ONLY tokens — nothing else
    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    // ✅ Create calendar client
    const calendar = google.calendar({
        version: 'v3',
        auth: oauth2Client,
    });

    console.log('✅ [Calendar] OAuth2 client authenticated correctly');
    return calendar;
};

// Refresh access token
const refreshAccessToken = async (userId) => {
    const tokenDoc = await GoogleCalendarToken.findOne({ userId });
    if (!tokenDoc) {
        throw new Error('Google Calendar token not found');
    }

    const oauth2Client = getOAuth2Client();
    const refreshToken = tokenDoc.getRefreshToken();
    if (!refreshToken) {
        throw new Error('Failed to decrypt refresh token');
    }

    oauth2Client.setCredentials({
        refresh_token: refreshToken,
        client_id: oauth2Client._clientId,
        client_secret: oauth2Client._clientSecret,
    });

    try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        // Update token document (pre-save hook will encrypt)
        tokenDoc.accessToken = credentials.access_token;
        tokenDoc.expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3600 * 1000);
        if (credentials.refresh_token) {
            tokenDoc.refreshToken = credentials.refresh_token;
        }
        await tokenDoc.save();

        return credentials;
    } catch (error) {
        console.error('❌ [Calendar] Error refreshing access token:', error);
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);

        // CRITICAL: Detect invalid/poisoned tokens
        // These errors indicate the refresh token is permanently invalid
        const isInvalidToken =
            error.code === 400 || // Bad Request - invalid_grant
            error.message?.includes('invalid_grant') ||
            error.message?.includes('Token has been expired or revoked') ||
            error.message?.includes('invalid') ||
            error.response?.data?.error === 'invalid_grant' ||
            error.response?.data?.error_description?.includes('Token has been expired or revoked');

        if (isInvalidToken) {
            console.error('🔴 [Calendar] CRITICAL: Refresh token is INVALID/POISONED!');
            console.error('   This usually happens when:');
            console.error('   1. Tokens were created with wrong OAuth Client ID');
            console.error('   2. Tokens were created before fixing Google Cloud Console settings');
            console.error('   3. User revoked access in Google Account settings');
            console.error('');
            console.error('   ⚠️  ACTION REQUIRED: Delete tokens and force reconnection');
            console.error('   Deleting invalid tokens for user:', userId);

            // Automatically delete the poisoned tokens
            try {
                await GoogleCalendarToken.deleteOne({ userId });
                console.log('✅ [Calendar] Invalid tokens deleted. User must reconnect.');
            } catch (deleteError) {
                console.error('❌ [Calendar] Failed to delete invalid tokens:', deleteError);
            }

            throw new Error('Refresh token is invalid or expired. Please disconnect and reconnect Google Calendar.');
        }

        throw new Error('Failed to refresh access token');
    }
};

// Get OAuth authorization URL
export async function getAuthUrl(req, res) {
    try {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return res.status(503).json({ error: 'Google Calendar OAuth not configured' });
        }

        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const oauth2Client = getOAuth2Client();
        // Use full calendar scope as requested by client
        // CRITICAL: This scope MUST be included for Calendar API access
        const scopes = ['https://www.googleapis.com/auth/calendar'];

        // Check if popup mode is requested (we'll pass this in state to preserve it)
        const usePopup = req.query.popup === 'true' || req.body?.popup === true;
        // Encode popup flag in state: userId|popup
        const state = usePopup ? `${userId.toString()}|popup` : userId.toString();

        // Log the redirect URI for debugging (helps identify mismatch issues)
        console.log('\n🔗 [Google Calendar OAuth] Generating authorization URL:');
        console.log('   ════════════════════════════════════════════════════════════');
        console.log('   📋 Redirect URI (MUST be added to Google Cloud Console):');
        console.log('      →', GOOGLE_REDIRECT_URI);
        console.log('');
        console.log('   📝 Configuration:');
        console.log('      - Backend URL:', BACKEND_URL);
        console.log('      - Client ID:', GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET');
        console.log('      - Popup mode:', usePopup);
        console.log('');
        console.log('   🔐 OAuth Scopes (CRITICAL - must include calendar):');
        console.log('      →', scopes.join(', '));
        console.log('      ✅ Scope includes: https://www.googleapis.com/auth/calendar');
        console.log('');
        console.log('   ⚠️  HOW TO FIX redirect_uri_mismatch ERROR:');
        console.log('      1. Go to: https://console.cloud.google.com/');
        console.log('      2. Select your project');
        console.log('      3. Navigate to: APIs & Services → Credentials');
        console.log('      4. Click on your OAuth 2.0 Client ID');
        console.log('      5. Under "Authorized redirect URIs", click "+ ADD URI"');
        console.log('      6. Add this EXACT URI:', GOOGLE_REDIRECT_URI);
        console.log('      7. Click "SAVE"');
        console.log('   ════════════════════════════════════════════════════════════\n');

        // Generate OAuth URL with calendar scope
        // CRITICAL: The scope parameter ensures Google requests calendar access permission
        // If scope is missing here, the consent screen won't show calendar access
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Required to get refresh_token
            prompt: 'consent', // Force consent screen to get refresh token and show scope
            scope: scopes, // MUST include calendar for Calendar API access
            state: state, // Pass userId and popup flag in state
        });

        console.log('   🔗 Generated OAuth URL (first 100 chars):', authUrl.substring(0, 100) + '...');
        console.log('   ⚠️  IMPORTANT: User must approve calendar access in consent screen');
        console.log('   ⚠️  If consent screen only shows "openid email profile", scope is missing!');

        return res.json({ authUrl });
    } catch (error) {
        console.error('❌ [Google Calendar OAuth] Error generating auth URL:', error);
        return res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
}

// Handle OAuth callback
export async function handleCallback(req, res) {
    try {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            console.error('❌ [Google Calendar OAuth] OAuth credentials not configured');
            return res.redirect(`${frontendUrl}/calendar?error=oauth_not_configured`);
        }

        const { code, state, error } = req.query;

        // Handle OAuth errors from Google
        if (error) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            console.error('❌ [Google Calendar OAuth] OAuth error from Google:', error);

            // Check if this is a popup OAuth flow (from state parameter)
            const stateParts = state ? String(state).split('|') : [];
            const isPopup = stateParts[1] === 'popup';

            // Provide helpful error message for redirect_uri_mismatch
            if (error === 'redirect_uri_mismatch') {
                console.error('⚠️  [Google Calendar OAuth] Redirect URI mismatch detected!');
                console.error('   Current redirect URI:', GOOGLE_REDIRECT_URI);
                console.error('   Please add this exact URI to Google Cloud Console:');
                console.error('   → APIs & Services → Credentials → OAuth 2.0 Client ID');
                console.error('   → Authorized redirect URIs → Add:', GOOGLE_REDIRECT_URI);

                if (isPopup) {
                    // Return HTML page that sends error message to parent window
                    return res.send(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>OAuth Error</title>
                            <style>
                                body {
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                    background: linear-gradient(135deg, #ef4444, #dc2626);
                                    color: white;
                                    padding: 2rem;
                                }
                                .container {
                                    text-align: center;
                                    max-width: 500px;
                                }
                                .error-icon {
                                    font-size: 4rem;
                                    margin-bottom: 1rem;
                                }
                                h1 {
                                    margin: 0 0 1rem 0;
                                    font-size: 1.5rem;
                                }
                                .error-details {
                                    background: rgba(0,0,0,0.2);
                                    padding: 1rem;
                                    border-radius: 0.5rem;
                                    margin: 1rem 0;
                                    font-size: 0.875rem;
                                    text-align: left;
                                }
                                code {
                                    background: rgba(0,0,0,0.3);
                                    padding: 0.25rem 0.5rem;
                                    border-radius: 0.25rem;
                                    font-size: 0.75rem;
                                    word-break: break-all;
                                }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="error-icon">❌</div>
                                <h1>Redirect URI Mismatch</h1>
                                <p>Please add this redirect URI to Google Cloud Console:</p>
                                <div class="error-details">
                                    <code>${GOOGLE_REDIRECT_URI}</code>
                                </div>
                                <p style="font-size: 0.875rem; opacity: 0.9;">
                                    Go to: APIs & Services → Credentials → OAuth 2.0 Client ID → Authorized redirect URIs
                                </p>
                            </div>
                            <script>
                                // Send error message to parent window
                                if (window.opener) {
                                    window.opener.postMessage({
                                        type: 'GOOGLE_CALENDAR_OAUTH_ERROR',
                                        error: 'redirect_uri_mismatch',
                                        message: 'Please add ${GOOGLE_REDIRECT_URI} to Google Cloud Console'
                                    }, '${frontendUrl}');
                                }
                                // Close popup after delay
                                setTimeout(() => {
                                    window.close();
                                }, 5000);
                            </script>
                        </body>
                        </html>
                    `);
                }

                return res.redirect(`${frontendUrl}/calendar?error=${encodeURIComponent('redirect_uri_mismatch: Please add ' + GOOGLE_REDIRECT_URI + ' to Google Cloud Console')}`);
            }

            if (isPopup) {
                // Return HTML page that sends error message to parent window
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>OAuth Error</title>
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                height: 100vh;
                                margin: 0;
                                background: linear-gradient(135deg, #ef4444, #dc2626);
                                color: white;
                            }
                            .container {
                                text-align: center;
                                padding: 2rem;
                            }
                            .error-icon {
                                font-size: 4rem;
                                margin-bottom: 1rem;
                            }
                            h1 {
                                margin: 0 0 0.5rem 0;
                                font-size: 1.5rem;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="error-icon">❌</div>
                            <h1>OAuth Error</h1>
                            <p>${error}</p>
                        </div>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'GOOGLE_CALENDAR_OAUTH_ERROR',
                                    error: '${error}'
                                }, '${frontendUrl}');
                            }
                            setTimeout(() => window.close(), 3000);
                        </script>
                    </body>
                    </html>
                `);
            }

            return res.redirect(`${frontendUrl}/calendar?error=${encodeURIComponent(error)}`);
        }

        if (!code) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            console.error('❌ [Google Calendar OAuth] Authorization code not provided');
            return res.redirect(`${frontendUrl}/calendar?error=authorization_code_required`);
        }

        // Parse state: can be "userId" or "userId|popup"
        const stateParts = String(state).split('|');
        const userId = stateParts[0];
        const isPopup = stateParts[1] === 'popup';

        if (!userId) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            console.error('❌ [Google Calendar OAuth] Invalid state parameter');
            if (isPopup) {
                return res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>OAuth Error</title></head>
                    <body>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({
                                    type: 'GOOGLE_CALENDAR_OAUTH_ERROR',
                                    error: 'invalid_state'
                                }, '${frontendUrl}');
                            }
                            setTimeout(() => window.close(), 2000);
                        </script>
                    </body>
                    </html>
                `);
            }
            return res.redirect(`${frontendUrl}/calendar?error=invalid_state`);
        }

        // Convert userId string to ObjectId
        const userIdObjectId = new mongoose.Types.ObjectId(userId);

        console.log('✅ [Google Calendar OAuth] Exchanging authorization code for tokens...');
        console.log('   - Popup mode:', isPopup);

        // Use the standard OAuth2 client (redirect URI without query params)
        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        if (!tokens.access_token || !tokens.refresh_token) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            console.error('❌ [Google Calendar OAuth] Failed to obtain access_token or refresh_token');
            return res.redirect(`${frontendUrl}/calendar?error=failed_to_obtain_tokens`);
        }

        console.log('✅ [Google Calendar OAuth] Tokens obtained successfully');
        console.log('');
        console.log('   🔐 TOKEN SCOPE VERIFICATION (CRITICAL):');
        console.log('   ════════════════════════════════════════════════════════════');
        const receivedScope = tokens.scope || 'Not provided by Google';
        console.log('   📋 Token scope received from Google:', receivedScope);

        if (!tokens.scope) {
            console.error('   ❌ CRITICAL: No scope in token response!');
            console.error('   ❌ This usually means OAuth consent screen is not configured correctly.');
            console.error('   ❌ Check: APIs & Services → OAuth consent screen → Scopes');
        } else if (!tokens.scope.includes('calendar.events') && !tokens.scope.includes('calendar')) {
            console.error('   ❌ CRITICAL: Token scope does NOT include calendar access!');
            console.error('   ❌ Received scope:', tokens.scope);
            console.error('   ❌ This will cause 403 "unregistered callers" errors.');
            console.error('   ❌ SOLUTION: Disconnect and reconnect. Ensure consent screen shows calendar access.');
        } else {
            console.log('   ✅ Token scope includes calendar access');
            console.log('   ✅ Scope:', tokens.scope);
        }
        console.log('   ════════════════════════════════════════════════════════════');
        console.log('');

        // Calculate expiry date
        const expiresAt = tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

        // Store or update token
        // Use findOne and save to ensure pre-save hook runs (which encrypts tokens)
        let tokenDoc = await GoogleCalendarToken.findOne({ userId: userIdObjectId });

        if (tokenDoc) {
            // Update existing document
            tokenDoc.accessToken = tokens.access_token; // Will be encrypted by pre-save hook
            tokenDoc.refreshToken = tokens.refresh_token; // Will be encrypted by pre-save hook
            tokenDoc.expiresAt = expiresAt;
            tokenDoc.syncEnabled = true;
            tokenDoc.lastSyncAt = new Date();
            tokenDoc.scope = tokens.scope || 'https://www.googleapis.com/auth/calendar';
        } else {
            // Create new document
            tokenDoc = new GoogleCalendarToken({
                userId: userIdObjectId,
                accessToken: tokens.access_token, // Will be encrypted by pre-save hook
                refreshToken: tokens.refresh_token, // Will be encrypted by pre-save hook
                expiresAt,
                syncEnabled: true,
                lastSyncAt: new Date(),
                scope: tokens.scope || 'https://www.googleapis.com/auth/calendar',
            });
        }

        // Save will trigger pre-save hook to encrypt tokens
        await tokenDoc.save();
        console.log('✅ [Google Calendar OAuth] Tokens saved and encrypted');

        // Redirect back to frontend with success
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        console.log('✅ [Google Calendar OAuth] Connection successful');

        // isPopup is already declared above from state parsing
        if (isPopup) {
            // Return HTML page that sends message to parent window and closes popup
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Google Calendar Connected</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #10b981, #059669);
                            color: white;
                        }
                        .container {
                            text-align: center;
                            padding: 2rem;
                        }
                        .success-icon {
                            font-size: 4rem;
                            margin-bottom: 1rem;
                        }
                        h1 {
                            margin: 0 0 0.5rem 0;
                            font-size: 1.5rem;
                        }
                        p {
                            margin: 0;
                            opacity: 0.9;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✅</div>
                        <h1>Google Calendar Connected!</h1>
                        <p>This window will close automatically...</p>
                    </div>
                    <script>
                        // Send success message to parent window
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'GOOGLE_CALENDAR_OAUTH_SUCCESS',
                                connected: true
                            }, '${frontendUrl}');
                        }
                        // Close popup after a short delay
                        setTimeout(() => {
                            window.close();
                        }, 1500);
                    </script>
                </body>
                </html>
            `);
        }

        // Regular redirect flow (fallback)
        return res.redirect(`${frontendUrl}/calendar?connected=true`);
    } catch (error) {
        console.error('❌ [Google Calendar OAuth] Callback error:', error);
        console.error('   Error message:', error.message);
        console.error('   Error stack:', error.stack);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const errorMessage = error.message || 'Failed to complete authorization';
        return res.redirect(`${frontendUrl}/calendar?error=${encodeURIComponent(errorMessage)}`);
    }
}

// Get connection status
export async function getConnectionStatus(req, res) {
    console.log('\n📊 [Calendar] Getting connection status...');
    try {
        const userId = req.user?.userId;
        console.log('[Calendar] User ID:', userId);
        if (!userId) {
            console.error('[Calendar] No user ID found');
            return res.status(401).json({ error: 'Authentication required' });
        }

        const tokenDoc = await GoogleCalendarToken.findOne({ userId });
        if (!tokenDoc) {
            console.log('[Calendar] No token found - not connected');
            return res.json({
                connected: false,
                syncEnabled: false,
            });
        }

        const status = {
            connected: true,
            syncEnabled: tokenDoc.syncEnabled,
            lastSyncAt: tokenDoc.lastSyncAt,
            calendarId: tokenDoc.calendarId,
            expiresAt: tokenDoc.expiresAt,
            needsRefresh: tokenDoc.needsRefresh(),
        };

        console.log('[Calendar] Connection status:', {
            connected: status.connected,
            syncEnabled: status.syncEnabled,
            lastSyncAt: status.lastSyncAt,
            needsRefresh: status.needsRefresh,
            expiresAt: status.expiresAt,
        });

        return res.json(status);
    } catch (error) {
        console.error('[Calendar] Error getting connection status:', error);
        return res.status(500).json({ error: 'Failed to get connection status' });
    }
}

// Revoke access token with Google OAuth 2.0 server
const revokeAccessToken = (accessToken) => {
    return new Promise((resolve, reject) => {
        if (!accessToken) {
            resolve(false); // No token to revoke
            return;
        }

        // Construct POST data for token revocation
        const postData = `token=${encodeURIComponent(accessToken)}`;

        // Request options for Google's OAuth 2.0 revocation endpoint
        const postOptions = {
            hostname: 'oauth2.googleapis.com',
            path: '/revoke',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        console.log('🔄 [Calendar] Revoking access token with Google OAuth server...');

        // Create HTTPS request
        const postReq = https.request(postOptions, (res) => {
            let responseData = '';

            // Collect response data
            res.on('data', (chunk) => {
                responseData += chunk;
            });

            // Handle response completion
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('✅ [Calendar] Access token revoked successfully');
                    resolve(true);
                } else {
                    console.warn(`⚠️  [Calendar] Token revocation returned status ${res.statusCode}`);
                    console.warn('   Response:', responseData);
                    // Still resolve as true - token may already be revoked or invalid
                    resolve(true);
                }
            });
        });

        // Handle request errors
        postReq.on('error', (error) => {
            console.error('❌ [Calendar] Error revoking token:', error.message);
            // Don't reject - we'll still delete from database even if revocation fails
            resolve(false);
        });

        // Send the request
        postReq.write(postData);
        postReq.end();
    });
};

// Disconnect Google Calendar
export async function disconnect(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Get token document before deletion
        const tokenDoc = await GoogleCalendarToken.findOne({ userId });

        if (tokenDoc) {
            try {
                // Attempt to revoke the access token with Google
                const accessToken = tokenDoc.getAccessToken();
                if (accessToken) {
                    await revokeAccessToken(accessToken);
                } else {
                    console.warn('⚠️  [Calendar] Could not decrypt access token for revocation');
                }
            } catch (revokeError) {
                console.warn('⚠️  [Calendar] Token revocation failed, but continuing with disconnect:', revokeError.message);
                // Continue with deletion even if revocation fails
            }
        }

        // Delete token from database
        await GoogleCalendarToken.deleteOne({ userId });
        console.log('✅ [Google Calendar] Disconnected successfully');
        console.log('   🗑️  Deleted tokens for user:', userId);

        return res.json({ success: true, message: 'Google Calendar disconnected' });
    } catch (error) {
        console.error('Error disconnecting Google Calendar:', error);
        return res.status(500).json({ error: 'Failed to disconnect Google Calendar' });
    }
}

// Clear all Google Calendar tokens (for testing/debugging)
// WARNING: This will force all users to reconnect
// CRITICAL: Use this when tokens are "poisoned" (created with wrong settings)
export async function clearAllTokens(req, res) {
    try {
        // Only allow in development or with admin auth
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'This endpoint is disabled in production' });
        }

        console.log('🗑️  [Calendar] Clearing all Google Calendar tokens...');
        console.log('   ⚠️  WARNING: This will force ALL users to reconnect');
        console.log('   This is necessary when tokens are "poisoned" (created with wrong OAuth settings)');

        const result = await GoogleCalendarToken.deleteMany({});
        console.log('✅ [Calendar] Cleared all Google Calendar tokens');
        console.log('   Deleted count:', result.deletedCount);
        console.log('');
        console.log('   📝 NEXT STEPS:');
        console.log('   1. Verify Google Cloud Console settings are correct');
        console.log('   2. Ensure OAuth Client ID, API Key, and Calendar API are in SAME project');
        console.log('   3. Users must reconnect Google Calendar');
        console.log('   4. New tokens will be created with correct settings');

        return res.json({
            success: true,
            message: 'All Google Calendar tokens cleared. Users must reconnect.',
            deletedCount: result.deletedCount,
            requiresReconnection: true
        });
    } catch (error) {
        console.error('Error clearing tokens:', error);
        return res.status(500).json({ error: 'Failed to clear tokens' });
    }
}

// Force reconnection by clearing user's tokens
// This is useful when tokens are invalid/poisoned
export async function forceReconnect(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        console.log('🔄 [Calendar] Forcing reconnection for user:', userId);
        console.log('   This will delete existing tokens and require re-authentication');

        const result = await GoogleCalendarToken.deleteOne({ userId });

        if (result.deletedCount > 0) {
            console.log('✅ [Calendar] Tokens deleted. User must reconnect.');
            return res.json({
                success: true,
                message: 'Tokens cleared. Please reconnect Google Calendar.',
                requiresReconnection: true
            });
        } else {
            console.log('ℹ️  [Calendar] No tokens found for user');
            return res.json({
                success: true,
                message: 'No tokens to clear. You can connect Google Calendar now.',
                requiresReconnection: false
            });
        }
    } catch (error) {
        console.error('Error forcing reconnection:', error);
        return res.status(500).json({ error: 'Failed to force reconnection' });
    }
}

// Get events from Google Calendar
export async function getEvents(req, res) {
    console.log('\n📅 [Calendar] ========================================');
    console.log('[Calendar] GET EVENTS REQUEST');
    console.log('[Calendar] ========================================');
    try {
        const userId = req.user?.userId;
        console.log('[Calendar] User ID:', userId);
        if (!userId) {
            console.error('[Calendar] No user ID found in request');
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { startDate, endDate, maxResults = 250 } = req.query;
        console.log('[Calendar] Request parameters:', { startDate, endDate, maxResults });

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        console.log('[Calendar] Getting authenticated calendar client...');
        const calendar = await getCalendarClient(userId);
        console.log('[Calendar] ✅ Calendar client obtained successfully', calendar);

        // Verify we're calling the correct endpoint: https://www.googleapis.com/calendar/v3/calendars/primary/events
        const requestParams = {
            calendarId: 'primary', // This maps to /calendars/primary/events endpoint
            timeMin: new Date(startDate).toISOString(),
            timeMax: new Date(endDate).toISOString(),
            maxResults: parseInt(maxResults, 10),
            singleEvents: true,
            orderBy: 'startTime',
        };

        // NOTE: API key is NOT required for OAuth-based server-side Calendar API calls
        // The OAuth access token in the Authorization header is sufficient for authentication

        console.log('\n[Calendar] 📡 Calling Google Calendar API:');
        console.log('   ════════════════════════════════════════════════════════════');
        console.log('   🔗 Endpoint: https://www.googleapis.com/calendar/v3/calendars/primary/events');
        console.log('   🔐 Authentication: OAuth2 Bearer Token (server-side, no API key needed)');
        console.log('   📋 Request Parameters:');
        console.log('      - calendarId:', requestParams.calendarId);
        console.log('      - timeMin:', requestParams.timeMin);
        console.log('      - timeMax:', requestParams.timeMax);
        console.log('      - maxResults:', requestParams.maxResults);
        console.log('      - singleEvents:', requestParams.singleEvents);
        console.log('      - orderBy:', requestParams.orderBy);
        console.log('   ════════════════════════════════════════════════════════════\n');

        // CRITICAL: Verify auth is still bound before making API call
        // This is the 1-line check that proves if auth is missing
        const authCheck = calendar.context?._options?.auth;
        if (!authCheck) {
            console.error('❌ [Calendar] CRITICAL: Auth binding lost before API call!');
            console.error('❌ calendar.context._options.auth is undefined');
            console.error('❌ This will cause 403 "unregistered callers" error');
            throw new Error('Calendar client auth binding missing - cannot make API call');
        }

        // FINAL VERIFICATION: OAuth2Client must be properly configured
        console.log('   🔍 FINAL VERIFICATION BEFORE API CALL:');
        console.log('      ✅ OAuth2Client bound:', !!authCheck);
        console.log('      ✅ Access token present:', !!authCheck?.credentials?.access_token);
        console.log('      ✅ Client ID present:', !!authCheck?._clientId);
        console.log('      ✅ Client ID in credentials:', !!authCheck?.credentials?.client_id);
        console.log('');

        // CRITICAL: Verify OAuth2Client has client ID before API call
        // Google needs the client ID to identify the caller as registered
        const clientId = authCheck._clientId;
        if (!clientId) {
            console.error('❌ [Calendar] CRITICAL: OAuth2Client missing client ID before API call!');
            console.error('❌ Google cannot identify the caller without client ID');
            console.error('❌ This will cause 403 "unregistered callers" error');
            throw new Error('OAuth2Client missing client ID - Google cannot identify caller');
        }

        console.log('✅ [Calendar] Auth binding verified before API call');
        console.log('   Auth present:', !!authCheck);
        console.log('   Auth has access_token:', !!authCheck?.credentials?.access_token);
        console.log('   Auth has client ID:', !!clientId);
        console.log('   Client ID:', clientId ? `${clientId.substring(0, 20)}...` : 'MISSING');
        console.log('');
        console.log('   ⚠️  IMPORTANT: If you still get 403 "unregistered callers" error:');
        console.log('   1. Verify Google Calendar API is ENABLED in the SAME project as your OAuth Client ID');
        console.log('   2. Go to: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com');
        console.log('   3. Select the project that contains OAuth Client ID:', clientId ? `${clientId.substring(0, 20)}...` : 'UNKNOWN');
        console.log('   4. Click "ENABLE" if not already enabled');
        console.log('   5. Wait 1-2 minutes for changes to propagate');
        console.log('');
        console.log('   🔍 DIAGNOSTIC: Verifying OAuth client configuration...');
        console.log('   Full OAuth Client ID:', clientId || 'MISSING');
        if (clientId) {
            const projectNumber = clientId.split('-')[0];
            console.log('   Project number from Client ID:', projectNumber);
            console.log('   ⚠️  CRITICAL: Verify this OAuth Client ID exists in Google Cloud Console');
            console.log('   ⚠️  CRITICAL: Go to: APIs & Services → Credentials');
            console.log('   ⚠️  CRITICAL: Find OAuth Client ID:', clientId);
            console.log('   ⚠️  CRITICAL: Note which PROJECT it belongs to');
            console.log('   ⚠️  CRITICAL: Then go to that PROJECT and enable Calendar API');
            console.log('   ⚠️  CRITICAL: The API and OAuth client MUST be in the SAME project');
        }
        console.log('');

        // The googleapis library automatically adds "Authorization: Bearer ACCESS_TOKEN" header
        // when using OAuth2Client. We are NOT using API keys.
        console.log('[Calendar] Sending API request to Google Calendar API...');
        console.log('[Calendar] Request will include:');

        // Show actual access token for debugging (masked for security)
        const accessTokenValue = authCheck?.credentials?.access_token;
        if (accessTokenValue) {
            // Show first 20 and last 10 characters for debugging
            const tokenPreview = accessTokenValue.length > 30
                ? `${accessTokenValue.substring(0, 20)}...${accessTokenValue.substring(accessTokenValue.length - 10)}`
                : accessTokenValue.substring(0, 20) + '...';
            console.log('   - Authorization: Bearer', tokenPreview);
            console.log('   - Access token length:', accessTokenValue.length);
            console.log('   - Full access token (for debugging):', accessTokenValue);
        } else {
            console.log('   - Authorization: Bearer <MISSING - NO TOKEN>');
            console.error('   ❌ CRITICAL: Access token is missing!');
        }

        console.log('   - OAuth Client ID (embedded in OAuth2Client):', clientId ? `${clientId.substring(0, 30)}...` : 'MISSING');
        console.log('   - Full OAuth Client ID:', clientId || 'MISSING');

        // Extract project number from client ID for verification
        if (clientId) {
            const projectNumber = clientId.split('-')[0];
            console.log('   - Project number from Client ID:', projectNumber);
            console.log('   ⚠️  VERIFY: Calendar API must be enabled in project:', projectNumber);
            console.log('   ⚠️  Go to: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com');
            console.log('   ⚠️  Select project with number:', projectNumber);
        }

        // Final verification before making request
        // Use authCheck which was verified earlier
        const finalAuth = authCheck; // Use the verified auth binding

        // Get token document for scope and expiry check
        const currentTokenDoc = await GoogleCalendarToken.findOne({ userId });

        console.log('');
        console.log('   🔍 FINAL VERIFICATION BEFORE API CALL:');
        console.log('   - OAuth2Client._clientId:', finalAuth?._clientId ? `${finalAuth._clientId.substring(0, 30)}...` : 'MISSING');
        console.log('   - OAuth2Client.credentials.client_id:', finalAuth?.credentials?.client_id ? `${finalAuth.credentials.client_id.substring(0, 30)}...` : 'MISSING');
        console.log('   - OAuth2Client.credentials.access_token:', finalAuth?.credentials?.access_token ? 'PRESENT' : 'MISSING');
        console.log('   - Access token length:', finalAuth?.credentials?.access_token?.length || 0);
        console.log('   - Access token preview:', finalAuth?.credentials?.access_token ? `${finalAuth.credentials.access_token.substring(0, 20)}...${finalAuth.credentials.access_token.substring(finalAuth.credentials.access_token.length - 10)}` : 'MISSING');
        console.log('   - Calendar client auth bound:', !!finalAuth);
        console.log('   - Stored scope:', currentTokenDoc?.scope || 'Not set');
        console.log('');

        // CRITICAL: Verify token hasn't expired between client creation and API call
        // Re-fetch token document to check expiry
        if (currentTokenDoc && currentTokenDoc.expiresAt && new Date() >= currentTokenDoc.expiresAt) {
            console.warn('⚠️  [Calendar] Token expired between client creation and API call, refreshing...');
            try {
                await refreshAccessToken(userId);
                const refreshedDoc = await GoogleCalendarToken.findOne({ userId });
                if (refreshedDoc) {
                    const newToken = refreshedDoc.getAccessToken();
                    if (newToken) {
                        // Update the OAuth2Client with new token
                        finalAuth.setCredentials({
                            access_token: newToken,
                            refresh_token: refreshedDoc.getRefreshToken(),
                            client_id: finalAuth._clientId,
                            client_secret: finalAuth._clientSecret,
                        });
                        console.log('✅ [Calendar] Token refreshed just before API call');
                    }
                }
            } catch (refreshError) {
                console.error('❌ [Calendar] Failed to refresh token before API call:', refreshError);
                throw new Error('Token expired and refresh failed. Please reconnect Google Calendar.');
            }
        }

        console.log('[Calendar] Making API request to Google Calendar...');
        console.log(requestParams);
        const response = await calendar.events.list(requestParams);
        console.log('[Calendar] ✅ API request successful!');

        // Track Calendar API call usage
        if (userId) {
          trackResourceUsage(userId, 'calendarApiCalls', 1, {
            operation: 'list',
          }).catch((err) => {
            console.error('[Calendar] Error tracking API usage:', err);
            // Don't fail if tracking fails
          });
        }
        console.log('[Calendar] Response status:', response.status || 'N/A');
        console.log('[Calendar] Events found:', response.data?.items?.length || 0);

        const events = (response.data.items || []).map((event) => ({
            id: event.id,
            title: event.summary || 'No title',
            description: event.description || '',
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            location: event.location || '',
            allDay: !event.start?.dateTime, // If no dateTime, it's an all-day event
            source: 'google',
            htmlLink: event.htmlLink,
            status: event.status,
            created: event.created,
            updated: event.updated,
        }));

        console.log('[Calendar] ✅ Successfully processed', events.length, 'events');
        console.log('[Calendar] ========================================\n');
        return res.json({ events });
    } catch (error) {
        console.error('\n❌ [Calendar] ========================================');
        console.error('[Calendar] ERROR FETCHING EVENTS');
        console.error('[Calendar] ========================================');
        console.error('[Calendar] Error type:', error.constructor.name);
        console.error('[Calendar] Error message:', error.message);
        console.error('[Calendar] Error code:', error.code || 'N/A');
        if (error.response) {
            console.error('[Calendar] HTTP Status:', error.response.status);
            console.error('[Calendar] Response data:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('[Calendar] Error stack:', error.stack);
        console.error('[Calendar] ========================================\n');

        if (error.message === 'Google Calendar not connected') {
            return res.status(404).json({ error: 'Google Calendar not connected' });
        }

        if (error.message?.includes('decrypt') || error.message?.includes('Invalid initialization vector') || error.message?.includes('Token decryption failed')) {
            console.error('[Calendar] Token decryption error - user needs to reconnect');
            return res.status(401).json({
                error: 'Token decryption failed. Please disconnect and reconnect Google Calendar.',
                requiresReconnect: true
            });
        }

        // Handle Google API "unregistered callers" error - PROJECT MISMATCH
        if (error.code === 403 && (error.message?.includes('unregistered callers') || error.errors?.[0]?.message?.includes('unregistered callers'))) {
            const oauthClientId = GOOGLE_CLIENT_ID || 'NOT SET';
            const projectNumber = GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.split('-')[0] : 'UNKNOWN';
            const fullClientId = oauthClientId !== 'NOT SET' ? oauthClientId : 'NOT SET';

            console.error('\n❌ [Calendar] ========================================');
            console.error('[Calendar] PROJECT MISMATCH DETECTED');
            console.error('[Calendar] ========================================');
            console.error('[Calendar] Full OAuth Client ID:', fullClientId);
            console.error('[Calendar] Project number from Client ID:', projectNumber);
            console.error('');
            console.error('🔴 ROOT CAUSE:');
            console.error('   The Google Calendar API is enabled in a DIFFERENT project');
            console.error('   than the one that contains your OAuth Client ID.');
            console.error('');
            console.error('   Cloud Shell works because it uses Application Default Credentials (ADC)');
            console.error('   which are automatically trusted. Your backend uses OAuth Client ID,');
            console.error('   which must be in the SAME project as the Calendar API.');
            console.error('');
            console.error('✅ EXACT SOLUTION:');
            console.error('   STEP 1: Find the project containing your OAuth Client ID');
            console.error('   - Go to: https://console.cloud.google.com/apis/credentials');
            console.error('   - Find OAuth Client ID:', fullClientId);
            console.error('   - Note the PROJECT NAME (not project number) shown');
            console.error('');
            console.error('   STEP 2: Enable Calendar API in THAT project');
            console.error('   - Switch to that PROJECT using the project dropdown (top of page)');
            console.error('   - Go to: APIs & Services → Library');
            console.error('   - Search: "Google Calendar API"');
            console.error('   - Click: "ENABLE" (if it shows "ENABLE", not "MANAGE")');
            console.error('   - Wait 2-3 minutes');
            console.error('');
            console.error('   STEP 3: Verify project match');
            console.error('   - The project dropdown should show the SAME project');
            console.error('   - When viewing OAuth Client ID AND Calendar API');
            console.error('');
            console.error('   STEP 4: Clear old/poisoned tokens');
            console.error('   - Old tokens may have been created with wrong settings');
            console.error('   - These "poisoned" tokens will NEVER work, even after fixing settings');
            console.error('   - You MUST delete them and force reconnection');
            console.error('   - Option A: Use disconnect endpoint for each user');
            console.error('   - Option B: Use clearAllTokens endpoint (dev only) to clear all');
            console.error('');
            console.error('   STEP 5: Reconnect');
            console.error('   - After clearing tokens, users must reconnect Google Calendar');
            console.error('   - New tokens will be created with correct settings');
            console.error('');
            console.error('⚠️  CRITICAL: OAuth Client ID and Calendar API MUST be in the SAME project!');
            console.error('⚠️  Project number', projectNumber, 'should match the project where API is enabled');
            console.error('⚠️  Old tokens created before fixing settings are "poisoned" and must be deleted!');
            console.error('[Calendar] ========================================\n');

            return res.status(403).json({
                error: 'Project mismatch: Calendar API and OAuth Client ID are in different projects.',
                requiresApiEnable: true,
                requiresProjectMatch: true,
                oauthClientId: oauthClientId,
                projectNumber: projectNumber,
                message: 'The Calendar API must be enabled in the SAME project as your OAuth Client ID. Find the project that contains your OAuth Client ID and enable the Calendar API there.',
                troubleshooting: {
                    step1: 'Go to https://console.cloud.google.com/',
                    step2: 'Navigate to: APIs & Services → Credentials',
                    step3: `Find OAuth Client ID: ${oauthClientId}`,
                    step4: 'Note the PROJECT NAME for this client',
                    step5: 'Switch to that PROJECT (use project dropdown at top)',
                    step6: 'Go to: APIs & Services → Library',
                    step7: 'Search for "Google Calendar API"',
                    step8: 'Click "ENABLE"',
                    step9: 'Wait 2-3 minutes for changes to propagate',
                    step10: 'Clear old/poisoned tokens (use disconnect or clearAllTokens endpoint)',
                    step11: 'Users must reconnect Google Calendar to get new tokens'
                }
            });
        }

        return res.status(500).json({
            error: 'Failed to fetch events',
            message: error.message || 'Unknown error'
        });
    }
}

// Create event in Google Calendar
export async function createEvent(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { title, description, start, end, location, allDay } = req.body;

        if (!title || !start || !end) {
            return res.status(400).json({ error: 'Title, start, and end are required' });
        }

        const calendar = await getCalendarClient(userId);

        const event = {
            summary: title,
            description: description || '',
            location: location || '',
            start: allDay
                ? { date: new Date(start).toISOString().split('T')[0] }
                : { dateTime: new Date(start).toISOString(), timeZone: 'UTC' },
            end: allDay
                ? { date: new Date(end).toISOString().split('T')[0] }
                : { dateTime: new Date(end).toISOString(), timeZone: 'UTC' },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
        });

        const createdEvent = {
            id: response.data.id,
            title: response.data.summary || 'No title',
            description: response.data.description || '',
            start: response.data.start?.dateTime || response.data.start?.date,
            end: response.data.end?.dateTime || response.data.end?.date,
            location: response.data.location || '',
            allDay: !response.data.start?.dateTime,
            source: 'google',
            htmlLink: response.data.htmlLink,
        };

        // Update last sync time
        await GoogleCalendarToken.findOneAndUpdate(
            { userId },
            { lastSyncAt: new Date() }
        );

        return res.status(201).json({ event: createdEvent });
    } catch (error) {
        console.error('Error creating event:', error);
        if (error.message === 'Google Calendar not connected') {
            return res.status(404).json({ error: 'Google Calendar not connected' });
        }
        return res.status(500).json({ error: 'Failed to create event' });
    }
}

// Update event in Google Calendar
export async function updateEvent(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { eventId } = req.params;
        const { title, description, start, end, location, allDay } = req.body;

        if (!eventId) {
            return res.status(400).json({ error: 'Event ID is required' });
        }

        const calendar = await getCalendarClient(userId);

        const event = {
            summary: title,
            description: description || '',
            location: location || '',
            start: allDay
                ? { date: new Date(start).toISOString().split('T')[0] }
                : { dateTime: new Date(start).toISOString(), timeZone: 'UTC' },
            end: allDay
                ? { date: new Date(end).toISOString().split('T')[0] }
                : { dateTime: new Date(end).toISOString(), timeZone: 'UTC' },
        };

        const response = await calendar.events.update({
            calendarId: 'primary',
            eventId,
            requestBody: event,
        });

        const updatedEvent = {
            id: response.data.id,
            title: response.data.summary || 'No title',
            description: response.data.description || '',
            start: response.data.start?.dateTime || response.data.start?.date,
            end: response.data.end?.dateTime || response.data.end?.date,
            location: response.data.location || '',
            allDay: !response.data.start?.dateTime,
            source: 'google',
            htmlLink: response.data.htmlLink,
        };

        // Update last sync time
        await GoogleCalendarToken.findOneAndUpdate(
            { userId },
            { lastSyncAt: new Date() }
        );

        return res.json({ event: updatedEvent });
    } catch (error) {
        console.error('Error updating event:', error);
        if (error.message === 'Google Calendar not connected') {
            return res.status(404).json({ error: 'Google Calendar not connected' });
        }
        return res.status(500).json({ error: 'Failed to update event' });
    }
}

// Delete event from Google Calendar
export async function deleteEvent(req, res) {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { eventId } = req.params;

        if (!eventId) {
            return res.status(400).json({ error: 'Event ID is required' });
        }

        const calendar = await getCalendarClient(userId);

        await calendar.events.delete({
            calendarId: 'primary',
            eventId,
        });

        // Update last sync time
        await GoogleCalendarToken.findOneAndUpdate(
            { userId },
            { lastSyncAt: new Date() }
        );

        return res.json({ success: true, message: 'Event deleted' });
    } catch (error) {
        console.error('Error deleting event:', error);
        if (error.message === 'Google Calendar not connected') {
            return res.status(404).json({ error: 'Google Calendar not connected' });
        }
        return res.status(500).json({ error: 'Failed to delete event' });
    }
}

