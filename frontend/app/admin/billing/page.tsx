'use client';

import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import AdminSidebar from '@/components/AdminSidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { adminClient, type BillingSummary } from '@/lib/adminClient';

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const statusChip = (status: string) => {
  if (status === 'paid') return 'bg-emerald-500/15 text-emerald-300';
  if (status === 'overdue') return 'bg-rose-500/20 text-rose-200';
  return 'bg-amber-500/20 text-amber-200';
};

function BillingPage() {
  const { user } = useAuth();
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

  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoicePage, setInvoicePage] = useState(0);
  const INVOICE_PAGE_SIZE = 5;

  const isAdmin = user?.role === 'admin';

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const data = await adminClient.getBillingSummary();
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load billing summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSummary();
    }
  }, [isAdmin]);

  const monthly = summary?.monthly ?? [];
  const maxValue = monthly.reduce((max, entry) => Math.max(max, entry.arr), 0) || 1;
  const pagedInvoices = useMemo(() => {
    if (!summary) return [];
    return summary.recentInvoices.slice(invoicePage * INVOICE_PAGE_SIZE, invoicePage * INVOICE_PAGE_SIZE + INVOICE_PAGE_SIZE);
  }, [invoicePage, summary]);
  const invoicePages = summary ? Math.max(1, Math.ceil(summary.recentInvoices.length / INVOICE_PAGE_SIZE)) : 1;

  useEffect(() => {
    setInvoicePage(0);
  }, [summary]);

  const openStripeDashboard = () => {
    if (typeof window === 'undefined') return;
    window.open(process.env.NEXT_PUBLIC_STRIPE_DASHBOARD_URL || 'https://dashboard.stripe.com', '_blank', 'noopener,noreferrer');
  };

  const exportInvoices = () => {
    if (!pagedInvoices.length) return;
    const rows = pagedInvoices.map((invoice) => [
      invoice.orgName,
      invoice.plan ?? 'Custom',
      currency(invoice.amount),
      invoice.status,
      new Date(invoice.dueDate).toLocaleDateString(),
    ]);
    const csv = [['Organization', 'Plan', 'Amount', 'Status', 'Due date'], ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `invoices-page-${invoicePage + 1}.csv`;
    link.click();
  };

  if (!isAdmin) {
    return (
      <div className={`app-shell ${pageBackground}`}>
        <Header />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className={`${cardBase} ${sectionPadding} text-center`}>
            <p className="text-sm uppercase tracking-[0.35em] text-rose-400">Restricted</p>
            <p className="mt-3 text-xl font-semibold text-white">Admin access required</p>
            <p className={`mt-2 text-sm ${subText}`}>You need admin permissions to view billing details.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${pageBackground}`}>
      <Header />
      <div
        className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16 ${
          isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-10 gap-6 lg:gap-8'
        }`}
      >
        <AdminSidebar active="billing" />

        <main className="flex-1 space-y-6 lg:space-y-8 lg:pl-0 xl:pl-4">
          <section className={`${cardBase} ${sectionPadding}`}>
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>Billing & payments</p>
              <h1 className={`text-3xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Stripe mirror & ARR tracking</h1>
              <p className={`text-sm ${subText}`}>
                See every client’s ARR, payment method, and next invoice date. Initiate dunning or upgrade workflows directly from here.
              </p>
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-6`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>ARR overview</h2>
                <p className={`text-sm ${subText}`}>Last six months of billing performance.</p>
              </div>
              <button
                onClick={fetchSummary}
                className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
              >
                Refresh
              </button>
            </div>
            {loading && <p className={`text-sm ${subText}`}>Loading billing data…</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            {!loading && !error && summary && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/5 px-4 py-3 text-white">
                    <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Total ARR</p>
                    <p className="mt-2 text-2xl font-semibold">{currency(summary.totals.arr)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-4 py-3 text-white">
                    <p className="text-xs uppercase tracking-[0.3em] text-blue-300">Paid</p>
                    <p className="mt-2 text-2xl font-semibold">{currency(summary.totals.paid)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-4 py-3 text-white">
                    <p className="text-xs uppercase tracking-[0.3em] text-rose-300">Overdue</p>
                    <p className="mt-2 text-2xl font-semibold">{currency(summary.totals.overdue)}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-end gap-4 overflow-x-auto pb-2">
                  {monthly.length === 0 && <p className={`text-sm ${subText}`}>No invoices yet.</p>}
                  {monthly.map((entry) => (
                    <div key={entry.month} className="flex flex-col items-center gap-2">
                      <div className="flex w-16 flex-col justify-end rounded-full bg-white/5 p-1" style={{ height: 160 }}>
                        <div
                          className="rounded-full bg-emerald-400/80"
                          style={{ height: `${Math.max((entry.paid / maxValue) * 100, 4)}%` }}
                          title={`Paid ${currency(entry.paid)}`}
                        />
                        <div
                          className="mt-1 rounded-full bg-amber-400/70"
                          style={{ height: `${Math.max((entry.overdue / maxValue) * 100, 2)}%` }}
                          title={`Overdue ${currency(entry.overdue)}`}
                        />
                      </div>
                      <p className="text-xs font-semibold text-white">{entry.month}</p>
                      <p className={`text-[11px] ${subText}`}>{currency(entry.arr)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Recent invoices</h2>
                <p className={`text-sm ${subText}`}>Mirror of Stripe data with Pepper context.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                  onClick={openStripeDashboard}
                >
                  Open Stripe
                </button>
                <button
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                  onClick={exportInvoices}
                >
                  Export invoices
                </button>
              </div>
            </div>

            {loading && <p className={`text-sm ${subText}`}>Loading invoices…</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            {!loading && !error && summary && (
              <>
                <div className="space-y-3">
                  {summary.recentInvoices.length === 0 && <p className={`text-sm ${subText}`}>No invoices available.</p>}
                  {pagedInvoices.map((invoice) => (
                    <div key={invoice.id} className={`rounded-2xl border ${borderColor} px-4 py-3 flex flex-col gap-2 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{invoice.orgName}</p>
                      <span className="text-xs font-semibold">{invoice.paymentMethod || 'Card'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span>
                        {invoice.plan || 'Custom'} • {currency(invoice.amount)}
                      </span>
                      <span className={subText}>
                        Due {new Date(invoice.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusChip(invoice.status)}`}>{invoice.status}</span>
                    </div>
                  </div>
                  ))}
                </div>
                {summary.recentInvoices.length > INVOICE_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-3">
                    <p className={`text-xs ${subText}`}>
                      Showing {(invoicePage * INVOICE_PAGE_SIZE) + 1}–
                      {Math.min((invoicePage + 1) * INVOICE_PAGE_SIZE, summary.recentInvoices.length)} of {summary.recentInvoices.length}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 disabled:opacity-40"
                        disabled={invoicePage === 0}
                        onClick={() => setInvoicePage((prev) => Math.max(0, prev - 1))}
                      >
                        Prev
                      </button>
                      <button
                        className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 disabled:opacity-40"
                        disabled={invoicePage >= invoicePages - 1}
                        onClick={() => setInvoicePage((prev) => Math.min(invoicePages - 1, prev + 1))}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default withAuth(BillingPage);

