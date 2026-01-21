import { authClient } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const isBrowser = typeof window !== 'undefined';

type CalendarEvent = {
    id: string;
    title: string;
    description?: string;
    start: string;
    end: string;
    location?: string;
    allDay?: boolean;
    source: 'google' | 'local' | 'pepper';
    htmlLink?: string;
    status?: string;
    created?: string;
    updated?: string;
};

type ConnectionStatus = {
    connected: boolean;
    syncEnabled: boolean;
    lastSyncAt?: string;
    calendarId?: string;
    expiresAt?: string;
    needsRefresh?: boolean;
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');

    // Get access token using authClient (consistent with other clients)
    const accessToken = authClient.getStoredAccessToken();
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    }

    if (options?.headers) {
        if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => headers.set(key, value));
        } else if (Array.isArray(options.headers)) {
            options.headers.forEach(([key, value]) => headers.set(key, value));
        } else {
            Object.entries(options.headers).forEach(([key, value]) => {
                if (value) headers.set(key, value);
            });
        }
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error ?? 'Unexpected error';
        const error = new Error(message) as Error & {
            requiresReconnect?: boolean;
            requiresApiEnable?: boolean;
            troubleshooting?: any;
        };
        error.requiresReconnect = errorData.requiresReconnect;
        error.requiresApiEnable = errorData.requiresApiEnable;
        error.troubleshooting = errorData.troubleshooting;
        throw error;
    }

    return response.json();
};

export const calendarClient = {
    /**
     * Get Google Calendar OAuth authorization URL
     * @param usePopup - If true, enables popup OAuth flow
     */
    async getAuthUrl(usePopup: boolean = false): Promise<{ authUrl: string }> {
        const url = usePopup ? '/api/calendar/auth-url?popup=true' : '/api/calendar/auth-url';
        return request<{ authUrl: string }>(url, {
            method: 'GET',
        });
    },

    /**
     * Get Google Calendar connection status
     */
    async getConnectionStatus(): Promise<ConnectionStatus> {
        return request<ConnectionStatus>('/api/calendar/status', {
            method: 'GET',
        });
    },

    /**
     * Disconnect Google Calendar
     */
    async disconnect(): Promise<{ success: boolean; message: string }> {
        return request<{ success: boolean; message: string }>('/api/calendar/disconnect', {
            method: 'POST',
        });
    },

    /**
     * Get events from Google Calendar
     */
    async getEvents(params: {
        startDate: string; // ISO string
        endDate: string; // ISO string
        maxResults?: number;
    }): Promise<{ events: CalendarEvent[] }> {
        const queryParams = new URLSearchParams({
            startDate: params.startDate,
            endDate: params.endDate,
            ...(params.maxResults && { maxResults: params.maxResults.toString() }),
        });

        return request<{ events: CalendarEvent[] }>(`/api/calendar/events?${queryParams.toString()}`, {
            method: 'GET',
        });
    },

    /**
     * Create event in Google Calendar
     */
    async createEvent(event: {
        title: string;
        description?: string;
        start: string; // ISO string
        end: string; // ISO string
        location?: string;
        allDay?: boolean;
    }): Promise<{ event: CalendarEvent }> {
        return request<{ event: CalendarEvent }>('/api/calendar/events', {
            method: 'POST',
            body: JSON.stringify(event),
        });
    },

    /**
     * Update event in Google Calendar
     */
    async updateEvent(
        eventId: string,
        event: {
            title: string;
            description?: string;
            start: string; // ISO string
            end: string; // ISO string
            location?: string;
            allDay?: boolean;
        }
    ): Promise<{ event: CalendarEvent }> {
        return request<{ event: CalendarEvent }>(`/api/calendar/events/${eventId}`, {
            method: 'PUT',
            body: JSON.stringify(event),
        });
    },

    /**
     * Delete event from Google Calendar
     */
    async deleteEvent(eventId: string): Promise<{ success: boolean; message: string }> {
        return request<{ success: boolean; message: string }>(`/api/calendar/events/${eventId}`, {
            method: 'DELETE',
        });
    },
};

export type { CalendarEvent, ConnectionStatus };

