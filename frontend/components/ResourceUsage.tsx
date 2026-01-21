'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/providers/LanguageProvider';
import { useThemeMode } from '@/providers/ThemeProvider';
import { authClient } from '@/lib/authClient';

interface ResourceUsageData {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  lastResetAt?: string;
}

interface ResourceUsageProps {
  usage: {
    voiceTranscriptions: ResourceUsageData;
    aiChatTokens: ResourceUsageData;
    whatsappMessages: ResourceUsageData;
    calendarApiCalls: ResourceUsageData;
    cpnuScrapes: ResourceUsageData;
  };
}

interface Device {
  id: string;
  type: string;
  addedAt: string;
  lastSeenAt: string;
}

interface DeviceListResponse {
  devices: Device[];
  replacementsUsed: number;
  maxReplacements: number;
  logs?: any[];
}

// Modern SVG Icon Components
const MicrophoneIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const ChatBubbleIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const MagnifyingGlassIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const RESOURCE_LABELS = {
  voiceTranscriptions: {
    label: 'Voice Transcriptions',
    unit: 'transcriptions',
    icon: MicrophoneIcon,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    bgColorDark: 'bg-blue-500/10',
  },
  aiChatTokens: {
    label: 'AI Chat Tokens',
    unit: 'tokens',
    icon: SparklesIcon,
    color: 'text-purple-500',
    bgColor: 'bg-purple-50',
    bgColorDark: 'bg-purple-500/10',
  },
  whatsappMessages: {
    label: 'WhatsApp Messages',
    unit: 'messages',
    icon: ChatBubbleIcon,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    bgColorDark: 'bg-green-500/10',
  },
  calendarApiCalls: {
    label: 'Calendar API Calls',
    unit: 'calls',
    icon: CalendarIcon,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    bgColorDark: 'bg-orange-500/10',
  },
  cpnuScrapes: {
    label: 'CPNU Scrapes',
    unit: 'scrapes',
    icon: MagnifyingGlassIcon,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-50',
    bgColorDark: 'bg-indigo-500/10',
  },
};

