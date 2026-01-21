'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import type { PriorityCase } from '@/hooks/useMCDData';

interface PriorityCasesProps {
  priorityCases: PriorityCase[];
  loading?: boolean;
}

export default function PriorityCases({ priorityCases, loading = false }: PriorityCasesProps) {
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const getStatusColor = (status: string) => {
    return status === 'urgent' ? 'bg-[#ff4f4f]' : 'bg-[#ffd439]';
  };

  // Auto-scroll effect
  useEffect(() => {
    if (!scrollContainerRef.current || loading || priorityCases.length <= 3) return;

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
  }, [priorityCases.length, loading]);

  const handleCaseClick = (caseItem: PriorityCase) => {
    // Navigate to calendar page with case information
    const params = new URLSearchParams();
    params.set('case', caseItem.case_id || caseItem.id);
    if (caseItem.name) {
      params.set('caseName', caseItem.name);
    }
    router.push(`/calendar?${params.toString()}`);
  };

  const { themeMode, layoutDensity } = useThemeMode();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';

  const containerPadding = isCompact ? 'px-5 py-5' : 'px-7 py-7';
  const itemSpacing = isCompact ? 'mt-3 px-4 py-4' : 'mt-[14px] px-5 py-[18px]';

  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';
  const containerStyles = isLight
    ? `bg-white border ${borderColor} shadow-[0_15px_35px_rgba(15,23,42,0.08)]`
    : `bg-white/5 border ${borderColor} shadow-[0_12px_28px_rgba(0,0,0,0.4)] backdrop-blur`;

  return (
    <div className={`w-full rounded-[18px] ${containerPadding} box-border transition ${containerStyles}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className={`text-[26px] font-bold tracking-[-0.02em] ${isLight ? 'text-slate-900' : 'text-white'
            }`}
        >
          {t('dashboard.priorityCases')}
        </h3>
        {!loading && (
          <span
            className={`text-[14px] font-medium px-4 py-[6px] rounded-full ${isLight ? 'bg-rose-100 text-rose-700' : 'bg-[rgba(255,255,255,0.14)] text-[#ffd7df]'
              }`}
          >
            {priorityCases.filter((c) => c.status === 'urgent').length} {t('dashboard.urgent')}
          </span>
        )}
      </div>

      {/* Case items */}
      <div className="relative overflow-hidden" style={{ maxHeight: '400px' }}>
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden"
          style={{
            maxHeight: '400px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            padding: '10px'
          }}
          onWheel={(e) => {
            // Allow manual scrolling
            e.currentTarget.scrollTop += e.deltaY;
          }}
        >
          {loading ? (
            <div className={`${itemSpacing} flex items-center justify-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('common.loading')}
            </div>
          ) : priorityCases.length === 0 ? (
            <div className={`${itemSpacing} flex items-center justify-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {t('dashboard.noPriorityCases')}
            </div>
          ) : (
            priorityCases.map((caseItem) => (
              <div
                key={caseItem.id}
                onClick={() => handleCaseClick(caseItem)}
                className={`group ${itemSpacing} flex items-center justify-between rounded-[16px] border ${borderColor} cursor-pointer transition hover:scale-[1.02] ${isLight ? 'bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_32px_rgba(15,23,42,0.12)]' : 'bg-white/5 shadow-[0_10px_26px_rgba(0,0,0,0.35)] hover:bg-white/8 hover:shadow-[0_12px_30px_rgba(0,0,0,0.45)]'
                  }`}
              >
                {/* Left: status dot + text */}
                <div className="flex items-center">
                  <div className={`w-[18px] h-[18px] rounded-full mr-[14px] shadow-[0_0_10px_rgba(0,0,0,0.25)] ${getStatusColor(caseItem.status)}`} />
                  <div className="flex-1">
                    <div
                      className={`text-[17px] font-medium ${isLight ? 'text-slate-900' : 'text-white'
                        }`}
                    >
                      {caseItem.name}
                    </div>
                    <div
                      className={`mt-[4px] text-[14px] ${isLight ? 'text-slate-500' : 'text-[#b9c3d9]'
                        }`}
                    >
                      {caseItem.description}
                    </div>
                    {/* Additional case details */}
                    <div className={`mt-2 space-y-1 text-[12px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                      {caseItem.court && <div>{t('cases.court')}: {caseItem.court}</div>}
                      {/* {caseItem.plaintiff && caseItem.defendant && (
                        <div>{caseItem.plaintiff} vs. {caseItem.defendant}</div>
                      )} */}
                      {/* {caseItem.last_action && <div>Last Action: {caseItem.last_action}</div>}
                      {caseItem.next_hearing && caseItem.next_hearing !== 'N/A' && (
                        <div>Next Hearing: {caseItem.next_hearing}</div>
                      )}
                      {caseItem.case_status && <div>Status: {caseItem.case_status}</div>} */}
                    </div>
                  </div>
                </div>

                {/* Right: arrow */}
                <div
                  className={`text-[22px] flex items-center justify-center transition-transform duration-200 ease-out group-hover:translate-x-1 group-hover:scale-110 ${isLight ? 'text-emerald-500' : 'text-[#3ddc84]'
                    }`}
                >
                  <svg
                    className="w-[22px] h-[22px]"
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

