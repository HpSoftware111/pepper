'use client';

import Header from '@/components/Header';
import AdminSidebar from '@/components/AdminSidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { auditEvents } from '@/app/admin/adminData';
import { FormEvent, useMemo, useState } from 'react';

// Modern SVG Icon Component
const CloseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function AuditPage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';

  const pageBackground = isLight ? 'bg-[#F6F7FB]' : 'bg-[#040915]';
  const cardBase = isLight
    ? 'rounded-[24px] bg-white border border-slate-200 shadow-[0_20px_40px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] bg-[rgba(7,20,40,0.85)] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.55)] backdrop-blur';
  const sectionPadding = isCompact ? 'p-5' : 'p-7';
  const subText = isLight ? 'text-slate-500' : 'text-slate-300/85';
  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(0);
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const pagedEvents = useMemo(
    () => auditEvents.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [page],
  );
  const totalPages = Math.max(1, Math.ceil(auditEvents.length / PAGE_SIZE));

  const exportCsv = () => {
    const rows = pagedEvents.map((event) => [event.time, event.actor, event.tag, event.text]);
    const csv = [['Time', 'Actor', 'Tag', 'Description'], ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit-events-page-${page + 1}.csv`;
    link.click();
  };

  const subscribeWebhook = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!webhookUrl) return;
    alert(`Subscribed ${webhookUrl} to audit events`);
    setWebhookUrl('');
    setWebhookModalOpen(false);
  };

  const auditTagColor = (tag: string) => {
    switch (tag) {
      case 'Knowledge':
        return 'bg-blue-500/15 text-blue-200';
      case 'Access':
        return 'bg-purple-500/15 text-purple-200';
      case 'Billing':
        return 'bg-emerald-500/15 text-emerald-300';
      default:
        return 'bg-amber-500/20 text-amber-200';
    }
  };

  return (
    <div className={`app-shell ${pageBackground}`}>
      <Header />
      <div
        className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16 ${
          isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-10 gap-6 lg:gap-8'
        }`}
      >
        <AdminSidebar active="audit" />

        <main className="flex-1 space-y-6 lg:space-y-8 lg:pl-0 xl:pl-4">
          <section className={`${cardBase} ${sectionPadding}`}>
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Audit timeline</p>
              <h1 className={`text-3xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Every action, every automation</h1>
              <p className={`text-sm ${subText}`}>
                Review 24 hours of admin actions, knowledge ingestions, billing updates, and automation jobs. Export or subscribe to a webhook
                for SIEM ingest.
              </p>
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Recent events</h2>
                <p className={`text-sm ${subText}`}>Automatic refresh every minute.</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="text-sm font-semibold px-3 py-1.5 rounded-2xl border border-white/20 hover:border-white/40 transition"
                  onClick={exportCsv}
                >
                  Export CSV
                </button>
                <button
                  className="text-sm font-semibold px-3 py-1.5 rounded-2xl border border-white/20 hover:border-white/40 transition"
                  onClick={() => setWebhookModalOpen(true)}
                >
                  Subscribe webhook
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {pagedEvents.map((event) => (
                <div
                  key={`${event.time}-${event.actor}`}
                  className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center gap-4 ${isLight ? 'bg-white' : 'bg-white/5'}`}
                >
                  <span className="text-xs font-semibold text-emerald-300 w-16">{event.time}</span>
                  <div className="flex-1">
                    <p className="font-semibold">{event.text}</p>
                    <p className={`text-xs ${subText}`}>{event.actor}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${auditTagColor(event.tag)}`}>{event.tag}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className={`text-xs ${subText}`}>
                Showing {(page * PAGE_SIZE) + 1}–{Math.min((page + 1) * PAGE_SIZE, auditEvents.length)} of {auditEvents.length}
              </p>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded-lg border border-white/20 text-xs text-white/80 disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                >
                  Prev
                </button>
                <button
                  className="px-3 py-1 rounded-lg border border-white/20 text-xs text-white/80 disabled:opacity-40"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((prev) => Math.min(totalPages - 1, prev + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
      {webhookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardBase} ${sectionPadding} w-full max-w-lg relative`}>
            <button
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
              onClick={() => setWebhookModalOpen(false)}
            >
              <CloseIcon className="w-5 h-5" />
            </button>
            <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Subscribe webhook</h2>
            <p className={`text-sm ${subText}`}>We will POST every audit event to the URL below.</p>
            <form className="mt-5 space-y-4" onSubmit={subscribeWebhook}>
              <label className="text-sm font-semibold">
                Webhook URL
                <input
                  type="url"
                  required
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://example.com/hooks/audit"
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                />
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setWebhookModalOpen(false)}
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-2xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-900">
                  Subscribe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(AuditPage);

