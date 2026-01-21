const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const ACCESS_TOKEN_KEY = 'pepper:accessToken';
const REFRESH_TOKEN_KEY = 'pepper:refreshToken';
const USER_KEY = 'pepper:user';
const isBrowser = typeof window !== 'undefined';

type CredentialsResponse = {
  user: AuthUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
};

export type ResourceUsageData = {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  lastResetAt?: string;
};

export type ResourceUsage = {
  voiceTranscriptions: ResourceUsageData;
  aiChatTokens: ResourceUsageData;
  whatsappMessages: ResourceUsageData;
  calendarApiCalls: ResourceUsageData;
  cpnuScrapes: ResourceUsageData;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  role: string;
  avatarUrl?: string;
  status: string;
  emailVerified?: boolean;
  resourceUsage?: ResourceUsage;
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  // Merge headers properly - options headers should override defaults
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => headers.set(key, value));
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => headers.set(key, value));
    } else {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (value) headers.set(key, value);
      });
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error ?? 'Error inesperado';
      throw new Error(message);
    }

    return response.json();
  } catch (error) {
    // Translate "Failed to fetch" network errors to Spanish
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new Error('Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.');
    }
    // Re-throw other errors as-is
    throw error;
  }
};

const persistSession = (payload: CredentialsResponse) => {
  if (!isBrowser) {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, payload.tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, payload.tokens.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
};

export const authClient = {
  getStoredAccessToken() {
    if (!isBrowser) return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  async fetchInviteDetails(token: string) {
    return request<{ email: string; displayName: string; status: string }>(`/api/auth/invite/${token}`, {
      method: 'GET',
    });
  },
  async acceptInvite(payload: { token: string; password: string; phone?: string }) {
    const data = await request<CredentialsResponse>('/api/auth/invite/accept', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    persistSession(data);
    return data.user;
  },
  getStoredRefreshToken() {
    if (!isBrowser) return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  getStoredUser(): AuthUser | null {
    if (!isBrowser) return null;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },
  async signIn(email: string, password: string) {
    const data = await request<CredentialsResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    persistSession(data);
    return data.user;
  },
  async signUp(payload: { email: string; password: string; displayName: string; phone?: string }) {
    const data = await request<CredentialsResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    persistSession(data);
    return data.user;
  },
  async signInWithGoogle(idToken: string) {
    const data = await request<CredentialsResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    persistSession(data);
    return data.user;
  },
  async requestPasswordReset(email: string) {
    return request<{ success: boolean; message?: string }>('/api/auth/reset/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  async verifyPasswordReset(payload: { email: string; code: string; newPassword: string }) {
    return request<{ success: boolean }>('/api/auth/reset/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async signOut() {
    const refreshToken = this.getStoredRefreshToken();
    if (refreshToken) {
      await request('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {
        // swallow errors to ensure local state clears
      });
    }
    this.clearSession();
  },
  async fetchProfile() {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token');
    }
    const data = await request<{ user: AuthUser; resourceUsage?: ResourceUsage }>('/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    // Merge resourceUsage into user object
    const userWithResources = { ...data.user, resourceUsage: data.resourceUsage };
    if (isBrowser) {
      localStorage.setItem(USER_KEY, JSON.stringify(userWithResources));
    }
    return userWithResources;
  },
  async updateProfile(payload: Partial<{ displayName: string; firstName: string; lastName: string; phone: string; address: string; city: string; state: string; zip: string; avatarUrl: string }>) {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token');
    }

    console.log('[authClient] updateProfile payload:', payload);
    console.log('[authClient] updateProfile stringified:', JSON.stringify(payload));

    const data = await request<{ user: AuthUser }>('/api/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (isBrowser) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    }
    return data.user;
  },
  async refreshSession() {
    const refreshToken = this.getStoredRefreshToken();
    if (!refreshToken) {
      throw new Error('Missing refresh token');
    }
    const data = await request<CredentialsResponse>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    persistSession(data);
    return data.user;
  },
  clearSession() {
    if (!isBrowser) return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  async getRegisteredDevices() {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token');
    }
    return request<{ devices: any[]; replacementsUsed: number; maxReplacements: number; logs?: any[] }>('/api/devices', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
  async registerDevice(deviceId: string, deviceType: string) {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token');
    }
    return request<{ success: boolean; status: string; device?: any }>('/api/devices/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ deviceId, deviceType }),
    });
  },
  async deleteDevice(deviceId: string) {
    const accessToken = this.getStoredAccessToken();
    if (!accessToken) {
      throw new Error('Missing access token');
    }
    return request<{ success: boolean }>(`/api/devices/${deviceId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
};

