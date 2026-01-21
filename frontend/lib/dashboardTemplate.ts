/**
 * Dashboard Template Types and Validation
 * Pepper 2.0 - Dashboard Agent System
 */

// =========================================================
// Type Definitions
// =========================================================

export interface ImportantDate {
    title: string;
    date: string; // YYYY-MM-DD
}

export interface RecentActivity {
    id: string;
    message: string;
    time: string;
}

export interface DeadlineItem {
    title: string;
    caseId: string;
    due: string; // YYYY-MM-DD
    owner: string;
    completed?: boolean;
}

export interface SidebarCase {
    id: string;
    name: string;
    type: string;
    status: 'active' | 'pending' | 'urgent';
}

export interface DashboardTemplate {
    case_id: string;
    court?: string; // Court / Judicial Office
    plaintiff?: string; // Plaintiff name
    defendant?: string; // Defendant name
    last_action?: string; // Last action taken
    client: string;
    practice: string;
    type: string;
    attorney: string;
    status: 'active' | 'pending' | 'urgent';
    stage: string;
    summary: string;
    hearing: string; // YYYY-MM-DD or "none"
    important_dates: ImportantDate[];
    recent_activity: RecentActivity[];
    deadlines: DeadlineItem[];
    sidebar_case: SidebarCase;
    // CPNU Integration Fields
    radicado_cpnu?: string; // 24-digit numeric radicado
    linked_cpnu?: boolean; // Whether case is linked to CPNU
    cpnu_bootstrap_done?: boolean; // Whether initial sync completed
    cpnu_bootstrap_at?: string; // ISO timestamp of bootstrap
    cpnu_bootstrap_by?: string; // User ID who ran bootstrap
    cpnu_last_fecha_registro?: string; // Last "Fecha de registro" from Actuaciones
    cpnu_last_sync_at?: string; // Last automatic sync timestamp
    cpnu_last_sync_status?: 'success' | 'error' | 'no_changes'; // Last sync result
    cpnu_actuaciones?: Array<{ // Stored Actuaciones from CPNU
        fecha_registro: string;
        descripcion: string;
        fecha_actuacion?: string;
    }>;
    cpnu_clase_proceso?: string; // Clase de Proceso from CPNU (placeholder field)
    is_deleted?: boolean; // Soft delete flag
    deleted_at?: string; // ISO timestamp of deletion
    deleted_by?: string; // User ID who deleted
    case_url?: string; // Pepper case URL (computed)
    cpnu_query_url?: string; // CPNU query URL (computed)
}

// =========================================================
// Utility Functions
// =========================================================

export function isNonEmptyString(value: any): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

export function validateEnum(value: string, allowed: string[]): boolean {
    return allowed.includes(value);
}

