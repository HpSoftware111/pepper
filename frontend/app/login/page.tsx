'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { deviceClient } from '@/lib/deviceClient';

type AuthMode = 'signin' | 'signup';

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [name, setName] = useState('Jane Attorney');
  const [email, setEmail] = useState('jane@pepperlabs.ai');
  const [phone, setPhone] = useState('+1 (415) 555-8012');
  const [password, setPassword] = useState('Pepper123!');
  const [confirmPassword, setConfirmPassword] = useState('Pepper123!');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const googleSigninEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN === 'true';
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const [googleSdkReady, setGoogleSdkReady] = useState(false);
  const [googleButtonMounted, setGoogleButtonMounted] = useState(false);

  const completeLogin = useCallback(async () => {
    try {
      await deviceClient.ensureRegistered();
      setStatusMessage({ type: 'success', text: 'All set. Redirecting…' });
      setTimeout(() => router.push('/dashboard'), 300);
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: (error as Error).message || 'Device registration failed. Contact an admin.',
      });
      throw error;
    }
  }, [router]);

  const handleGoogleCredential = useCallback(
    async (credentialResponse: { credential?: string }) => {
      const credential = credentialResponse?.credential;
      if (!credential) {
        return;
      }
      setStatusMessage(null);
      setIsSubmitting(true);
      try {
        await signInWithGoogle(credential);
        await completeLogin();
      } catch (error) {
        if (!(error instanceof Error && error.message === 'Device registration failed. Contact an admin.')) {
          let errorMessage = (error as Error).message || 'Error al iniciar sesión con Google';
          // Translate "Failed to fetch" to Spanish if not already translated
          if (errorMessage === 'Failed to fetch') {
            errorMessage = 'Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.';
          }
          setStatusMessage({ type: 'error', text: errorMessage });
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [completeLogin, signInWithGoogle],
  );

  useEffect(() => {
    if (!googleSigninEnabled || !googleClientId || typeof window === 'undefined') {
      return;
    }
    
    // Log helpful information for debugging
    const currentOrigin = window.location.origin;
    console.log('🔐 [Google Sign-In] Initializing...');
    console.log('   Current origin:', currentOrigin);
    console.log('   Client ID:', googleClientId ? `${googleClientId.substring(0, 30)}...` : 'NOT SET');
    console.log('   If you see "origin not allowed" errors, add this origin to Google Cloud Console:');
    console.log('   →', currentOrigin);
    console.log('   See: pepper-2.0/docs/GOOGLE_SIGNIN_SETUP.md for instructions');
    
    const initialize = () => {
    if (!googleSigninEnabled || !window.google?.accounts?.id) {
        return;
      }
      setGoogleSdkReady(true);
      
      // Get current origin for error messages
      const currentOrigin = window.location.origin;
      
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      });
      
      // Listen for Google Sign-In errors
      const handleError = (error: any) => {
        if (error?.type === 'popup_closed_by_user') {
          // User closed popup, don't show error
          return;
        }
        if (error?.message?.includes('origin is not allowed') || error?.message?.includes('not allowed for the given client ID')) {
          setStatusMessage({
            type: 'error',
            text: `Origin not allowed. Please add "${currentOrigin}" to Authorized JavaScript origins in Google Cloud Console. See console for details.`,
          });
          console.error('❌ [Google Sign-In] Origin not allowed error');
          console.error('   Current origin:', currentOrigin);
          console.error('   OAuth Client ID:', googleClientId);
          console.error('');
          console.error('✅ SOLUTION: Add Authorized JavaScript Origins');
          console.error('   1. Go to: https://console.cloud.google.com/apis/credentials');
          console.error('   2. Find your OAuth 2.0 Client ID:', googleClientId);
          console.error('   3. Click on the Client ID to edit');
          console.error('   4. Under "Authorized JavaScript origins", click "+ ADD URI"');
          console.error('   5. Add:', currentOrigin);
          console.error('   6. Click "SAVE"');
          console.error('   7. Wait 1-2 minutes for changes to propagate');
          console.error('   8. Refresh this page and try again');
        } else if (error?.message) {
          setStatusMessage({
            type: 'error',
            text: `Google Sign-In error: ${error.message}`,
          });
        }
      };
      
      // Set up error handler
      if (window.google?.accounts?.id?.prompt) {
        const originalPrompt = window.google.accounts.id.prompt;
        window.google.accounts.id.prompt = function(notificationCallback?: (notification: any) => void) {
          return originalPrompt.call(this, (notification: any) => {
            if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
              handleError({ message: 'Popup was blocked or skipped' });
            }
            if (notificationCallback) {
              notificationCallback(notification);
            }
          });
        };
      }
      
      if (googleButtonRef.current) {
        try {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            width: 340,
            text: 'continue_with',
            shape: 'pill',
          });
          setGoogleButtonMounted(true);
        } catch (error: any) {
          handleError(error);
        }
      }
    };
    if (window.google?.accounts?.id) {
      initialize();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initialize;
    script.onerror = () => {
      setStatusMessage({
        type: 'error',
        text: 'Failed to load Google Sign-In script. Check your internet connection.',
      });
    };
    document.body.appendChild(script);
    return () => {
      script.onload = null;
      script.onerror = null;
    };
  }, [googleClientId, handleGoogleCredential, googleSigninEnabled]);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard');
    }
  }, [authLoading, user, router]);

  const handleGoogleButtonClick = () => {
    if (!googleSigninEnabled) {
      setStatusMessage({ type: 'error', text: 'Google sign-in is disabled for this environment.' });
      return;
    }
    if (!googleClientId) {
      setStatusMessage({ type: 'error', text: 'Google client ID missing. Please configure NEXT_PUBLIC_GOOGLE_CLIENT_ID.' });
      return;
    }
    if (!window.google?.accounts?.id) {
      setStatusMessage({ type: 'error', text: 'Google sign-in is still loading, try again shortly.' });
      return;
    }
    window.google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        setStatusMessage({ type: 'error', text: 'Google sign-in popup was blocked. Allow popups and retry.' });
      }
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setStatusMessage(null);
    setIsSubmitting(true);

    const run = async () => {
      if (mode === 'signup' && password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (mode === 'signup') {
        await signUp({
          email,
          password,
          displayName: name.trim() || email,
          phone,
        });
      } else {
        await signIn(email, password);
      }
      await completeLogin();
    };

    run().catch((error: Error) => {
      // Translate "Failed to fetch" to Spanish if not already translated
      let errorMessage = error.message || 'Error de autenticación';
      if (errorMessage === 'Failed to fetch') {
        errorMessage = 'Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.';
      }
      setStatusMessage({ type: 'error', text: errorMessage });
    }).finally(() => {
      setIsSubmitting(false);
    });
  };

  const renderModeTitle = () => (mode === 'signup' ? 'Create your workspace' : 'Sign in to Pepper');

  const renderDescription = () =>
    mode === 'signup'
      ? 'Invite your team, connect calendar, and let Pepper draft your first motion.'
      : 'Secure access to hearings, filings, and Pepper insights.';

  const passwordInputType = showPassword ? 'text' : 'password';

  return (
    <div
      className="min-h-screen text-slate-100 flex flex-col items-center p-6 bg-cover bg-center gap-6"
      style={{ backgroundImage: 'url(/assets/images/login_background.png)' }}
    >
      <div className="w-full text-white flex flex-row items-start justify-start gap-2 p-2">
        <a
          href="https://www.emtechnologysolutions.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="relative w-44 h-24 border border-white/15 rounded-2xl overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.55)] bg-black hover:opacity-90 transition-opacity cursor-pointer"
          aria-label="Visit EEM Technology Solutions website"
        >
          <Image
            src="/assets/images/latest logo.png"
            alt="EEM AI Technology"
            fill
            sizes="(min-width: 1280px) 260px, 45vw"
            quality={100}
            priority
            unoptimized
            className="object-contain"
          />
        </a>
      </div>
      <div className='w-full flex flex-col items-center justify-center max-w-5xl gap-20'>
        <div></div>
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.1fr,_0.9fr] gap-8 glass-panel bg-white/5 rounded-[16px] border border-white/10 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
          <aside className="hidden lg:flex flex-col justify-between rounded-[16px] border border-white/10 p-8 bg-[linear-gradient(135deg,_rgba(12,52,100,0.8),_rgba(7,20,48,0.95))]">
              <div>
                <div className="flex items-center gap-4 text-white">
                  <div className="relative w-20 h-10 overflow-hidden border border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.4)] bg-white inline-flex">
                    <Image src="/assets/icons/logo.png" alt="Pepper 2.0" fill className="object-contain" sizes="80px" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-emerald-200/80">Pepper 2.0</p>
                    <h1 className="text-3xl font-semibold">Legal co-pilot</h1>
                  </div>
                </div>
              <p className="mt-6 text-sm text-slate-200">
                • Drafts filings, exhibits, and discovery responses <br />
                • Syncs with calendar & document management <br />
                • Flags deadlines, conflicts, and missing exhibits in real time
              </p>
              <div className="mt-6 space-y-4 bg-white/5 rounded-2xl p-4 border border-white/10">
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Security</p>
                <div className="flex items-center justify-between text-sm">
                  <span>MFA enforced</span>
                  <span>✔️</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Audit trail logging</span>
                  <span>✔️</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>SOC 2 Type II</span>
                  <span>✔️</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400">© {new Date().getFullYear()} Pepper AI Labs · Secure cloud infrastructure</p>
          </aside>

          <main className="p-8 sm:p-10 flex flex-col gap-6">
            <div>
              <div className="flex gap-3 text-xs uppercase tracking-[0.3em] text-emerald-300 mb-2">
                <button
                  onClick={() => setMode('signin')}
                  className={`px-3 py-1 rounded-full border ${
                    mode === 'signin' ? 'border-emerald-300 text-emerald-200' : 'border-transparent text-black'
                  }`}
                >
                  Sign in
                </button>
                <button
                  onClick={() => setMode('signup')}
                  className={`px-3 py-1 rounded-full border ${
                    mode === 'signup' ? 'border-emerald-300 text-emerald-200' : 'border-transparent text-black'
                  }`}
                >
                  Sign up
                </button>
              </div>
              <h2 className="text-3xl font-semibold text-white">{renderModeTitle()}</h2>
              <p className="text-sm text-slate-300">{renderDescription()}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <>
                  <label className="block text-sm space-y-1">
                    <span className="text-slate-300">Full name</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-black  focus:border-emerald-400 focus:outline-none"
                    />
                  </label>
                  <label className="block text-sm space-y-1">
                    <span className="text-slate-300">Phone</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-black focus:border-emerald-400 focus:outline-none"
                    />
                  </label>
                </>
              )}

              <label className="block text-sm space-y-1">
                <span className="text-slate-300">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-black focus:border-emerald-400 focus:outline-none"
                  required
                />
              </label>

              <label className="block text-sm space-y-1">
                <span className="text-slate-300">Password</span>
                <div className="relative">
                  <input
                    type={passwordInputType}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-black focus:border-emerald-400 focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 text-xs text-slate-300"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              {mode === 'signup' && (
                <label className="block text-sm space-y-1">
                  <span className="text-slate-300">Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-black  focus:border-emerald-400 focus:outline-none"
                    required
                  />
                </label>
              )}

              {mode === 'signin' && (
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={() => setRememberMe((prev) => !prev)}
                      className="rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-400"
                    />
                    Remember me
                  </label>
                  <button type="button" className="text-emerald-300 text-xs" onClick={() => router.push('/reset')}>
                    Forgot password?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-[linear-gradient(135deg,_#2af598,_#009efd)] text-slate-900 font-semibold py-3 shadow-[0_18px_45px_rgba(3,170,220,0.35)] hover:brightness-110 transition disabled:opacity-60"
              >
                {isSubmitting ? 'Working...' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            {statusMessage && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  statusMessage.type === 'error'
                    ? 'border-rose-400/60 bg-rose-500/10 text-rose-200'
                    : 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <div className="space-y-3">
              {googleSigninEnabled && googleClientId ? (
                <>
                  <div ref={googleButtonRef} className="flex justify-center" />
                  {!googleButtonMounted && (
                    <button
                      type="button"
                      onClick={handleGoogleButtonClick}
                      disabled={isSubmitting || !googleSdkReady}
                      className="w-full rounded-2xl border border-white/15 bg-white/5 py-2 text-sm text-white/80 hover:bg-white/10 transition flex items-center justify-center gap-3 disabled:opacity-60"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.91-6.91C35.9 2.16 30.47 0 24 0 14.62 0 6.43 5.38 2.58 13.22l8.04 6.24C12.57 13.28 17.78 9.5 24 9.5z" />
                        <path fill="#34A853" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9.04h12.7c-.55 2.92-2.18 5.39-4.65 7.04l7.24 5.62C43.44 37.04 46.5 31.28 46.5 24.5z" />
                        <path fill="#4A90E2" d="M13.54 28.46a9.46 9.46 0 010-8.92l-8.04-6.32C2.05 15.21 0 19.35 0 24s2.05 8.79 5.5 11.78l8.04-6.32z" />
                        <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.93-5.76l-7.24-5.62C30.67 38.7 27.54 39.5 24 39.5c-6.22 0-11.43-3.78-13.38-9.96l-8.04 6.24C6.43 42.62 14.62 48 24 48z" />
                      </svg>
                      Continue with Google
                    </button>
                  )}
                </>
              ) : (
                <p className="text-center text-xs text-rose-200">
                  Google sign-in is disabled for this environment. Set NEXT_PUBLIC_ENABLE_GOOGLE_SIGNIN=true (and a valid NEXT_PUBLIC_GOOGLE_CLIENT_ID) to enable it.
                </p>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

