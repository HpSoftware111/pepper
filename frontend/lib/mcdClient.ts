import { authClient } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Master Case Document (MCD) data structures
 */
export interface MCDParties {
    plaintiff?: string;
    defendant?: string;
    other?: string[];
}

export interface MCDDeadline {
    title: string;
    due_date: string; // ISO date string
    case_id: string;
    owner: string;
    completed?: boolean;
}

export interface MCDLastDocument {
    name: string;
    uploaded_at: string; // ISO date string
    type?: string;
}

export interface MCDNextAction {
    title: string;
    description?: string;
    priority?: 'urgent' | 'pending' | 'normal';
}

export type MCDStatus = 'new' | 'review' | 'in_progress' | 'appeals' | 'pending_decision' | 'closed';
export type MCDSource = 'document' | 'questionnaire' | 'manual' | 'file';

export interface MasterCaseDocument {
    _id?: string;
    case_id: string;
    parties: MCDParties;
    case_type: string;
    status: MCDStatus;
    deadlines: MCDDeadline[];
    last_documents: MCDLastDocument[];
    next_actions: MCDNextAction[];
    summary: string;
    attorney?: string; // Attorney (can be set from CPNU Sujetos Procesales)
    user_id?: string;
    user_email?: string;
    mcd_file_path?: string;
    source?: MCDSource;
    source_document_id?: string;
    createdAt?: string;
    updatedAt?: string;
    // CPNU Integration Fields
    radicado_cpnu?: string;
    linked_cpnu?: boolean;
    cpnu_bootstrap_done?: boolean;
    court?: string; // Court from CPNU
}

export interface CreateMCDRequest {
    case_id: string;
    parties: MCDParties;
    case_type: string;
    status?: MCDStatus;
    deadlines?: MCDDeadline[];
    last_documents?: MCDLastDocument[];
    next_actions?: MCDNextAction[];
    summary?: string;
    mcd_file_path?: string;
    source?: MCDSource;
    source_document_id?: string;
}

export interface UpdateMCDRequest {
    parties?: MCDParties;
    case_type?: string;
    status?: MCDStatus;
    deadlines?: MCDDeadline[];
    last_documents?: MCDLastDocument[];
    next_actions?: MCDNextAction[];
    summary?: string;
    mcd_file_path?: string;
}

export interface GetAllMCDsResponse {
    success: boolean;
    mcds: MasterCaseDocument[];
    total: number;
    limit: number;
    offset: number;
}

export interface GetMCDResponse {
    success: boolean;
    mcd: MasterCaseDocument;
}

export interface CreateMCDResponse {
    success: boolean;
    mcd: MasterCaseDocument;
}

/**
 * Get authentication token from storage
 */
function getAuthToken(): string | null {
    return authClient.getStoredAccessToken();
}

/**
 * Make authenticated API request
 */
async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getAuthToken();
    if (!token) {
        throw new Error('No authentication token found');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Request failed';
        try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
            errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
    }

    return response.json();
}

export const mcdClient = {
    /**
     * Create a new Master Case Document
     */
    async createMCD(data: CreateMCDRequest): Promise<CreateMCDResponse> {
        return request<CreateMCDResponse>('/api/mcd', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },

    /**
     * Get all MCDs for the authenticated user
     */
    async getAllMCDs(options?: {
        status?: MCDStatus;
        limit?: number;
        offset?: number;
    }): Promise<GetAllMCDsResponse> {
        const params = new URLSearchParams();
        if (options?.status) {
            params.append('status', options.status);
        }
        if (options?.limit) {
            params.append('limit', options.limit.toString());
        }
        if (options?.offset) {
            params.append('offset', options.offset.toString());
        }

        const queryString = params.toString();
        const endpoint = queryString ? `/api/mcd?${queryString}` : '/api/mcd';
        return request<GetAllMCDsResponse>(endpoint);
    },

    /**
     * Get MCD by case_id
     */
    async getMCDByCaseId(caseId: string): Promise<GetMCDResponse> {
        return request<GetMCDResponse>(`/api/mcd/${encodeURIComponent(caseId)}`);
    },

    /**
     * Update MCD by case_id
     */
    async updateMCD(caseId: string, data: UpdateMCDRequest): Promise<GetMCDResponse> {
        return request<GetMCDResponse>(`/api/mcd/${encodeURIComponent(caseId)}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    },

    /**
     * Delete MCD by case_id
     */
    async deleteMCD(caseId: string): Promise<{ success: boolean; message: string }> {
        return request<{ success: boolean; message: string }>(
            `/api/mcd/${encodeURIComponent(caseId)}`,
            {
                method: 'DELETE',
            }
        );
    },

    /**
     * Sync MCD from local file
     */
    async syncFromFile(
        mcdData: MasterCaseDocument,
        filePath: string
    ): Promise<CreateMCDResponse> {
        return request<CreateMCDResponse>('/api/mcd/sync-from-file', {
            method: 'POST',
            body: JSON.stringify({
                mcd_data: mcdData,
                file_path: filePath,
            }),
        });
    },

    /**
     * Extract case data from uploaded document (returns extracted data, does not create MCD)
     */
    async extractFromDocument(file: File): Promise<{
        success: boolean;
        extractedData: MasterCaseDocument;
        fileName: string;
        wordCount: number;
    }> {
        const token = getAuthToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const formData = new FormData();
        formData.append('files', file);

        const response = await fetch(`${API_BASE_URL}/api/mcd/extract-from-document`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Request failed';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        return response.json();
    },

    /**
     * Generate MCD from previously extracted case data
     */
    async generateFromExtraction(
        extractedData: MasterCaseDocument,
        sourceDocumentId?: string
    ): Promise<CreateMCDResponse> {
        return request<CreateMCDResponse>('/api/mcd/generate-from-extraction', {
            method: 'POST',
            body: JSON.stringify({
                extractedData,
                source_document_id: sourceDocumentId,
            }),
        });
    },

    /**
     * Extract case data from document and generate MCD in one step
     */
    async extractAndGenerateMCD(file: File): Promise<{
        success: boolean;
        mcd: MasterCaseDocument;
        extractedData: MasterCaseDocument;
        fileName: string;
        message: string;
    }> {
        const token = getAuthToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const formData = new FormData();
        formData.append('files', file);

        const response = await fetch(`${API_BASE_URL}/api/mcd/extract-and-generate`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Request failed';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        return response.json();
    },

    /**
     * Get questionnaire template structure
     */
    async getQuestionnaireTemplate(): Promise<{
        success: boolean;
        template: any;
    }> {
        return request<{ success: boolean; template: any }>('/api/mcd/questionnaire/template');
    },

    /**
     * Submit questionnaire and generate MCD
     */
    async submitQuestionnaire(data: MasterCaseDocument): Promise<CreateMCDResponse> {
        return request<CreateMCDResponse>('/api/mcd/questionnaire', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
};

