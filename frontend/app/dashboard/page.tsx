'use client';

import { useMemo } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import SummaryCard from '@/components/SummaryCard';
import PriorityCases from '@/components/PriorityCases';
import RecentActivity from '@/components/RecentActivity';
import PepperAssistant from '@/components/PepperAssistant';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { useMCDData } from '@/hooks/useMCDData';

function DashboardPage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const { stats, priorityCases, recentActivities, loading, mcds, dashboardCases } = useMCDData();

  // Transform cases for sidebar (most recent 3 cases)
  const recentCasesForSidebar = useMemo(() => {
    const allCases = [
      ...mcds.map((mcd) => {
        // Determine status for sidebar
        let status: 'active' | 'pending' | 'urgent' = 'active';
        if (mcd.status === 'closed') {
          status = 'pending';
        } else if (mcd.deadlines && mcd.deadlines.some((d) => {
          const dueDate = new Date(d.due_date);
          const now = new Date();
          const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
          return dueDate >= now && dueDate <= threeDaysFromNow && !d.completed;
        })) {
          status = 'urgent';
        }

        return {
          id: mcd._id || mcd.case_id,
          case_id: mcd.case_id, // Include case_id for navigation
          name: `${mcd.case_id}: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
          type: (mcd as any).practice_area || 'General',
          status,
          timestamp: mcd.createdAt ? new Date(mcd.createdAt).getTime() : 0,
        };
      }),
      ...dashboardCases.map((dc) => ({
        id: dc.case_id,
        case_id: dc.case_id, // Include case_id for navigation
        name: `${dc.case_id}: ${dc.client}`,
        type: dc.practice || dc.type || 'General',
        status: dc.status as 'active' | 'pending' | 'urgent',
        timestamp: dc.recent_activity && dc.recent_activity.length > 0
          ? (() => {
            try {
              const time = new Date(dc.recent_activity[0].time);
              return isNaN(time.getTime()) ? 0 : time.getTime();
            } catch {
              return 0;
            }
          })()
          : 0,
      })),
    ];

    return allCases
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3)
      .map(({ timestamp, ...case_ }) => case_);
  }, [mcds, dashboardCases]);

  const shellGaps = isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-8 gap-6 lg:gap-8';
  const stackSpacing = isCompact ? 'space-y-4 lg:space-y-5' : 'space-y-6 lg:space-y-8';
  const summaryGap = isCompact ? 'gap-4' : 'gap-5';
  const middleGap = isCompact ? 'gap-4 lg:gap-5' : 'gap-6';
  const welcomeMargin = isCompact ? 'mt-2' : 'mt-4';

  const panelWrapper = isLight
    ? 'rounded-[24px] border border-slate-200 bg-white shadow-[0_25px_55px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] border border-white/5 bg-[rgba(5,18,45,0.55)] shadow-[0_25px_55px_rgba(3,9,24,0.45)]';

  const headingColor = isLight ? 'text-slate-900' : 'text-slate-50';
  const subheadingColor = isLight ? 'text-slate-600' : 'text-slate-300';

  return (
    <div className="app-shell">
      <Header />

      <div className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-20 ${shellGaps}`}>
        <div className="w-full lg:w-[30%] lg:max-w-sm">
          <Sidebar recentCases={recentCasesForSidebar} />
        </div>

        <main
          className={`w-full lg:w-[70%] flex-1 ${isCompact ? 'pt-1' : 'pt-2'} lg:pt-0 lg:pl-6 lg:pr-8 ${isLight ? 'lg:border-l lg:border-slate-200' : 'lg:border-l lg:border-slate-800/70'
            }`}
        >
          <div className={`${panelWrapper} ${isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'} lg:p-0 lg:border-none lg:bg-transparent lg:shadow-none lg:rounded-none`}>
            <div className={stackSpacing}>
              {/* Welcome Header */}
              <section className={welcomeMargin}>
                <h1 className={`text-3xl font-semibold ${headingColor} mb-1`}>{t('dashboard.welcomeBack')}</h1>
                <p className={`text-sm ${subheadingColor}`}>{t('dashboard.welcomeSubtitle')}</p>
              </section>

              {/* Summary Cards */}
              <section>
                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 ${summaryGap}`}>
                  <SummaryCard
                    title={t('dashboard.totalCases')}
                    value={stats.totalCases}
                    loading={loading}
                    icon={
                      <svg className={`w-6 h-6 ${isLight ? 'text-slate-700' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5h6a2 2 0 012 2v1h3a1 1 0 011 1v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a1 1 0 011-1h3V7a2 2 0 012-2zm0 0V4a1 1 0 011-1h4a1 1 0 011 1v1"
                        />
                      </svg>
                    }
                  />

                  <SummaryCard
                    title={t('dashboard.activeCases')}
                    value={stats.activeCases}
                    loading={loading}
                    icon={
                      <svg className={`w-6 h-6 ${isLight ? 'text-slate-700' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5h6a2 2 0 012 2v1h3a1 1 0 011 1v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a1 1 0 011-1h3V7a2 2 0 012-2zm0 0V4a1 1 0 011-1h4a1 1 0 011 1v1"
                        />
                      </svg>
                    }
                    color="green"
                  />

                  <SummaryCard
                    title={t('dashboard.upcomingDeadlines')}
                    value={stats.upcomingDeadlines}
                    loading={loading}
                    icon={
                      <svg className={`w-6 h-6 ${isLight ? 'text-slate-700' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    }
                    color="yellow"
                  />

                  <SummaryCard
                    title={t('dashboard.documents')}
                    value={stats.totalDocuments}
                    loading={loading}
                    icon={
                      <svg className={`w-8 h-8 ${isLight ? 'text-slate-700' : 'text-white'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M8 4h7l5 5v9a2 2 0 01-2 2H8a2 2 0 01-2-2V6a2 2 0 012-2z" />
                      </svg>
                    }
                    color="blue"
                  />
                </div>
              </section>

              {/* Middle Row */}
              <section>
                <div className={`grid grid-cols-1 lg:grid-cols-2 ${middleGap}`}>
                  <PriorityCases priorityCases={priorityCases} loading={loading} />
                  <RecentActivity activities={recentActivities} loading={loading} />
                </div>
              </section>

              {/* Bottom Row */}
              <section>
                <PepperAssistant />
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default withAuth(DashboardPage);

