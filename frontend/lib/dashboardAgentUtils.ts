/**
 * Dashboard Agent Utilities
 * Helper functions for parsing and processing Dashboard Agent responses
 */

import type { DashboardTemplate } from './dashboardTemplate';
import { validateDashboardTemplate } from './dashboardTemplate';
import { dashboardAgentClient } from './dashboardAgentClient';

/**
 * Normalize status values from Spanish to English
 */
function normalizeStatus(status: string): string {
    const normalized = status.trim().toLowerCase();
    const statusMap: Record<string, 'active' | 'pending' | 'urgent'> = {
        // Spanish
        'activo': 'active',
        'activa': 'active',
        'pendiente': 'pending',
        'urgente': 'urgent',
        // English (already correct)
        'active': 'active',
        'pending': 'pending',
        'urgent': 'urgent',
    };
    return statusMap[normalized] || status;
}

/**
 * Normalize Dashboard Template data (convert Spanish status values to English)
 */
function normalizeTemplate(data: any): any {
    if (!data || typeof data !== 'object') return data;

    const normalized = { ...data };

    // Normalize main status
    if (normalized.status) {
        normalized.status = normalizeStatus(normalized.status);
    }

    // Normalize sidebar_case status
    if (normalized.sidebar_case && normalized.sidebar_case.status) {
        normalized.sidebar_case = {
            ...normalized.sidebar_case,
            status: normalizeStatus(normalized.sidebar_case.status),
        };
    }

    return normalized;
}

/**
 * Extract JSON from text (handles markdown code blocks and mixed content)
 */
export function extractJSONFromText(text: string): DashboardTemplate | null {
    try {
        let jsonStr = text.trim();

        // Strategy 1: Try to find JSON in markdown code blocks
        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
        const codeBlockMatch = jsonStr.match(codeBlockRegex);
        if (codeBlockMatch && codeBlockMatch[1]) {
            jsonStr = codeBlockMatch[1].trim();
        }

        // Strategy 2: Try to find JSON object in the text (look for { ... })
        if (!jsonStr.startsWith('{')) {
            const jsonObjectRegex = /\{[\s\S]*\}/;
            const jsonMatch = jsonStr.match(jsonObjectRegex);
            if (jsonMatch && jsonMatch[0]) {
                jsonStr = jsonMatch[0].trim();
            }
        }

        // Strategy 3: Remove common prefixes/suffixes that might be added
        // Remove text before first {
        const firstBraceIndex = jsonStr.indexOf('{');
        if (firstBraceIndex > 0) {
            jsonStr = jsonStr.substring(firstBraceIndex);
        }

        // Remove text after last }
        const lastBraceIndex = jsonStr.lastIndexOf('}');
        if (lastBraceIndex > 0 && lastBraceIndex < jsonStr.length - 1) {
            jsonStr = jsonStr.substring(0, lastBraceIndex + 1);
        }

        // Clean up any remaining markdown markers
        jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/i, '').trim();

        // Try to parse JSON
        const parsed = JSON.parse(jsonStr);

        // Normalize status values (convert Spanish to English)
        const normalized = normalizeTemplate(parsed);

        // Validate the template
        const errors = validateDashboardTemplate(normalized);
        if (errors.length > 0) {
            console.error('Validation errors:', errors);
            return null;
        }

        return normalized as DashboardTemplate;
    } catch (error) {
        // Only log errors if we actually found something that looked like JSON
        // (i.e., text contains '{' and 'case_id')
        if (text.includes('{') && text.includes('case_id')) {
            console.error('Failed to parse JSON from text:', error);
            console.error('Text that failed to parse:', text.substring(0, 500));
        }
        // Silently return null for non-JSON text (like greeting messages)
        return null;
    }
}

/**
 * Check if text contains valid Dashboard Template JSON
 */
export function isDashboardTemplateJSON(text: string): boolean {
    // Quick check: text must contain both '{' and 'case_id' to be a Dashboard Template JSON
    // This prevents trying to parse non-JSON messages (like greetings)
    if (!text.includes('{') || !text.includes('case_id')) {
        return false;
    }

    const extracted = extractJSONFromText(text);
    return extracted !== null;
}

/**
 * Save Dashboard Template from chat response
 */
export async function saveTemplateFromChatResponse(
    responseText: string
): Promise<{
    success: boolean;
    template?: DashboardTemplate;
    fileLocation?: {
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
    isUpdate?: boolean;
    caseId?: string;
    error?: string;
}> {
    try {
        const template = extractJSONFromText(responseText);

        if (!template) {
            return {
                success: false,
                error: 'Could not extract valid Dashboard Template from response',
            };
        }

        const result = await dashboardAgentClient.saveCase(template);

        if (result.success) {
            return {
                success: true,
                template,
                fileLocation: result.fileLocation,
                isUpdate: result.isUpdate,
                caseId: result.caseId,
            };
        } else {
            return {
                success: false,
                error: 'Failed to save case template',
            };
        }
    } catch (error) {
        console.error('Error saving template from chat response:', error);
        return {
            success: false,
            error: (error as Error).message || 'Unknown error',
        };
    }
}

