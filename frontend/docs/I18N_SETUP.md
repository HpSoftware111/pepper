# Internationalization (i18n) Setup Guide

Pepper 2.0 includes a comprehensive internationalization system that supports English, Spanish, and Portuguese. The language preference is managed through the Quick Preferences popup and persists across sessions.

## Overview

The i18n system is built with:
- **LanguageProvider**: React context that manages language state
- **Translation files**: Separate files for each language (en, es, pt)
- **localStorage persistence**: Language preference is saved and restored
- **Browser detection**: Automatically detects user's preferred language on first visit

## Supported Languages

- **English (en)**: Default language
- **Español (es)**: Spanish
- **Português (pt)**: Portuguese

## Architecture

### File Structure

```
frontend/
├── lib/
│   └── i18n/
│       ├── index.ts                    # Core i18n utilities
│       └── translations/
│           ├── en.ts                  # English translations
│           ├── es.ts                  # Spanish translations
│           └── pt.ts                  # Portuguese translations
├── providers/
│   └── LanguageProvider.tsx           # Language context provider
└── components/
    └── Header.tsx                     # Language selector UI
```

### Core Components

#### 1. LanguageProvider

The `LanguageProvider` wraps the application and provides:
- Current language state
- `setLanguage()` function to change language
- `t()` function for translations
- Automatic localStorage persistence
- HTML lang attribute updates

```tsx
import { useLanguage } from '@/providers/LanguageProvider';

function MyComponent() {
  const { language, setLanguage, t } = useLanguage();
  
  return (
    <div>
      <h1>{t('header.dashboard')}</h1>
      <button onClick={() => setLanguage('es')}>
        Switch to Spanish
      </button>
    </div>
  );
}
```

#### 2. Translation Files

Each language has its own translation file with nested objects:

```typescript
// lib/i18n/translations/en.ts
export const en = {
  header: {
    dashboard: 'Dashboard',
    cases: 'Cases',
    // ...
  },
  preferences: {
    title: 'Quick Preferences',
    // ...
  },
  // ...
};
```

#### 3. Translation Function

The `t()` function accepts dot-notation keys:

```typescript
t('header.dashboard')        // Returns: 'Dashboard' (en) or 'Panel de Control' (es)
t('preferences.title')       // Returns: 'Quick Preferences' (en) or 'Preferencias Rápidas' (es)
```

## Usage

### Basic Translation

```tsx
import { useLanguage } from '@/providers/LanguageProvider';

function MyComponent() {
  const { t } = useLanguage();
  
  return <h1>{t('header.dashboard')}</h1>;
}
```

### Language Switching

```tsx
import { useLanguage } from '@/providers/LanguageProvider';

function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  
  return (
    <select value={language} onChange={(e) => setLanguage(e.target.value)}>
      <option value="en">English</option>
      <option value="es">Español</option>
      <option value="pt">Português</option>
    </select>
  );
}
```

### Adding New Translations

1. **Add to all translation files** (en.ts, es.ts, pt.ts):

```typescript
// en.ts
export const en = {
  // ... existing translations
  myNewSection: {
    title: 'My New Section',
    description: 'This is a new section',
  },
};

// es.ts
export const es = {
  // ... existing translations
  myNewSection: {
    title: 'Mi Nueva Sección',
    description: 'Esta es una nueva sección',
  },
};

// pt.ts
export const pt = {
  // ... existing translations
  myNewSection: {
    title: 'Minha Nova Seção',
    description: 'Esta é uma nova seção',
  },
};
```

2. **Use in components**:

```tsx
const { t } = useLanguage();
<h1>{t('myNewSection.title')}</h1>
<p>{t('myNewSection.description')}</p>
```

## Language Detection

The system automatically detects the user's preferred language:

1. **First Priority**: Stored preference in localStorage
2. **Second Priority**: Browser language detection
3. **Default**: English (en)

Browser detection checks:
- `navigator.language`
- `navigator.languages` array
- Falls back to English if no match

## Persistence

Language preference is automatically saved to `localStorage` with the key `pepper-language`. The preference persists across:
- Page refreshes
- Browser sessions
- Tab switches

## Integration with Quick Preferences

The language selector is integrated into the Quick Preferences popup in the Header component. When a user changes the language:

1. The `setLanguage()` function is called
2. Language is saved to localStorage
3. HTML `lang` attribute is updated
4. All components using `t()` automatically re-render with new translations

## Best Practices

### 1. Use Descriptive Keys

```typescript
// ✅ Good
t('dashboard.priorityCases')
t('account.saveChanges')

// ❌ Bad
t('text1')
t('label')
```

### 2. Group Related Translations

```typescript
// ✅ Good - grouped by feature
dashboard: {
  title: 'Dashboard',
  priorityCases: 'Priority Cases',
  recentActivity: 'Recent Activity',
}

// ❌ Bad - flat structure
dashboardTitle: 'Dashboard',
priorityCases: 'Priority Cases',
recentActivity: 'Recent Activity',
```

### 3. Keep Translations Consistent

Use the same terminology across the app:
- "Save changes" not "Save" in one place and "Update" in another
- "Cancel" not "Close" for cancel buttons

### 4. Handle Missing Translations

The `t()` function returns the key if translation is missing. This helps identify missing translations during development:

```typescript
t('missing.key') // Returns: 'missing.key'
```

## Testing

To test language switching:

1. Open Quick Preferences (gear icon in header)
2. Select a different language from the dropdown
3. Verify all text updates immediately
4. Refresh the page - language should persist
5. Check browser console for any missing translation keys

## Troubleshooting

### Translations Not Updating

- Ensure component is using `useLanguage()` hook
- Check that translation key exists in all language files
- Verify LanguageProvider wraps the component tree

### Language Not Persisting

- Check browser localStorage (DevTools > Application > Local Storage)
- Verify `pepper-language` key exists
- Check for localStorage errors in console

### Missing Translations

- Check console for translation keys being returned as-is
- Verify key exists in all three language files (en, es, pt)
- Ensure key uses dot notation (e.g., `header.dashboard`)

## Future Enhancements

Potential improvements:
- Server-side language detection
- User profile language preference
- Pluralization support
- Date/number formatting per locale
- RTL (Right-to-Left) language support
- Translation management UI
- Missing translation detection tool

