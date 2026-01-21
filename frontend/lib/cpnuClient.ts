/**
 * CPNU Client
 * Handles communication with CPNU sync API
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export interface CPNUSyncResponse {
  success: boolean;
  message?: string;
  error?: string;
  errorCategory?: 'timeout' | 'connection' | 'not_found' | 'validation' | 'other';
  isDuplicateRecord?: boolean;
  data?: {
    radicado: string;
    datosProceso: {
      despacho?: string;
      claseProceso?: string;
      fechaRadicacion?: string;
      tipoProceso?: string;
    };
    sujetosProcesales: {
      demandante?: string;
      demandado?: string;
      defensorPrivado?: string;
      defensorPublico?: string;  // ← Add this line
    };
    actuacionesCount: number;
  };
}

export interface CPNUPreviewResponse {
  success: boolean;
  message?: string;
  error?: string;
  errorCategory?: 'timeout' | 'connection' | 'not_found' | 'validation' | 'other';
  isDuplicateRecord?: boolean;
  data?: {
    radicado: string;
    datosProceso: {
      despacho?: string;
      claseProceso?: string;
      fechaRadicacion?: string;
      tipoProceso?: string;
    };
    sujetosProcesales: {
      demandante?: string;
      demandado?: string;
      defensorPrivado?: string;
      defensorPublico?: string;  // ← Add this line
    };
    actuacionesCount: number;
    actuaciones?: Array<{
      fecha_actuacion?: string;
      descripcion?: string;
      fecha_registro?: string;
    }>;
    latestActuacion?: {
      fecha_actuacion?: string;
      descripcion?: string;
      fecha_registro?: string;
    } | null;
  };
}

/**
 * Helper function to retry a fetch operation with exponential backoff
 * @param fetchFn - Function that returns a fetch promise
 * @param maxAttempts - Maximum number of retry attempts (default: 2)
 * @param initialDelay - Initial delay in milliseconds (default: 1000)
 * @returns Promise with fetch result
 */
async function retryFetch<T>(
  fetchFn: () => Promise<T>,
  maxAttempts: number = 2,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error should be retried (connection, timeout, or server errors)
      const errorMessage = lastError.message.toLowerCase();
      const shouldRetry =
        attempt < maxAttempts && (
          errorMessage.includes('conectar') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('timed out') ||
          errorMessage.includes('connection') ||
          errorMessage.includes('network') ||
          errorMessage.includes('intenta nuevamente')
        );

      if (!shouldRetry) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      const delay = initialDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));

      console.log(`[CPNU Client] Retry attempt ${attempt + 1}/${maxAttempts} after ${delay}ms delay`);
    }
  }

  throw lastError || new Error('Failed after all retry attempts');
}

/**
 * Sync a case with CPNU using radicado
 * @param caseId - Case ID
 * @param radicado - 23-digit numeric radicado
 * @param token - Authentication token
 * @returns Promise with sync result
 */
export async function syncCaseWithCPNU(
  caseId: string,
  radicado: string,
  token: string
): Promise<CPNUSyncResponse> {
  return retryFetch(async () => {
    const response = await fetch(`${API_BASE_URL}/api/cpnu/sync/${caseId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ radicado }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string; errorCategory?: string; isDuplicateRecord?: boolean };
      // Attach error category and duplicate record flag to error for i18n translation
      const error = new Error(errorData.error || '');
      (error as any).errorCategory = errorData.errorCategory || 'other';
      (error as any).isDuplicateRecord = errorData.isDuplicateRecord || false;
      throw error;
    }

    return response.json();
  }, 2); // Max 2 attempts
}

/**
 * Preview CPNU data for a radicado (used before creating a case)
 * @param radicado - 23-digit numeric radicado
 * @param token - Authentication token
 * @returns Promise with preview result
 */
export async function previewCPNUData(
  radicado: string,
  token: string
): Promise<CPNUPreviewResponse> {
  return retryFetch(async () => {
    const response = await fetch(`${API_BASE_URL}/api/cpnu/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ radicado }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string; errorCategory?: string; isDuplicateRecord?: boolean };
      // Attach error category and duplicate record flag to error for i18n translation
      const error = new Error(errorData.error || '');
      (error as any).errorCategory = errorData.errorCategory || 'other';
      (error as any).isDuplicateRecord = errorData.isDuplicateRecord || false;
      throw error;
    }

    return response.json();
  }, 2); // Max 2 attempts
}

/**
 * Validate radicado format
 * @param radicado - Radicado to validate
 * @returns true if valid, false otherwise
 */
export function validateRadicado(radicado: string): boolean {
  return /^\d{23}$/.test(radicado);
}

