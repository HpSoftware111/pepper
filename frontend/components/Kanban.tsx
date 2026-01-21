'use client';

import { useState, useMemo } from 'react';
import { useMCDData } from '@/hooks/useMCDData';
import { mcdClient, type MasterCaseDocument, type MCDStatus } from '@/lib/mcdClient';
import { dashboardAgentClient } from '@/lib/dashboardAgentClient';
import type { DashboardTemplate } from '@/lib/dashboardTemplate';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useRouter } from 'next/navigation';

type KanbanColumn = {
    id: MCDStatus;
    title: string;
    color: string;
    bgColor: string;
    borderColor: string;
};

const columns: KanbanColumn[] = [
    { id: 'new', title: 'New', color: 'text-blue-600', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
    { id: 'review', title: 'Review', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200' },
    { id: 'in_progress', title: 'In Progress', color: 'text-purple-600', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
    { id: 'appeals', title: 'Appeals', color: 'text-orange-600', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
    { id: 'pending_decision', title: 'Pending Decision', color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' },
    { id: 'closed', title: 'Closed', color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
];

const darkColumns: KanbanColumn[] = [
    { id: 'new', title: 'New', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-400/30' },
    { id: 'review', title: 'Review', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-400/30' },
    { id: 'in_progress', title: 'In Progress', color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-400/30' },
    { id: 'appeals', title: 'Appeals', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-400/30' },
    { id: 'pending_decision', title: 'Pending Decision', color: 'text-indigo-400', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-400/30' },
    { id: 'closed', title: 'Closed', color: 'text-gray-400', bgColor: 'bg-gray-500/10', borderColor: 'border-gray-400/30' },
];

// Unified case type for Kanban board
type UnifiedCase = {
    id: string;
    case_id: string;
    displayName: string;
    case_type: string;
    status: MCDStatus;
    source: 'mcd' | 'dashboard';
    upcomingDeadline: string | null;
    nextActionsCount: number;
    mcd?: MasterCaseDocument;
    dashboardCase?: DashboardTemplate;
};

/**
 * Map Dashboard Agent status to MCD status
 */
function mapDashboardStatusToMCD(dashboardStatus: 'active' | 'pending' | 'urgent'): MCDStatus {
    const statusMap: Record<'active' | 'pending' | 'urgent', MCDStatus> = {
        active: 'in_progress',
        pending: 'review',
        urgent: 'new',
    };
    return statusMap[dashboardStatus] || 'new';
}

/**
 * Map MCD status to Dashboard Agent status
 */
function mapMCDStatusToDashboard(mcdStatus: MCDStatus): 'active' | 'pending' | 'urgent' {
    const statusMap: Partial<Record<MCDStatus, 'active' | 'pending' | 'urgent'>> = {
        new: 'urgent',
        review: 'pending',
        in_progress: 'active',
        appeals: 'active',
        pending_decision: 'pending',
        closed: 'pending', // Dashboard Agent doesn't have 'closed', use 'pending' as fallback
    };
    return statusMap[mcdStatus] || 'active';
}

export default function Kanban() {
    const { themeMode } = useThemeMode();
    const isLight = themeMode === 'light';
    const router = useRouter();
    const { mcds, dashboardCases, loading, error, refetch } = useMCDData();
    const [draggedCase, setDraggedCase] = useState<string | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());

    const activeColumns = isLight ? columns : darkColumns;

    // Get upcoming deadline for a case
    const getUpcomingDeadline = (deadlines: Array<{ due_date?: string; due?: string; completed?: boolean }>): string | null => {
        const now = new Date();
        const upcoming = deadlines
            ?.filter((d) => {
                const dueDate = d.due_date ? new Date(d.due_date) : d.due ? new Date(d.due) : null;
                return dueDate && !d.completed && dueDate >= now;
            })
            .sort((a, b) => {
                const dateA = a.due_date ? new Date(a.due_date) : a.due ? new Date(a.due) : new Date(0);
                const dateB = b.due_date ? new Date(b.due_date) : b.due ? new Date(b.due) : new Date(0);
                return dateA.getTime() - dateB.getTime();
            })[0];

        if (!upcoming) return null;

        const dueDate = upcoming.due_date ? new Date(upcoming.due_date) : upcoming.due ? new Date(upcoming.due) : null;
        if (!dueDate) return null;

        const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return 'Overdue';
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Tomorrow';
        return `In ${diffDays} days`;
    };

    // Transform all cases into unified format
    const unifiedCases = useMemo((): UnifiedCase[] => {
        const cases: UnifiedCase[] = [];

        // Add MCD cases
        mcds.forEach((mcd) => {
            if (mcd.status) {
                cases.push({
                    id: mcd._id || mcd.case_id,
                    case_id: mcd.case_id,
                    displayName: `${mcd.case_id}: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                    case_type: mcd.case_type || 'General',
                    status: mcd.status,
                    source: 'mcd',
                    upcomingDeadline: getUpcomingDeadline(mcd.deadlines || []),
                    nextActionsCount: mcd.next_actions?.length || 0,
                    mcd,
                });
            }
        });

        // Add Dashboard Agent cases
        dashboardCases.forEach((dashboardCase) => {
            const mcdStatus = mapDashboardStatusToMCD(dashboardCase.status);
            cases.push({
                id: `dashboard-${dashboardCase.case_id}`,
                case_id: dashboardCase.case_id,
                displayName: `${dashboardCase.case_id}: ${dashboardCase.client}`,
                case_type: dashboardCase.practice || dashboardCase.type || 'General',
                status: mcdStatus,
                source: 'dashboard',
                upcomingDeadline: getUpcomingDeadline(dashboardCase.deadlines || []),
                nextActionsCount: 0, // Dashboard Agent doesn't track next_actions
                dashboardCase,
            });
        });

        return cases;
    }, [mcds, dashboardCases]);

    // Group cases by status
    const casesByStatus = useMemo(() => {
        const grouped: Record<MCDStatus, UnifiedCase[]> = {
            new: [],
            review: [],
            in_progress: [],
            appeals: [],
            pending_decision: [],
            closed: [],
        };

        unifiedCases.forEach((case_) => {
            if (case_.status && grouped[case_.status]) {
                grouped[case_.status].push(case_);
            }
        });

        return grouped;
    }, [unifiedCases]);

    const handleDragStart = (caseId: string) => {
        setDraggedCase(caseId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (newStatus: MCDStatus) => {
        if (!draggedCase) return;

        const caseToUpdate = unifiedCases.find((c) => c.id === draggedCase || c.case_id === draggedCase);
        if (!caseToUpdate || caseToUpdate.status === newStatus) {
            setDraggedCase(null);
            return;
        }

        // Optimistic update
        setUpdatingStatus((prev) => new Set(prev).add(draggedCase));

        try {
            if (caseToUpdate.source === 'mcd' && caseToUpdate.mcd) {
                // Update MCD case
                await mcdClient.updateMCD(caseToUpdate.case_id, { status: newStatus });
            } else if (caseToUpdate.source === 'dashboard' && caseToUpdate.dashboardCase) {
                // Update Dashboard Agent case
                const dashboardStatus = mapMCDStatusToDashboard(newStatus);
                await dashboardAgentClient.updateCase(caseToUpdate.case_id, { status: dashboardStatus });
            }

            // Refetch to get latest data
            await refetch();
        } catch (error) {
            console.error('Error updating case status:', error);
            // Refetch to revert optimistic update
            await refetch();
        } finally {
            setUpdatingStatus((prev) => {
                const next = new Set(prev);
                next.delete(draggedCase);
                return next;
            });
            setDraggedCase(null);
        }
    };

    const handleCaseClick = (caseId: string, displayName: string) => {
        router.push(`/calendar?case=${encodeURIComponent(caseId)}&caseName=${encodeURIComponent(displayName)}`);
    };

    if (loading) {
        return (
            <div className={`flex items-center justify-center h-64 ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <p>Loading cases...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-6 rounded-xl ${isLight ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                <p className="font-semibold">Error loading cases</p>
                <p className="text-sm mt-1">{error}</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="mb-6">
                <h2 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Case Kanban Board</h2>
                <p className={`text-sm mt-1 ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                    Drag and drop cases to update their status
                </p>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-4">
                {activeColumns.map((column) => {
                    const cases = casesByStatus[column.id];
                    const isUpdating = cases.some((c) => updatingStatus.has(c.id));

                    return (
                        <div
                            key={column.id}
                            className={`flex-shrink-0 w-80 rounded-xl border-2 p-4 ${column.borderColor} ${column.bgColor} ${isLight ? 'bg-white' : 'bg-white/5'}`}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(column.id)}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`font-semibold text-lg ${column.color}`}>
                                    {column.title}
                                </h3>
                                <span className={`text-sm font-medium px-2 py-1 rounded-full ${column.bgColor} ${column.color}`}>
                                    {cases.length}
                                </span>
                            </div>

                            <div className="space-y-3 min-h-[200px]">
                                {cases.map((case_) => {
                                    const isDragging = draggedCase === case_.id;
                                    const isUpdatingCase = updatingStatus.has(case_.id);

                                    return (
                                        <div
                                            key={case_.id}
                                            draggable={!isUpdatingCase}
                                            onDragStart={() => handleDragStart(case_.id)}
                                            className={`p-4 rounded-lg border cursor-move transition-all ${isLight
                                                ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                                                : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                                                } ${isDragging ? 'opacity-50' : ''} ${isUpdatingCase ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                                            onClick={() => !isUpdatingCase && handleCaseClick(case_.case_id, case_.displayName)}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <h4 className={`font-semibold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                                        {case_.case_id}
                                                    </h4>
                                                    {case_.source === 'dashboard' && (
                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300'
                                                            }`}>
                                                            DA
                                                        </span>
                                                    )}
                                                </div>
                                                {isUpdatingCase && (
                                                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                                )}
                                            </div>

                                            <p className={`text-xs mb-2 line-clamp-2 ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                                                {case_.displayName}
                                            </p>

                                            {case_.case_type && (
                                                <span className={`inline-block text-xs px-2 py-1 rounded mb-2 ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white/70'
                                                    }`}>
                                                    {case_.case_type}
                                                </span>
                                            )}

                                            {case_.upcomingDeadline && (
                                                <div className={`mt-2 text-xs font-medium ${case_.upcomingDeadline === 'Overdue' || case_.upcomingDeadline === 'Today'
                                                    ? 'text-red-600'
                                                    : case_.upcomingDeadline === 'Tomorrow'
                                                        ? 'text-orange-600'
                                                        : 'text-emerald-600'
                                                    }`}>
                                                    📅 {case_.upcomingDeadline}
                                                </div>
                                            )}

                                            {case_.nextActionsCount > 0 && (
                                                <div className={`mt-2 text-xs ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                                                    {case_.nextActionsCount} action{case_.nextActionsCount !== 1 ? 's' : ''}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {cases.length === 0 && (
                                    <div className={`text-center py-8 text-sm ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
                                        No cases
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