export function isValidISODate(date: string): boolean {
    // Checks YYYY-MM-DD format
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// =========================================================
// Field Validators
// =========================================================

export function validateCaseId(caseId: string | null | undefined): string | null {
    const id = caseId ?? '';
    if (!isNonEmptyString(id)) return 'Case ID is required.';
    // Case ID must be numeric only for Colombian judicial compatibility
    if (!/^\d+$/.test(id))
        return 'Case ID must be numeric only (no letters, dashes, or special characters).';
    return null;
}

export function validateClientName(client: string): string | null {
    return isNonEmptyString(client) ? null : 'Client/Case name is required.';
}

export function validatePractice(practice: string): string | null {
    return isNonEmptyString(practice) ? null : 'Practice area is required.';
}

export function validateCaseType(type: string): string | null {
    return isNonEmptyString(type) ? null : 'Case type is required.';
}

export function validateAttorney(attorney: string): string | null {
    return isNonEmptyString(attorney) ? null : 'Assigned attorney is required.';
}

export function validateStatus(status: string): string | null {
    const allowed = ['active', 'pending', 'urgent'];
    return validateEnum(status, allowed)
        ? null
        : `Status must be one of ${allowed.join(', ')}.`;
}

export function validateStage(stage: string): string | null {
    return isNonEmptyString(stage) ? null : 'Case stage is required.';
}

export function validateSummary(summary: string): string | null {
    return isNonEmptyString(summary)
        ? null
        : 'Case summary is required (1–3 sentences recommended).';
}

export function validateCourt(court: string | null | undefined): string | null {
    const c = court ?? '';
    return isNonEmptyString(c) ? null : 'Court / Judicial Office is required.';
}

export function validatePlaintiff(plaintiff: string | null | undefined): string | null {
    const p = plaintiff ?? '';
    return isNonEmptyString(p) ? null : 'Plaintiff is required.';
}

export function validateDefendant(defendant: string | null | undefined): string | null {
    const d = defendant ?? '';
    return isNonEmptyString(d) ? null : 'Defendant is required.';
}

export function validateLastAction(lastAction: string | null | undefined): string | null {
    const la = lastAction ?? '';
    return isNonEmptyString(la) ? null : 'Last action is required.';
}

export function validateHearing(hearing: string | null | undefined): string | null {
    const h = hearing ?? '';
    if (h.trim().toLowerCase() === 'none') return null;
    return isValidISODate(h)
        ? null
        : "Hearing date must be in YYYY-MM-DD format or 'None'.";
}

export function validateImportantDate(item: ImportantDate): string | null {
    if (!isNonEmptyString(item.title)) return 'Important date title is required.';
    if (!isValidISODate(item.date)) return 'Important date must use YYYY-MM-DD format.';
    return null;
}

export function validateActivity(a: RecentActivity): string | null {
    if (!isNonEmptyString(a.id)) return 'Activity item must contain an ID.';
    if (!isNonEmptyString(a.message)) return 'Activity item must contain a message.';
    if (!isNonEmptyString(a.time)) return 'Activity item must contain a timestamp.';
    return null;
}

export function validateDeadline(item: DeadlineItem, expectedCaseId: string): string | null {
    if (!isNonEmptyString(item.title)) return 'Deadline title is required.';
    if (item.caseId !== expectedCaseId)
        return 'Deadline caseId must match the main case_id.';
    if (!isValidISODate(item.due)) return 'Deadline date must use YYYY-MM-DD format.';
    if (!isNonEmptyString(item.owner)) return 'Deadline owner is required.';
    return null;
}

export function validateSidebarCase(c: SidebarCase): string | null {
    if (!isNonEmptyString(c.id)) return 'Sidebar case id is required.';
    if (!isNonEmptyString(c.name)) return 'Sidebar case name is required.';
    if (!isNonEmptyString(c.type)) return 'Sidebar case type is required.';

    const allowed = ['active', 'pending', 'urgent'];
    if (!allowed.includes(c.status))
        return 'Sidebar case status must be active, pending, or urgent.';

    return null;
}

// =========================================================
// Master Template Validator
// =========================================================

export function validateDashboardTemplate(data: any): string[] {
    const errors: string[] = [];

    // Identity fields
    // @ts-ignore - TypeScript is incorrectly inferring types despite function signatures accepting string | null | undefined
    errors.push(validateCaseId(data.case_id));
    // @ts-ignore
    errors.push(validateCourt(data.court));
    // @ts-ignore
    errors.push(validatePlaintiff(data.plaintiff));
    // @ts-ignore
    errors.push(validateDefendant(data.defendant));
    // @ts-ignore
    errors.push(validateLastAction(data.last_action));
    // @ts-ignore - TypeScript inference issue with nullable types
    errors.push(validateClientName(data.client));
    // @ts-ignore
    errors.push(validatePractice(data.practice));
    // @ts-ignore
    errors.push(validateCaseType(data.type));
    // @ts-ignore
    errors.push(validateAttorney(data.attorney));
    // @ts-ignore
    errors.push(validateStatus(data.status));
    // @ts-ignore
    errors.push(validateStage(data.stage));
    // @ts-ignore
    errors.push(validateSummary(data.summary));
    // @ts-ignore
    errors.push(validateHearing(data.hearing));

    // Important Dates
    if (Array.isArray(data.important_dates)) {
        data.important_dates.forEach((d: ImportantDate, i: number) => {
            const err = validateImportantDate(d);
            if (err) errors.push(`Important date #${i}: ${err}`);
        });
    }

    // Recent Activity
    if (Array.isArray(data.recent_activity)) {
        data.recent_activity.forEach((a: RecentActivity, i: number) => {
            const err = validateActivity(a);
            if (err) errors.push(`Activity #${i}: ${err}`);
        });
    }

    // Deadlines
    if (Array.isArray(data.deadlines)) {
        const caseIdForDeadlines = data.case_id ?? '';
        data.deadlines.forEach((d: DeadlineItem, i: number) => {
            const err = validateDeadline(d, caseIdForDeadlines);
            if (err) errors.push(`Deadline #${i}: ${err}`);
        });
    }

    // Sidebar Case
    if (data.sidebar_case) {
        const sidebarErr = validateSidebarCase(data.sidebar_case);
        if (sidebarErr) errors.push(`Sidebar case: ${sidebarErr}`);
    }

    // Clean nulls and return
    return errors.filter(Boolean);
}

