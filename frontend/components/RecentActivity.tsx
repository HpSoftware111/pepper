'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import type { RecentActivity } from '@/hooks/useMCDData';

interface RecentActivityProps {
  activities: RecentActivity[];
  loading?: boolean;
}

export default function RecentActivity({ activities, loading = false }: RecentActivityProps) {
  const router = useRouter();
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll effect
  useEffect(() => {
    if (!scrollContainerRef.current || loading || activities.length <= 3) return;

    const container = scrollContainerRef.current;
    let scrollInterval: NodeJS.Timeout;
    let isPaused = false;

    const startScrolling = () => {
      scrollInterval = setInterval(() => {
        if (!isPaused && container) {
          if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
            // Reached bottom, scroll to top smoothly
            container.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            // Scroll down slowly
            container.scrollBy({ top: 0.5, behavior: 'auto' });
          }
        }
      }, 30); // Update every 30ms for smooth scrolling
    };

    const handleMouseEnter = () => {
      isPaused = true;
    };

    const handleMouseLeave = () => {
      isPaused = false;
    };

    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    startScrolling();

    return () => {
      clearInterval(scrollInterval);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [activities.length, loading]);

  const containerPadding = isCompact ? 'px-5 py-5' : 'px-7 py-7';
  const listGap = isCompact ? 'gap-3.5' : 'gap-[18px]';
  const itemPadding = isCompact ? 'px-4 py-3.5' : 'px-5 py-4';

  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';
  const containerStyles = isLight
    ? `bg-white text-slate-900 border ${borderColor} shadow-[0_15px_35px_rgba(15,23,42,0.08)]`
    : `text-white bg-white/5 border ${borderColor} shadow-[0_12px_28px_rgba(0,0,0,0.35)] backdrop-blur`;

  const handleActivityClick = (activity: RecentActivity) => {
    // If activity has case_id, navigate to calendar with case filter
    if (activity.case_id) {
      const params = new URLSearchParams();
      params.set('case', activity.case_id);
      if (activity.caseName) {
        params.set('caseName', activity.caseName);
      }
      router.push(`/calendar?${params.toString()}`);
    } else {
      // For activities without case_id, navigate based on type
      switch (activity.type) {
        case 'document':
          router.push('/files');
          break;
        case 'deadline':
        case 'mcd_created':
        case 'mcd_updated':
        default:
          router.push('/cases');
          break;
      }
    }
  };

  return (
    <div className={`w-full rounded-[18px] ${containerPadding} box-border font-[system-ui] transition ${containerStyles}`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-[18px]">
        <h3
          className={`text-[26px] font-bold tracking-[-0.02em] ${isLight ? 'text-slate-900' : 'text-white'
            }`}
        >
          {t('dashboard.recentActivity')}
        </h3>
        <button
          onClick={() => router.push('/cases')}
          className={`text-[14px] font-semibold cursor-pointer transition-colors ${isLight ? 'text-emerald-600 hover:text-emerald-500' : 'text-[#22c385] hover:text-[#4be1a0]'
            }`}
        >
          {t('common.viewAll')}
        </button>
      </div>

      {/* List */}
      <div className={`flex flex-col ${listGap} relative overflow-hidden`} style={{ maxHeight: '400px' }}>
        <div
          ref={scrollContainerRef}
          className={`overflow-y-auto scroll-smooth flex flex-col ${listGap} [&::-webkit-scrollbar]:hidden`}
          style={{
            maxHeight: '400px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingLeft: '10px',
            paddingRight: '10px'
          }}
          onWheel={(e) => {
            // Allow manual scrolling
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
          {loading ? (
            <div className={`${itemPadding} flex items-center justify-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('files.loadingActivities')}
            </div>
          ) : activities.length === 0 ? (
            <div className={`${itemPadding} flex items-center justify-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('dashboard.noRecentActivity')}
            </div>
          ) : (
            activities.map((activity) => (
              <div
                key={activity.id}
                onClick={() => handleActivityClick(activity)}
                className={`group flex items-center gap-4 rounded-[16px] ${itemPadding} border ${borderColor} shadow-[0_10px_24px_rgba(6,13,30,0.18)] cursor-pointer transition-all hover:scale-[1.02] ${isLight ? 'bg-white hover:shadow-[0_12px_28px_rgba(6,13,30,0.22)]' : 'bg-white/5 hover:bg-white/8 hover:shadow-[0_12px_28px_rgba(0,0,0,0.4)]'
                  }`}
              >
                <div className="w-11 h-11 min-w-11 rounded-full inline-grid place-items-center shadow-[0_6px_14px_rgba(11,73,90,0.12)] bg-[radial-gradient(circle_at_30%_30%,rgba(54,191,140,0.22)_0%,rgba(12,126,158,0.12)_35%,rgba(9,28,56,0.08)_100%)] text-[#16c9a0] text-[16px]">
                  {activity.icon}
                </div>
                <div className="flex flex-col gap-[6px] flex-1">
                  <p className={`text-[18px] font-semibold m-0 ${isLight ? 'text-slate-900' : 'text-white'}`}>{activity.message}</p>
                  <p className={`text-[13px] font-medium m-0 ${isLight ? 'text-slate-500' : 'text-[#9fb0c9]'}`}>{activity.time}</p>
                </div>
                {/* Arrow indicator */}
                <div
                  className={`text-sm flex items-center justify-center transition-transform duration-200 ease-out group-hover:translate-x-1 ${isLight ? 'text-emerald-500' : 'text-[#3ddc84]'
                    }`}
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

