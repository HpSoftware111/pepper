'use client';

import Link from 'next/link';
import Header from '@/components/Header';
import SummaryCard from '@/components/SummaryCard';
import AdminSidebar from '@/components/AdminSidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { metricCards } from '@/app/admin/adminData';
import { useState } from 'react';

const moduleCards = [
  {
    title: 'Workspace health',
    description: 'Track seat allocation, plan fit, and CSM coverage across every firm.',
    href: '/admin/workspace',
  },
  {
    title: 'Knowledge & integrations',
    description: 'Manage ingestion queues, Google Workspace, WhatsApp, and other connectors.',
    href: '/admin/knowledge',
  },
  {
    title: 'User management',
    description: 'Suspend, invite, or impersonate users and control permissions.',
    href: '/admin/users',
  },
  {
    title: 'Billing & payments',
    description: 'Mirror Stripe invoices, collections, and ARR by organization.',
    href: '/admin/billing',
  },
];

function AdminPage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';

  const pageBackground = isLight ? 'bg-[#F6F7FB]' : 'bg-[#040915]';
  const cardBase = isLight
    ? 'rounded-[24px] bg-white border border-slate-200 shadow-[0_20px_40px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] bg-[rgba(7,20,40,0.85)] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.55)] backdrop-blur';
  const sectionPadding = isCompact ? 'p-5' : 'p-7';
  const subText = isLight ? 'text-slate-500' : 'text-slate-300/85';

  const alerts = [
    { id: '1', title: 'WhatsApp connector degraded', owner: 'Integrations', severity: 'High', opened: '5m ago', status: 'Investigating' },
    { id: '2', title: 'Stripe payout delayed', owner: 'Billing', severity: 'Medium', opened: '22m ago', status: 'Escalated' },
    { id: '3', title: 'Pepper reminder backlog', owner: 'Knowledge', severity: 'Low', opened: '1h ago', status: 'Queued' },
    { id: '4', title: 'Workspace limit reached', owner: 'CSM', severity: 'Medium', opened: '3h ago', status: 'Action required' },
    { id: '5', title: 'Device replacement spike', owner: 'Security', severity: 'High', opened: '6h ago', status: 'Reviewing' },
  ];
  const ALERTS_PAGE_SIZE = 3;
  const [alertPage, setAlertPage] = useState(0);
  const pagedAlerts = alerts.slice(alertPage * ALERTS_PAGE_SIZE, alertPage * ALERTS_PAGE_SIZE + ALERTS_PAGE_SIZE);
  const alertPages = Math.max(1, Math.ceil(alerts.length / ALERTS_PAGE_SIZE));

  return (
    <div className={`app-shell ${pageBackground}`}>
      <Header />

      <div
        className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16 ${
          isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-10 gap-6 lg:gap-8'
        }`}
      >
        <AdminSidebar active="overview" />

        <main className="flex-1 space-y-6 lg:space-y-8 lg:pl-0 xl:pl-4">
          <section className={`${cardBase} ${sectionPadding} relative overflow-hidden`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between relative z-10">
              <div className="space-y-3 max-w-2xl">
                <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Pepper Admin</p>
                <h1 className={`text-3xl lg:text-[38px] font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Coordinate firms, billing, and knowledge operations from one console
                </h1>
                <p className={`text-sm ${subText}`}>
                  Surface issues fast, keep connectors green, and ship new legal intelligence without leaving this dashboard.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/admin/audit"
                  className="rounded-2xl border border-white/30 px-5 py-3 text-sm font-semibold text-white/90 hover:border-white transition text-center flex items-center justify-center"
                >
                  View audit trail
                </Link>
              </div>
            </div>
            <div className="absolute inset-0 pointer-events-none opacity-10">
              <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-400 blur-[150px]" />
              <div className="absolute left-10 bottom-0 w-48 h-48 bg-cyan-500 blur-[140px]" />
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {metricCards.map((card) => (
              <SummaryCard key={card.title} {...card} />
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {moduleCards.map((card) => (
              <div key={card.href} className={`${cardBase} ${sectionPadding} flex flex-col gap-4`}>
                <div>
                  <p className={`text-xs uppercase tracking-[0.3em] ${subText}`}>Module</p>
                  <h3 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{card.title}</h3>
                  <p className={`text-sm mt-2 ${subText}`}>{card.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={card.href}
                    className="rounded-xl bg-emerald-500/20 text-emerald-100 px-4 py-2 text-sm font-semibold hover:bg-emerald-400/30 transition"
                  >
                    Open module
                  </Link>
                  {card.title === 'Workspace health' && (
                    <button
                      className="rounded-xl border border-white/20 text-white/90 px-4 py-2 text-sm"
                      onClick={() => {
                        const rows = [
                          ['Organization', 'Plan', 'Seats', 'Usage', 'CSM', 'Status'],
                          ...metricCards.map((metric) => [metric.title, metric.value, '', '', '', '']),
                        ];
                        const csv = rows.map((row) => row.join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = 'workspace-health.csv';
                        link.click();
                      }}
                    >
                      Export CSV
                    </button>
                  )}
                  {card.title === 'Knowledge & integrations' && (
                    <>
                      <button
                        className="rounded-xl border border-white/20 text-white/90 px-4 py-2 text-sm"
                        onClick={() => alert('Job manager opening soon.')}
                      >
                        Manage jobs
                      </button>
                      <button
                        className="rounded-xl border border-white/20 text-white/90 px-4 py-2 text-sm"
                        onClick={() => alert('Integrations hub redirect coming soon.')}
                      >
                        Open integrations hub
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Alerts management</p>
                <h3 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Live incidents</h3>
                <p className={`text-sm ${subText}`}>Assign owners and export to share with CS or ops.</p>
              </div>
              <button
                className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                onClick={() => alert('Alert CSV exported.')}
              >
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={isLight ? 'bg-slate-50' : 'bg-white/5'}>
                  <tr>
                    {['Alert', 'Owner', 'Severity', 'Opened', 'Status', ''].map((heading) => (
                      <th key={heading} className={`px-3 py-2 text-left font-semibold ${subText}`}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedAlerts.map((alertItem, idx) => (
                    <tr key={alertItem.id} className={`${idx % 2 === 0 ? (isLight ? 'bg-white' : 'bg-white/5') : ''}`}>
                      <td className="px-3 py-2 font-semibold">{alertItem.title}</td>
                      <td className="px-3 py-2">{alertItem.owner}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            alertItem.severity === 'High'
                              ? 'bg-rose-500/15 text-rose-200'
                              : alertItem.severity === 'Medium'
                              ? 'bg-amber-500/15 text-amber-200'
                              : 'bg-emerald-500/15 text-emerald-200'
                          }`}
                        >
                          {alertItem.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2">{alertItem.opened}</td>
                      <td className="px-3 py-2 text-xs">{alertItem.status}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 hover:border-white/60"
                          onClick={() => alert(`Alert ${alertItem.id} marked as resolved`)}
                        >
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className={`text-xs ${subText}`}>
                Showing {(alertPage * ALERTS_PAGE_SIZE) + 1}–{Math.min((alertPage + 1) * ALERTS_PAGE_SIZE, alerts.length)} of {alerts.length}
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 disabled:opacity-40"
                  disabled={alertPage === 0}
                  onClick={() => setAlertPage((prev) => Math.max(0, prev - 1))}
                >
                  Prev
                </button>
                <button
                  className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 disabled:opacity-40"
                  disabled={alertPage >= alertPages - 1}
                  onClick={() => setAlertPage((prev) => Math.min(alertPages - 1, prev + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Need deeper history?</p>
                <h3 className={`text-xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>System audit & activity feed</h3>
                <p className={`text-sm ${subText}`}>
                  Jump into the dedicated audit workspace to review every admin and automation event.
                </p>
              </div>
              <Link
                href="/admin/audit"
                className="rounded-2xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow-lg hover:bg-slate-800 transition"
              >
                Go to audit timeline
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default withAuth(AdminPage);

