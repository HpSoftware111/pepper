'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import CaseQuestionnaire from '@/components/CaseQuestionnaire';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { useMCDData } from '@/hooks/useMCDData';
import type { MasterCaseDocument } from '@/lib/mcdClient';
import { authClient } from '@/lib/authClient';
import { syncCaseWithCPNU, validateRadicado } from '@/lib/cpnuClient';
import { dashboardAgentClient } from '@/lib/dashboardAgentClient';
import { mcdClient } from '@/lib/mcdClient';

type CaseItem = {
  id: string;
  court?: string;
  plaintiff?: string;
  defendant?: string;
  lastAction?: string;
  client: string;
  practice: string;
  stage: string;
  hearing: string;
  attorney: string;
  status: string;
  summary: string;
  // CPNU fields
  radicado_cpnu?: string;
  linked_cpnu?: boolean;
  cpnu_bootstrap_done?: boolean;
  source?: 'mcd' | 'dashboard'; // Track source for delete operations
};

type DeadlineItem = {
  title: string;
  caseId: string;
  due: string; // Original date string (YYYY-MM-DD or ISO string)
  dueDisplay: string; // Formatted date for display (e.g., "Dec 20")
  owner: string;
  completed?: boolean;
};

// Demo data removed - using real data from useMCDData hook

// filterOptions will be created dynamically using translations

const formatHearingLabel = (isoValue: string) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return isoValue;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const defaultCaseForm = {
  caseId: '',
  court: '',
  plaintiff: '',
  defendant: '',
  lastAction: '',
  client: '',
  practice: '',
  stage: 'Discovery',
  hearingDate: '',
  attorney: '',
  status: 'Active',
  summary: '',
};

