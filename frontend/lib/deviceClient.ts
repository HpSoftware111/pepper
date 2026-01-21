'use client';

import { authClient } from './authClient';

const DEVICE_KEY = 'pepper:deviceId';

const hexFromBuffer = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const computeDeviceFingerprint = async () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const fingerprint = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  if (!window.crypto?.subtle) {
    return hexFromBuffer(new TextEncoder().encode(fingerprint));
  }
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  return hexFromBuffer(digest);
};

const detectDeviceType = () => {
  if (typeof navigator === 'undefined') return 'unknown';
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'pc';
};

const authorizedFetch = async (path: string, init?: RequestInit) => {
  if (typeof window === 'undefined') {
    throw new Error('Device registration is only available in the browser');
  }
  const token = authClient.getStoredAccessToken();
  if (!token) {
    throw new Error('Missing access token');
  }
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error ?? 'Device request failed');
  }
  return response.json().catch(() => ({}));
};

export const deviceClient = {
  async ensureRegistered() {
    try {
      if (typeof window === 'undefined') return;
      const deviceId = await computeDeviceFingerprint();
      if (!deviceId) return;
      const stored = window.localStorage.getItem(DEVICE_KEY);
      if (stored === deviceId) {
        return;
      }
      await authorizedFetch('/api/devices/register', {
        method: 'POST',
        body: JSON.stringify({
          deviceId,
          deviceType: detectDeviceType(),
        }),
      });
      window.localStorage.setItem(DEVICE_KEY, deviceId);
    } catch (error) {
      console.error('[device] failed to register', error);
      throw error;
    }
  },
  async list() {
    return authorizedFetch('/api/devices');
  },
  async delete(deviceId: string) {
    return authorizedFetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
  },
};

