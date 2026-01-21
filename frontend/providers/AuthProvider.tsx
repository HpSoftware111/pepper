'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authClient, type AuthUser } from '@/lib/authClient';

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUp: (payload: { email: string; password: string; displayName: string; phone?: string }) => Promise<AuthUser>;
  signInWithGoogle: (idToken: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser>;
  updateUser: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hydrate = useCallback(async () => {
    const storedUser = authClient.getStoredUser();
    if (storedUser) {
      setUser(storedUser);
    }

    const hasAnyToken = Boolean(authClient.getStoredAccessToken() || authClient.getStoredRefreshToken());
    if (!hasAnyToken) {
      setIsLoading(false);
      return;
    }

    try {
      const profile = await authClient.fetchProfile();
      setUser(profile);
    } catch {
      try {
        const refreshed = await authClient.refreshSession();
        setUser(refreshed);
      } catch {
        authClient.clearSession();
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const signIn = useCallback(async (email: string, password: string) => {
    const authenticated = await authClient.signIn(email, password);
    setUser(authenticated);
    return authenticated;
  }, []);

  const signUp = useCallback(
    async (payload: { email: string; password: string; displayName: string; phone?: string }) => {
      const created = await authClient.signUp(payload);
      setUser(created);
      return created;
    },
    [],
  );

  const signInWithGoogle = useCallback(async (idToken: string) => {
    const authenticated = await authClient.signInWithGoogle(idToken);
    setUser(authenticated);
    return authenticated;
  }, []);

  const logout = useCallback(async () => {
    await authClient.signOut();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const refreshed = await authClient.refreshSession();
    setUser(refreshed);
    return refreshed;
  }, []);

  const updateUser = useCallback(async () => {
    try {
      const profile = await authClient.fetchProfile();
      setUser(profile);
      return profile;
    } catch {
      // If fetch fails, try to get from localStorage
      const storedUser = authClient.getStoredUser();
      if (storedUser) {
        setUser(storedUser);
        return storedUser;
      }
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      signIn,
      signUp,
      signInWithGoogle,
      logout,
      refresh,
      updateUser,
    }),
    [user, isLoading, signIn, signUp, signInWithGoogle, logout, refresh, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}


