/**
 * Case Files Client
 * Frontend client for accessing files from case folders
 */

import { authClient } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface CaseFile {
    id: string;
    name: string;
    caseId: string;
    size: number;
    updated: string;
    type: string;
    path?: string;
}

export interface CaseFolder {
    caseId: string;
    fileCount: number;
}

export interface CaseFilesResponse {
    success: boolean;
    files: CaseFile[];
    caseFolders?: CaseFolder[];
    caseId?: string;
    error?: string;
    message?: string;
}

export interface UploadFileResponse {
    success: boolean;
    message: string;
    files: Array<{
        name: string;
        size: number;
        path: string;
    }>;
    errors?: Array<{
        name: string;
        error: string;
    }>;
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

export const caseFilesClient = {
    /**
     * Get all files from all case folders
     */
    async getAllFiles(): Promise<CaseFilesResponse> {
        return request<CaseFilesResponse>('/api/case-files');
    },

    /**
     * Get files from a specific case folder
     */
    async getCaseFiles(caseId: string): Promise<CaseFilesResponse> {
        return request<CaseFilesResponse>(`/api/case-files/${encodeURIComponent(caseId)}`);
    },

    /**
     * Download a file from a case folder
     */
    async downloadFile(caseId: string, fileName: string): Promise<Blob> {
        const token = getAuthToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const response = await fetch(
            `${API_BASE_URL}/api/case-files/${encodeURIComponent(caseId)}/${encodeURIComponent(fileName)}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

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

    /**
     * Upload files to a case folder
     * Key rule: All file operations go through Pepper UI - lawyer never touches files directly
     */
    async uploadFiles(caseId: string, files: File[]): Promise<UploadFileResponse> {
        const token = getAuthToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });

        const response = await fetch(
            `${API_BASE_URL}/api/case-files/${encodeURIComponent(caseId)}/upload`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    // Don't set Content-Type - browser will set it with boundary for FormData
                },
                body: formData,
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Upload failed';
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
     * Delete a file from a case folder
     */
    async deleteFile(caseId: string, fileName: string): Promise<{ success: boolean; message: string }> {
        return request<{ success: boolean; message: string }>(
            `/api/case-files/${encodeURIComponent(caseId)}/${encodeURIComponent(fileName)}`,
            {
                method: 'DELETE',
            }
        );
    },
};

