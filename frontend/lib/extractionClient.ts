/**
 * Client library for interacting with extracted text APIs
 * Handles voice transcriptions and file extractions storage
 */

import { authClient } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface ExtractedTextMetadata {
    duration?: number;
    fileSize?: number;
    fileType?: string;
    wordCount: number;
    language?: string;
    fileName?: string;
    meetingTitle?: string;
}

export interface ExtractedText {
    textId: string;
    userId: string;
    userEmail: string;
    source: 'voice' | 'file';
    sourceName: string;
    extractedText: string;
    metadata: ExtractedTextMetadata;
    status: 'processing' | 'ready' | 'error';
    error?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ExtractedTextSummary {
    textId: string;
    source: 'voice' | 'file';
    sourceName: string;
    wordCount: number;
    createdAt: string;
}

export interface ExtractedTextsListResponse {
    success: boolean;
    extractedTexts: ExtractedTextSummary[];
    total: number;
    limit: number;
    offset: number;
}

export interface StoreVoiceTextRequest {
    text: string;
    sourceName?: string;
    duration?: number;
    language?: string;
    meetingTitle?: string;
}

export interface StoreVoiceTextResponse {
    success: boolean;
    textId: string;
    extractedText: ExtractedTextSummary;
}

export interface StoreFileTextRequest {
    text: string;
    sourceName?: string;
    fileSize?: number;
    fileType?: string;
    fileName?: string;
    language?: string;
}

export interface StoreFileTextResponse {
    success: boolean;
    textId: string;
    extractedText: ExtractedTextSummary;
}

export interface TranscribeAndStoreResponse {
    success: boolean;
    text: string;
    language: string;
    confidence: number | null;
    textId: string;
    response?: string;
    extractedText: ExtractedTextSummary;
}

export interface ExtractAndStoreResponse {
    success: boolean;
    totalFiles: number;
    extracted: number;
    stored: number;
    failed: number;
    extractedTexts: Array<{
        textId: string;
        fileName: string;
        wordCount: number;
    }>;
    errors?: Array<{
        fileName: string;
        status: string;
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

/**
 * Store voice transcription as extracted text
 */
export async function storeVoiceText(
    data: StoreVoiceTextRequest
): Promise<StoreVoiceTextResponse> {
    return request<StoreVoiceTextResponse>('/api/extracted-text/voice', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * Store file extraction as extracted text
 */
export async function storeFileText(
    data: StoreFileTextRequest
): Promise<StoreFileTextResponse> {
    return request<StoreFileTextResponse>('/api/extracted-text/file', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * Transcribe audio and store in ExtractedText model
 */
export async function transcribeAndStore(
    audioBlob: Blob,
    options: {
        language?: string;
        sourceName?: string;
        duration?: number;
        meetingTitle?: string;
        storeOnly?: boolean;
        threadId?: string;
        scenario?: string;
    } = {}
): Promise<TranscribeAndStoreResponse> {
    const token = getAuthToken();
    if (!token) {
        throw new Error('No authentication token found');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (options.language) {
        formData.append('language', options.language);
    }
    if (options.sourceName) {
        formData.append('sourceName', options.sourceName);
    }
    if (options.duration !== undefined) {
        formData.append('duration', options.duration.toString());
    }
    if (options.meetingTitle) {
        formData.append('meetingTitle', options.meetingTitle);
    }
    if (options.storeOnly !== undefined) {
        formData.append('storeOnly', options.storeOnly.toString());
    }
    if (options.threadId) {
        formData.append('threadId', options.threadId);
    }
    if (options.scenario) {
        formData.append('scenario', options.scenario);
    }

    // Ensure API_BASE_URL doesn't end with /api to avoid double /api/api/
    const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/chat/speech/transcribe-and-store`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Transcription failed';
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

/**
 * Extract text from files and store in ExtractedText model
 */
export async function extractFilesAndStore(
    files: File[]
): Promise<ExtractAndStoreResponse> {
    const token = getAuthToken();
    if (!token) {
        throw new Error('No authentication token found');
    }

    const formData = new FormData();
    files.forEach((file) => {
        formData.append('files', file);
    });
    formData.append('storeOnly', 'true');

    // Ensure API_BASE_URL doesn't end with /api to avoid double /api/api/
    const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL.slice(0, -4) : API_BASE_URL;
    const response = await fetch(`${baseUrl}/api/files/extract-and-store`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'File extraction failed';
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

/**
 * Get all extracted texts for the current user
 */
export async function getExtractedTexts(options: {
    source?: 'voice' | 'file';
    limit?: number;
    offset?: number;
} = {}): Promise<ExtractedTextsListResponse> {
    const params = new URLSearchParams();
    if (options.source) {
        params.append('source', options.source);
    }
    if (options.limit !== undefined) {
        params.append('limit', options.limit.toString());
    }
    if (options.offset !== undefined) {
        params.append('offset', options.offset.toString());
    }

    const queryString = params.toString();
    const endpoint = `/api/extracted-text${queryString ? `?${queryString}` : ''}`;

    return request<ExtractedTextsListResponse>(endpoint);
}

/**
 * Get a specific extracted text by textId
 */
export async function getExtractedText(textId: string): Promise<{ success: boolean; extractedText: ExtractedText }> {
    return request<{ success: boolean; extractedText: ExtractedText }>(`/api/extracted-text/${textId}`);
}

/**
 * Delete an extracted text by textId
 */
export async function deleteExtractedText(textId: string): Promise<{ success: boolean; message: string; textId: string }> {
    return request<{ success: boolean; message: string; textId: string }>(`/api/extracted-text/${textId}`, {
        method: 'DELETE',
    });
}

/**
 * Append a transcription chunk to existing transcription
 * Used for continuous/streaming transcription
 */
export async function appendTranscriptionChunk(
    textId: string,
    chunkText: string,
    language?: string
): Promise<{ success: boolean; textId: string; extractedText: ExtractedTextSummary }> {
    return request<{ success: boolean; textId: string; extractedText: ExtractedTextSummary }>(
        '/api/chat/speech/append-chunk',
        {
            method: 'POST',
            body: JSON.stringify({ textId, chunkText, language }),
        }
    );
}

