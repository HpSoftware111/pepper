'use client';

import { ComponentType, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';

export function withAuth<P>(WrappedComponent: ComponentType<P>) {
  function AuthenticatedComponent(props: P) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !user) {
        router.replace('/login');
      }
    }, [isLoading, user, router]);

    if (!user) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6 text-center shadow-2xl">
            <p className="text-sm tracking-[0.25em] uppercase text-emerald-200">Pepper 2.0</p>
            <p className="mt-4 text-lg font-semibold text-white">Verifying your session…</p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  }

  AuthenticatedComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return AuthenticatedComponent;
}


