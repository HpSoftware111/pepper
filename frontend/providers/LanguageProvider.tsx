'use client';

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Language } from '@/lib/i18n';
import {
  detectBrowserLanguage,
  getStoredLanguage,
  storeLanguage,
  translations,
  getTranslation,
} from '@/lib/i18n';

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  languageName: string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Initialize language: stored preference > browser language > English
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en';
    return getStoredLanguage() || detectBrowserLanguage();
  });

  // Store language preference when it changes
  useEffect(() => {
    storeLanguage(language);
    // Update HTML lang attribute
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  // Set language function
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  // Translation function
  const t = (key: string): string => {
    const translation = translations[language];
    return getTranslation(translation, key);
  };

  // Get current language display name
  const languageName = useMemo(() => {
    const names: Record<Language, string> = {
      en: 'English',
      es: 'Español',
      pt: 'Português',
    };
    return names[language];
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      languageName,
    }),
    [language, languageName]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

