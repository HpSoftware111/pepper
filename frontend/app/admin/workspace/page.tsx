'use client';

import Header from '@/components/Header';
import AdminSidebar from '@/components/AdminSidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { workspaceData } from '@/app/admin/adminData';
import { useState } from 'react';

function WorkspacePage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);

  const pageBackground = isLight ? 'bg-[#F6F7FB]' : 'bg-[#040915]';
  const cardBase = isLight
    ? 'rounded-[24px] bg-white border border-slate-200 shadow-[0_20px_40px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] bg-[rgba(7,20,40,0.85)] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.55)] backdrop-blur';
  const sectionPadding = isCompact ? 'p-5' : 'p-7';
  const subText = isLight ? 'text-slate-500' : 'text-slate-300/85';

  const usageBar = (value: number) => (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-[linear-gradient(135deg,_#2af598,_#009efd)]" style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="text-xs font-semibold text-emerald-300">{Math.round(value * 100)}%</span>
    </div>
  );

  const statusChip = (status: string) => {
    if (status === 'Healthy') return 'bg-emerald-500/15 text-emerald-300';
    if (status === 'Growth plan') return 'bg-blue-500/15 text-blue-200';
    if (status === 'Expansion') return 'bg-purple-500/15 text-purple-200';
    return 'bg-amber-500/20 text-amber-200';
  };

  const totalPages = Math.max(1, Math.ceil(workspaceData.length / PAGE_SIZE));
  const pagedRows = workspaceData.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const downloadCsv = () => {
    const headers = ['Organization', 'Plan', 'Seats', 'Usage', 'CSM', 'Status'];
    const rows = pagedRows.map((row) => [
      row.org,
      row.plan,
      row.seats,
      `${Math.round(row.usage * 100)}%`,
      row.owner,
      row.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `workspace-health-page-${page + 1}.csv`;
    link.click();
  };

  return (
    <div className={`app-shell ${pageBackground}`}>
      <Header />
      <div
        className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16 ${
          isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-10 gap-6 lg:gap-8'
        }`}
      >
        <AdminSidebar active="workspace" />

        <main className="flex-1 space-y-6 lg:space-y-8 lg:pl-0 xl:pl-4">
          <section className={`${cardBase} ${sectionPadding}`}>
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Workspace health</p>
              <h1 className={`text-3xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Seat usage & plan fitness</h1>
              <p className={`text-sm ${subText}`}>
                Watch every firm’s capacity, understand who needs an upgrade, and keep CSM ownership balanced. Data refreshes every 10
                minutes.
              </p>
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Organizations</h2>
                <p className={`text-sm ${subText}`}>Usage, plan, and success-manager coverage.</p>
              </div>
              <button
                className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                onClick={downloadCsv}
              >
                Export CSV
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={isLight ? 'bg-slate-50' : 'bg-white/5'}>
                  <tr>
                    {['Organization', 'Plan', 'Seats', 'Usage', 'CSM', 'Status'].map((heading) => (
                      <th key={heading} className={`px-4 py-3 text-left font-semibold ${subText}`}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, idx) => (
                    <tr key={row.org} className={`${idx % 2 === 0 ? (isLight ? 'bg-white' : 'bg-white/10') : ''} border-b border-white/5`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{row.org}</p>
                        <p className={`text-xs ${subText}`}>AI drafting + WhatsApp concierge</p>
                      </td>
                      <td className="px-4 py-3">{row.plan}</td>
                      <td className="px-4 py-3">{row.seats}</td>
                      <td className="px-4 py-3">{usageBar(row.usage)}</td>
                      <td className="px-4 py-3">{row.owner}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusChip(row.status)}`}>{row.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between pt-2">
              <p className={`text-xs ${subText}`}>
                Showing {(page * PAGE_SIZE) + 1}–{Math.min((page + 1) * PAGE_SIZE, workspaceData.length)} of {workspaceData.length}
              </p>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded-lg border border-white/20 text-sm text-white/80 disabled:opacity-40"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <button
                  className="px-3 py-1 rounded-lg border border-white/20 text-sm text-white/80 disabled:opacity-40"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default withAuth(WorkspacePage);

