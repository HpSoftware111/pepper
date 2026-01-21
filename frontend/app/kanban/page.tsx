'use client';

import Header from '@/components/Header';
import Kanban from '@/components/Kanban';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';

function KanbanPage() {
    const { themeMode, layoutDensity } = useThemeMode();
    const isLight = themeMode === 'light';
    const isCompact = layoutDensity === 'compact';

    const shellGaps = isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-8 gap-6 lg:gap-8';

    return (
        <div className="app-shell">
            <Header />

            <div className={`flex flex-1 flex-col px-4 sm:px-6 lg:px-20 ${shellGaps}`}>
                <main className={`w-full flex-1 ${isCompact ? 'pt-1' : 'pt-2'}`}>
                    <div className={`${isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'} ${
                        isLight
                            ? 'rounded-[24px] border border-slate-200 bg-white shadow-[0_25px_55px_rgba(15,23,42,0.08)]'
                            : 'rounded-[24px] border border-white/5 bg-[rgba(5,18,45,0.55)] shadow-[0_25px_55px_rgba(3,9,24,0.45)]'
                    }`}>
                        <Kanban />
                    </div>
                </main>
            </div>
        </div>
    );
}

export default withAuth(KanbanPage);

