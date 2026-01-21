'use client';

import Link from 'next/link';
import { useThemeMode } from '@/providers/ThemeProvider';
import { billingRows, userRoster, workspaceData } from '@/app/admin/adminData';

const navItems = [
  { label: 'Overview', href: '/admin', key: 'overview' },
  { label: 'Workspace health', href: '/admin/workspace', key: 'workspace' },
  { label: 'Knowledge & integrations', href: '/admin/knowledge', key: 'knowledge' },
  { label: 'User management', href: '/admin/users', key: 'users' },
  { label: 'Billing & payments', href: '/admin/billing', key: 'billing' },
  { label: 'Audit timeline', href: '/admin/audit', key: 'audit' },
];

type AdminSidebarProps = {
  active: (typeof navItems)[number]['key'];
};

export default function AdminSidebar({ active }: AdminSidebarProps) {
  const { themeMode, layoutDensity } = useThemeMode();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const cardBase = isLight
    ? 'rounded-[24px] bg-white border border-slate-200 shadow-[0_20px_40px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] bg-[rgba(7,20,40,0.85)] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.55)]';
  const sectionPadding = isCompact ? 'p-5' : 'p-6';
  const subText = isLight ? 'text-slate-500' : 'text-slate-300/85';
  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';

  return (
    <aside className={`w-full lg:w-[280px] xl:w-[300px] flex-shrink-0 ${isLight ? 'lg:pr-4' : 'lg:pr-5'}`}>
      <div className={`${cardBase} ${sectionPadding} space-y-4 sticky top-24`}>
        <div>
          <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Control center</p>
          <h2 className={`text-xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Admin modules</h2>
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                active === item.key
                  ? isLight
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-900'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {item.label}
              {active === item.key ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 8 8">
                  <circle cx="4" cy="4" r="3" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              )}
            </Link>
          ))}
        </nav>

        <div className="space-y-3">
          <div className={`rounded-2xl border ${borderColor} p-4 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">Users</p>
            <h3 className="text-lg font-semibold mt-1 text-slate-900 dark:text-white">{userRoster.length} admins</h3>
            <p className={`text-xs ${subText}`}>Manage invites, roles, impersonation</p>
          </div>
          <div className={`rounded-2xl border ${borderColor} p-4 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Billing</p>
            <h3 className="text-lg font-semibold mt-1 text-slate-900 dark:text-white">
              $
              {(
                billingRows.reduce((sum, row) => {
                  const numeric = parseFloat(row.arr.replace(/[^0-9.]/g, '')) || 0;
                  const isThousands = row.arr.toLowerCase().includes('k');
                  return sum + (isThousands ? numeric * 1000 : numeric);
                }, 0) / 1000
              ).toFixed(1)}
              K ARR
            </h3>
            <p className={`text-xs ${subText}`}>Track invoices & collections</p>
          </div>
          <div className={`rounded-2xl border ${borderColor} p-4 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
            <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Health</p>
            <h3 className="text-lg font-semibold mt-1 text-slate-900 dark:text-white">{workspaceData.length} firms</h3>
            <p className={`text-xs ${subText}`}>Monitor seat usage & CSM load</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

