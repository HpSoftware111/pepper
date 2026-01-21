'use client';

import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/authClient';
import { useAuth } from '@/providers/AuthProvider';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatusMessage({ type: 'error', text: 'Missing invitation token.' });
      setLoading(false);
      return;
    }

    authClient
      .fetchInviteDetails(token)
      .then((details) => {
        setEmail(details.email);
        setDisplayName(details.displayName);
        setStatusMessage(null);
      })
      .catch((error) => {
        setStatusMessage({ type: 'error', text: error.message || 'Invite is invalid or already used.' });
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      setStatusMessage({ type: 'error', text: 'Missing invitation token.' });
      return;
    }
    if (password.length < 8) {
      setStatusMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setStatusMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);
    try {
      await authClient.acceptInvite({ token, password, phone });
      await refresh();
      setStatusMessage({ type: 'success', text: 'Account activated. Redirecting…' });
      setTimeout(() => router.replace('/dashboard'), 600);
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message || 'Unable to activate invite.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="p-8 sm:p-10 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-300 mb-2">Activate invite</p>
        <h2 className="text-3xl font-semibold text-white">Finish setting up your account</h2>
        <p className="text-sm text-slate-300">Choose a password to access Pepper. You'll be redirected to your dashboard after activation.</p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">Validating invite…</div>
      ) : (
        <>
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block text-sm space-y-1">
              <span className="text-slate-300">Email</span>
              <input
                type="email"
                value={email}
                readOnly
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white"
              />
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-slate-300">Name</span>
              <input
                value={displayName}
                readOnly
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white"
              />
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-slate-300">Phone (optional)</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white focus:border-emerald-400 focus:outline-none"
              />
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-slate-300">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white focus:border-emerald-400 focus:outline-none"
                required
              />
            </label>
            <label className="block text-sm space-y-1">
              <span className="text-slate-300">Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-white focus:border-emerald-400 focus:outline-none"
                required
              />
            </label>

            <button
              type="submit"
              disabled={submitting || !token}
              className="w-full rounded-2xl bg-[linear-gradient(135deg,_#2af598,_#009efd)] text-slate-900 font-semibold py-3 shadow-[0_18px_45px_rgba(3,170,220,0.35)] hover:brightness-110 transition disabled:opacity-60"
            >
              {submitting ? 'Activating…' : 'Activate account'}
            </button>
          </form>
        </>
      )}
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <div
      className="min-h-screen text-slate-100 flex items-center justify-center p-6 bg-cover bg-center"
      style={{ backgroundImage: 'url(/assets/images/login_background.png)' }}
    >
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-[1.1fr,_0.9fr] gap-8 glass-panel bg-white/5 rounded-[16px] border border-white/10 shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
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
              Personalize your workspace, connect Google Calendar, and let Pepper brief you on every new hearing automatically.
            </p>
            <div className="mt-6 space-y-4 bg-white/5 rounded-2xl p-4 border border-white/10">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">What's next</p>
              <ul className="space-y-2 text-sm text-slate-200/80">
                <li>Connect your calendar & DMS integrations.</li>
                <li>Invite your team and assign permissions.</li>
                <li>Let Pepper ingest your precedents and filings.</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Pepper AI Labs · Secure cloud infrastructure</p>
        </aside>

        <Suspense fallback={<div className="p-8 sm:p-10"><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">Loading...</div></div>}>
          <VerifyEmailForm />
        </Suspense>
      </div>
    </div>
  );
}
