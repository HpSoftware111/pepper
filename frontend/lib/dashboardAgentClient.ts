/**
 * Dashboard Agent Client
 * Pepper 2.0 - Frontend client for Dashboard Agent API
 */

import { authClient } from './authClient';
import type { DashboardTemplate } from './dashboardTemplate';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

/**
 * Get authentication token from storage
 */
function getAuthToken(): string | null {
    return authClient.getStoredAccessToken();
}

/**
 * Make authenticated API request
 */
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

export const dashboardAgentClient = {
    /**
     * Save a case template
     */
    async saveCase(template: DashboardTemplate): Promise<{
        success: boolean;
        jsonFile: string;
        docxFile: string;
        caseId: string;
        isUpdate: boolean;
        fileLocation: {
            json: {
                fullPath: string;
                relativePath: string;
                description: string;
            };
            docx: {
                fullPath: string;
                relativePath: string;
                description: string;
            };
        };
        message: string;
    }> {
        return request<{
            success: boolean;
            jsonFile: string;
            docxFile: string;
            caseId: string;
            isUpdate: boolean;
            fileLocation: {
                json: {
                    fullPath: string;
                    relativePath: string;
                    description: string;
                };
                docx: {
                    fullPath: string;
                    relativePath: string;
                    description: string;
                };
            };
            message: string;
        }>(
            '/api/dashboard-agent/case/save',
            {
                method: 'POST',
                body: JSON.stringify(template),
            }
        );
    },

    /**
     * Get a case template by ID
     */
    async getCase(caseId: string): Promise<{
        success: boolean;
        data: DashboardTemplate;
    }> {
        return request<{ success: boolean; data: DashboardTemplate }>(
            `/api/dashboard-agent/case/${encodeURIComponent(caseId)}`
        );
    },

    /**
     * Get all case IDs for the authenticated user
     */
    async getAllCases(): Promise<{
        success: boolean;
        cases: string[];
    }> {
        return request<{ success: boolean; cases: string[] }>('/api/dashboard-agent/cases/all');
    },

    /**
     * Get all case templates with full data (for dashboard integration)
     */
    async getAllCasesData(): Promise<{
        success: boolean;
        cases: DashboardTemplate[];
    }> {
        try {
            const response = await request<{ success: boolean; cases: DashboardTemplate[] }>('/api/dashboard-agent/cases/all-data');
            console.log('[dashboardAgentClient] getAllCasesData response:', {
                success: response.success,
                casesCount: response.cases?.length || 0,
            });
            return response;
        } catch (error) {
            console.error('[dashboardAgentClient] Error in getAllCasesData:', error);
            throw error;
        }
    },

    /**
     * Update a case template (partial update)
     * Used for status updates from Kanban board
     */
    async updateCase(caseId: string, updates: Partial<DashboardTemplate>): Promise<{
        success: boolean;
        jsonFile: string;
        docxFile: string;
        caseId: string;
        isUpdate: boolean;
        fileLocation: {
            json: {
                fullPath: string;
                relativePath: string;
                description: string;
            };
            docx: {
                fullPath: string;
                relativePath: string;
                description: string;
            };
        };
        message: string;
    }> {
        // First get the existing case
        const existingCase = await this.getCase(caseId);
        if (!existingCase.success) {
            throw new Error('Case not found');
        }

        // Merge updates with existing data
        const updatedCase: DashboardTemplate = {
            ...existingCase.data,
            ...updates,
        };

        // Save the updated case
        return this.saveCase(updatedCase);
    },

    /**
     * Download DOCX file for a case
     */
    async downloadDocx(caseId: string): Promise<Blob> {
        const token = getAuthToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(`${API_BASE_URL}/api/dashboard-agent/case/${encodeURIComponent(caseId)}/docx`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
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

        return response.blob();
    },
};

