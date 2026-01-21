'use client';

import { useState, useEffect } from 'react';
import { mcdClient, type MasterCaseDocument, type MCDStatus } from '@/lib/mcdClient';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { previewCPNUData, validateRadicado } from '@/lib/cpnuClient';
import { authClient } from '@/lib/authClient';

type CaseQuestionnaireProps = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: (mcd: MasterCaseDocument) => void;
    onRefetch?: () => Promise<void>;
    initialData?: Partial<MasterCaseDocument>;
};

type DeadlineForm = {
    title: string;
    due_date: string; // ISO date string
    case_id: string;
    owner: string;
    completed: boolean;
};

type NextActionForm = {
    title: string;
    description: string;
    priority: 'urgent' | 'pending' | 'normal';
};

export default function CaseQuestionnaire({
    isOpen,
    onClose,
    onSuccess,
    onRefetch,
    initialData,
}: CaseQuestionnaireProps) {
    const { themeMode } = useThemeMode();
    const { t } = useLanguage();
    const isLight = themeMode === 'light';

    // Form state
    const [caseId, setCaseId] = useState(initialData?.case_id || '');
    const [court, setCourt] = useState((initialData as any)?.court || '');
    const [plaintiff, setPlaintiff] = useState(initialData?.parties?.plaintiff || '');
    const [defendant, setDefendant] = useState(initialData?.parties?.defendant || '');
    // Last action: separate fields (title = Actuacion, date = Fecha de actuacion)
    const [lastActionTitle, setLastActionTitle] = useState(
        (initialData as any)?.last_action?.title || 
        (typeof (initialData as any)?.last_action === 'string' ? (initialData as any).last_action.split(' - ')[0] : '') || 
        ''
    );
    const [lastActionDate, setLastActionDate] = useState(
        (initialData as any)?.last_action?.date 
            ? new Date((initialData as any).last_action.date).toISOString().split('T')[0]
            : (typeof (initialData as any)?.last_action === 'string' && (initialData as any).last_action.includes(' - ')
                ? (initialData as any).last_action.split(' - ')[1]?.trim() || ''
                : '') || ''
    );
    const [otherParties, setOtherParties] = useState<string[]>(
        initialData?.parties?.other || []
    );
    const [newOtherParty, setNewOtherParty] = useState('');
    const [caseType, setCaseType] = useState(initialData?.case_type || '');
    const [attorney, setAttorney] = useState<string>((initialData as any)?.attorney || '');
    const [status, setStatus] = useState<MCDStatus>(initialData?.status || 'new');
    const [deadlines, setDeadlines] = useState<DeadlineForm[]>(
        initialData?.deadlines?.map((d) => ({
            title: d.title,
            due_date: d.due_date ? new Date(d.due_date).toISOString().split('T')[0] : '',
            case_id: d.case_id,
            owner: d.owner || '',
            completed: d.completed || false,
        })) || []
    );
    const [nextActions, setNextActions] = useState<NextActionForm[]>(
        initialData?.next_actions?.map((a) => ({
            title: a.title,
            description: a.description || '',
            priority: a.priority || 'pending',
        })) || []
    );
    const [summary, setSummary] = useState(initialData?.summary || '');

    // UI state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDeadlineForm, setShowDeadlineForm] = useState(false);
    const [showActionForm, setShowActionForm] = useState(false);

    // CPNU sync state
    const [cpnuSyncing, setCpnuSyncing] = useState(false);
    const [cpnuSyncError, setCpnuSyncError] = useState<string | null>(null);
    const [cpnuActuaciones, setCpnuActuaciones] = useState<Array<{
        fecha_actuacion?: string;
        descripcion?: string;
        fecha_registro?: string;
    }>>([]);

    // Reset form when modal opens/closes
    useEffect(() => {
        if (isOpen && !initialData) {
            // Reset to defaults when opening fresh
            setCaseId('');
            setCourt('');
            setPlaintiff('');
            setDefendant('');
            setAttorney('');
            setLastActionTitle('');
            setLastActionDate('');
            setOtherParties([]);
            setNewOtherParty('');
            setCaseType('');
            setStatus('new');
            setDeadlines([]);
            setNextActions([]);
            setSummary('');
            setError(null);
            setCpnuSyncError(null);
            setCpnuSyncing(false);
            setCpnuActuaciones([]);
        }
    }, [isOpen, initialData]);

    // CPNU sync handler
    const handleCpnuSync = async () => {
        // Validate radicado format (must be 23 digits)
        if (!validateRadicado(caseId)) {
            setCpnuSyncError(t('cpnu.invalidCaseId'));
            return;
        }

        setCpnuSyncing(true);
        setCpnuSyncError(null);
        setError(null); // Clear general error too

        try {
            const token = authClient.getStoredAccessToken();
            if (!token) {
                throw new Error(t('cpnu.loginAgain'));
            }

            // Call preview endpoint (with retry logic built-in)
            const result = await previewCPNUData(caseId, token);

            if (result.success && result.data) {
                const { datosProceso, sujetosProcesales, latestActuacion, actuaciones } = result.data;

                // Store all actuaciones for calendar events (including past dates)
                if (actuaciones && Array.isArray(actuaciones) && actuaciones.length > 0) {
                    setCpnuActuaciones(actuaciones);
                    console.log(`[CaseQuestionnaire] Stored ${actuaciones.length} CPNU actuaciones for calendar events`);
                } else {
                    setCpnuActuaciones([]);
                }

                // Auto-populate form fields with scraped data
                if (datosProceso.despacho) {
                    setCourt(datosProceso.despacho);
                }
                if (datosProceso.claseProceso) {
                    setCaseType(datosProceso.claseProceso);
                }
                if (sujetosProcesales.demandante) {
                    setPlaintiff(sujetosProcesales.demandante);
                }
                if (sujetosProcesales.demandado) {
                    setDefendant(sujetosProcesales.demandado);
                }
                // Set attorney from CPNU data (priority: defensorPrivado > defensorPublico)
                if (sujetosProcesales.defensorPrivado) {
                    setAttorney(sujetosProcesales.defensorPrivado);
                } else if (sujetosProcesales.defensorPublico) {
                    setAttorney(sujetosProcesales.defensorPublico);
                }
                // Set separate fields: title (Actuacion) and date (Fecha de actuacion)
                if (latestActuacion) {
                    const descripcion = latestActuacion.descripcion || '';
                    const fechaActuacion = latestActuacion.fecha_actuacion || latestActuacion.fecha_registro || '';
                    // Set title (Actuacion)
                    if (descripcion) {
                        setLastActionTitle(descripcion);
                    }
                    // Set date (Fecha de actuacion) - format to YYYY-MM-DD for date input
                    if (fechaActuacion) {
                        // Handle different date formats
                        let dateStr = fechaActuacion;
                        if (dateStr.includes('/')) {
                            // Convert DD/MM/YYYY to YYYY-MM-DD
                            const parts = dateStr.split('/');
                            if (parts.length === 3) {
                                dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                            }
                        }
                        setLastActionDate(dateStr);
                    }
                }

                // Show success message (could be a toast in the future)
                console.log('[CaseQuestionnaire] CPNU data synced successfully');
            } else {
                throw new Error(result.error || t('cpnu.connectionError'));
            }
        } catch (err) {
            // Map error category to i18n key for proper translation
            const errorCategory = (err as any)?.errorCategory || 'other';
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
                    if (err instanceof Error && err.message) {
                        const isDuplicateRecord = (err as any)?.isDuplicateRecord || false;
                        if (isDuplicateRecord) {
                            // Append translated suffix to the original message
                            const fullMessage = `${err.message} ${t('cpnu.duplicateRecordSuffix')}`;
                            setCpnuSyncError(fullMessage);
                            return;
                        }
                        setCpnuSyncError(err.message);
                        return;
                    }
                    i18nKey = 'cpnu.invalidCaseId';
                    break;
                default:
                    i18nKey = 'cpnu.connectionError';
                    break;
            }
            
            setCpnuSyncError(t(i18nKey));
            console.error('[CaseQuestionnaire] CPNU sync error:', err);
        } finally {
            setCpnuSyncing(false);
        }
    };

    const addOtherParty = () => {
        if (newOtherParty.trim()) {
            setOtherParties([...otherParties, newOtherParty.trim()]);
            setNewOtherParty('');
        }
    };

    const removeOtherParty = (index: number) => {
        setOtherParties(otherParties.filter((_, i) => i !== index));
    };

    const addDeadline = () => {
        setDeadlines([
            ...deadlines,
            {
                title: '',
                due_date: '',
                case_id: caseId || '',
                owner: '',
                completed: false,
            },
        ]);
        setShowDeadlineForm(true);
    };

    const updateDeadline = (index: number, field: keyof DeadlineForm, value: any) => {
        const updated = [...deadlines];
        updated[index] = { ...updated[index], [field]: value };
        if (field === 'case_id' && !value) {
            updated[index].case_id = caseId;
        }
        setDeadlines(updated);
    };

    const removeDeadline = (index: number) => {
        setDeadlines(deadlines.filter((_, i) => i !== index));
    };

    const addNextAction = () => {
        setNextActions([
            ...nextActions,
            {
                title: '',
                description: '',
                priority: 'pending',
            },
        ]);
        setShowActionForm(true);
    };

    const updateNextAction = (index: number, field: keyof NextActionForm, value: any) => {
        const updated = [...nextActions];
        updated[index] = { ...updated[index], [field]: value };
        setNextActions(updated);
    };

    const removeNextAction = (index: number) => {
        setNextActions(nextActions.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!caseId.trim()) {
            setError(t('questionnaire.caseIdRequired'));
            return;
        }
        if (!court.trim()) {
            setError(t('questionnaire.courtRequired'));
            return;
        }
        if (!plaintiff.trim() && !defendant.trim() && otherParties.length === 0) {
            setError('At least one party (plaintiff, defendant, or other) is required');
            return;
        }
        if (!plaintiff.trim()) {
            setError(t('questionnaire.plaintiffRequired'));
            return;
        }
        if (!defendant.trim()) {
            setError(t('questionnaire.defendantRequired'));
            return;
        }
        if (!lastActionTitle.trim()) {
            setError(t('questionnaire.lastActionRequired') || 'Last action title (Actuación) is required');
            return;
        }
        if (!lastActionDate.trim()) {
            setError('Last action date (Fecha de actuación) is required');
            return;
        }
        if (!caseType.trim()) {
            setError('Case type is required');
            return;
        }

        // Validate deadlines
        const invalidDeadlines = deadlines.filter(
            (d) => !d.title.trim() || !d.due_date || !d.case_id.trim()
        );
        if (invalidDeadlines.length > 0) {
            setError('All deadlines must have a title, due date, and case ID');
            return;
        }

        // Validate next actions
        const invalidActions = nextActions.filter((a) => !a.title.trim());
        if (invalidActions.length > 0) {
            setError('All next actions must have a title');
            return;
        }

        setIsSubmitting(true);

        try {
            // Prepare data
            const questionnaireData: any = {
                case_id: caseId.trim().toUpperCase(),
                court: court.trim(),
                parties: {
                    plaintiff: plaintiff.trim() || undefined,
                    defendant: defendant.trim() || undefined,
                    other: otherParties.filter((p) => p.trim().length > 0),
                },
                last_action: {
                    title: lastActionTitle.trim(),
                    date: lastActionDate ? new Date(lastActionDate + 'T00:00:00').toISOString() : null,
                },
                case_type: caseType.trim(),
                status,
                attorney: attorney.trim() || undefined, // Include attorney field
                // Include CPNU actuaciones for calendar events (including past dates)
                cpnu_actuaciones: cpnuActuaciones.length > 0 ? cpnuActuaciones : undefined,
                deadlines: deadlines.map((d) => {
                    // Extract YYYY-MM-DD format from date input to avoid timezone issues
                    let dueDateStr = d.due_date;
                    if (typeof d.due_date === 'string') {
                        // If it's already YYYY-MM-DD format, use it directly
                        if (/^\d{4}-\d{2}-\d{2}$/.test(d.due_date)) {
                            dueDateStr = d.due_date;
                        } else {
                            // If it's an ISO string or other format, extract date part
                            const date = new Date(d.due_date);
                            if (!isNaN(date.getTime())) {
                                const year = date.getFullYear();
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const day = String(date.getDate()).padStart(2, '0');
                                dueDateStr = `${year}-${month}-${day}`;
                            }
                        }
                    }
                    return {
                        title: d.title.trim(),
                        due_date: dueDateStr, // Send as YYYY-MM-DD format (no UTC conversion)
                        case_id: d.case_id.trim().toUpperCase() || caseId.trim().toUpperCase(),
                        owner: d.owner.trim(),
                        completed: d.completed,
                    };
                }),
                next_actions: nextActions.map((a) => ({
                    title: a.title.trim(),
                    description: a.description.trim() || undefined,
                    priority: a.priority,
                })),
                summary: summary.trim() || '',
            };

            const result = await mcdClient.submitQuestionnaire(questionnaireData);

            if (result.success) {
                console.log('[CaseQuestionnaire] Case created successfully:', result);

                // Log operation results
                // The result.operations property does not exist on the response type.
                // Safely attempt to log operation results if present in a less strictly typed way.
                const opResults = (result as any).operations;
                if (opResults) {
                    console.log('[CaseQuestionnaire] Operation results:', {
                        fileSave: opResults.fileSave?.success ? '✅' : '❌',
                        docxGeneration: opResults.docxGeneration?.success ? '✅' : '❌',
                        calendarSync: opResults.calendarSync?.success ? '✅' : '❌',
                    });

                    // Show warnings if any operations failed
                    const failures = [];
                    if (opResults.fileSave && !opResults.fileSave.success) {
                        failures.push('File save');
                    }
                    if (opResults.docxGeneration && !opResults.docxGeneration.success) {
                        failures.push('DOCX generation');
                    }
                    if (opResults.calendarSync && !opResults.calendarSync.success) {
                        failures.push('Calendar sync');
                    }

                    if (failures.length > 0) {
                        console.warn(`[CaseQuestionnaire] ⚠️ Some operations failed: ${failures.join(', ')}`);
                    }
                }

                // Optimistic update: refetch data immediately
                if (onRefetch) {
                    try {
                        await onRefetch();
                        console.log('[CaseQuestionnaire] ✅ Data refetched successfully');
                    } catch (refetchError) {
                        console.error('[CaseQuestionnaire] ❌ Error refetching data:', refetchError);
                        // Continue anyway - case was created successfully
                    }
                }

                onSuccess?.(result.mcd);
                onClose();
            } else {
                // The CreateMCDResponse type doesn't have 'error' -- provide a generic error message.
                throw new Error('Failed to create case');
            }
        } catch (err) {
            console.error('Error submitting questionnaire:', err);
            setError((err as Error).message || 'Failed to submit questionnaire');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={onClose}
        >
            <div
                className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border ${isLight
                    ? 'bg-white border-slate-200'
                    : 'bg-slate-900 border-slate-700'
                    } shadow-2xl`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header - Sticky with backdrop blur to prevent overlap */}
                <div
                    className={`sticky top-0 z-10 flex items-center justify-between p-6 border-b backdrop-blur-sm ${isLight
                        ? 'border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm'
                        : 'border-slate-700 bg-slate-900/95 backdrop-blur-sm shadow-sm'
                        }`}
                >
                    <h2
                        className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'
                            }`}
                    >
                        {t('questionnaire.title')}
                    </h2>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg transition ${isLight
                            ? 'hover:bg-slate-100 text-slate-600'
                            : 'hover:bg-slate-800 text-slate-400'
                            }`}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {error && (
                        <div
                            className={`p-4 rounded-lg ${isLight ? 'bg-red-50 text-red-800' : 'bg-red-900/20 text-red-400'
                                }`}
                        >
                            {error}
                        </div>
                    )}

                    {/* Case ID */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('questionnaire.caseId')} <span className="text-red-500">{t('questionnaire.required')}</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={caseId}
                                onChange={(e) => {
                                    setCaseId(e.target.value);
                                    setCpnuSyncError(null); // Clear sync error when typing
                                }}
                                required
                                className={`flex-1 px-4 py-2 rounded-lg border ${isLight
                                    ? 'bg-white border-slate-200 text-slate-900'
                                    : 'bg-slate-800 border-slate-600 text-white'
                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                placeholder={t('questionnaire.caseIdPlaceholder')}
                                disabled={cpnuSyncing}
                            />
                            <button
                                type="button"
                                onClick={handleCpnuSync}
                                disabled={cpnuSyncing || !validateRadicado(caseId)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${isLight
                                    ? cpnuSyncing || !validateRadicado(caseId)
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                        : 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
                                    : cpnuSyncing || !validateRadicado(caseId)
                                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20'
                                    }`}
                                title={!validateRadicado(caseId) ? 'Enter a 23-digit radicado to sync with CPNU' : 'Sync with CPNU'}
                            >
                                {cpnuSyncing ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Syncing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        <span>Sync CPNU</span>
                                    </>
                                )}
                            </button>
                        </div>
                        {cpnuSyncError && (
                            <div className={`mt-2 p-3 rounded-lg text-sm ${isLight
                                ? 'bg-red-50 text-red-800 border border-red-200'
                                : 'bg-red-900/20 text-red-400 border border-red-500/30'
                                }`}>
                                {cpnuSyncError}
                            </div>
                        )}
                        {validateRadicado(caseId) && !cpnuSyncing && !cpnuSyncError && (
                            <p className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                ✓ Valid radicado format. Click "Sync CPNU" to auto-fill form fields.
                            </p>
                        )}
                    </div>

                    {/* Court / Judicial Office */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('cases.court')} <span className="text-red-500">{t('questionnaire.required')}</span>
                        </label>
                        <input
                            type="text"
                            value={court}
                            onChange={(e) => setCourt(e.target.value)}
                            required
                            className={`w-full px-4 py-2 rounded-lg border ${isLight
                                ? 'bg-white border-slate-200 text-slate-900'
                                : 'bg-slate-800 border-slate-600 text-white'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                            placeholder="e.g., Juzgado Primero Civil del Circuito"
                        />
                    </div>

                    {/* Parties */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('questionnaire.parties')} <span className="text-red-500">{t('questionnaire.required')}</span>
                        </label>
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={plaintiff}
                                onChange={(e) => setPlaintiff(e.target.value)}
                                className={`w-full px-4 py-2 rounded-lg border ${isLight
                                    ? 'bg-white border-slate-200 text-slate-900'
                                    : 'bg-slate-800 border-slate-600 text-white'
                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                placeholder={t('questionnaire.plaintiffPlaceholder')}
                            />
                            <input
                                type="text"
                                value={defendant}
                                onChange={(e) => setDefendant(e.target.value)}
                                className={`w-full px-4 py-2 rounded-lg border ${isLight
                                    ? 'bg-white border-slate-200 text-slate-900'
                                    : 'bg-slate-800 border-slate-600 text-white'
                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                placeholder={t('questionnaire.defendantPlaceholder')}
                            />
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newOtherParty}
                                    onChange={(e) => setNewOtherParty(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOtherParty())}
                                    className={`flex-1 px-4 py-2 rounded-lg border ${isLight
                                        ? 'bg-white border-slate-200 text-slate-900'
                                        : 'bg-slate-800 border-slate-600 text-white'
                                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                    placeholder={t('questionnaire.otherPartyPlaceholder')}
                                />
                                <button
                                    type="button"
                                    onClick={addOtherParty}
                                    className={`px-4 py-2 rounded-lg ${isLight
                                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                        } transition`}
                                >
                                    {t('questionnaire.add')}
                                </button>
                            </div>
                            {otherParties.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {otherParties.map((party, index) => (
                                        <span
                                            key={index}
                                            className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg ${isLight
                                                ? 'bg-slate-100 text-slate-700'
                                                : 'bg-slate-800 text-slate-300'
                                                }`}
                                        >
                                            {party}
                                            <button
                                                type="button"
                                                onClick={() => removeOtherParty(index)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Last Action */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('cases.lastAction')} <span className="text-red-500">{t('questionnaire.required')}</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <input
                                    type="text"
                                    value={lastActionTitle}
                                    onChange={(e) => setLastActionTitle(e.target.value)}
                                    required
                                    placeholder="Actuación (e.g., Fijacion Estado)"
                                    className={`w-full px-4 py-2 rounded-lg border ${isLight
                                        ? 'bg-white border-slate-200 text-slate-900'
                                        : 'bg-slate-800 border-slate-600 text-white'
                                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                />
                                <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Actuación
                                </p>
                            </div>
                            <div>
                                <input
                                    type="date"
                                    value={lastActionDate}
                                    onChange={(e) => setLastActionDate(e.target.value)}
                                    required
                                    className={`w-full px-4 py-2 rounded-lg border ${isLight
                                        ? 'bg-white border-slate-200 text-slate-900'
                                        : 'bg-slate-800 border-slate-600 text-white'
                                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                />
                                <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Fecha de actuación
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Case Type */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('questionnaire.caseType')} <span className="text-red-500">{t('questionnaire.required')}</span>
                        </label>
                        <input
                            type="text"
                            value={caseType}
                            onChange={(e) => setCaseType(e.target.value)}
                            required
                            className={`w-full px-4 py-2 rounded-lg border ${isLight
                                ? 'bg-white border-slate-200 text-slate-900'
                                : 'bg-slate-800 border-slate-600 text-white'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                            placeholder={t('questionnaire.caseTypePlaceholder')}
                        />
                    </div>

                    {/* Attorney */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('cases.attorney')}
                        </label>
                        <input
                            type="text"
                            value={attorney}
                            onChange={(e) => setAttorney(e.target.value)}
                            className={`w-full px-4 py-2 rounded-lg border ${isLight
                                ? 'bg-white border-slate-200 text-slate-900'
                                : 'bg-slate-800 border-slate-600 text-white'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                            placeholder="Attorney name (e.g., from CPNU sync)"
                        />
                    </div>

                    {/* Status */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('questionnaire.status')}
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as MCDStatus)}
                            className={`w-full px-4 py-2 rounded-lg border ${isLight
                                ? 'bg-white border-slate-200 text-slate-900'
                                : 'bg-slate-800 border-slate-600 text-white'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        >
                            <option value="new">{t('questionnaire.statusNew')}</option>
                            <option value="review">{t('questionnaire.statusReview')}</option>
                            <option value="in_progress">{t('questionnaire.statusInProgress')}</option>
                            <option value="appeals">{t('questionnaire.statusAppeals')}</option>
                            <option value="pending_decision">{t('questionnaire.statusPendingDecision')}</option>
                            <option value="closed">{t('questionnaire.statusClosed')}</option>
                        </select>
                    </div>

                    {/* Deadlines */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label
                                className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'
                                    }`}
                            >
                                {t('questionnaire.deadlines')}
                            </label>
                            <button
                                type="button"
                                onClick={addDeadline}
                                className={`text-sm px-3 py-1 rounded-lg ${isLight
                                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                                    } transition`}
                            >
                                + {t('questionnaire.addDeadline')}
                            </button>
                        </div>
                        {deadlines.length > 0 && (
                            <div className="space-y-3">
                                {deadlines.map((deadline, index) => (
                                    <div
                                        key={index}
                                        className={`p-4 rounded-lg border ${isLight
                                            ? 'bg-slate-50 border-slate-200'
                                            : 'bg-slate-800/50 border-slate-700'
                                            }`}
                                    >
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input
                                                type="text"
                                                value={deadline.title}
                                                onChange={(e) =>
                                                    updateDeadline(index, 'title', e.target.value)
                                                }
                                                placeholder={t('questionnaire.deadlineTitlePlaceholder')}
                                                className={`px-3 py-2 rounded-lg border ${isLight
                                                    ? 'bg-white border-slate-200 text-slate-900'
                                                    : 'bg-slate-800 border-slate-600 text-white'
                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            />
                                            <input
                                                type="date"
                                                value={deadline.due_date}
                                                onChange={(e) =>
                                                    updateDeadline(index, 'due_date', e.target.value)
                                                }
                                                className={`px-3 py-2 rounded-lg border ${isLight
                                                    ? 'bg-white border-slate-200 text-slate-900'
                                                    : 'bg-slate-800 border-slate-600 text-white'
                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={deadline.owner}
                                                onChange={(e) =>
                                                    updateDeadline(index, 'owner', e.target.value)
                                                }
                                                placeholder={t('questionnaire.deadlineOwnerPlaceholder')}
                                                className={`flex-1 px-3 py-2 rounded-lg border ${isLight
                                                    ? 'bg-white border-slate-200 text-slate-900'
                                                    : 'bg-slate-800 border-slate-600 text-white'
                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeDeadline(index)}
                                                className={`px-3 py-2 rounded-lg ${isLight
                                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                                    : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                                                    } transition`}
                                            >
                                                {t('questionnaire.remove')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Next Actions */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label
                                className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'
                                    }`}
                            >
                                {t('questionnaire.nextActions')}
                            </label>
                            <button
                                type="button"
                                onClick={addNextAction}
                                className={`text-sm px-3 py-1 rounded-lg ${isLight
                                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                    : 'bg-blue-900/30 text-blue-400 hover:bg-blue-900/50'
                                    } transition`}
                            >
                                + {t('questionnaire.addAction')}
                            </button>
                        </div>
                        {nextActions.length > 0 && (
                            <div className="space-y-3">
                                {nextActions.map((action, index) => (
                                    <div
                                        key={index}
                                        className={`p-4 rounded-lg border ${isLight
                                            ? 'bg-slate-50 border-slate-200'
                                            : 'bg-slate-800/50 border-slate-700'
                                            }`}
                                    >
                                        <div className="grid grid-cols-2 gap-3 mb-3">
                                            <input
                                                type="text"
                                                value={action.title}
                                                onChange={(e) =>
                                                    updateNextAction(index, 'title', e.target.value)
                                                }
                                                placeholder={t('questionnaire.actionTitlePlaceholder')}
                                                className={`px-3 py-2 rounded-lg border ${isLight
                                                    ? 'bg-white border-slate-200 text-slate-900'
                                                    : 'bg-slate-800 border-slate-600 text-white'
                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            />
                                            <select
                                                value={action.priority}
                                                onChange={(e) =>
                                                    updateNextAction(
                                                        index,
                                                        'priority',
                                                        e.target.value as 'urgent' | 'pending' | 'normal'
                                                    )
                                                }
                                                className={`px-3 py-2 rounded-lg border ${isLight
                                                    ? 'bg-white border-slate-200 text-slate-900'
                                                    : 'bg-slate-800 border-slate-600 text-white'
                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            >
                                                <option value="urgent">{t('questionnaire.priorityUrgent')}</option>
                                                <option value="pending">{t('questionnaire.priorityPending')}</option>
                                                <option value="normal">{t('questionnaire.priorityNormal')}</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-2">
                                            <textarea
                                                value={action.description}
                                                onChange={(e) =>
                                                    updateNextAction(index, 'description', e.target.value)
                                                }
                                                placeholder={t('questionnaire.actionDescriptionPlaceholder')}
                                                rows={2}
                                                className={`flex-1 px-3 py-2 rounded-lg border ${isLight
                                                    ? 'bg-white border-slate-200 text-slate-900'
                                                    : 'bg-slate-800 border-slate-600 text-white'
                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeNextAction(index)}
                                                className={`px-3 py-2 rounded-lg ${isLight
                                                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                                    : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                                                    } transition`}
                                            >
                                                {t('questionnaire.remove')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Summary */}
                    <div>
                        <label
                            className={`block text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-slate-300'
                                }`}
                        >
                            {t('questionnaire.summary')}
                        </label>
                        <textarea
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            rows={4}
                            className={`w-full px-4 py-2 rounded-lg border ${isLight
                                ? 'bg-white border-slate-200 text-slate-900'
                                : 'bg-slate-800 border-slate-600 text-white'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none`}
                            placeholder={t('questionnaire.summaryPlaceholder')}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex-1 px-4 py-2 rounded-lg border transition ${isLight
                                ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                                : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                                }`}
                        >
                            {t('questionnaire.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`flex-1 px-4 py-2 rounded-lg transition ${isSubmitting
                                ? 'bg-slate-400 cursor-not-allowed'
                                : isLight
                                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                        >
                            {isSubmitting ? t('questionnaire.submitting') : t('questionnaire.createCase')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