function CasesPage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const showSidebar = false;
  const searchParams = useSearchParams();
  const { mcds, dashboardCases, loading, refetch } = useMCDData();

  // Transform MCD and Dashboard cases to CaseItem format
  const realCases = useMemo<CaseItem[]>(() => {
    const allCases: CaseItem[] = [];

    // Add MCD cases (filter out deleted cases)
    mcds.forEach((mcd) => {
      // Skip deleted cases
      if ((mcd as any).is_deleted === true) {
        return;
      }

      const caseName = `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`;

      // Format last_action: handle object format { title, date } or string format (backward compatibility)
      let lastAction = 'No actions recorded';
      const mcdLastAction = (mcd as any).last_action;
      if (mcdLastAction) {
        if (typeof mcdLastAction === 'object' && mcdLastAction !== null) {
          // New format: object with title and date
          const title = mcdLastAction.title?.trim() || '';
          const date = mcdLastAction.date;
          if (title && date) {
            // Format date as YYYY-MM-DD
            let dateStr = '';
            if (date instanceof Date) {
              dateStr = date.toISOString().split('T')[0];
            } else if (typeof date === 'string') {
              dateStr = date.includes('T') ? date.split('T')[0] : date;
            }
            lastAction = dateStr ? `${title} - ${dateStr}` : title;
          } else if (title) {
            lastAction = title;
          }
        } else if (typeof mcdLastAction === 'string' && mcdLastAction.trim()) {
          // Backward compatibility: string format
          lastAction = mcdLastAction.trim();
        }
      }

      allCases.push({
        id: mcd.case_id,
        court: mcd.court || 'Not specified',
        plaintiff: mcd.parties?.plaintiff || 'N/A',
        defendant: mcd.parties?.defendant || 'N/A',
        lastAction,
        client: caseName,
        practice: mcd.case_type || 'General',
        stage: mcd.status === 'new' ? 'Intake' : mcd.status === 'in_progress' ? 'Discovery' : mcd.status === 'closed' ? 'Closed' : 'Pre-trial',
        hearing: '', // MCD doesn't have hearing field directly
        attorney: mcd.attorney && mcd.attorney.trim() ? mcd.attorney.trim() : '', // MCD attorney field
        status: mcd.status === 'closed' ? 'Closed' : mcd.status === 'new' ? 'Active' : 'Active',
        summary: mcd.summary || '',
        radicado_cpnu: mcd.radicado_cpnu,
        linked_cpnu: mcd.linked_cpnu,
        cpnu_bootstrap_done: mcd.cpnu_bootstrap_done,
        source: 'mcd',
      });
    });

    // Add Dashboard Agent cases (filter out deleted cases)
    dashboardCases.forEach((dc) => {
      // Skip deleted cases
      if (dc.is_deleted === true) {
        return;
      }

      allCases.push({
        id: dc.case_id,
        court: dc.court || 'Not specified',
        plaintiff: dc.plaintiff || 'N/A',
        defendant: dc.defendant || 'N/A',
        lastAction: dc.last_action || 'No actions recorded',
        client: dc.client || 'Unknown Client',
        practice: dc.practice || dc.type || 'General',
        stage: dc.stage || 'Discovery',
        hearing: dc.hearing && dc.hearing.toLowerCase() !== 'none' ? formatHearingLabel(dc.hearing) : '',
        attorney: dc.attorney || '',
        status: dc.status === 'active' ? 'Active' : dc.status === 'urgent' ? 'Hearing Soon' : dc.status === 'pending' ? 'Briefing' : 'Active',
        summary: dc.summary || '',
        radicado_cpnu: dc.radicado_cpnu,
        linked_cpnu: dc.linked_cpnu,
        cpnu_bootstrap_done: dc.cpnu_bootstrap_done,
        source: 'dashboard',
      });
    });

    // Remove duplicates (same case_id) - prioritize MCD cases over dashboard cases
    // This prevents the same case from appearing twice if it exists in both sources
    const uniqueCasesMap = new Map<string, CaseItem>();
    allCases.forEach(caseItem => {
      const existing = uniqueCasesMap.get(caseItem.id);
      // If case already exists, prioritize MCD source over dashboard source
      if (!existing || (caseItem.source === 'mcd' && existing.source === 'dashboard')) {
        uniqueCasesMap.set(caseItem.id, caseItem);
      }
    });

    return Array.from(uniqueCasesMap.values());
  }, [mcds, dashboardCases]);

  // Transform deadlines from MCD and Dashboard cases
  const realDeadlines = useMemo<DeadlineItem[]>(() => {
    const allDeadlines: DeadlineItem[] = [];

    // Helper function to normalize date to YYYY-MM-DD format
    const normalizeDateToString = (dateInput: string | Date): string => {
      let date: Date;
      if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'string') {
        // Check if it's already YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
          return dateInput; // Already in correct format
        }
        // Try parsing as ISO string or other format
        date = new Date(dateInput);
      } else {
        date = new Date();
      }

      // Validate date
      if (isNaN(date.getTime())) {
        console.error('[normalizeDateToString] Invalid date:', dateInput);
        return new Date().toISOString().split('T')[0]; // Fallback to today
      }

      // Convert to YYYY-MM-DD format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Helper function to format date for display
    const formatDateForDisplay = (dateString: string): string => {
      const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
      if (isNaN(date.getTime())) {
        return dateString; // Return original if invalid
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Add MCD deadlines
    mcds.forEach((mcd) => {
      mcd.deadlines?.forEach((deadline) => {
        if (!deadline.completed) {
          const originalDate = deadline.due_date && typeof deadline.due_date === 'object' && 'toISOString' in deadline.due_date
            ? (deadline.due_date as Date).toISOString().split('T')[0]
            : normalizeDateToString(deadline.due_date as string);
          const formattedDate = formatDateForDisplay(originalDate);

          allDeadlines.push({
            title: deadline.title,
            caseId: deadline.case_id || mcd.case_id,
            due: originalDate, // Store original date string for calculations
            dueDisplay: formattedDate, // Store formatted date for display
            owner: deadline.owner || 'Unassigned',
            completed: deadline.completed || false,
          });
        }
      });
    });

    // Add Dashboard Agent deadlines
    dashboardCases.forEach((dc) => {
      dc.deadlines?.forEach((deadline) => {
        if (!deadline.completed) {
          const originalDate = normalizeDateToString(deadline.due);
          const formattedDate = formatDateForDisplay(originalDate);

          allDeadlines.push({
            title: deadline.title,
            caseId: deadline.caseId || dc.case_id,
            due: originalDate, // Store original date string for calculations
            dueDisplay: formattedDate, // Store formatted date for display
            owner: deadline.owner || 'Unassigned',
            completed: deadline.completed || false,
          });
        }
      });
    });

    // Sort by due date (earliest first) - use original date string
    return allDeadlines.sort((a, b) => {
      const dateA = new Date(a.due + 'T00:00:00');
      const dateB = new Date(b.due + 'T00:00:00');
      return dateA.getTime() - dateB.getTime();
    });
  }, [mcds, dashboardCases]);

  // Create filter options using translations (must be defined before useState that uses it)
  const filterOptions = useMemo(() => [
    t('cases.allStages'),
    t('cases.intake'),
    t('cases.discovery'),
    t('cases.pretrial'),
    t('cases.hearing'),
    t('cases.closed'),
  ], [t]);

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStage, setActiveStage] = useState(() => filterOptions[0]);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseForm, setCaseForm] = useState(defaultCaseForm);
  const [caseFormError, setCaseFormError] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [reportToast, setReportToast] = useState<string | null>(null);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);

  // CPNU sync state
  const [cpnuSyncModalOpen, setCpnuSyncModalOpen] = useState(false);
  const [cpnuSyncCaseId, setCpnuSyncCaseId] = useState<string | null>(null);
  const [cpnuRadicado, setCpnuRadicado] = useState('');
  const [cpnuSyncing, setCpnuSyncing] = useState(false);
  const [cpnuSyncError, setCpnuSyncError] = useState<string | null>(null);

  // Table horizontal scroll state and ref
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(true);

  // Delete case state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteCaseId, setDeleteCaseId] = useState<string | null>(null);
  const [deleteCaseSource, setDeleteCaseSource] = useState<'mcd' | 'dashboard' | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Case detail modal state
  const [caseDetailModalOpen, setCaseDetailModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [caseNotFound, setCaseNotFound] = useState(false);

  // Pagination state
  const CASES_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(0);

  const shellSpacing = isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-8 gap-6 lg:gap-8';
  const panelWrapper = isLight
    ? 'rounded-[24px] border border-slate-200 bg-white shadow-[0_25px_55px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] border border-white/5 bg-[rgba(5,18,45,0.55)] shadow-[0_25px_55px_rgba(3,9,24,0.45)]';

  const headerColor = isLight ? 'text-slate-900' : 'text-slate-50';
  const subColor = isLight ? 'text-slate-600' : 'text-slate-300';
  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';
  const cardBg = isLight ? 'bg-white' : 'bg-[rgba(255,255,255,0.04)]';

  const tableHead = isLight ? 'text-slate-500' : 'text-slate-300';
  const stageChoices = useMemo(() => filterOptions.filter((option) => option !== t('cases.allStages')), [filterOptions, t]);
  const statusChoices = useMemo(() => [
    t('cases.active'),
    t('cases.briefing'),
    t('cases.hearingSoon'),
    t('cases.closed'),
  ], [t]);

  // Translation mappings: English key -> Translated value
  const stageTranslationMap = useMemo(() => ({
    'Intake': t('cases.intake'),
    'Discovery': t('cases.discovery'),
    'Pre-trial': t('cases.pretrial'),
    'Hearing': t('cases.hearing'),
    'Closed': t('cases.closed'),
    'Drafting': t('cases.discovery'), // Fallback for Drafting
  }), [t]);

  const statusTranslationMap = useMemo(() => ({
    'Active': t('cases.active'),
    'Briefing': t('cases.briefing'),
    'Hearing Soon': t('cases.hearingSoon'),
    'Closed': t('cases.closed'),
  }), [t]);

  // Reverse mappings: Translated value -> English key (for form values)
  const stageKeyMap = useMemo(() => ({
    [t('cases.intake')]: 'Intake',
    [t('cases.discovery')]: 'Discovery',
    [t('cases.pretrial')]: 'Pre-trial',
    [t('cases.hearing')]: 'Hearing',
    [t('cases.closed')]: 'Closed',
  }), [t]);

  const statusKeyMap = useMemo(() => ({
    [t('cases.active')]: 'Active',
    [t('cases.briefing')]: 'Briefing',
    [t('cases.hearingSoon')]: 'Hearing Soon',
    [t('cases.closed')]: 'Closed',
  }), [t]);

  // Helper functions to translate stage and status
  const translateStage = useCallback((stage: string): string => {
    return stageTranslationMap[stage as keyof typeof stageTranslationMap] || stage;
  }, [stageTranslationMap]);

  const translateStatus = useCallback((status: string): string => {
    return statusTranslationMap[status as keyof typeof statusTranslationMap] || status;
  }, [statusTranslationMap]);

  const tableRowBg = (index: number) =>
    index % 2 === 0
      ? isLight
        ? 'bg-white'
        : 'bg-[rgba(255,255,255,0.02)]'
      : isLight
        ? 'bg-slate-50'
        : 'bg-[rgba(255,255,255,0.05)]';

  // Update cases and deadlines when real data is loaded
  useEffect(() => {
    if (!loading) {
      setCases(realCases);
      setDeadlines(realDeadlines);
    }
  }, [realCases, realDeadlines, loading]);

  // Check if we should open the modal from query parameter
  useEffect(() => {
    const shouldOpenModal = searchParams.get('new') === 'true';
    if (shouldOpenModal) {
      setQuestionnaireOpen(true);
      // Clean up the URL by removing the query parameter
      window.history.replaceState({}, '', '/cases');
    }

    // Handle case detail modal
    const caseIdFromUrl = searchParams.get('case');
    if (caseIdFromUrl) {
      // Find the case in current cases list
      const foundCase = realCases.find(c => c.id === caseIdFromUrl);
      if (foundCase) {
        setSelectedCase(foundCase);
        setCaseNotFound(false);
        setCaseDetailModalOpen(true);
      } else {
        // Case not found - still show modal with error
        setSelectedCase(null);
        setCaseNotFound(true);
        setCaseDetailModalOpen(true);
      }
    } else {
      // No case parameter - close modal if open
      setCaseDetailModalOpen(false);
      setSelectedCase(null);
      setCaseNotFound(false);
    }
  }, [searchParams, realCases]);

  const applySearch = () => {
    setSearchTerm(searchInput.trim().toLowerCase());
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    applySearch();
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchTerm('');
  };

  const filteredCases = useMemo(() => {
    return cases.filter((caseItem) => {
      // Compare using translated values for stage matching
      const translatedStage = translateStage(caseItem.stage);
      const matchesStage = activeStage === t('cases.allStages') || translatedStage === activeStage;
      const query = searchTerm;
      if (!query) {
        return matchesStage;
      }
      const haystack = `${caseItem.id} ${caseItem.client} ${caseItem.practice} ${caseItem.summary} ${caseItem.attorney}`.toLowerCase();
      return matchesStage && haystack.includes(query);
    });
  }, [cases, activeStage, searchTerm, t, translateStage]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredCases.length / CASES_PER_PAGE));
  const paginatedCases = useMemo(() => {
    const startIndex = currentPage * CASES_PER_PAGE;
    const endIndex = startIndex + CASES_PER_PAGE;
    return filteredCases.slice(startIndex, endIndex);
  }, [filteredCases, currentPage, CASES_PER_PAGE]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [activeStage, searchTerm]);

  // Table horizontal scroll detection and handlers
  const checkScrollPosition = useCallback(() => {
    const container = tableScrollRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftScroll(scrollLeft > 10);
    setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    const container = tableScrollRef.current;
    if (!container) return;

    // Check initial scroll position
    checkScrollPosition();

    // Add scroll event listener
    container.addEventListener('scroll', checkScrollPosition);
    window.addEventListener('resize', checkScrollPosition);

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
      window.removeEventListener('resize', checkScrollPosition);
    };
  }, [checkScrollPosition, paginatedCases]); // Re-check when cases change

  const scrollTable = (direction: 'left' | 'right') => {
    const container = tableScrollRef.current;
    if (!container) return;

    const scrollAmount = 300; // Pixels to scroll
    const scrollPosition = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: scrollPosition,
      behavior: 'smooth'
    });
  };

  const handleStageFilter = (option: string) => {
    setActiveStage(option);
  };

  const handleCaseFormChange = (field: keyof typeof defaultCaseForm, value: string) => {
    // Convert translated values back to English keys for stage and status
    if (field === 'stage' && stageKeyMap[value]) {
      setCaseForm((prev) => ({ ...prev, [field]: stageKeyMap[value] }));
    } else if (field === 'status' && statusKeyMap[value]) {
      setCaseForm((prev) => ({ ...prev, [field]: statusKeyMap[value] }));
    } else {
      setCaseForm((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleNewCaseSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!caseForm.caseId || !caseForm.court || !caseForm.plaintiff || !caseForm.defendant || !caseForm.lastAction || !caseForm.client || !caseForm.practice || !caseForm.hearingDate || !caseForm.attorney || !caseForm.summary) {
      setCaseFormError(t('cases.allFieldsRequired'));
      return;
    }

    // Note: This creates a local case entry. For full integration, you should
    // create an MCD or Dashboard case via API. For now, we'll add it locally.
    const newCase: CaseItem = {
      id: caseForm.caseId,
      client: caseForm.client,
      practice: caseForm.practice,
      stage: caseForm.stage,
      hearing: formatHearingLabel(caseForm.hearingDate),
      attorney: caseForm.attorney,
      status: caseForm.status,
      summary: caseForm.summary,
    };
    setCases((prev) => [newCase, ...prev]);
    setCaseForm(defaultCaseForm);
    setCaseFormError(null);
    setCaseModalOpen(false);
  };

  const handleCompleteDeadline = (title: string) => {
    setDeadlines((prev) =>
      prev.map((item) => (item.title === title ? { ...item, completed: !item.completed } : item)),
    );
  };

  const handleDownloadReport = () => {
    const now = new Date();
    const reportLines = [
      'Pepper 2.0 · Litigation health report',
      `Generated: ${now.toLocaleString()}`,
      '-------------------------------------',
      '',
      `Total Cases: ${cases.length}`,
      `Active Cases: ${cases.filter(c => c.status === 'Active').length}`,
      `Upcoming Deadlines: ${deadlines.filter(d => !d.completed).length}`,
      '',
      'Top Risks:',
    ];

    // Add urgent deadlines
    const urgentDeadlines = deadlines
      .filter(d => !d.completed)
      .filter(d => {
        const dueDate = new Date(d.due);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntilDue <= 3 && daysUntilDue >= 0;
      })
      .slice(0, 5);

    if (urgentDeadlines.length > 0) {
      urgentDeadlines.forEach((deadline) => {
        const dueDate = new Date(deadline.due);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntilDue < 0 ? 'overdue' : daysUntilDue === 0 ? 'due today' : `due in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`;
        reportLines.push(`- ${deadline.caseId}: "${deadline.title}" ${status} (Owner: ${deadline.owner})`);
      });
    } else {
      reportLines.push('- No urgent deadlines at this time.');
    }

    reportLines.push('');
    reportLines.push('Auto-generated by Pepper insights.');

    const reportBody = reportLines.join('\n');
    const blob = new Blob([reportBody], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pepper-cases-report.txt';
    link.click();
    URL.revokeObjectURL(url);
    setReportToast('Report downloaded to your device.');
    setTimeout(() => setReportToast(null), 3000);
  };

  const closeCaseModal = () => {
    setCaseModalOpen(false);
    setCaseForm(defaultCaseForm);
    setCaseFormError(null);
  };

  // CPNU Sync handlers
  const handleOpenCpnuSync = (caseId: string) => {
    setCpnuSyncCaseId(caseId);
    // Check if case ID is exactly 23 digits - if so, use it as radicado
    const is23Digits = /^\d{23}$/.test(caseId);
    setCpnuRadicado(is23Digits ? caseId : '');
    setCpnuSyncError(null);
    setCpnuSyncModalOpen(true);
  };

  const handleCloseCpnuSync = () => {
    setCpnuSyncModalOpen(false);
    setCpnuSyncCaseId(null);
    setCpnuRadicado('');
    setCpnuSyncError(null);
  };

  const handleCpnuSync = async () => {
    if (!cpnuSyncCaseId) return;

    if (!validateRadicado(cpnuRadicado)) {
      setCpnuSyncError(t('cpnu.invalidRadicado'));
      return;
    }

    setCpnuSyncing(true);
    setCpnuSyncError(null);

    try {
      const token = authClient.getStoredAccessToken();
      if (!token) {
        throw new Error(t('cpnu.notAuthenticated'));
      }

      await syncCaseWithCPNU(cpnuSyncCaseId, cpnuRadicado, token);

      // Refresh cases data
      await refetch();

      // Close modal
      handleCloseCpnuSync();

      // Show success message using i18n
      alert(t('cpnu.syncSuccess'));
    } catch (error) {
      // Map error category to i18n key for proper translation
      const errorCategory = (error as any)?.errorCategory || 'other';
      let i18nKey: string;

      switch (errorCategory) {
        case 'timeout':
          i18nKey = 'cpnu.timeoutError';
          break;
        case 'connection':
          i18nKey = 'cpnu.connectionError';
          break;
        case 'not_found':
          i18nKey = 'cpnu.notFoundError';
          break;
        case 'validation':
          // For validation errors, try to use the backend message if it's available
          // If it's a duplicate record error, append the translated suffix
          if (error instanceof Error && error.message) {
            const isDuplicateRecord = (error as any)?.isDuplicateRecord || false;
            if (isDuplicateRecord) {
              // Append translated suffix to the original message
              const fullMessage = `${error.message} ${t('cpnu.duplicateRecordSuffix')}`;
              setCpnuSyncError(fullMessage);
              return;
            }
            setCpnuSyncError(error.message);
            return;
          }
          i18nKey = 'cpnu.invalidRadicado';
          break;
        default:
          i18nKey = 'cpnu.connectionError';
          break;
      }

      setCpnuSyncError(t(i18nKey));
    } finally {
      setCpnuSyncing(false);
    }
  };

  // Delete case handlers
  const handleOpenDelete = (caseId: string, source: 'mcd' | 'dashboard') => {
    setDeleteCaseId(caseId);
    setDeleteCaseSource(source);
    setDeleteModalOpen(true);
  };

  const handleCloseDelete = () => {
    setDeleteModalOpen(false);
    setDeleteCaseId(null);
    setDeleteCaseSource(null);
  };

  const handleDeleteCase = async () => {
    if (!deleteCaseId || !deleteCaseSource) return;

    setDeleting(true);

    try {
      const token = authClient.getStoredAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

      // Try deleting from the primary source first
      const primaryEndpoint = deleteCaseSource === 'dashboard'
        ? `${API_BASE_URL}/api/dashboard-agent/case/${deleteCaseId}`
        : `${API_BASE_URL}/api/mcd/${deleteCaseId}`;

      const primaryResponse = await fetch(primaryEndpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const primaryData = await primaryResponse.json();

      // If primary source succeeded or case is already deleted, use that result
      if (primaryResponse.ok) {
        // Success from primary source - also try secondary source for complete deletion
        const secondaryEndpoint = deleteCaseSource === 'dashboard'
          ? `${API_BASE_URL}/api/mcd/${deleteCaseId}`
          : `${API_BASE_URL}/api/dashboard-agent/case/${deleteCaseId}`;

        // Try deleting from the other source too (cases might exist in both)
        try {
          const secondaryResponse = await fetch(secondaryEndpoint, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          if (secondaryResponse.ok) {
            const secondaryData = await secondaryResponse.json();
            console.log('[Delete] Also deleted from secondary source:', secondaryData);
          }
        } catch (secondaryError) {
          // Ignore - case might not exist in secondary source
          console.log('[Delete] Secondary delete skipped (case doesn\'t exist there)');
        }

        // Success case from primary source
        console.log('[Delete] Delete successful from primary source, refreshing data...');
        handleCloseDelete();
        await new Promise(resolve => setTimeout(resolve, 500));
        await refetch();
        console.log('[Delete] Refetch completed');
        alert(primaryData.message || t('cases.caseDeleted'));
        return;
      }

      // Primary source failed - check if it's "already deleted" or "not found"
      const errorMessage = primaryData.error || primaryData.message || 'Failed to delete case';
      const isAlreadyDeleted = errorMessage.toLowerCase().includes('already deleted') ||
        errorMessage.toLowerCase().includes('ya está eliminado') ||
        errorMessage.toLowerCase().includes('ya estaba eliminado');
      const isNotFound = primaryResponse.status === 404 || errorMessage.toLowerCase().includes('not found') || errorMessage.toLowerCase().includes('no se encontró');

      // If primary returned 404 or "not found", try secondary source (case might exist there)
      if (isNotFound && !isAlreadyDeleted) {
        console.log(`[Delete] Primary source returned 404, trying secondary source...`);
        const secondaryEndpoint = deleteCaseSource === 'dashboard'
          ? `${API_BASE_URL}/api/mcd/${deleteCaseId}`
          : `${API_BASE_URL}/api/dashboard-agent/case/${deleteCaseId}`;

        try {
          const secondaryResponse = await fetch(secondaryEndpoint, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          const secondaryData = await secondaryResponse.json();

          if (secondaryResponse.ok) {
            // Success from secondary source!
            console.log('[Delete] Delete successful from secondary source:', secondaryData);
            handleCloseDelete();
            await new Promise(resolve => setTimeout(resolve, 500));
            await refetch();
            console.log('[Delete] Refetch completed');
            alert(secondaryData.message || t('cases.caseDeleted'));
            return;
          }

          // Secondary also failed - check if already deleted
          const secondaryErrorMessage = secondaryData.error || secondaryData.message || '';
          const secondaryIsAlreadyDeleted = secondaryErrorMessage.toLowerCase().includes('already deleted') ||
            secondaryErrorMessage.toLowerCase().includes('ya está eliminado') ||
            secondaryErrorMessage.toLowerCase().includes('ya estaba eliminado');

          if (secondaryIsAlreadyDeleted) {
            handleCloseDelete();
            await new Promise(resolve => setTimeout(resolve, 300));
            await refetch();
            alert(t('cases.caseDeleted'));
            return;
          }

          // Both failed with real errors
          throw new Error(secondaryErrorMessage || errorMessage);
        } catch (secondaryError) {
          // Secondary fetch failed entirely - use primary error
          throw new Error(errorMessage);
        }
      }

      // Primary failed but it's "already deleted" - treat as success
      if (isAlreadyDeleted) {
        handleCloseDelete();
        await new Promise(resolve => setTimeout(resolve, 300));
        await refetch();
        alert(t('cases.caseDeleted'));
        return;
      }

      // Primary failed with real error (not 404, not already deleted)
      throw new Error(errorMessage);

    } catch (error) {
      // Only show error and keep modal open for real errors
      // User can try again or cancel
      alert(error instanceof Error ? error.message : t('cases.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleExportDeadlines = () => {
    const rows = [
      ['Title', 'Case', 'Due', 'Owner', 'Completed'],
      ...deadlines.map((item) => [item.title, item.caseId, item.dueDisplay || item.due, item.owner, item.completed ? 'Yes' : 'No']),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pepper-deadlines.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Generate real insights from cases and deadlines
  const insightsHighlights = useMemo(() => {
    const insights: { title: string; detail: string }[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize to start of today

    // Helper function to parse and normalize date
    const parseAndNormalizeDate = (dateString: string): Date => {
      let date: Date;
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        // YYYY-MM-DD format - parse as local date to avoid timezone issues
        const [year, month, day] = dateString.split('-').map(Number);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(dateString);
      }
      date.setHours(0, 0, 0, 0); // Normalize to start of day
      return date;
    };

    // Find overdue deadlines
    const overdueDeadlines = deadlines
      .filter(d => !d.completed)
      .filter(d => {
        const dueDate = parseAndNormalizeDate(d.due);
        return dueDate.getTime() < now.getTime();
      })
      .slice(0, 3);

    overdueDeadlines.forEach((deadline) => {
      const caseItem = cases.find(c => c.id === deadline.caseId);
      if (caseItem) {
        const dueDate = parseAndNormalizeDate(deadline.due);
        const diffTime = now.getTime() - dueDate.getTime();
        const daysOverdue = Math.round(diffTime / (1000 * 60 * 60 * 24));
        insights.push({
          title: `${deadline.caseId} · ${caseItem.client}`,
          detail: `"${deadline.title}" overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}. Owner: ${deadline.owner}`,
        });
      }
    });

    // Find upcoming urgent deadlines
    const urgentDeadlines = deadlines
      .filter(d => !d.completed)
      .filter(d => {
        const dueDate = parseAndNormalizeDate(d.due);
        const diffTime = dueDate.getTime() - now.getTime();
        const daysUntilDue = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return daysUntilDue <= 3 && daysUntilDue > 0;
      })
      .slice(0, 3 - insights.length);

    urgentDeadlines.forEach((deadline) => {
      const caseItem = cases.find(c => c.id === deadline.caseId);
      if (caseItem) {
        const dueDate = parseAndNormalizeDate(deadline.due);
        const diffTime = dueDate.getTime() - now.getTime();
        const daysUntilDue = Math.round(diffTime / (1000 * 60 * 60 * 24));
        insights.push({
          title: `${deadline.caseId} · ${caseItem.client}`,
          detail: `"${deadline.title}" due in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}. Owner: ${deadline.owner}`,
        });
      }
    });

    // If no insights, add a default message
    if (insights.length === 0) {
      insights.push({
        title: t('cases.allCaughtUp'),
        detail: t('cases.noUrgentDeadlines'),
      });
    }

    return insights;
  }, [cases, deadlines, t]);

  return (
    <div className="app-shell">
      <Header />

      <div className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-20 ${shellSpacing}`}>
        {showSidebar && (
          <div className="w-full lg:w-[30%] lg:max-w-sm">
            <Sidebar showQuickActions={false} showRecentCases={false} />
          </div>
        )}

        <main
          className={`w-full ${showSidebar ? 'lg:w-[70%]' : 'lg:w-full'} flex-1 ${isCompact ? 'pt-1' : 'pt-2'
            } lg:pt-0 ${showSidebar ? 'lg:pl-6 lg:pr-8' : 'lg:px-0'} ${showSidebar
              ? isLight
                ? 'lg:border-l lg:border-slate-200'
                : 'lg:border-l lg:border-slate-800/70'
              : ''
            }`}
        >
          <div className={`${panelWrapper} ${isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'} lg:p-0 lg:border-none lg:bg-transparent lg:shadow-none lg:rounded-none`}>
            <div className={isCompact ? 'space-y-4 lg:space-y-5' : 'space-y-6 lg:space-y-8'}>
              {/* Page header */}
              <section className={isCompact ? 'mt-2' : 'mt-4'}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h1 className={`text-3xl font-semibold ${headerColor}`}>{t('cases.title')}</h1>
                    <p className={`text-sm ${subColor}`}>{t('cases.subtitle')}</p>
                  </div>
                  <button
                    onClick={() => setQuestionnaireOpen(true)}
                    className="rounded-xl bg-[linear-gradient(135deg,_#2af598,_#009efd)] text-slate-900 font-semibold px-4 py-2 shadow-[0_15px_35px_rgba(3,170,220,0.35)] hover:brightness-110 transition"
                  >
                    + {t('cases.newCase')}
                  </button>
                </div>
              </section>

              {/* Filters */}
              <section className="space-y-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap lg:gap-4">
                  <form
                    onSubmit={handleSearchSubmit}
                    className={`w-full lg:max-w-[380px] rounded-2xl border ${borderColor} ${cardBg} px-3 py-2 flex items-center gap-3`}
                  >
                    <button
                      type="submit"
                      aria-label="Run search"
                      className={`w-9 h-9 rounded-xl border ${borderColor} flex items-center justify-center ${isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-200 hover:bg-white/10'
                        }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M5 11a6 6 0 1112 0 6 6 0 01-12 0z" />
                      </svg>
                    </button>
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder={t('cases.searchPlaceholder')}
                      className="flex-1 bg-transparent text-sm focus:outline-none"
                    />
                    {searchTerm && (
                      <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest">
                        Active: “{searchTerm}”
                      </span>
                    )}
                  </form>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={applySearch}
                      className="rounded-2xl border border-emerald-300/60 px-4 py-2 text-xs font-semibold text-emerald-100 bg-emerald-500/20 hover:bg-emerald-500/30 transition"
                    >
                      {t('common.search')}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="rounded-2xl border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 hover:border-white/40 transition"
                    >
                      {t('common.clear')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 flex-1">
                    {filterOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => handleStageFilter(option)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${option === activeStage
                          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                          : isLight
                            ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'border-white/15 text-white/80 hover:bg-white/10'
                          }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Cases table with enhanced horizontal scroll indicators */}
              <section className="relative overflow-hidden rounded-2xl border border-white/10">
                {/* Left scroll gradient indicator */}
                {showLeftScroll && (
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-12 z-10 pointer-events-none transition-opacity duration-300 ${isLight
                      ? 'bg-gradient-to-r from-white to-transparent'
                      : 'bg-gradient-to-r from-[rgba(5,18,45,0.98)] to-transparent'
                      }`}
                  />
                )}

                {/* Right scroll gradient indicator */}
                {showRightScroll && (
                  <div
                    className={`absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none transition-opacity duration-300 ${isLight
                      ? 'bg-gradient-to-l from-white to-transparent'
                      : 'bg-gradient-to-l from-[rgba(5,18,45,0.98)] to-transparent'
                      }`}
                  />
                )}

                {/* Left scroll button */}
                {showLeftScroll && (
                  <button
                    onClick={() => scrollTable('left')}
                    className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-110 ${isLight
                      ? 'bg-white/90 text-slate-700 shadow-lg hover:bg-white border border-slate-200'
                      : 'bg-white/10 text-white shadow-lg hover:bg-white/20 border border-white/20'
                      }`}
                    aria-label="Scroll left"
                    title="Scroll left"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}

                {/* Right scroll button */}
                {showRightScroll && (
                  <button
                    onClick={() => scrollTable('right')}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full backdrop-blur-sm transition-all duration-300 hover:scale-110 ${isLight
                      ? 'bg-white/90 text-slate-700 shadow-lg hover:bg-white border border-slate-200'
                      : 'bg-white/10 text-white shadow-lg hover:bg-white/20 border border-white/20'
                      }`}
                    aria-label="Scroll right"
                    title="Scroll right"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}

                <div
                  ref={tableScrollRef}
                  className={`overflow-x-auto ${cardBg} custom-scrollbar`}
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: isLight ? '#cbd5e1 #ffffff' : 'rgba(255, 255, 255, 0.3) rgba(5, 18, 45, 0.98)',
                  }}
                >
                  <table className="min-w-full divide-y divide-white/5 text-sm table-fixed">
                    <colgroup>
                      <col className="w-20" />
                      <col className="w-28" />
                      <col className="w-24" />
                      <col className="w-24" />
                      <col className="w-28" />
                      <col className="w-36" />
                      <col className="w-32" />
                      <col className="w-32" />
                      <col className="w-24" />
                      <col className="w-32" />
                      <col className="w-24" />
                      <col className="w-40" />
                    </colgroup>
                    <thead className={isLight ? 'bg-slate-50' : 'bg-white/5'}>
                      <tr>
                        {[t('cases.caseId'), t('cases.court'), t('cases.plaintiff'), t('cases.defendant'), t('cases.lastAction'), t('cases.clientMatter'), t('cases.nextHearing'), t('cases.practiceArea'), t('cases.stage'), t('cases.attorney'), t('cases.status'), t('cases.actions')].map((heading, idx) => (
                          <th
                            key={heading}
                            className={`${idx === 0 ? 'px-3' : 'px-4'} py-3 text-left font-semibold ${tableHead} ${idx === 0 ? 'break-words' : ''}`}
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCases.map((caseItem, index) => (
                        <tr key={caseItem.id} className={`${tableRowBg(index)} border-b border-white/5`}>
                          <td className="px-3 py-2 font-semibold align-top">
                            <div className="flex flex-col gap-1 min-w-0">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  const url = new URL(window.location.href);
                                  url.searchParams.set('case', caseItem.id);
                                  window.history.pushState({}, '', url.pathname + url.search);
                                  setSelectedCase(caseItem);
                                  setCaseNotFound(false);
                                  setCaseDetailModalOpen(true);
                                }}
                                className="text-blue-500 hover:text-blue-700 underline cursor-pointer bg-transparent border-none p-0 text-left break-words leading-tight"
                                title="View case details"
                              >
                                {caseItem.id}
                              </button>
                              {caseItem.linked_cpnu && caseItem.radicado_cpnu && (
                                <a
                                  href={`https://consultaprocesos.ramajudicial.gov.co/Procesos/NumeroRadicacion?numeroRadicacion=${caseItem.radicado_cpnu}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-500 hover:text-green-700 text-[10px] self-start"
                                  title="View in CPNU"
                                >
                                  🔗 CPNU
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-1.5 py-2 text-xs" title={caseItem.court || 'N/A'}>
                            <div className="max-w-[7rem] truncate">{caseItem.court || 'N/A'}</div>
                          </td>
                          <td className="px-1.5 py-2 text-xs" title={caseItem.plaintiff || 'N/A'}>
                            <div className="max-w-[6rem] truncate">{caseItem.plaintiff || 'N/A'}</div>
                          </td>
                          <td className="px-1.5 py-2 text-xs" title={caseItem.defendant || 'N/A'}>
                            <div className="max-w-[6rem] truncate">{caseItem.defendant || 'N/A'}</div>
                          </td>
                          <td className="px-1.5 py-2 text-xs" title={caseItem.lastAction || 'N/A'}>
                            <div className="max-w-[7rem] truncate">{caseItem.lastAction || 'N/A'}</div>
                          </td>
                          <td className="px-1.5 py-2">
                            <p className="font-semibold max-w-[9rem] truncate" title={caseItem.client}>{caseItem.client}</p>
                            {caseItem.summary && (
                              <p className={`text-xs ${subColor} mt-1 max-w-[9rem] line-clamp-2 break-words`} title={caseItem.summary}>{caseItem.summary}</p>
                            )}
                          </td>
                          <td className="px-1.5 py-2 text-xs">{caseItem.hearing || t('common.na')}</td>
                          <td className="px-1.5 py-2">{caseItem.practice || t('common.na')}</td>
                          <td className="px-1.5 py-2">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold ${caseItem.stage === 'Discovery'
                                ? 'bg-cyan-500/15 text-cyan-300'
                                : caseItem.stage === 'Drafting'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : caseItem.stage === 'Intake'
                                    ? 'bg-blue-500/15 text-blue-300'
                                    : caseItem.stage === 'Pre-trial'
                                      ? 'bg-orange-500/15 text-orange-300'
                                      : caseItem.stage === 'Hearing'
                                        ? 'bg-rose-500/15 text-rose-300'
                                        : caseItem.stage === 'Closed'
                                          ? 'bg-slate-500/15 text-slate-300'
                                          : 'bg-purple-500/15 text-purple-200'
                                }`}
                            >
                              {translateStage(caseItem.stage) || t('common.na')}
                            </span>
                          </td>
                          <td className="px-1.5 py-2">{caseItem.attorney || <span className={subColor}>—</span>}</td>
                          <td className="px-1.5 py-2">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${caseItem.status === 'Hearing Soon'
                                ? 'bg-rose-500/20 text-rose-300'
                                : caseItem.status === 'Active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : caseItem.status === 'Briefing'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : caseItem.status === 'Closed'
                                      ? 'bg-slate-500/20 text-slate-300'
                                      : 'bg-blue-500/20 text-blue-300'
                                }`}
                            >
                              {translateStatus(caseItem.status) || t('cases.active')}
                            </span>
                          </td>
                          <td className="px-1.5 py-2">
                            <div className="flex items-center gap-1.5">
                              {!caseItem.cpnu_bootstrap_done ? (
                                <button
                                  onClick={() => handleOpenCpnuSync(caseItem.id)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 ${isLight
                                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 hover:shadow-sm border border-blue-200'
                                    : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:shadow-lg hover:shadow-blue-500/20 border border-blue-500/30'
                                    }`}
                                  title="Sincronizar con Rama Judicial"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  Sync CPNU
                                </button>
                              ) : (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${isLight ? 'text-slate-500' : 'text-slate-400'}`} title="Already synced">
                                  ✓ Synced
                                </span>
                              )}
                              <button
                                onClick={() => handleOpenDelete(caseItem.id, caseItem.source || 'dashboard')}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-200 ${isLight
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100 hover:shadow-sm border border-red-200'
                                  : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 hover:shadow-lg hover:shadow-red-500/20 border border-red-500/30'
                                  }`}
                                title="Delete case"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {loading && (
                        <tr>
                          <td colSpan={12} className="px-1.5 py-2 text-center text-sm text-slate-400">
                            {t('cases.loadingCases')}
                          </td>
                        </tr>
                      )}
                      {!loading && filteredCases.length === 0 && (
                        <tr>
                          <td colSpan={12} className="px-1.5 py-2 text-center text-sm text-slate-400">
                            {t('cases.noCasesMatch')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination controls */}
                {!loading && filteredCases.length > 0 && (
                  <div className={`flex items-center justify-between px-4 py-3 border-t ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('files.showing')} {(currentPage * CASES_PER_PAGE) + 1}–{Math.min((currentPage + 1) * CASES_PER_PAGE, filteredCases.length)} {t('files.of')} {filteredCases.length}
                    </p>
                    <div className="flex gap-2">
                      <button
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isLight
                          ? 'border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
                          : 'border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                        disabled={currentPage === 0}
                        onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                      >
                        {t('common.previous')}
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isLight
                          ? 'border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed'
                          : 'border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
                          }`}
                        disabled={currentPage >= totalPages - 1}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                      >
                        {t('common.next')}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* Deadlines + Pepper insights */}
              <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className={`rounded-2xl border ${borderColor} ${cardBg} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className={`text-sm ${subColor}`}>{t('cases.upcoming')}</p>
                      <h3 className={`text-lg font-semibold ${headerColor}`}>{t('cases.deadlinesTasks')}</h3>
                    </div>
                    <button
                      onClick={() => setDeadlineModalOpen(true)}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                    >
                      {t('cases.viewAll')}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {deadlines.slice(0, 3).map((item) => (
                      <div
                        key={item.title}
                        className={`rounded-xl border ${borderColor} px-4 py-3 flex items-center justify-between gap-3 ${isLight ? 'bg-slate-50' : 'bg-white/5'}`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleCompleteDeadline(item.title)}
                            className="rounded-full border border-rose-400/40 text-rose-200 hover:bg-rose-500/20 p-1.5 transition"
                            aria-label={`Remove ${item.title}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                          <div>
                            <p
                              className={`text-sm font-semibold ${headerColor} ${item.completed ? 'line-through opacity-60' : ''
                                }`}
                            >
                              {item.title}
                            </p>
                            <p className={`text-xs ${subColor}`}>
                              {item.caseId} · {item.owner}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold ${item.completed ? 'text-slate-400' : 'text-emerald-400'}`}>
                          {item.dueDisplay || item.due}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-300/40 bg-[linear-gradient(135deg,_rgba(19,220,167,0.12),_rgba(3,60,80,0.55))] p-4 text-slate-900">
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">{t('cases.pepperInsights')}</p>
                  <h3 className="text-xl font-semibold text-white mt-2">
                    {insightsHighlights.length > 0 && insightsHighlights[0].title !== t('cases.allCaughtUp')
                      ? `${insightsHighlights.length} ${insightsHighlights.length > 1 ? t('cases.mattersRequiringAttentionPlural') : t('cases.mattersRequiringAttention')}`
                      : t('cases.allCaughtUp')}
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-emerald-50">
                    {insightsHighlights.slice(0, 3).map((insight, index) => (
                      <li key={index}>• {insight.detail}</li>
                    ))}
                  </ul>
                  <button
                    onClick={() => setReportModalOpen(true)}
                    className="mt-4 rounded-xl bg-white/90 text-emerald-700 px-3 py-1.5 text-sm font-semibold hover:bg-white transition"
                  >
                    {t('cases.viewFullReport')}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

      {caseModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur">
          <div
            className={`w-full max-w-3xl rounded-[28px] border ${borderColor} ${isLight ? 'bg-white' : 'bg-[rgba(7,12,24,0.95)]'
              } p-6 space-y-6`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">{t('cases.newMatter')}</p>
                <h3 className={`text-2xl font-semibold ${headerColor}`}>{t('cases.createCaseRecord')}</h3>
                <p className={`text-sm ${subColor}`}>{t('cases.createCaseDescription')}</p>
              </div>
              <button
                onClick={closeCaseModal}
                className="text-slate-400 hover:text-white transition"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleNewCaseSubmit}>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.caseId')}</span>
                <input
                  value={caseForm.caseId}
                  onChange={(event) => handleCaseFormChange('caseId', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                  placeholder="Numeric only"
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.court')}</span>
                <input
                  value={caseForm.court}
                  onChange={(event) => handleCaseFormChange('court', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                  placeholder="e.g., Juzgado Primero Civil del Circuito"
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.plaintiff')}</span>
                <input
                  value={caseForm.plaintiff}
                  onChange={(event) => handleCaseFormChange('plaintiff', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.defendant')}</span>
                <input
                  value={caseForm.defendant}
                  onChange={(event) => handleCaseFormChange('defendant', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1 md:col-span-2">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.lastAction')}</span>
                <textarea
                  value={caseForm.lastAction}
                  onChange={(event) => handleCaseFormChange('lastAction', event.target.value)}
                  rows={2}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  placeholder="e.g., Motion filed on December 15, 2024"
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.clientMatterLabel')}</span>
                <input
                  value={caseForm.client}
                  onChange={(event) => handleCaseFormChange('client', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.practiceAreaLabel')}</span>
                <input
                  value={caseForm.practice}
                  onChange={(event) => handleCaseFormChange('practice', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.stageLabel')}</span>
                <select
                  value={translateStage(caseForm.stage)}
                  onChange={(event) => handleCaseFormChange('stage', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                >
                  {stageChoices.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.nextHearingDeadline')}</span>
                <input
                  type="datetime-local"
                  value={caseForm.hearingDate}
                  onChange={(event) => handleCaseFormChange('hearingDate', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.attorneyLabel')}</span>
                <input
                  value={caseForm.attorney}
                  onChange={(event) => handleCaseFormChange('attorney', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  required
                />
              </label>
              <label className="block text-sm font-semibold space-y-1">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.statusLabel')}</span>
                <select
                  value={translateStatus(caseForm.status)}
                  onChange={(event) => handleCaseFormChange('status', event.target.value)}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                >
                  {statusChoices.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold space-y-1 md:col-span-2">
                <span className={`block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('cases.summaryInstructions')}</span>
                <textarea
                  value={caseForm.summary}
                  onChange={(event) => handleCaseFormChange('summary', event.target.value)}
                  rows={3}
                  className={`w-full rounded-2xl border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  placeholder={t('cases.summaryPlaceholder')}
                  required
                />
              </label>
              {caseFormError && (
                <div className="md:col-span-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                  {caseFormError}
                </div>
              )}
              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCaseModal}
                  className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 hover:border-white/60"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300"
                >
                  {t('cases.saveCase')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reportModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur">
          <div
            className={`w-full max-w-2xl rounded-[28px] border ${borderColor} ${isLight ? 'bg-white' : 'bg-[rgba(5,12,28,0.95)]'
              } p-6 space-y-5`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">{t('cases.pepperReport')}</p>
                <h3 className={`text-2xl font-semibold ${headerColor}`}>{t('cases.riskWorkloadOverview')}</h3>
                <p className={`text-sm ${subColor}`}>{t('cases.fullInsightLog')}</p>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
                aria-label="Close report modal"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {insightsHighlights.map((item) => (
                <div key={item.title} className={`rounded-2xl border ${borderColor} px-4 py-3 ${cardBg}`}>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className={`text-sm ${subColor}`}>{item.detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-50">
              {insightsHighlights.length > 0 && insightsHighlights[0].title !== 'All caught up' ? (
                <>
                  Pepper recommends reviewing {insightsHighlights.length} matter{insightsHighlights.length > 1 ? 's' : ''} with upcoming or overdue deadlines.
                  {deadlines.filter(d => !d.completed).length > 0 && (
                    <> There {deadlines.filter(d => !d.completed).length === 1 ? 'is' : 'are'} {deadlines.filter(d => !d.completed).length} active deadline{deadlines.filter(d => !d.completed).length > 1 ? 's' : ''} requiring attention.</>
                  )}
                </>
              ) : (
                <>All cases are up to date. No urgent actions required at this time.</>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handleDownloadReport}
                className="rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white/60"
              >
                {t('cases.downloadReport')}
              </button>
              <button
                onClick={() => setReportModalOpen(false)}
                className="rounded-2xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-300"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deadlineModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur">
          <div
            className={`w-full max-w-2xl rounded-[28px] border ${borderColor} ${isLight ? 'bg-white' : 'bg-[rgba(6,12,24,0.95)]'
              } p-6 space-y-5`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">{t('cases.taskRegister')}</p>
                <h3 className={`text-2xl font-semibold ${headerColor}`}>{t('cases.allDeadlinesHearings')}</h3>
                <p className={`text-sm ${subColor}`}>{t('cases.markTasksComplete')}</p>
              </div>
              <button
                onClick={() => setDeadlineModalOpen(false)}
                className="text-slate-400 hover:text-white transition"
                aria-label="Close deadlines modal"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportDeadlines}
                className="rounded-2xl border border-white/20 px-4 py-2 text-xs font-semibold text-white/80 hover:border-white/60"
              >
                {t('cases.exportCsv')}
              </button>
            </div>
            <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
              {deadlines.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center justify-between ${cardBg}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(item.completed)}
                      onChange={() => handleCompleteDeadline(item.title)}
                      className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
                    />
                    <div>
                      <p className={`text-sm font-semibold ${headerColor} ${item.completed ? 'line-through opacity-60' : ''}`}>
                        {item.title}
                      </p>
                      <p className={`text-xs ${subColor}`}>
                        {item.caseId} · {item.owner}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold ${item.completed ? 'text-slate-400' : 'text-emerald-400'}`}>{item.dueDisplay || item.due}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setDeadlineModalOpen(false)}
                className="rounded-2xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-emerald-300"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportToast && (
        <div className="fixed bottom-6 right-6 z-30 rounded-2xl border border-emerald-300/40 bg-emerald-600/90 px-4 py-2 text-sm text-white shadow-lg">
          {reportToast}
        </div>
      )}

      {/* CPNU Sync Modal */}
      {cpnuSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className={`w-full max-w-md rounded-2xl border ${borderColor} ${cardBg} p-6 ${isLight ? 'shadow-xl' : 'shadow-2xl'}`}>
            <h2 className={`text-xl font-bold mb-4 ${headerColor}`}>Sincronizar con Rama Judicial</h2>
            <p className={`text-sm mb-4 ${subColor}`}>
              {cpnuRadicado && /^\d{23}$/.test(cpnuRadicado)
                ? `Se utilizará el radicado del ID del caso (${cpnuRadicado}). Esta acción solo se puede ejecutar una vez por caso.`
                : 'Ingrese el radicado de 23 dígitos para sincronizar este caso con CPNU. Esta acción solo se puede ejecutar una vez por caso.'}
            </p>
            <div className="space-y-4">
              <label className="block">
                <span className={`block mb-1 text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  Radicado (23 dígitos)
                </span>
                <input
                  type="text"
                  value={cpnuRadicado}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 23);
                    setCpnuRadicado(value);
                    setCpnuSyncError(null);
                  }}
                  placeholder="6808131840022024002830"
                  maxLength={23}
                  className={`w-full rounded-lg border ${borderColor} px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'bg-white text-slate-900' : 'bg-white/5 text-white'
                    }`}
                  disabled={cpnuSyncing}
                />
              </label>
              {cpnuSyncError && (
                <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                  {cpnuSyncError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseCpnuSync}
                  disabled={cpnuSyncing}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                    } disabled:opacity-50`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCpnuSync}
                  disabled={cpnuSyncing || !validateRadicado(cpnuRadicado)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-emerald-500/80 text-white hover:bg-emerald-500'
                    } disabled:opacity-50`}
                >
                  {cpnuSyncing
                    ? 'Sincronizando...'
                    : validateRadicado(cpnuRadicado) && cpnuSyncCaseId && /^\d{23}$/.test(cpnuSyncCaseId)
                      ? 'Sincronizar Ahora'
                      : 'Sincronizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Case Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className={`w-full max-w-md rounded-2xl border ${borderColor} ${cardBg} p-6 ${isLight ? 'shadow-xl' : 'shadow-2xl'}`}>
            <h2 className={`text-xl font-bold mb-4 ${headerColor}`}>{t('cases.deleteCase')}</h2>
            <p className={`text-sm mb-4 ${subColor}`}>
              {t('cases.deleteCaseConfirm').replace('{caseId}', deleteCaseId || '')}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseDelete}
                disabled={deleting}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
                  } disabled:opacity-50`}
              >
                {t('cases.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteCase}
                disabled={deleting}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-red-500/80 text-white hover:bg-red-500'
                  } disabled:opacity-50`}
              >
                {deleting ? t('cases.deleting') : t('cases.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Case Detail Modal */}
      {caseDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border ${borderColor} ${cardBg} p-6 ${isLight ? 'shadow-xl' : 'shadow-2xl'}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-2xl font-bold ${headerColor}`}>
                {caseNotFound ? 'Case Not Found' : `Case Details: ${selectedCase?.id}`}
              </h2>
              <button
                onClick={() => {
                  setCaseDetailModalOpen(false);
                  setSelectedCase(null);
                  setCaseNotFound(false);
                  // Clean up URL
                  const url = new URL(window.location.href);
                  url.searchParams.delete('case');
                  window.history.replaceState({}, '', url.pathname + url.search);
                }}
                className={`p-2 rounded-lg transition ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/10 text-white/80'}`}
              >
                ✕
              </button>
            </div>

            {caseNotFound ? (
              <div className={`rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200`}>
                <p className="font-semibold">Case not found</p>
                <p className="text-sm mt-1">
                  The case ID &quot;{searchParams.get('case')}&quot; could not be found in your cases list.
                </p>
              </div>
            ) : selectedCase ? (
              <div className="space-y-6">
                {/* Case Information Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.caseId')}
                    </label>
                    <p className={`text-sm font-semibold ${headerColor} mt-1`}>{selectedCase.id}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.status')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${selectedCase.status === 'Hearing Soon'
                          ? 'bg-rose-500/20 text-rose-300'
                          : selectedCase.status === 'Active'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : selectedCase.status === 'Briefing'
                              ? 'bg-amber-500/20 text-amber-300'
                              : selectedCase.status === 'Closed'
                                ? 'bg-slate-500/20 text-slate-300'
                                : 'bg-blue-500/20 text-blue-300'
                          }`}
                      >
                        {translateStatus(selectedCase.status)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.court')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.court || 'N/A'}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.stage')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${selectedCase.stage === 'Discovery'
                          ? 'bg-cyan-500/15 text-cyan-300'
                          : selectedCase.stage === 'Drafting'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : selectedCase.stage === 'Intake'
                              ? 'bg-blue-500/15 text-blue-300'
                              : selectedCase.stage === 'Pre-trial'
                                ? 'bg-orange-500/15 text-orange-300'
                                : selectedCase.stage === 'Hearing'
                                  ? 'bg-rose-500/15 text-rose-300'
                                  : selectedCase.stage === 'Closed'
                                    ? 'bg-slate-500/15 text-slate-300'
                                    : 'bg-purple-500/15 text-purple-200'
                          }`}
                      >
                        {translateStage(selectedCase.stage)}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.plaintiff')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.plaintiff || 'N/A'}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.defendant')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.defendant || 'N/A'}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.attorney')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.attorney?.trim() || 'N/A'}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.practiceArea')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.practice || 'N/A'}</p>
                  </div>
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      {t('cases.nextHearing')}
                    </label>
                    <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.hearing || t('common.na')}</p>
                  </div>
                  {selectedCase.linked_cpnu && selectedCase.radicado_cpnu && (
                    <div>
                      <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                        CPNU Radicado
                      </label>
                      <p className={`text-sm ${headerColor} mt-1`}>
                        {selectedCase.radicado_cpnu}
                        <a
                          href={`https://consultaprocesos.ramajudicial.gov.co/Procesos/NumeroRadicacion?numeroRadicacion=${selectedCase.radicado_cpnu}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 text-green-500 hover:text-green-700 text-xs"
                        >
                          🔗 View in CPNU
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {/* Last Action */}
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                    {t('cases.lastAction')}
                  </label>
                  <p className={`text-sm ${headerColor} mt-1`}>{selectedCase.lastAction || 'No actions recorded'}</p>
                </div>

                {/* Summary */}
                {selectedCase.summary && (
                  <div>
                    <label className={`text-xs font-semibold uppercase tracking-wide ${subColor}`}>
                      Summary
                    </label>
                    <p className={`text-sm ${headerColor} mt-1 whitespace-pre-wrap`}>{selectedCase.summary}</p>
                  </div>
                )}

                {/* Action Buttons */}
                {/* <div className="flex gap-3 pt-4 border-t border-white/10">
                  {!selectedCase.cpnu_bootstrap_done && (
                    <button
                      onClick={() => {
                        setCaseDetailModalOpen(false);
                        handleOpenCpnuSync(selectedCase.id);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-blue-500/80 text-white hover:bg-blue-500'
                        }`}
                    >
                      🔄 Sync with CPNU
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCaseDetailModalOpen(false);
                      handleOpenDelete(selectedCase.id, selectedCase.source || 'dashboard');
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-red-500/80 text-white hover:bg-red-500'
                      }`}
                  >
                    🗑️ Delete Case
                  </button>
                  <button
                    onClick={() => {
                      setCaseDetailModalOpen(false);
                      setSelectedCase(null);
                      setCaseNotFound(false);
                      const url = new URL(window.location.href);
                      url.searchParams.delete('case');
                      window.history.replaceState({}, '', url.pathname + url.search);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${isLight
                      ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                      }`}
                  >
                    Close
                  </button>
                </div> */}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <CaseQuestionnaire
        isOpen={questionnaireOpen}
        onClose={() => setQuestionnaireOpen(false)}
        onSuccess={async (mcd: MasterCaseDocument) => {
          console.log('MCD created successfully:', mcd);
          // Refetch data to update the cases list
          await refetch();
          setReportToast(`${t('cases.caseCreated')} ${mcd.case_id}`);
          setTimeout(() => setReportToast(null), 3000);
        }}
        onRefetch={refetch}
      />
    </div>
  );
}

export default withAuth(CasesPage);

