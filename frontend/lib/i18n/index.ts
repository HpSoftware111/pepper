import { en } from './translations/en';
import { es } from './translations/es';
import { pt } from './translations/pt';

export type Language = 'en' | 'es' | 'pt';
export type TranslationKey = keyof typeof en;

export const translations = {
  en,
  es,
  pt,
} as const;

export const languageNames: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
};

export const languageOptions: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
];

/**
 * Get translation for a nested key path
 * Example: getTranslation(translations.en, 'header.dashboard') => 'Dashboard'
 */
export function getTranslation(
  translation: typeof en,
  key: string
): string {
  const keys = key.split('.');
  let value: any = translation;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k as keyof typeof value];
    } else {
      return key; // Return key if translation not found
    }
  }

  return typeof value === 'string' ? value : key;
}

/**
 * Detect user's preferred language from browser
 */
export function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') return 'en';

  const browserLang = navigator.language || (navigator as any).userLanguage || '';
  const langCode = browserLang.toLowerCase().split('-')[0];

  // Check if browser language is supported
  if (langCode === 'es') return 'es';
  if (langCode === 'pt') return 'pt';
  if (langCode === 'en') return 'en';

  // Check navigator.languages array
  if (navigator.languages) {
    for (const lang of navigator.languages) {
      const code = lang.toLowerCase().split('-')[0];
      if (code === 'es') return 'es';
      if (code === 'pt') return 'pt';
      if (code === 'en') return 'en';
    }
  }

  return 'en'; // Default to English
}

/**
 * Get stored language preference from localStorage
 */
export function getStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem('pepper-language');
    if (stored && (stored === 'en' || stored === 'es' || stored === 'pt')) {
      return stored as Language;
    }
  } catch (error) {
    console.error('Error reading language from localStorage:', error);
  }

  return null;
}

/**
 * Store language preference in localStorage
 */
export function storeLanguage(language: Language): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('pepper-language', language);
  } catch (error) {
    console.error('Error storing language in localStorage:', error);
  }
}

