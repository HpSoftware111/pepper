import { useState, useEffect } from 'react';
import { mcdClient, type MasterCaseDocument, type MCDStatus } from '@/lib/mcdClient';
import { dashboardAgentClient } from '@/lib/dashboardAgentClient';
import type { DashboardTemplate } from '@/lib/dashboardTemplate';

export interface MCDStats {
    totalCases: number;
    activeCases: number;
    upcomingDeadlines: number;
    totalDocuments: number;
}

export interface PriorityCase {
    id: string;
    case_id: string;
    name: string;
    description: string;
    status: 'urgent' | 'pending';
    deadline?: {
        title: string;
        due_date: string;
    };
    court?: string;
    plaintiff?: string;
    defendant?: string;
    last_action?: string;
    next_hearing?: string;
    case_status?: string;
}

export interface RecentActivity {
    id: string;
    message: string;
    icon: React.ReactNode;
    time: string;
    type: 'mcd_created' | 'mcd_updated' | 'deadline' | 'document';
    case_id?: string;
    caseName?: string;
}

export function useMCDData(): {
    mcds: MasterCaseDocument[];
    dashboardCases: DashboardTemplate[];
    loading: boolean;
    error: string | null;
    stats: MCDStats;
    priorityCases: PriorityCase[];
    recentActivities: RecentActivity[];
    refetch: () => Promise<void>;
} {
    const [mcds, setMcds] = useState<MasterCaseDocument[]>([]);
    const [dashboardCases, setDashboardCases] = useState<DashboardTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<MCDStats>({
        totalCases: 0,
        activeCases: 0,
        upcomingDeadlines: 0,
        totalDocuments: 0,
    });
    const [priorityCases, setPriorityCases] = useState<PriorityCase[]>([]);
    const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

    const fetchMCDs = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch both MCD and Dashboard Agent cases in parallel
            const [mcdResponse, dashboardAgentResponse] = await Promise.allSettled([
                mcdClient.getAllMCDs({ limit: 100 }),
                dashboardAgentClient.getAllCasesData(),
            ]);

            const mcds: MasterCaseDocument[] = [];
            const dashboardCases: DashboardTemplate[] = [];

            // Process MCD response
            if (mcdResponse.status === 'fulfilled' && mcdResponse.value.success) {
                mcds.push(...mcdResponse.value.mcds);
            } else if (mcdResponse.status === 'rejected') {
                console.error('Error fetching MCDs:', mcdResponse.reason);
            }

            // Process Dashboard Agent response
            if (dashboardAgentResponse.status === 'fulfilled' && dashboardAgentResponse.value.success) {
                console.log(`[useMCDData] Loaded ${dashboardAgentResponse.value.cases.length} Dashboard Agent case(s)`);
                dashboardCases.push(...dashboardAgentResponse.value.cases);
            } else if (dashboardAgentResponse.status === 'rejected') {
                console.error('[useMCDData] Error fetching Dashboard Agent cases:', dashboardAgentResponse.reason);
                console.error('[useMCDData] Error details:', {
                    message: dashboardAgentResponse.reason?.message,
                    stack: dashboardAgentResponse.reason?.stack,
                });
            } else if (dashboardAgentResponse.status === 'fulfilled' && !dashboardAgentResponse.value.success) {
                console.warn('[useMCDData] Dashboard Agent response not successful:', dashboardAgentResponse.value);
            }

            setMcds(mcds);
            setDashboardCases(dashboardCases);

            // Calculate stats, priority cases, and activities from both sources
            calculateStats(mcds, dashboardCases);
            calculatePriorityCases(mcds, dashboardCases);
            calculateRecentActivities(mcds, dashboardCases);
        } catch (err) {
            console.error('Error fetching cases:', err);
            setError((err as Error).message || 'Failed to fetch cases');
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (mcdCases: MasterCaseDocument[], dashboardCases: DashboardTemplate[]) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Set to start of today for proper comparison
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        sevenDaysFromNow.setHours(23, 59, 59, 999); // End of 7th day

        // Calculate MCD stats
        const activeStatuses: MCDStatus[] = ['new', 'review', 'in_progress', 'appeals', 'pending_decision'];
        const activeMcdCases = mcdCases.filter((c) => activeStatuses.includes(c.status));

        const mcdUpcomingDeadlines = mcdCases.reduce((count, c) => {
            return (
                count +
                c.deadlines.filter((d) => {
                    const dueDate = new Date(d.due_date);
                    dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
                    return dueDate >= now && dueDate <= sevenDaysFromNow && !d.completed;
                }).length
            );
        }, 0);

        const mcdTotalDocuments = mcdCases.reduce((count, c) => count + (c.last_documents?.length || 0), 0);

        // Calculate Dashboard Agent stats
        const activeDashboardCases = dashboardCases.filter((c) => c.status === 'active');

        const dashboardUpcomingDeadlines = dashboardCases.reduce((count, c) => {
            return (
                count +
                (c.deadlines || []).filter((d) => {
                    const dueDate = new Date(d.due);
                    dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
                    return dueDate >= now && dueDate <= sevenDaysFromNow && !d.completed;
                }).length
            );
        }, 0);

        // Combine stats
        setStats({
            totalCases: mcdCases.length + dashboardCases.length,
            activeCases: activeMcdCases.length + activeDashboardCases.length,
            upcomingDeadlines: mcdUpcomingDeadlines + dashboardUpcomingDeadlines,
            totalDocuments: mcdTotalDocuments, // Dashboard Agent doesn't track documents separately
        });
    };

    const calculatePriorityCases = (mcdCases: MasterCaseDocument[], dashboardCases: DashboardTemplate[]) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Set to start of today
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        threeDaysFromNow.setHours(23, 59, 59, 999); // End of 3rd day
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        sevenDaysFromNow.setHours(23, 59, 59, 999); // End of 7th day

        const priority: PriorityCase[] = [];

        // Process MCD cases
        mcdCases.forEach((mcd) => {
            const urgentDeadlines = mcd.deadlines.filter((d) => {
                const dueDate = new Date(d.due_date);
                dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
                return dueDate >= now && dueDate <= threeDaysFromNow && !d.completed;
            });

            const pendingDeadlines = mcd.deadlines.filter((d) => {
                const dueDate = new Date(d.due_date);
                dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
                return (
                    dueDate >= threeDaysFromNow &&
                    dueDate <= sevenDaysFromNow &&
                    !d.completed &&
                    !urgentDeadlines.some((ud) => ud.title === d.title)
                );
            });

            urgentDeadlines.forEach((deadline) => {
                priority.push({
                    id: `mcd-${mcd.case_id}-${deadline.title}`,
                    case_id: mcd.case_id,
                    name: `${mcd.case_id}: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                    description: `${deadline.title} - ${formatDeadlineDate(deadline.due_date)}`,
                    status: 'urgent',
                    deadline: {
                        title: deadline.title,
                        due_date: deadline.due_date,
                    },
                    court: (mcd as any).court || 'Not specified',
                    plaintiff: mcd.parties?.plaintiff || 'N/A',
                    defendant: mcd.parties?.defendant || 'N/A',
                    last_action: (mcd as any).last_action || 'No actions recorded',
                    next_hearing: 'N/A', // MCD doesn't track hearings directly
                    case_status: mcd.status || 'N/A',
                });
            });

            if (priority.length < 5) {
                pendingDeadlines.slice(0, 5 - priority.length).forEach((deadline) => {
                    priority.push({
                        id: `mcd-${mcd.case_id}-${deadline.title}`,
                        case_id: mcd.case_id,
                        name: `${mcd.case_id}: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                        description: `${deadline.title} - ${formatDeadlineDate(deadline.due_date)}`,
                        status: 'pending',
                        deadline: {
                            title: deadline.title,
                            due_date: deadline.due_date,
                        },
                        court: (mcd as any).court || 'Not specified',
                        plaintiff: mcd.parties?.plaintiff || 'N/A',
                        defendant: mcd.parties?.defendant || 'N/A',
                        last_action: (mcd as any).last_action || 'No actions recorded',
                        next_hearing: 'N/A',
                        case_status: mcd.status || 'N/A',
                    });
                });
            }
        });

        // Process Dashboard Agent cases
        dashboardCases.forEach((dashboardCase) => {
            const deadlines = dashboardCase.deadlines || [];
            const urgentDeadlines = deadlines.filter((d) => {
                const dueDate = new Date(d.due);
                dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
                return dueDate >= now && dueDate <= threeDaysFromNow && !d.completed;
            });

            const pendingDeadlines = deadlines.filter((d) => {
                const dueDate = new Date(d.due);
                dueDate.setHours(0, 0, 0, 0); // Normalize to start of day
                return (
                    dueDate >= threeDaysFromNow &&
                    dueDate <= sevenDaysFromNow &&
                    !d.completed &&
                    !urgentDeadlines.some((ud) => ud.title === d.title)
                );
            });

            urgentDeadlines.forEach((deadline) => {
                priority.push({
                    id: `dashboard-${dashboardCase.case_id}-${deadline.title}`,
                    case_id: dashboardCase.case_id,
                    name: `${dashboardCase.case_id}: ${dashboardCase.client}`,
                    description: `${deadline.title} - ${formatDeadlineDate(deadline.due)}`,
                    status: 'urgent',
                    deadline: {
                        title: deadline.title,
                        due_date: deadline.due,
                    },
                    court: dashboardCase.court || 'Not specified',
                    plaintiff: dashboardCase.plaintiff || 'N/A',
                    defendant: dashboardCase.defendant || 'N/A',
                    last_action: dashboardCase.last_action || 'No actions recorded',
                    next_hearing: dashboardCase.hearing && dashboardCase.hearing.toLowerCase() !== 'none' ? dashboardCase.hearing : 'N/A',
                    case_status: dashboardCase.status || 'N/A',
                });
            });

            if (priority.length < 5) {
                pendingDeadlines.slice(0, 5 - priority.length).forEach((deadline) => {
                    priority.push({
                        id: `dashboard-${dashboardCase.case_id}-${deadline.title}`,
                        case_id: dashboardCase.case_id,
                        name: `${dashboardCase.case_id}: ${dashboardCase.client}`,
                        description: `${deadline.title} - ${formatDeadlineDate(deadline.due)}`,
                        status: 'pending',
                        deadline: {
                            title: deadline.title,
                            due_date: deadline.due,
                        },
                        court: dashboardCase.court || 'Not specified',
                        plaintiff: dashboardCase.plaintiff || 'N/A',
                        defendant: dashboardCase.defendant || 'N/A',
                        last_action: dashboardCase.last_action || 'No actions recorded',
                        next_hearing: dashboardCase.hearing && dashboardCase.hearing.toLowerCase() !== 'none' ? dashboardCase.hearing : 'N/A',
                        case_status: dashboardCase.status || 'N/A',
                    });
                });
            }
        });

        // Sort by urgency (urgent first) and date
        priority.sort((a, b) => {
            if (a.status === 'urgent' && b.status !== 'urgent') return -1;
            if (a.status !== 'urgent' && b.status === 'urgent') return 1;
            if (a.deadline && b.deadline) {
                return new Date(a.deadline.due_date).getTime() - new Date(b.deadline.due_date).getTime();
            }
            return 0;
        });

        setPriorityCases(priority.slice(0, 5)); // Limit to 5
    };

    const calculateRecentActivities = (mcdCases: MasterCaseDocument[], dashboardCases: DashboardTemplate[]) => {
        const activities: RecentActivity[] = [];
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Process MCD cases
        mcdCases.forEach((mcd) => {
            if (mcd.createdAt) {
                activities.push({
                    id: `mcd-created-${mcd._id}`,
                    message: `Case ${mcd.case_id} created: ${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                    icon: (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5h6a2 2 0 012 2v1h3a1 1 0 011 1v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a1 1 0 011-1h3V7a2 2 0 012-2zm0 0V4a1 1 0 011-1h4a1 1 0 011 1v1"
                            />
                        </svg>
                    ),
                    time: formatTimeAgo(new Date(mcd.createdAt)),
                    type: 'mcd_created',
                    case_id: mcd.case_id,
                    caseName: `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                });
            }

            if (mcd.last_documents && mcd.last_documents.length > 0) {
                mcd.last_documents.slice(0, 2).forEach((doc) => {
                    activities.push({
                        id: `doc-${mcd._id}-${doc.name}`,
                        message: `Document "${doc.name}" added to case ${mcd.case_id}`,
                        icon: (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                            </svg>
                        ),
                        time: formatTimeAgo(new Date(doc.uploaded_at)),
                        type: 'document',
                        case_id: mcd.case_id,
                        caseName: `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                    });
                });
            }

            mcd.deadlines
                .filter((d) => {
                    const dueDate = new Date(d.due_date);
                    return dueDate >= now && dueDate <= sevenDaysFromNow && !d.completed;
                })
                .slice(0, 1)
                .forEach((deadline) => {
                    activities.push({
                        id: `deadline-${mcd._id}-${deadline.title}`,
                        message: `Deadline "${deadline.title}" for case ${mcd.case_id}`,
                        icon: (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                        ),
                        time: formatTimeAgo(new Date(deadline.due_date)),
                        type: 'deadline',
                        case_id: mcd.case_id,
                        caseName: `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`,
                    });
                });
        });

        // Process Dashboard Agent cases - use recent_activity array
        dashboardCases.forEach((dashboardCase) => {
            // Add recent activities from the template
            if (dashboardCase.recent_activity && dashboardCase.recent_activity.length > 0) {
                dashboardCase.recent_activity.slice(0, 2).forEach((activity) => {
                    // Parse timestamp - Dashboard Agent uses ISO strings or relative time
                    let activityTime: Date;
                    try {
                        activityTime = new Date(activity.time);
                        if (isNaN(activityTime.getTime())) {
                            // If parsing fails, use current time as fallback
                            activityTime = new Date();
                        }
                    } catch {
                        activityTime = new Date();
                    }

                    activities.push({
                        id: `dashboard-activity-${dashboardCase.case_id}-${activity.id}`,
                        message: activity.message,
                        icon: (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5h6a2 2 0 012 2v1h3a1 1 0 011 1v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9a1 1 0 011-1h3V7a2 2 0 012-2zm0 0V4a1 1 0 011-1h4a1 1 0 011 1v1"
                                />
                            </svg>
                        ),
                        time: formatTimeAgo(activityTime),
                        type: 'mcd_created', // Dashboard Agent activities are case-related
                        case_id: dashboardCase.case_id,
                        caseName: dashboardCase.client,
                    });
                });
            }

            // Add upcoming deadline activities from Dashboard Agent
            const deadlines = dashboardCase.deadlines || [];
            deadlines
                .filter((d) => {
                    const dueDate = new Date(d.due);
                    return dueDate >= now && dueDate <= sevenDaysFromNow && !d.completed;
                })
                .slice(0, 1)
                .forEach((deadline) => {
                    activities.push({
                        id: `dashboard-deadline-${dashboardCase.case_id}-${deadline.title}`,
                        message: `Deadline "${deadline.title}" for case ${dashboardCase.case_id}`,
                        icon: (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                        ),
                        time: formatTimeAgo(new Date(deadline.due)),
                        type: 'deadline',
                        case_id: dashboardCase.case_id,
                        caseName: dashboardCase.client,
                    });
                });
        });

        // Sort by time (most recent first) and limit to 5
        activities.sort((a, b) => {
            const timeA = parseTimeAgo(a.time);
            const timeB = parseTimeAgo(b.time);
            return timeB - timeA;
        });

        setRecentActivities(activities.slice(0, 5));
    };

    useEffect(() => {
        fetchMCDs();

        // Poll for changes every 30 seconds (optional - can be disabled)
        const pollInterval = setInterval(() => {
            fetchMCDs();
        }, 30000); // 30 seconds

        return () => {
            clearInterval(pollInterval);
        };
    }, []);

    return {
        mcds,
        dashboardCases,
        loading,
        error,
        stats,
        priorityCases,
        recentActivities,
        refetch: fetchMCDs,
    };
}

// Helper functions
function formatDeadlineDate(dateString: string): string {
    // Parse the date string - handle both ISO strings and YYYY-MM-DD format
    let date: Date;
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // YYYY-MM-DD format - parse as local date to avoid timezone issues
        const [year, month, day] = dateString.split('-').map(Number);
        date = new Date(year, month - 1, day);
    } else {
        date = new Date(dateString);
    }

    // Validate the date
    if (isNaN(date.getTime())) {
        console.error('[formatDeadlineDate] Invalid date string:', dateString);
        return 'Invalid date';
    }

    // Normalize both dates to start of day (00:00:00) for accurate day calculation
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    // Calculate difference in days
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); // Use Math.round instead of Math.ceil for more accurate calculation

    if (diffDays < 0) {
        const daysOverdue = Math.abs(diffDays);
        return daysOverdue === 1 ? 'Overdue 1 day' : `Overdue ${daysOverdue} days`;
    } else if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Tomorrow';
    } else if (diffDays <= 7) {
        return `In ${diffDays} days`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function parseTimeAgo(timeString: string): number {
    // Convert time ago string back to timestamp for sorting
    const now = Date.now();
    const match = timeString.match(/(\d+)\s*(minute|hour|day)/);
    if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        let milliseconds = 0;
        if (unit === 'minute') {
            milliseconds = value * 60 * 1000;
        } else if (unit === 'hour') {
            milliseconds = value * 60 * 60 * 1000;
        } else if (unit === 'day') {
            milliseconds = value * 24 * 60 * 60 * 1000;
        }
        return now - milliseconds;
    }
    return now;
}