export function ResourceUsage({ usage }: ResourceUsageProps) {
  const { themeMode } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<{ replacementsUsed: number; maxReplacements: number } | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);

  const resources = Object.entries(usage).map(([key, data]) => ({
    key,
    ...RESOURCE_LABELS[key as keyof typeof RESOURCE_LABELS],
    ...data,
  }));

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    setLoadingDevices(true);
    try {
      const data = await authClient.getRegisteredDevices();
      setDevices(data.devices || []);
      setDeviceInfo({
        replacementsUsed: data.replacementsUsed || 0,
        maxReplacements: data.maxReplacements || 10,
      });
    } catch (error) {
      console.error('Error loading devices:', error);
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleRegisterDevice = async () => {
    if (deviceInfo && deviceInfo.replacementsUsed >= deviceInfo.maxReplacements) {
      alert(`Device replacement limit reached. You have used ${deviceInfo.replacementsUsed} of ${deviceInfo.maxReplacements} replacements.`);
      return;
    }
    
    setRegisteringDevice(true);
    try {
      // Generate a unique device ID (must be at least 32 characters for backend validation)
      // In production, use a proper device fingerprint library like fingerprintjs
      const generateDeviceId = () => {
        const parts = [
          navigator.userAgent,
          navigator.language,
          screen.width + 'x' + screen.height,
          new Date().getTime().toString(),
          Math.random().toString(36).substring(2, 15),
          Math.random().toString(36).substring(2, 15),
        ];
        return btoa(parts.join('|')).replace(/[+/=]/g, '').substring(0, 40);
      };
      
      const deviceId = generateDeviceId();
      const deviceType = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'pc';
      
      await authClient.registerDevice(deviceId, deviceType);
      await loadDevices();
    } catch (error: any) {
      alert(error.message || 'Failed to register device');
    } finally {
      setRegisteringDevice(false);
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) {
      return;
    }
    
    setDeletingDeviceId(deviceId);
    try {
      await authClient.deleteDevice(deviceId);
      await loadDevices();
    } catch (error: any) {
      alert(error.message || 'Failed to delete device');
    } finally {
      setDeletingDeviceId(null);
    }
  };

  const getDeviceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      pc: 'PC',
      mobile: 'Mobile',
      unknown: 'Unknown',
    };
    return labels[type] || type;
  };

  const formatDeviceId = (id: string) => {
    if (id.length > 20) {
      return `${id.substring(0, 12)}...${id.substring(id.length - 4)}`;
    }
    return id;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-semibold mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
          Resource Usage
        </h3>
        <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          Track your API resource consumption
        </p>
      </div>

      <div className="space-y-4">
        {resources.map((resource) => {
          const percentage = resource.limit > 0 && !resource.isUnlimited
            ? Math.min(Math.round((resource.used / resource.limit) * 100), 100)
            : 0;
          const isWarning = !resource.isUnlimited && percentage >= 80;
          const isCritical = !resource.isUnlimited && percentage >= 95;

          return (
            <div
              key={resource.key}
              className={`rounded-xl border p-4 ${isLight
                ? 'border-slate-200 bg-slate-50'
                : 'border-white/10 bg-white/5'
                }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${isLight ? resource.bgColor : resource.bgColorDark} ${resource.color}`}>
                    {resource.icon && <resource.icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {resource.label}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-white'}`}>
                    {resource.used.toLocaleString()} / {resource.isUnlimited ? '∞' : resource.limit.toLocaleString()}
                  </span>
                  <span className={`text-xs ml-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {resource.unit}
                  </span>
                </div>
              </div>

              {!resource.isUnlimited && (
                <>
                  {/* Information text above progress bar (like Tutelas) */}
                  <div className={`mb-2 p-2 rounded ${isLight ? 'bg-blue-50 text-blue-900' : 'bg-blue-500/10 text-blue-200'}`}>
                    <p className="text-sm">
                      You have used <strong>{resource.used.toLocaleString()}</strong> of <strong>{resource.limit.toLocaleString()}</strong> {resource.unit}.
                      {resource.remaining > 0 && (
                        <> <strong>{resource.remaining.toLocaleString()}</strong> remaining.</>
                      )}
                    </p>
                  </div>

                  {/* Blue progress bar with percentage inside (like Tutelas) */}
                  <div className={`relative w-full h-8 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-white/10'}`}>
                    <div
                      className={`h-full transition-all duration-300 flex items-center justify-center ${isCritical
                          ? 'bg-red-500'
                          : isWarning
                            ? 'bg-yellow-500'
                            : 'bg-blue-500'
                        }`}
                      style={{ width: `${percentage}%` }}
                    >
                      {percentage > 10 && (
                        <span className="text-xs font-semibold text-white">
                          {percentage}%
                        </span>
                      )}
                    </div>
                    {percentage <= 10 && (
                      <span className={`absolute inset-0 flex items-center justify-center text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        {percentage}%
                      </span>
                    )}
                  </div>
                </>
              )}

              {resource.isUnlimited && (
                <div className={`text-xs p-2 rounded ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/5 text-slate-400'}`}>
                  Unlimited usage
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Device Control Section (like Tutelas) */}
      <div className={`mt-6 pt-6 border-t ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
        <h4 className={`text-base font-semibold mb-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>
          Registered Devices (maximum 2)
        </h4>

        {deviceInfo && deviceInfo.replacementsUsed > 0 && (
          <div className={`mb-3 p-3 rounded-lg ${isLight ? 'bg-yellow-50 border border-yellow-200' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
            <p className={`text-sm ${isLight ? 'text-yellow-900' : 'text-yellow-200'}`}>
              You have used <strong>{deviceInfo.replacementsUsed}</strong> of <strong>{deviceInfo.maxReplacements}</strong> device replacements allowed.
            </p>
          </div>
        )}

        {loadingDevices ? (
          <div className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Loading devices...
          </div>
        ) : devices.length > 0 ? (
          <ul className="space-y-2 mb-3">
            {devices.map((device) => (
              <li
                key={device.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${isLight
                    ? 'border-slate-200 bg-white'
                    : 'border-white/10 bg-white/5'
                  }`}
              >
                <div>
                  <code className={`text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {formatDeviceId(device.id)}
                  </code>
                  <span className={`ml-2 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    ({getDeviceTypeLabel(device.type)})
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteDevice(device.id)}
                  disabled={deletingDeviceId === device.id}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    isLight
                      ? 'bg-red-500 text-white hover:bg-red-600 disabled:bg-red-300'
                      : 'bg-red-500 text-white hover:bg-red-600 disabled:bg-red-700'
                  } disabled:cursor-not-allowed`}
                >
                  {deletingDeviceId === device.id ? 'Deleting...' : 'Delete'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-sm mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            No registered devices.
          </p>
        )}

        <button
          onClick={handleRegisterDevice}
          disabled={registeringDevice || (deviceInfo && deviceInfo.replacementsUsed >= deviceInfo.maxReplacements) || devices.length >= 2}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            isLight
              ? 'border border-blue-500 text-blue-600 hover:bg-blue-50 disabled:border-slate-300 disabled:text-slate-400'
              : 'border border-blue-400 text-blue-300 hover:bg-blue-500/10 disabled:border-white/20 disabled:text-slate-500'
          } disabled:cursor-not-allowed`}
        >
          {registeringDevice ? 'Registering...' : 'Register this device manually'}
        </button>
      </div>
    </div>
  );
}
