'use client';

import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color?: 'green' | 'yellow' | 'blue' | 'purple';
  loading?: boolean;
}

const iconBackgrounds: Record<NonNullable<SummaryCardProps['color']>, string> = {
  green: 'bg-[linear-gradient(135deg,_rgba(26,188,156,0.45)_0%,_rgba(7,109,95,0.95)_100%)]',
  yellow: 'bg-[linear-gradient(135deg,_rgba(254,214,110,0.5)_0%,_rgba(204,145,15,0.9)_100%)]',
  blue: 'bg-[linear-gradient(135deg,_rgba(123,178,255,0.45)_0%,_rgba(41,95,175,0.95)_100%)]',
  purple: 'bg-[linear-gradient(135deg,_rgba(196,146,255,0.5)_0%,_rgba(108,65,190,0.95)_100%)]',
};

export default function SummaryCard({ title, value, icon, color = 'green', loading = false }: SummaryCardProps) {
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';

  const padding = isCompact ? 'px-5 py-4' : 'px-7 py-6';
  const valueSize = isCompact ? 'text-[32px]' : 'text-[36px]';
  const iconBoxSize = isCompact ? 'w-12 h-12' : 'w-14 h-14';

  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';
  const containerStyles = isLight
    ? `border ${borderColor} bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]`
    : `border ${borderColor} bg-white/5 shadow-[0_12px_26px_rgba(0,0,0,0.28)]`;

  return (
    <div className={`flex items-center justify-between rounded-[18px] ${padding} transition ${containerStyles}`}>
      <div>
        <p className={`text-[18px] font-medium ${isLight ? 'text-slate-500' : 'text-[#dfe6ff]'}`}>{title}</p>
        {loading ? (
          <div className={`mt-[6px] ${valueSize} leading-none ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('common.loading')}
          </div>
        ) : (
          <p className={`mt-[6px] ${valueSize} leading-none font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{value}</p>
        )}
      </div>
      <div
        className={`${iconBoxSize} rounded-[14px] flex items-center justify-center border shadow-[0_6px_16px_rgba(12,30,65,0.18)] ${isLight ? 'border-slate-100 bg-white' : 'border-white/15 bg-white/10'
          } ${iconBackgrounds[color]}`}
      >
        <span className={`text-[28px] flex items-center justify-center ${isLight ? 'text-emerald-500' : 'text-[#c7fff2]'}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

