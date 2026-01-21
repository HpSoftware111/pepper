'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authClient } from '@/lib/authClient';

export default function ResetPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'verify' | 'success'>('request');
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setStatusMessage(null);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      await authClient.requestPasswordReset(trimmedEmail);
      setStatusMessage({
        type: 'success',
        text: 'If that email exists, a verification code was just sent. Enter it below.',
      });
      setStep('verify');
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message || 'Unable to send reset link' });
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    setStatusMessage(null);
    try {
      await authClient.verifyPasswordReset({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        newPassword,
      });
      setStep('success');
      setStatusMessage({
        type: 'success',
        text: 'Password updated. You can now sign in with your new credentials.',
      });
    } catch (error) {
      setStatusMessage({ type: 'error', text: (error as Error).message || 'Verification failed' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 text-slate-100 bg-cover bg-center"
      style={{ backgroundImage: 'url(/assets/images/login_background.png)' }}
    >
      <div className="w-full max-w-3xl grid grid-cols-1 lg:grid-cols-2 bg-white/5 backdrop-blur-lg rounded-[32px] border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.6)] overflow-hidden">
        <section className="p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-white/10 text-white">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Security</p>
          <h1 className="mt-3 text-3xl font-semibold">Reset your Pepper access</h1>
          <p className="mt-4 text-sm text-slate-200">
            Confirm your identity, set a new password, and jump back into your hearings, filings, and Pepper drafts.
          </p>
          <div className="mt-6 space-y-3 text-sm text-slate-200">
            <p>• One-time code delivered to your email on file</p>
            <p>• Automatic sign-out of other sessions</p>
            <p>• Optional MFA revalidation for admins</p>
          </div>
          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-slate-300">
            Need help? Email <span className="text-emerald-300">security@pepper.ai</span> or call +1 (415) 555‑0101.
          </div>
        </section>

        <section className="p-8 lg:p-10 bg-white/3 text-slate-100">
          {step === 'request' && (
            <form onSubmit={handleRequest} className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-white">Send reset link</h2>
                <p className="text-sm text-slate-300">Enter the email associated with your Pepper workspace.</p>
              </div>
              <label className="text-sm space-y-1 block">
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:outline-none focus:border-emerald-400"
                />
              </label>
              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-[linear-gradient(135deg,_#2af598,_#009efd)] text-slate-900 font-semibold py-3 shadow-[0_12px_32px_rgba(3,170,220,0.35)] hover:brightness-110 transition disabled:opacity-60"
              >
                {sending ? 'Sending...' : 'Email me a reset link'}
              </button>
              <p className="text-center text-sm text-slate-400">
                Remembered your password?{' '}
                <Link href="/login" className="text-emerald-300 underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-white">Enter verification code</h2>
                <p className="text-sm text-slate-300">We sent a 6-digit code to {email}. Check spam if you don’t see it.</p>
              </div>
              <label className="text-sm space-y-1 block">
                <span>Verification code</span>
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  className="w-full tracking-[0.4em] text-center rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-lg font-mono focus:outline-none focus:border-emerald-400"
                />
              </label>
              <label className="text-sm space-y-1 block">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white focus:outline-none focus:border-emerald-400"
                />
                <span className="text-xs text-slate-400">Use at least 12 characters with numbers and symbols.</span>
              </label>
              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-[linear-gradient(135deg,_#fcb045,_#fd1d1d)] text-white font-semibold py-3 shadow-[0_12px_32px_rgba(253,29,29,0.35)] hover:brightness-110 transition disabled:opacity-60"
              >
                {sending ? 'Verifying...' : 'Update password'}
              </button>
              <p className="text-center text-sm text-slate-400">
                Didn’t get a code?{' '}
                <button type="button" onClick={() => setStep('request')} className="text-emerald-300 underline">
                  Resend
                </button>
              </p>
            </form>
          )}

          {statusMessage && step !== 'success' && (
            <div
              className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                statusMessage.type === 'error'
                  ? 'border-rose-400/60 bg-rose-500/10 text-rose-100'
                  : 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {step === 'success' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-400/20 border border-emerald-200/50 flex items-center justify-center text-2xl">
                ✅
              </div>
              <h2 className="text-2xl font-semibold text-white">Password updated</h2>
              <p className="text-sm text-slate-300">
                You can now sign in with your new password. For extra safety, we signed you out on all other devices.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(135deg,_#2af598,_#009efd)] text-slate-900 font-semibold px-6 py-3 shadow-[0_12px_32px_rgba(3,170,220,0.35)] hover:brightness-110 transition"
              >
                Return to sign in
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

