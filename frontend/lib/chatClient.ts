const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type StreamOptions = {
  token: string;
  threadId: string;
  scenario: string;
  text: string;
  extractedTextIds?: string[];
  onDelta?: (partial: string) => void;
  signal?: AbortSignal;
};

const buildHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export async function createThread(token: string, scenario: string) {
  const response = await fetch(`${API_BASE_URL}/api/chat/threads`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ scenario }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to start conversation');
  }
  return response.json();
}

export async function sendMessageStream({
  token,
  threadId,
  scenario,
  text,
  extractedTextIds,
  onDelta,
  signal,
}: StreamOptions) {
  const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({
      threadId,
      scenario,
      text,
      ...(extractedTextIds && extractedTextIds.length > 0 ? { extractedTextIds } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Chat service unavailable');
  }

  if (!response.body) {
    throw new Error('Chat service did not return a stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aggregated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      if (!rawEvent.startsWith('data:')) continue;
      const dataStr = rawEvent.slice(5).trim();
      if (!dataStr) continue;
      if (dataStr === '[DONE]') {
        return aggregated;
      }
      try {
        const payload = JSON.parse(dataStr);
        if (payload.error) {
          throw new Error(payload.error);
        }
        if (payload.completed) {
          return aggregated;
        }
        if (typeof payload.content === 'string' && payload.content.length > 0) {
          aggregated += payload.content;
          onDelta?.(aggregated);
        }
      } catch (error) {
        // ignore malformed chunks
      }
    }
  }

  return aggregated;
}

export async function fetchThreadMessages(token: string, threadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/chat/messages?threadId=${encodeURIComponent(threadId)}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to load conversation history');
  }

  return response.json();
}

export async function fetchThreads(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/chat/threads`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to load conversations');
  }

  return response.json();
}

export async function updateThreadTitle(token: string, threadId: string, title: string) {
  const response = await fetch(`${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}`, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to rename conversation');
  }

  return response.json();
}

export async function deleteThread(token: string, threadId: string) {
  const response = await fetch(`${API_BASE_URL}/api/chat/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to delete conversation');
  }
  return response.json();
}

type TranscriptionOptions = {
  blob: Blob;
  language?: string;
  scenario?: string | null;
};

// Helper function to detect user's preferred language from browser/system
export function detectUserLanguage(): string {
  if (typeof window === 'undefined') return 'auto';

  // Check browser language
  const browserLang = navigator.language || (navigator as any).userLanguage || '';
  const langCode = browserLang.toLowerCase().split('-')[0];

  // If Spanish, Portuguese, or English, use explicit language hint
  if (langCode === 'es') return 'es';
  if (langCode === 'pt') return 'pt';
  if (langCode === 'en') return 'en';

  // Check if any of the preferred languages are Spanish
  if (navigator.languages) {
    for (const lang of navigator.languages) {
      const code = lang.toLowerCase().split('-')[0];
      if (code === 'es') return 'es';
      if (code === 'pt') return 'pt';
      if (code === 'en') return 'en';
    }
  }

  return 'auto';
}

export async function transcribeAudio(
  token: string,
  { blob, language, scenario, threadId }: TranscriptionOptions & { threadId?: string },
  timeout: number = 30000
): Promise<{ text: string; language: string; confidence: number | null; response?: string }> {
  const formData = new FormData();
  formData.append('audio', blob, 'recording.webm');
  if (language) {
    formData.append('language', language);
  }
  if (scenario) {
    formData.append('scenario', scenario);
  }
  if (threadId) {
    formData.append('threadId', threadId);
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/speech/transcribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Unable to transcribe audio';

      // Parse error message if it's JSON
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      // Provide more specific error messages
      if (response.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a moment.';
      } else if (response.status === 413) {
        errorMessage = 'Audio file is too large. Maximum size is 25MB.';
      } else if (response.status === 401) {
        errorMessage = 'Authentication failed. Please refresh and try again.';
      } else if (response.status === 503) {
        errorMessage = 'Service temporarily unavailable. Please try again.';
      }

      throw new Error(errorMessage);
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Transcription request timed out. Please try again.');
      }
      throw error;
    }

    throw new Error('Unable to transcribe audio');
  }
}

type TtsOptions = {
  text: string;
  language?: string;
  speakingRate?: number;
  pitch?: number;
};

export async function synthesizeSpeech(token: string, payload: TtsOptions) {
  const response = await fetch(`${API_BASE_URL}/api/chat/speech/synthesize`, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to generate audio');
  }
  return response.json();
}

export async function extractFiles(token: string, files: File[], scenario?: string | null) {
  if (!files.length) return { files: [] };
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file, file.name);
  });
  if (scenario) {
    formData.append('scenario', scenario);
  }
  const response = await fetch(`${API_BASE_URL}/api/files/extract`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to extract file text');
  }
  return response.json();
}

export async function extractFilesAndChat({
  token,
  files,
  threadId,
  scenario,
  userMessage,
  onDelta,
  signal,
}: {
  token: string;
  files: File[];
  threadId: string;
  scenario: string;
  userMessage?: string;
  onDelta?: (partial: string) => void;
  signal?: AbortSignal;
}) {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file, file.name);
  });
  formData.append('threadId', threadId);
  formData.append('scenario', scenario);
  if (userMessage) {
    formData.append('userMessage', userMessage);
  }

  const response = await fetch(`${API_BASE_URL}/api/files/extract-and-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Unable to extract files and get chat response');
  }

  if (!response.body) {
    throw new Error('Chat service did not return a stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aggregated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex;
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      if (!rawEvent.startsWith('data:')) continue;
      const dataStr = rawEvent.slice(5).trim();
      if (!dataStr) continue;
      if (dataStr === '[DONE]') {
        return aggregated;
      }
      try {
        const payload = JSON.parse(dataStr);
        if (payload.error) {
          throw new Error(payload.error);
        }
        if (typeof payload.content === 'string' && payload.content.length > 0) {
          aggregated += payload.content;
          onDelta?.(aggregated);
        }
        if (payload.completed) {
          return aggregated;
        }
      } catch (error) {
        // ignore malformed chunks
      }
    }
  }

  return aggregated;
}

