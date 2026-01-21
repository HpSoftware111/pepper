'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';
type LayoutDensity = 'cozy' | 'compact';

type ThemeContextValue = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  layoutDensity: LayoutDensity;
  setLayoutDensity: (density: LayoutDensity) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [layoutDensity, setLayoutDensity] = useState<LayoutDensity>('cozy');

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.dataset.theme = themeMode;
    document.body.dataset.density = layoutDensity;
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${themeMode}`);
    document.body.classList.remove('density-cozy', 'density-compact');
    document.body.classList.add(`density-${layoutDensity}`);
  }, [themeMode, layoutDensity]);

  const value = useMemo(
    () => ({
      themeMode,
      setThemeMode,
      layoutDensity,
      setLayoutDensity,
    }),
    [themeMode, layoutDensity],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return context;
}

