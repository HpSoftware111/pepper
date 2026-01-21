'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { authClient } from '@/lib/authClient';
import { languageOptions } from '@/lib/i18n';
import { ResourceUsage } from './ResourceUsage';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [notificationSounds, setNotificationSounds] = useState(true);
  const { language, setLanguage, t } = useLanguage();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const prefsRef = useRef<HTMLDivElement | null>(null);
  const { themeMode, setThemeMode, layoutDensity, setLayoutDensity } = useThemeMode();
  const { logout, user, updateUser } = useAuth();
  const isLight = themeMode === 'light';
  const [signingOut, setSigningOut] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [resourceUsageModalOpen, setResourceUsageModalOpen] = useState(false);
  const [isDomReady, setIsDomReady] = useState(false);
  const [accountForm, setAccountForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    role: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [resourceUsage, setResourceUsage] = useState<any>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (prefsRef.current && !prefsRef.current.contains(event.target as Node)) {
        setPrefsOpen(false);
      }
    };
    if (prefsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [prefsOpen]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (user) {
      setAccountForm((prev) => ({
        ...prev,
        displayName: user.displayName ?? prev.displayName,
        email: user.email ?? prev.email,
        phone: user.phone ?? prev.phone,
        role: user.role ?? prev.role,
        address: user.address ?? prev.address,
        city: user.city ?? prev.city,
        state: user.state ?? prev.state,
        zip: user.zip ?? prev.zip,
      }));
      setAvatarPreview(user.avatarUrl ?? null);
      setAvatarFile(null); // Reset avatar file when user data changes
    }
  }, [user]);

  // Reset avatar file when modal closes
  useEffect(() => {
    if (!accountModalOpen) {
      setAvatarFile(null);
      // Reset preview to user's current avatar
      if (user?.avatarUrl) {
        setAvatarPreview(user.avatarUrl);
      }
    }
  }, [accountModalOpen, user?.avatarUrl]);

  useEffect(() => {
    setIsDomReady(true);
  }, []);

  // Fetch resource usage when resource usage modal opens
  useEffect(() => {
    if (resourceUsageModalOpen && user?.id) {
      authClient.fetchProfile().then((profile) => {
        if (profile.resourceUsage) {
          setResourceUsage(profile.resourceUsage);
        }
      }).catch((err) => {
        console.error('Error fetching resource usage:', err);
      });
    }
  }, [resourceUsageModalOpen, user?.id]);

  const handleSettings = () => {
    setMenuOpen(false);
    setAccountModalOpen(true);
  };

  const handleResourceUsage = () => {
    setMenuOpen(false);
    setResourceUsageModalOpen(true);
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error('Error during sign-out', error);
    } finally {
      setMenuOpen(false);
      setSigningOut(false);
    }
  };

  const navItems = [
    { name: t('header.dashboard'), href: '/dashboard' },
    { name: t('header.cases'), href: '/cases' },
    { name: t('header.calendar'), href: '/calendar' },
    { name: t('header.files'), href: '/files' },
  ];

  const shellStyles = isLight
    ? 'bg-white/90 text-slate-900 shadow-[0_25px_65px_rgba(15,23,42,0.12)]'
    : 'text-white backdrop-blur-xl';

  const darkModeShadowStyle = isLight
    ? {}
    : {
        boxShadow: 'inset 10px 0px 2px 2px #1b121214, inset -1px 0px 0px 0px #eedcdc5c, inset 1px -1px 4px 4px rgb(255 255 255 / 9%)',
      };

  const iconButtonClasses = isLight
    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-[0_8px_18px_rgba(15,23,42,0.08)]'
    : 'bg-white/10 border-white/15 text-white/80 hover:bg-white/20 shadow-[0_12px_26px_rgba(0,0,0,0.55)]';

  const prefsPanelShell = isLight
    ? 'bg-white text-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.12)] border-slate-100'
    : 'bg-[rgba(8,16,32,0.95)] text-white shadow-[0_35px_90px_rgba(0,0,0,0.65)] border-white/10';

  const handleAccountInputChange = (field: keyof typeof accountForm, value: string) => {
    setAccountForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarSwap = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        return;
      }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAccountSave = async () => {
    if (isSaving) return; // Prevent double submission

    setIsSaving(true);
    try {
      console.log('Saving profile changes...', accountForm);

      // Validate required fields
      if (!accountForm.displayName || !accountForm.displayName.trim()) {
        alert('Full name is required');
        setIsSaving(false);
        return;
      }

      // Extract firstName and lastName from displayName if not provided separately
      const displayNameParts = accountForm.displayName.trim().split(/\s+/);
      const firstName = displayNameParts[0] || '';
      const lastName = displayNameParts.slice(1).join(' ') || '';

      // Build payload with all fields - use empty string for empty values so they're sent
      const updatePayload: {
        displayName: string;
        firstName: string;
        lastName: string;
        phone: string;
        address: string;
        city: string;
        state: string;
        zip: string;
        avatarUrl?: string;
      } = {
        displayName: accountForm.displayName?.trim() || '',
        firstName: firstName || '',
        lastName: lastName || '',
        phone: accountForm.phone?.trim() || '',
        address: accountForm.address?.trim() || '',
        city: accountForm.city?.trim() || '',
        state: accountForm.state?.trim() || '',
        zip: accountForm.zip?.trim() || '',
      };

      // If avatar file is selected, convert it to base64 data URL
      if (avatarFile) {
        const avatarDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(avatarFile);
        });
        updatePayload.avatarUrl = avatarDataUrl;
        console.log('Avatar converted to data URL, length:', avatarDataUrl.length);
      }

      console.log('Updating profile with payload:', { ...updatePayload, avatarUrl: updatePayload.avatarUrl ? `[${updatePayload.avatarUrl.length} chars]` : 'none' });
      console.log('Payload JSON stringified:', JSON.stringify(updatePayload).substring(0, 200) + '...');
      console.log('API URL will be:', `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'}/api/auth/profile`);

      // Update profile on backend
      const updatedUser = await authClient.updateProfile(updatePayload);
      console.log('Profile updated successfully:', updatedUser);

      // Clear avatar file after successful save
      setAvatarFile(null);

      // Update user state in AuthProvider
      await updateUser();
      console.log('User state refreshed');

      setAccountModalOpen(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(`Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="w-full px-4 sm:px-6 lg:px-16 py-4 relative z-20">
        <div className={`rounded-[28px] transition-all ${shellStyles}`} style={darkModeShadowStyle}>
          <div className="flex flex-wrap items-center gap-5 sm:gap-7 px-4 sm:px-6 py-2">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <a
                href="https://www.emtechnologysolutions.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-11 h-11 sm:w-14 sm:h-14 lg:w-20 lg:h-20 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <Image
                  src="/assets/icons/logo.png"
                  alt="Pepper 2.0 logo"
                  fill
                  className="object-contain"
                  priority
                  sizes="96px"
                />
              </a>
              <div className="flex flex-col">
                <a
                  href="https://www.emtechnologysolutions.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-lg sm:text-xl lg:text-[26px] font-semibold tracking-tight leading-tight cursor-pointer hover:opacity-80 transition-opacity ${isLight ? 'text-slate-900' : 'text-slate-50'
                    }`}
                >
                  Pepper 2.0
                </a>
                <span
                  className={`text-xs uppercase tracking-[0.4em] ${isLight ? 'text-slate-500' : 'text-slate-300/80'
                    } lg:hidden`}
                >
                  {t('header.legalAISuite')}
                </span>
              </div>
            </div>

            <nav className="hidden lg:flex flex-1 items-center justify-center space-x-9 text-base font-semibold tracking-wide">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative pb-1 transition-colors ${active
                      ? isLight
                        ? 'text-slate-900'
                        : 'text-slate-50'
                      : isLight
                        ? 'text-slate-500 hover:text-slate-900'
                        : 'text-slate-300 hover:text-slate-100'
                      }`}
                  >
                    {item.name}
                    {active && (
                      <span
                        className={`absolute left-0 -bottom-1 h-0.5 w-full rounded-full ${isLight ? 'bg-emerald-500' : 'bg-emerald-400'
                          }`}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-4 ml-auto lg:hidden">
              <button
                onClick={() => setMobileNavOpen((prev) => !prev)}
                aria-label="Toggle navigation"
                aria-expanded={mobileNavOpen}
                className={`p-2 rounded-full border transition ${iconButtonClasses}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileNavOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-4 order-3 w-full justify-end lg:order-none lg:w-auto">
              <button
                className={`p-1.5 rounded-full border transition-colors ${iconButtonClasses}`}
                onClick={() => setMenuOpen(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </button>

              <div className="relative" ref={prefsRef}>
                <button
                  onClick={() => setPrefsOpen((prev) => !prev)}
                  className={`p-1.5 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${iconButtonClasses}`}
                  aria-expanded={prefsOpen}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                {prefsOpen && (
                  <div
                    className={`absolute right-0 mt-3 w-[360px] rounded-[26px] border px-5 py-6 space-y-5 z-30 backdrop-blur-xl ${prefsPanelShell}`}
                  >
                    <header className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold">{t('preferences.title')}</p>
                        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400/80'}`}>
                          {t('preferences.subtitle')}
                        </p>
                      </div>
                      <button
                        onClick={() => setPrefsOpen(false)}
                        className={`p-1 rounded-full transition ${isLight ? 'text-slate-500 hover:text-slate-700 hover:bg-slate-100' : 'text-white/70 hover:text-white hover:bg-white/10'
                          }`}
                        aria-label="Close preferences"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </header>

                    <section className="space-y-3">
                      <p className={`text-[11px] uppercase tracking-[0.3em] ${isLight ? 'text-slate-500' : 'text-slate-400/70'}`}>{t('preferences.theme')}</p>
                      <div className="grid grid-cols-2 gap-2.5">
                        {(['light', 'dark'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setThemeMode(mode)}
                            className={`rounded-2xl border px-3 py-3 text-left transition ${themeMode === mode
                              ? isLight
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                                : 'border-emerald-400 bg-emerald-400/10 text-white'
                              : isLight
                                ? 'border-slate-200 text-slate-600 hover:border-slate-400'
                                : 'border-white/10 text-slate-300 hover:border-white/30'
                              }`}
                          >
                            <span className="block font-semibold">{mode === 'light' ? t('preferences.light') : t('preferences.dark')}</span>
                            <span className="text-xs opacity-70">{t('preferences.optimizedPalette')}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-2.5">
                      <p className={`text-[11px] uppercase tracking-[0.3em] ${isLight ? 'text-slate-500' : 'text-slate-400/70'}`}>{t('preferences.language')}</p>
                      <div
                        className={`rounded-2xl border px-4 py-4 flex items-center justify-between gap-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'
                          }`}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">{t('preferences.interfaceLanguage')}</span>
                          <span className="text-xs opacity-70">{t('preferences.languageDescription')}</span>
                        </div>
                        <div className="relative w-40">
                          <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as 'en' | 'es' | 'pt')}
                            className={`w-full appearance-none rounded-xl border px-4 py-2 text-sm font-semibold pr-10 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 ${isLight
                              ? 'border-slate-200 bg-white text-slate-800'
                              : 'border-white/20 bg-[rgba(10,18,34,0.7)] text-white'
                              }`}
                          >
                            {languageOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span
                            className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${isLight ? 'text-emerald-500' : 'text-emerald-300'
                              }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t('preferences.notificationSounds')}</p>
                          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400/80'}`}>
                            {t('preferences.notificationSoundsDescription')}
                          </p>
                        </div>
                        <button
                          onClick={() => setNotificationSounds((prev) => !prev)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${notificationSounds ? 'bg-emerald-400/70' : 'bg-slate-600'
                            }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${notificationSounds ? 'translate-x-5' : 'translate-x-1'
                              }`}
                          />
                        </button>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <p className={`text-[11px] uppercase tracking-[0.3em] ${isLight ? 'text-slate-500' : 'text-slate-400/70'}`}>
                        {t('preferences.layoutDensity')}
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        {(['cozy', 'compact'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setLayoutDensity(mode)}
                            className={`rounded-2xl border px-3 py-3 text-left transition ${layoutDensity === mode
                              ? isLight
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                                : 'border-emerald-400 bg-emerald-400/10 text-white'
                              : isLight
                                ? 'border-slate-200 text-slate-600 hover:border-slate-400'
                                : 'border-white/10 text-slate-300 hover:border-white/30'
                              }`}
                          >
                            <span className="block font-semibold capitalize">{t(`preferences.${mode}`)}</span>
                            <span className="text-xs opacity-70">
                              {mode === 'cozy' ? t('preferences.cozyDescription') : t('preferences.compactDescription')}
                            </span>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className={`relative w-9 h-9 border-2 rounded-full overflow-hidden flex items-center justify-center font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400/70 ${isLight
                    ? user?.avatarUrl
                      ? 'border-emerald-200 shadow-slate-300/60'
                      : 'bg-gradient-to-br from-emerald-400 to-emerald-500 border-emerald-200 text-white shadow-slate-300/60'
                    : user?.avatarUrl
                      ? 'border-blue-300 shadow-slate-900/60'
                      : 'bg-gradient-to-br from-blue-500 to-blue-700 border-blue-300 text-white shadow-slate-900/60'
                    }`}
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                >
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName || 'User avatar'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback to initials if image fails to load
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className = 'w-full h-full flex items-center justify-center text-white font-semibold';
                          fallback.textContent = user?.displayName
                            ? user.displayName.charAt(0).toUpperCase()
                            : user?.firstName && user?.lastName
                              ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                              : user?.email
                                ? user.email[0].toUpperCase()
                                : 'U';
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <span className="text-white">
                      {user?.displayName
                        ? user.displayName.charAt(0).toUpperCase()
                        : user?.firstName && user?.lastName
                          ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                          : user?.email
                            ? user.email[0].toUpperCase()
                            : 'U'}
                    </span>
                  )}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${isLight ? 'bg-emerald-500 border-white' : 'bg-emerald-400 border-slate-900'
                      }`}
                  />
                </button>
                {menuOpen && (
                  <div
                    className={`absolute right-0 top-full mt-3 w-64 rounded-[20px] border px-4 py-4 space-y-3 z-[40] backdrop-blur-xl ${isLight
                      ? 'border-slate-200 bg-white text-slate-900 shadow-[0_22px_55px_rgba(15,23,42,0.15)]'
                      : 'border-white/10 bg-[rgba(4,12,26,0.95)] text-white shadow-[0_28px_60px_rgba(0,0,0,0.55)]'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl border overflow-hidden flex items-center justify-center text-lg font-semibold ${isLight ? 'border-slate-200 bg-slate-50 text-slate-900' : 'border-white/15 bg-white/10 text-white'
                          }`}
                      >
                        {user?.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.displayName || 'User avatar'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to initials if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                const fallback = document.createElement('div');
                                fallback.className = 'w-full h-full flex items-center justify-center font-semibold';
                                fallback.className += isLight ? ' text-slate-900' : ' text-white';
                                fallback.textContent = user?.displayName
                                  ? user.displayName
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()
                                  : user?.firstName && user?.lastName
                                    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                                    : user?.email
                                      ? user.email[0].toUpperCase()
                                      : 'U';
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        ) : (
                          <span>
                            {user?.displayName
                              ? user.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()
                              : user?.firstName && user?.lastName
                                ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                                : user?.email
                                  ? user.email[0].toUpperCase()
                                  : 'U'}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{user?.displayName ?? 'Guest'}</p>
                        <p className={`text-xs truncate ${isLight ? 'text-slate-500' : 'text-slate-300/80'}`}>
                          {user?.role === 'admin' ? t('userMenu.administrator') : t('userMenu.teamMember')}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`rounded-[16px] border px-3 py-3 text-sm ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'
                        }`}
                    >
                      <p className={`text-xs uppercase tracking-[0.35em] ${isLight ? 'text-slate-400' : 'text-slate-400/80'}`}>{t('userMenu.status')}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="text-sm font-medium">{t('userMenu.availableForHandoff')}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleSettings}
                      className={`w-full px-3 py-3 text-sm font-semibold rounded-[14px] flex items-center justify-between border transition ${isLight ? 'border-slate-200 text-slate-700 hover:bg-slate-50' : 'border-white/10 text-white hover:bg-white/10'
                        }`}
                    >
                      <span>{t('userMenu.viewProfile')}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <button
                      onClick={handleResourceUsage}
                      className={`w-full px-3 py-3 text-sm font-semibold rounded-[14px] flex items-center justify-between border transition ${isLight ? 'border-slate-200 text-slate-700 hover:bg-slate-50' : 'border-white/10 text-white hover:bg-white/10'
                        }`}
                    >
                      <span>Resource Usage</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </button>

                    <button
                      onClick={handleSignOut}
                      className={`w-full px-3 py-3 text-sm font-semibold rounded-[14px] flex items-center justify-between border transition ${isLight ? 'border-rose-100 text-rose-600 hover:bg-rose-50' : 'border-rose-400/30 text-rose-200 hover:bg-rose-500/10'
                        }`}
                    >
                      <span>{t('userMenu.signOut')}</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4h5a2 2 0 012 2v12a2 2 0 01-2 2H7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {mobileNavOpen && (
          <div className="px-4 sm:px-6 pb-4 border-t border-white/10 lg:hidden">
            <nav
              className={`flex flex-col gap-2 text-base font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'
                }`}
            >
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={`mobile-${item.href}`}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 transition ${active
                      ? isLight
                        ? 'border-emerald-400/70 bg-emerald-50 text-emerald-700'
                        : 'border-emerald-400/70 bg-emerald-400/10 text-white'
                      : isLight
                        ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/30'
                      }`}
                  >
                    {item.name}
                    {active && (
                      <span
                        className={`text-[10px] uppercase tracking-[0.4em] ${isLight ? 'text-emerald-500' : 'text-emerald-200'
                          }`}
                      >
                        Active
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {isDomReady &&
        accountModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(5,10,20,0.82)] backdrop-blur-sm px-4 py-6">
            <div
              className={`w-full max-w-4xl rounded-[32px] border px-6 py-6 sm:px-8 sm:py-8 shadow-[0_45px_120px_rgba(5,10,20,0.45)] ${isLight ? 'bg-white text-slate-900 border-slate-100' : 'bg-[rgba(8,16,34,0.92)] text-white border-white/10'
                }`}
            >
              <div className="flex flex-wrap items-start gap-6">
                <div
                  className={`w-full max-w-[260px] rounded-[24px] border p-4 sm:p-5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'
                    }`}
                >
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="relative">
                      <div
                        className={`w-28 h-28 rounded-2xl border-2 overflow-hidden ${isLight ? 'border-slate-200 bg-white' : 'border-white/20 bg-white/10'
                          }`}
                      >
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                        ) : user?.avatarUrl ? (
                          <img src={user.avatarUrl} alt="User avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-3xl font-bold">
                            {user?.displayName
                              ? user.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()
                              : user?.firstName && user?.lastName
                                ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
                                : user?.email
                                  ? user.email[0].toUpperCase()
                                  : 'U'}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 text-white text-xs font-semibold px-3 py-1 shadow"
                      >
                        {t('account.swapPhoto')}
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSwap} />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{accountForm.displayName || '—'}</p>
                      <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-slate-300/90'}`}>
                        {accountForm.role || t('account.seniorPartner')}
                      </p>
                    </div>
                    <div className="text-left w-full space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{t('account.email')}:</span>
                        <span className="font-medium truncate">{accountForm.email || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{t('account.phone')}:</span>
                        <span className="font-medium truncate">{accountForm.phone || '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{t('account.fullName')}</label>
                      <input
                        value={accountForm.displayName}
                        onChange={(e) => handleAccountInputChange('displayName', e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                          }`}
                      />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{t('account.email')}</label>
                      <input
                        value={accountForm.email}
                        onChange={(e) => handleAccountInputChange('email', e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                          }`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{t('account.phone')}</label>
                      <input
                        value={accountForm.phone}
                        onChange={(e) => handleAccountInputChange('phone', e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                          }`}
                      />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{t('account.role')}</label>
                      <input
                        value={accountForm.role}
                        onChange={(e) => handleAccountInputChange('role', e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                          }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{t('account.officeAddress')}</label>
                    <textarea
                      value={accountForm.address}
                      onChange={(e) => handleAccountInputChange('address', e.target.value)}
                      rows={1}
                      placeholder="Office address"
                      className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                        }`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {['city', 'state'].map((field) => (
                      <div key={field}>
                        <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{field}</label>
                        <input
                          value={(accountForm as any)[field]}
                          onChange={(e) => handleAccountInputChange(field as keyof typeof accountForm, e.target.value)}
                          className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                            }`}
                        />
                      </div>
                    ))}
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">ZIP</label>
                      <input
                        value={accountForm.zip}
                        onChange={(e) => handleAccountInputChange('zip', e.target.value)}
                        className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                          }`}
                      />
                    </div>
                  </div>

                  <div className="rounded-[22px] border px-4 py-4 space-y-3">
                    <p className="text-sm font-semibold">{t('account.security')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[t('account.currentPassword'), t('account.newPassword'), t('account.confirmNewPassword')].map((label) => (
                        <div key={label}>
                          <label className="text-xs uppercase tracking-[0.3em] block mb-2 opacity-70">{label}</label>
                          <input
                            type="password"
                            className={`w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-[rgba(12,20,38,0.65)] text-white'
                              }`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      onClick={() => setAccountModalOpen(false)}
                      className={`px-4 py-2 rounded-2xl border text-sm font-semibold ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-white/80 hover:bg-white/10'
                        }`}
                    >
                      {t('account.cancel')}
                    </button>
                    <button
                      onClick={handleAccountSave}
                      disabled={isSaving}
                      className={`px-5 py-2 rounded-2xl text-white text-sm font-semibold shadow-[0_15px_35px_rgba(16,185,129,0.35)] ${isSaving
                        ? 'bg-emerald-400 cursor-not-allowed opacity-70'
                        : 'bg-emerald-500 hover:bg-emerald-400'
                        }`}
                    >
                      {isSaving ? t('account.saving') : t('account.saveChanges')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {isDomReady &&
        resourceUsageModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(5,10,20,0.82)] backdrop-blur-sm px-4 py-6">
            <div
              className={`w-full max-w-2xl rounded-[32px] border px-6 py-6 sm:px-8 sm:py-8 shadow-[0_45px_120px_rgba(5,10,20,0.45)] ${isLight ? 'bg-white text-slate-900 border-slate-100' : 'bg-[rgba(8,16,34,0.92)] text-white border-white/10'
                }`}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Resource Usage
                </h2>
                <button
                  onClick={() => setResourceUsageModalOpen(false)}
                  className={`p-2 rounded-full transition ${isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-white/70 hover:bg-white/10'
                    }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {resourceUsage ? (
                <ResourceUsage usage={resourceUsage} />
              ) : (
                <div className={`text-center py-8 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Loading resource usage...
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
