'use client';

import Header from '@/components/Header';
import AdminSidebar from '@/components/AdminSidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { integrationCards, knowledgeQueue } from '@/app/admin/adminData';
import { FormEvent, useState } from 'react';

// Modern SVG Icon Component
const CloseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function KnowledgePage() {
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

  const [jobsModalOpen, setJobsModalOpen] = useState(false);
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [jobForm, setJobForm] = useState({ name: '', source: 'sentencias', priority: 'normal' });
  const [integrationForm, setIntegrationForm] = useState({ connector: 'google', note: '' });

  const submitJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJobsModalOpen(false);
    alert(`Queued ${jobForm.name || 'new job'} from ${jobForm.source}`);
    setJobForm({ name: '', source: 'sentencias', priority: 'normal' });
  };

  const submitIntegration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIntegrationModalOpen(false);
    alert(`Opening integration: ${integrationForm.connector}`);
    setIntegrationForm({ connector: 'google', note: '' });
  };

  return (
    <div className={`app-shell ${pageBackground}`}>
      <Header />
      <div
        className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16 ${
          isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-10 gap-6 lg:gap-8'
        }`}
      >
        <AdminSidebar active="knowledge" />

        <main className="flex-1 space-y-6 lg:space-y-8 lg:pl-0 xl:pl-4">
          <section className={`${cardBase} ${sectionPadding}`}>
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Knowledge & integrations</p>
              <h1 className={`text-3xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Ingestion pipelines & connectors</h1>
              <p className={`text-sm ${subText}`}>
                Keep constitutional uploads, sentencia scrapes, and client documents flowing while ensuring Google Workspace and WhatsApp stay
                online.
              </p>
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Knowledge queue</h2>
                <p className={`text-sm ${subText}`}>Imports, scrapes, and manual uploads in flight.</p>
              </div>
              <button
                className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                onClick={() => setJobsModalOpen(true)}
              >
                Manage jobs
              </button>
            </div>

            <div className="space-y-3">
              {knowledgeQueue.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center gap-3 ${isLight ? 'bg-white' : 'bg-white/5'}`}
                >
                  <div className="flex-1">
                    <p className="font-semibold">{item.title}</p>
                    <p className={`text-xs ${subText}`}>
                      {item.type} • {item.items} items • {item.owner}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/10">{item.eta}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Integrations status</h2>
                <p className={`text-sm ${subText}`}>Connector uptime and incident alerts.</p>
              </div>
              <button
                className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                onClick={() => setIntegrationModalOpen(true)}
              >
                Open integrations hub
              </button>
            </div>

            <div className="space-y-3">
              {integrationCards.map((card) => (
                <div
                  key={card.title}
                  className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center gap-3 ${
                    card.health === 'alert'
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : card.health === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : isLight
                      ? 'bg-white'
                      : 'bg-white/5'
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-semibold">{card.title}</p>
                    <p className={`text-xs ${subText}`}>{card.detail}</p>
                  </div>
                  <span className="text-xs font-semibold">{card.status}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {jobsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardBase} ${sectionPadding} w-full max-w-lg relative`}>
            <button className="absolute right-4 top-4 text-sm text-slate-400 hover:text-white" onClick={() => setJobsModalOpen(false)}>
              ✕
            </button>
            <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Queue ingestion job</h2>
            <p className={`text-sm ${subText}`}>Send a batch import or re-run a connector.</p>
            <form className="mt-5 space-y-4" onSubmit={submitJob}>
              <label className="text-sm font-semibold">
                Job name
                <input
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={jobForm.name}
                  onChange={(e) => setJobForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Upload tutela batch"
                  required
                />
              </label>
              <label className="text-sm font-semibold">
                Source
                <select
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={jobForm.source}
                  onChange={(e) => setJobForm((prev) => ({ ...prev, source: e.target.value }))}
                >
                  <option value="sentencias" className="text-slate-900">
                    Sentencias CSV
                  </option>
                  <option value="constdf" className="text-slate-900">
                    Constitutional articles
                  </option>
                  <option value="client-drive" className="text-slate-900">
                    Client drive upload
                  </option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Priority
                <select
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={jobForm.priority}
                  onChange={(e) => setJobForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="normal" className="text-slate-900">
                    Normal
                  </option>
                  <option value="high" className="text-slate-900">
                    High
                  </option>
                </select>
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setJobsModalOpen(false)}
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-2xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-900">
                  Queue job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {integrationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardBase} ${sectionPadding} w-full max-w-lg relative`}>
            <button
              className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
              onClick={() => setIntegrationModalOpen(false)}
            >
              <CloseIcon className="w-5 h-5" />
            </button>
            <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Integrations hub</h2>
            <p className={`text-sm ${subText}`}>Toggle connectors and leave a note for the integrations team.</p>
            <form className="mt-5 space-y-4" onSubmit={submitIntegration}>
              <label className="text-sm font-semibold">
                Connector
                <select
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  value={integrationForm.connector}
                  onChange={(e) => setIntegrationForm((prev) => ({ ...prev, connector: e.target.value }))}
                >
                  <option value="google" className="text-slate-900">
                    Google Workspace
                  </option>
                  <option value="whatsapp" className="text-slate-900">
                    WhatsApp Business
                  </option>
                  <option value="teams" className="text-slate-900">
                    Microsoft Teams
                  </option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Notes
                <textarea
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                  rows={3}
                  value={integrationForm.note}
                  onChange={(e) => setIntegrationForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Add context for the integration team"
                />
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIntegrationModalOpen(false)}
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm text-white/80"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-2xl bg-blue-400/90 px-5 py-2 text-sm font-semibold text-slate-900">
                  Open hub
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(KnowledgePage);

