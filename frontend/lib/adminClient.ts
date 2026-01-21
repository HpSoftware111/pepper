'use client';

import { authClient } from './authClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type RequestOptions = RequestInit & { skipAuthHeader?: boolean };

const adminRequest = async <T>(path: string, options?: RequestOptions): Promise<T> => {
  const token = authClient.getStoredAccessToken();
  if (!token) {
    throw new Error('You must be signed in to perform this action.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error ?? 'Unexpected error');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
};

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  status: string;
  emailVerified: boolean;
  stripeCustomerId?: string;
  createdAt?: string;
};

export type BillingSummary = {
  monthly: { month: string; arr: number; paid: number; overdue: number }[];
  totals: { arr: number; paid: number; overdue: number };
  recentInvoices: {
    id: string;
    orgName: string;
    plan?: string;
    amount: number;
    status: string;
    dueDate: string;
    paidAt?: string;
    paymentMethod?: string;
  }[];
};

export const adminClient = {
  async listUsers(): Promise<{ users: AdminUser[] }> {
    return adminRequest('/api/admin/users');
  },
  async createUser(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role?: string;
  }): Promise<{ user: AdminUser }> {
    return adminRequest('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async updateUser(
    id: string,
    payload: Partial<{ firstName: string; lastName: string; phone: string; role: string; status: string; password: string; maxDeviceReplacements: number }>,
  ): Promise<{ user: AdminUser }> {
    return adminRequest(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  async disableUser(id: string): Promise<{ success: boolean }> {
    return adminRequest(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  },
  async getUserDetail(
    id: string,
  ): Promise<{ user: AdminUser; devices: any[]; logs: any[]; replacementsUsed: number; maxReplacements: number }> {
    return adminRequest(`/api/admin/users/${id}`);
  },
  async getUserDevices(id: string) {
    return adminRequest(`/api/admin/users/${id}/devices`);
  },
  async removeUserDevice(id: string, deviceId: string) {
    return adminRequest(`/api/admin/users/${id}/devices/remove`, {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    });
  },
  async getBillingSummary(): Promise<BillingSummary> {
    return adminRequest('/api/admin/billing/summary');
  },
  async getAllUsersResourceUsage(): Promise<{ users: Array<{ userId: string; email: string; displayName: string; firstName?: string; lastName?: string; resourceUsage: any }> }> {
    return adminRequest('/api/admin/resources');
  },
  async getUserResourceUsageDetail(id: string): Promise<{ user: any; resourceUsage: any; logs: any[] }> {
    return adminRequest(`/api/admin/resources/${id}`);
  },
  async setUserResourceLimit(id: string, resourceType: string, limit: number): Promise<{ success: boolean; message: string; resourceUsage: any }> {
    return adminRequest(`/api/admin/resources/${id}/limit`, {
      method: 'PATCH',
      body: JSON.stringify({ resourceType, limit }),
    });
  },
  async resetUserResourceUsage(id: string, resourceType: string = 'all'): Promise<{ success: boolean; message: string; resourceUsage: any }> {
    return adminRequest(`/api/admin/resources/${id}/reset`, {
      method: 'POST',
      body: JSON.stringify({ resourceType }),
    });
  },
};

