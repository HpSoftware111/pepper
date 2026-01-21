import { authClient } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export type Reminder = {
    id: string;
    title: string;
    due: string; // ISO string
    owner: string;
    completed: boolean;
    completedAt?: string;
    createdAt?: string;
    updatedAt?: string;
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');

    // Get access token using authClient
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
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
};

export const reminderClient = {
    /**
     * Get all reminders
     * @param params - Optional query parameters (completed, upcoming)
     */
    async getReminders(params?: { completed?: boolean; upcoming?: boolean }): Promise<{ reminders: Reminder[] }> {
        const queryParams = new URLSearchParams();
        if (params?.completed !== undefined) {
            queryParams.append('completed', params.completed.toString());
        }
        if (params?.upcoming !== undefined) {
            queryParams.append('upcoming', params.upcoming.toString());
        }

        const queryString = queryParams.toString();
        const path = `/api/reminders${queryString ? `?${queryString}` : ''}`;

        return request<{ reminders: Reminder[] }>(path, {
            method: 'GET',
        });
    },

    /**
     * Get a single reminder by ID
     */
    async getReminder(id: string): Promise<{ reminder: Reminder }> {
        return request<{ reminder: Reminder }>(`/api/reminders/${id}`, {
            method: 'GET',
        });
    },

    /**
     * Create a new reminder
     */
    async createReminder(reminder: {
        title: string;
        due: string; // ISO string or datetime-local format
        owner?: string;
    }): Promise<{ reminder: Reminder }> {
        return request<{ reminder: Reminder }>('/api/reminders', {
            method: 'POST',
            body: JSON.stringify(reminder),
        });
    },

    /**
     * Update a reminder
     */
    async updateReminder(
        id: string,
        reminder: {
            title?: string;
            due?: string;
            owner?: string;
            completed?: boolean;
        }
    ): Promise<{ reminder: Reminder }> {
        return request<{ reminder: Reminder }>(`/api/reminders/${id}`, {
            method: 'PUT',
            body: JSON.stringify(reminder),
        });
    },

    /**
     * Delete a reminder
     */
    async deleteReminder(id: string): Promise<{ message: string }> {
        return request<{ message: string }>(`/api/reminders/${id}`, {
            method: 'DELETE',
        });
    },

    /**
     * Mark reminder as completed
     */
    async completeReminder(id: string): Promise<{ reminder: Reminder }> {
        return request<{ reminder: Reminder }>(`/api/reminders/${id}/complete`, {
            method: 'POST',
        });
    },

    /**
     * Mark reminder as incomplete
     */
    async uncompleteReminder(id: string): Promise<{ reminder: Reminder }> {
        return request<{ reminder: Reminder }>(`/api/reminders/${id}/uncomplete`, {
            method: 'POST',
        });
    },
};

