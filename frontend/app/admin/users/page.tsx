'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import AdminSidebar from '@/components/AdminSidebar';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { adminClient, type AdminUser } from '@/lib/adminClient';
import { ResourceUsage } from '@/components/ResourceUsage';

// Modern SVG Icon Components
const CloseIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

type FormState = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'user' | 'admin';
  status: 'active' | 'invited' | 'disabled';
};

const defaultFormState: FormState = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
  role: 'user',
  status: 'invited',
};

const statusBadge = (status: string, isLight: boolean) => {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-300',
    invited: 'bg-blue-500/15 text-blue-200',
    disabled: 'bg-rose-500/20 text-rose-200',
  };
  return map[status] ?? (isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-500/20 text-slate-200');
};

function UsersPage() {
  const { user } = useAuth();
  const { themeMode, layoutDensity } = useThemeMode();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';

  const pageBackground = isLight ? 'bg-[#F6F7FB]' : 'bg-[#040915]';
  const cardBase = isLight
    ? 'rounded-[24px] bg-white border border-slate-200 shadow-[0_20px_40px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] bg-[rgba(7,20,40,0.85)] border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.55)] backdrop-blur';
  const sectionPadding = isCompact ? 'p-5' : 'p-7';
  const subText = isLight ? 'text-slate-500' : 'text-slate-300/85';
  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormState>(defaultFormState);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [detailDevices, setDetailDevices] = useState<any[]>([]);
  const [detailLogs, setDetailLogs] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMeta, setDetailMeta] = useState({ replacementsUsed: 0, maxReplacements: 10 });
  const [detailResourceUsage, setDetailResourceUsage] = useState<any>(null);
  const [resourceLimits, setResourceLimits] = useState<Record<string, number>>({});
  const [deviceReplacementLimit, setDeviceReplacementLimit] = useState<number>(10);
  const [savingLimits, setSavingLimits] = useState(false);
  const [usersPage, setUsersPage] = useState(0);
  const USERS_PER_PAGE = 6;

  const RESOURCE_TYPES = [
    { key: 'voiceTranscriptions', label: 'Voice Transcriptions', unit: 'transcriptions' },
    { key: 'aiChatTokens', label: 'AI Chat Tokens', unit: 'tokens' },
    { key: 'whatsappMessages', label: 'WhatsApp Messages', unit: 'messages' },
    { key: 'calendarApiCalls', label: 'Calendar API Calls', unit: 'calls' },
    { key: 'cpnuScrapes', label: 'CPNU Scrapes', unit: 'scrapes' },
  ];

  const isAdmin = user?.role === 'admin';

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await adminClient.listUsers();
      setUsers(response.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormValues(defaultFormState);
    setEditingUser(null);
    setFormError(null);
    setShowModal(false);
  };

  const handleEdit = (adminUser: AdminUser) => {
    setEditingUser(adminUser);
    setFormValues({
      email: adminUser.email,
      password: '',
      firstName: adminUser.firstName ?? '',
      lastName: adminUser.lastName ?? '',
      phone: adminUser.phone ?? '',
      role: (adminUser.role as 'user' | 'admin') ?? 'user',
      status: (adminUser.status as 'active' | 'invited' | 'disabled') ?? 'active',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    try {
      if (editingUser) {
        const payload: Record<string, string> = {
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          phone: formValues.phone,
          role: formValues.role,
          status: formValues.status,
        };
        if (formValues.password) {
          payload.password = formValues.password;
        }
        await adminClient.updateUser(editingUser.id, payload);
      } else {
        await adminClient.createUser({
          email: formValues.email,
          password: formValues.password,
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          phone: formValues.phone,
          role: formValues.role,
        });
      }
      await fetchUsers();
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async (adminUser: AdminUser) => {
    if (!confirm(`Disable ${adminUser.displayName}?`)) return;
    try {
      await adminClient.disableUser(adminUser.id);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disable user');
    }
  };

  const orderedUsers = useMemo(
    () => users.sort((a, b) => new Date(b.createdAt ?? '').getTime() - new Date(a.createdAt ?? '').getTime()),
    [users],
  );
  const totalPages = Math.max(1, Math.ceil(orderedUsers.length / USERS_PER_PAGE));
  const paginatedUsers = orderedUsers.slice(usersPage * USERS_PER_PAGE, usersPage * USERS_PER_PAGE + USERS_PER_PAGE);

  const openDetailModal = async (adminUser: AdminUser) => {
    setDetailModalOpen(true);
    setDetailLoading(true);
    try {
      const [detailResponse, resourceResponse] = await Promise.all([
        adminClient.getUserDetail(adminUser.id),
        adminClient.getUserResourceUsageDetail(adminUser.id).catch(() => null), // Don't fail if resource endpoint fails
      ]);
      setDetailUser(detailResponse.user);
      setDetailDevices(detailResponse.devices || []);
      setDetailLogs(detailResponse.logs || []);
      setDetailMeta({
        replacementsUsed: detailResponse.replacementsUsed ?? 0,
        maxReplacements: detailResponse.maxReplacements ?? 10,
      });
      setDeviceReplacementLimit(detailResponse.maxReplacements ?? 10);
      
      if (resourceResponse && resourceResponse.resourceUsage) {
        setDetailResourceUsage(resourceResponse.resourceUsage);
        // Initialize resource limits from current usage
        const limits: Record<string, number> = {};
        RESOURCE_TYPES.forEach(({ key }) => {
          limits[key] = resourceResponse.resourceUsage[key]?.limit ?? 0;
        });
        setResourceLimits(limits);
      } else {
        // Initialize empty limits if no resource usage
        const limits: Record<string, number> = {};
        RESOURCE_TYPES.forEach(({ key }) => {
          limits[key] = 0;
        });
        setResourceLimits(limits);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load user detail');
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const removeDetailDevice = async (deviceId: string) => {
    if (!detailUser) return;
    if (!confirm('Remove this device from the account?')) return;
    try {
      await adminClient.removeUserDevice(detailUser.id, deviceId);
      const refreshed = await adminClient.getUserDetail(detailUser.id);
      setDetailDevices(refreshed.devices || []);
      setDetailLogs(refreshed.logs || []);
      setDetailMeta({
        replacementsUsed: refreshed.replacementsUsed ?? 0,
        maxReplacements: refreshed.maxReplacements ?? 10,
      });
      setDeviceReplacementLimit(refreshed.maxReplacements ?? 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove device');
    }
  };

  const handleSaveResourceLimits = async () => {
    if (!detailUser) return;
    setSavingLimits(true);
    try {
      // Save device replacement limit
      if (deviceReplacementLimit !== detailMeta.maxReplacements) {
        await adminClient.updateUser(detailUser.id, { maxDeviceReplacements: deviceReplacementLimit });
      }

      // Save resource limits
      const limitPromises = RESOURCE_TYPES.map(({ key }) => {
        const newLimit = resourceLimits[key] ?? 0;
        const currentLimit = detailResourceUsage?.[key]?.limit ?? 0;
        if (newLimit !== currentLimit) {
          return adminClient.setUserResourceLimit(detailUser.id, key, newLimit);
        }
        return Promise.resolve(null);
      }).filter((p) => p !== null);

      await Promise.all(limitPromises);

      // Reload data
      const [detailResponse, resourceResponse] = await Promise.all([
        adminClient.getUserDetail(detailUser.id),
        adminClient.getUserResourceUsageDetail(detailUser.id).catch(() => null),
      ]);
      
      setDetailMeta({
        replacementsUsed: detailResponse.replacementsUsed ?? 0,
        maxReplacements: detailResponse.maxReplacements ?? 10,
      });
      setDeviceReplacementLimit(detailResponse.maxReplacements ?? 10);
      
      if (resourceResponse && resourceResponse.resourceUsage) {
        setDetailResourceUsage(resourceResponse.resourceUsage);
        const limits: Record<string, number> = {};
        RESOURCE_TYPES.forEach(({ key }) => {
          limits[key] = resourceResponse.resourceUsage[key]?.limit ?? 0;
        });
        setResourceLimits(limits);
      }
      
      alert('Resource limits updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save resource limits');
      alert(`Failed to save resource limits: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSavingLimits(false);
    }
  };

  const handleResetResourceUsage = async (resourceType: string = 'all') => {
    if (!detailUser) return;
    if (!confirm(`Reset usage for ${resourceType === 'all' ? 'all resources' : resourceType}?`)) return;
    
    try {
      await adminClient.resetUserResourceUsage(detailUser.id, resourceType);
      const resourceResponse = await adminClient.getUserResourceUsageDetail(detailUser.id).catch(() => null);
      if (resourceResponse) {
        setDetailResourceUsage(resourceResponse.resourceUsage);
      }
      alert('Resource usage reset successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset resource usage');
      alert(`Failed to reset usage: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (!isAdmin) {
    return (
      <div className={`app-shell ${pageBackground}`}>
        <Header />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className={`${cardBase} ${sectionPadding} text-center`}>
            <p className="text-sm uppercase tracking-[0.35em] text-rose-400">Restricted</p>
            <p className="mt-3 text-xl font-semibold text-white">Admin access required</p>
            <p className={`mt-2 text-sm ${subText}`}>You need admin permissions to manage users.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${pageBackground}`}>
      <Header />
      <div
        className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-12 xl:px-16 ${isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-10 gap-6 lg:gap-8'
          }`}
      >
        <AdminSidebar active="users" />

        <main className="flex-1 space-y-6 lg:space-y-8 lg:pl-0 xl:pl-4">
          <section className={`${cardBase} ${sectionPadding}`}>
            <div className="space-y-3">
              <p className={`text-xs uppercase tracking-[0.35em] ${subText}`}>User management</p>
              <h1 className={`text-3xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Control access & credentials</h1>
              <p className={`text-sm ${subText}`}>
                Create invitations, reset credentials, and control access rights for every workspace admin.
              </p>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setFormValues(defaultFormState);
                  setShowModal(true);
                }}
                className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition inline-flex items-center gap-2"
              >
                <span className="text-lg leading-none">+</span> Invite user
              </button>
            </div>
          </section>

          <section className={`${cardBase} ${sectionPadding} space-y-4`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Admins & staff</h2>
                <p className={`text-sm ${subText}`}>Active invitations, access status, and impersonation targets.</p>
              </div>
              <button onClick={fetchUsers} className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition">
                Refresh
              </button>
            </div>
            {loading && <p className={`text-sm ${subText}`}>Loading users…</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            {!loading && !error && (
              <div className="space-y-3">
                {paginatedUsers.map((adminUser) => (
                  <div key={adminUser.id} className={`rounded-2xl border ${borderColor} px-4 py-3 flex flex-col gap-2 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                      <div className="flex flex-1 items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-200 flex items-center justify-center font-semibold">
                          {(adminUser.displayName || adminUser.email)
                            .split(' ')
                            .map((part) => part[0])
                            .join('')
                            .slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold">{adminUser.displayName}</p>
                          <p className={`text-xs ${subText}`}>{adminUser.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge(adminUser.status, isLight)}`}>
                          {adminUser.status}
                        </span>
                        <span className={`text-xs ${subText}`}>{adminUser.role}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>{adminUser.phone || 'No phone'}</span>
                      <span>{adminUser.emailVerified ? 'Email verified' : 'Awaiting verification'}</span>
                      <span>
                        Created{' '}
                        {adminUser.createdAt ? new Date(adminUser.createdAt).toLocaleDateString() : 'unknown'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleEdit(adminUser)}
                        className="rounded-2xl border border-slate-200/40 px-3 py-1 text-xs font-semibold text-slate-100 hover:border-white/70"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDetailModal(adminUser)}
                        className="rounded-2xl border border-white/20 px-3 py-1 text-xs font-semibold text-white/80 hover:border-white/60"
                      >
                        Details
                      </button>
                      <button
                        onClick={() => handleDisable(adminUser)}
                        className="rounded-2xl border border-rose-300/40 px-3 py-1 text-xs font-semibold text-rose-200 hover:border-rose-200/70"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {orderedUsers.length === 0 && <p className={`text-sm ${subText}`}>No users yet.</p>}
              </div>
            )}
            {!loading && orderedUsers.length > 0 && (
              <div className="flex items-center justify-between pt-3">
                <p className={`text-xs ${subText}`}>
                  Showing {(usersPage * USERS_PER_PAGE) + 1}–
                  {Math.min((usersPage + 1) * USERS_PER_PAGE, orderedUsers.length)} of {orderedUsers.length}
                </p>
                <div className="flex gap-2">
                  <button
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 disabled:opacity-40"
                    disabled={usersPage === 0}
                    onClick={() => setUsersPage((prev) => Math.max(0, prev - 1))}
                  >
                    Prev
                  </button>
                  <button
                    className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/80 disabled:opacity-40"
                    disabled={usersPage >= totalPages - 1}
                    onClick={() => setUsersPage((prev) => Math.min(totalPages - 1, prev + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
            <div className={`${cardBase} w-full max-w-2xl ${sectionPadding} relative`}>
              <button
                onClick={resetForm}
                className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
              <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {editingUser ? 'Update user' : 'Invite new user'}
              </h2>
              <p className={`text-sm ${subText}`}>{editingUser ? 'Edit profile and roles.' : 'Send a new invite with initial credentials.'}</p>
              <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
                {!editingUser && (
                  <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200">
                    Email
                    <input
                      required
                      type="email"
                      name="email"
                      value={formValues.email}
                      onChange={handleInputChange}
                      className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                    />
                  </label>
                )}
                <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200">
                  First name
                  <input
                    required
                    type="text"
                    name="firstName"
                    value={formValues.firstName}
                    onChange={handleInputChange}
                    className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200">
                  Last name
                  <input
                    required
                    type="text"
                    name="lastName"
                    value={formValues.lastName}
                    onChange={handleInputChange}
                    className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200">
                  Phone
                  <input
                    type="tel"
                    name="phone"
                    value={formValues.phone}
                    onChange={handleInputChange}
                    className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200">
                  Role
                  <div className="relative mt-1">
                    <select
                      name="role"
                      value={formValues.role}
                      onChange={handleInputChange}
                      className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white focus:border-emerald-400 focus:outline-none"
                    >
                      <option value="user" className="text-slate-900">
                        User
                      </option>
                      <option value="admin" className="text-slate-900">
                        Admin
                      </option>
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/60">⌄</span>
                  </div>
                </label>
                {editingUser && (
                  <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200">
                    Status
                    <div className="relative mt-1">
                      <select
                        name="status"
                        value={formValues.status}
                        onChange={handleInputChange}
                        className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white focus:border-emerald-400 focus:outline-none"
                      >
                        <option value="active" className="text-slate-900">
                          Active
                        </option>
                        <option value="invited" className="text-slate-900">
                          Invited
                        </option>
                        <option value="disabled" className="text-slate-900">
                          Disabled
                        </option>
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/60">⌄</span>
                    </div>
                  </label>
                )}
                <label className="flex flex-col text-sm font-semibold text-slate-600 dark:text-slate-200 md:col-span-2">
                  {editingUser ? 'Reset password (optional)' : 'Temporary password'}
                  <input
                    type="text"
                    name="password"
                    value={formValues.password}
                    onChange={handleInputChange}
                    placeholder={editingUser ? 'Leave blank to keep current password' : 'Min. 8 characters'}
                    required={!editingUser}
                    className="mt-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none"
                  />
                </label>
                {formError && (
                  <div className="md:col-span-2 rounded-2xl border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
                    {formError}
                  </div>
                )}
                <div className="md:col-span-2 flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 hover:border-white transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-2xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving…' : editingUser ? 'Update user' : 'Send invite'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {detailModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto">
            <div className={`${cardBase} w-full max-w-7xl ${sectionPadding} relative my-8`}>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="absolute right-4 top-4 text-slate-400 hover:text-white transition-colors"
                aria-label="Close detail modal"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
              {detailLoading || !detailUser ? (
                <p className={`text-sm ${subText}`}>Loading user detail…</p>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <h2 className={`text-2xl font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>{detailUser.displayName}</h2>
                    <p className={`text-sm ${subText}`}>{detailUser.email}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-sm">
                    <div>
                      <p className={`text-xs uppercase ${subText}`}>Email</p>
                      <p className="font-semibold break-all">{detailUser.email}</p>
                    </div>
                    <div>
                      <p className={`text-xs uppercase ${subText}`}>Phone</p>
                      <p className="font-semibold">{detailUser.phone || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className={`text-xs uppercase ${subText}`}>Created</p>
                      <p className="font-semibold">
                        {detailUser.createdAt ? new Date(detailUser.createdAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-sm">
                    <div>
                      <p className={`text-xs uppercase ${subText}`}>Role</p>
                      <p className="font-semibold">{detailUser.role}</p>
                    </div>
                    <div>
                      <p className={`text-xs uppercase ${subText}`}>Status</p>
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusBadge(detailUser.status ?? 'active', isLight)}`}>
                        {detailUser.status}
                      </span>
                    </div>
                    <div>
                      <p className={`text-xs uppercase ${subText}`}>Device replacements</p>
                      <p className="font-semibold">
                        {detailMeta.replacementsUsed} / {detailMeta.maxReplacements}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Devices</h3>
                      <span className={`text-xs ${subText}`}>{detailDevices.length} linked devices</span>
                    </div>
                    {detailDevices.length === 0 ? (
                      <p className={`text-sm ${subText}`}>No devices registered.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className={isLight ? 'bg-slate-50' : 'bg-white/5'}>
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">Device ID</th>
                              <th className="px-3 py-2 text-left font-semibold">Type</th>
                              <th className="px-3 py-2 text-left font-semibold">Last seen</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {detailDevices.map((device) => (
                              <tr key={device.id} className="border-b border-white/10">
                                <td className="px-3 py-2 font-mono text-xs text-emerald-200 break-all">{device.id}</td>
                                <td className="px-3 py-2 capitalize">{device.type}</td>
                                <td className="px-3 py-2 text-xs">
                                  {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : '—'}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    onClick={() => removeDetailDevice(device.id)}
                                    className="rounded-xl border border-rose-300/40 px-3 py-1 text-xs font-semibold text-rose-200 hover:border-rose-200/70"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Resource Usage and Limits Management - Side by Side */}
                  {detailResourceUsage && (
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Resource Usage Section */}
                      <div className={`rounded-[22px] border px-5 py-5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                        <h3 className={`text-lg font-semibold mb-4 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          Resource Usage
                        </h3>
                        <div className="max-h-[600px] overflow-y-auto pr-2">
                          <ResourceUsage usage={detailResourceUsage} />
                        </div>
                      </div>

                      {/* Resource Limits Management Section */}
                      <div className={`rounded-[22px] border px-5 py-5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/5'}`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className={`text-lg font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Resource Limits Management</h3>
                          <button
                            onClick={handleSaveResourceLimits}
                            disabled={savingLimits}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                              isLight
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-300'
                                : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-700'
                            } disabled:cursor-not-allowed`}
                          >
                            {savingLimits ? 'Saving...' : 'Save Limits'}
                          </button>
                        </div>

                        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                          {/* Device Replacement Limit */}
                          <div className={`p-4 rounded-lg border ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}>
                            <label className={`block text-sm font-semibold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              Device Replacement Limit
                            </label>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  min="0"
                                  value={deviceReplacementLimit}
                                  onChange={(e) => setDeviceReplacementLimit(parseInt(e.target.value) || 0)}
                                  className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                                    isLight
                                      ? 'border-slate-200 bg-white text-slate-900'
                                      : 'border-white/20 bg-white/5 text-white'
                                  } focus:outline-none focus:ring-2 focus:ring-emerald-400/50`}
                                />
                                <span className={`text-xs whitespace-nowrap ${subText}`}>
                                  {detailMeta.replacementsUsed} / {deviceReplacementLimit}
                                </span>
                              </div>
                              <p className={`text-xs ${subText}`}>
                                Maximum number of device replacements allowed
                              </p>
                            </div>
                          </div>

                          {/* Resource Type Limits */}
                          <div className="space-y-3">
                            <h4 className={`text-sm font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                              Resource Limits (0 = Unlimited)
                            </h4>
                            {RESOURCE_TYPES.map(({ key, label, unit }) => {
                              const currentUsage = detailResourceUsage?.[key];
                              const used = currentUsage?.used ?? 0;
                              const currentLimit = currentUsage?.limit ?? 0;
                              const newLimit = resourceLimits[key] ?? currentLimit;
                              
                              return (
                                <div
                                  key={key}
                                  className={`p-3 rounded-lg border ${isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/5'}`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <label className={`text-xs font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                      {label}
                                    </label>
                                    <span className={`text-xs ${subText} whitespace-nowrap ml-2`}>
                                      {used.toLocaleString()} / {newLimit === 0 ? '∞' : newLimit.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="0"
                                      value={newLimit}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value) || 0;
                                        setResourceLimits((prev) => ({ ...prev, [key]: value }));
                                      }}
                                      placeholder="0 = Unlimited"
                                      className={`flex-1 rounded-lg border px-3 py-2 text-xs ${
                                        isLight
                                          ? 'border-slate-200 bg-white text-slate-900'
                                          : 'border-white/20 bg-white/5 text-white'
                                      } focus:outline-none focus:ring-2 focus:ring-emerald-400/50`}
                                    />
                                    <button
                                      onClick={() => handleResetResourceUsage(key)}
                                      className={`text-xs px-2 py-1.5 rounded border transition-colors whitespace-nowrap ${
                                        isLight
                                          ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                                          : 'border-white/20 text-slate-400 hover:bg-white/10'
                                      }`}
                                    >
                                      Reset
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Reset All Button */}
                          <div className="pt-3 border-t border-white/10">
                            <button
                              onClick={() => handleResetResourceUsage('all')}
                              className={`w-full px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                                isLight
                                  ? 'border-rose-300 text-rose-600 hover:bg-rose-50'
                                  : 'border-rose-400/30 text-rose-200 hover:bg-rose-500/10'
                              }`}
                            >
                              Reset All Resource Usage
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <h3 className={`text-lg font-semibold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>Device logs</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {detailLogs.length === 0 && <p className={`text-sm ${subText}`}>No device activity logged.</p>}
                      {detailLogs.map((log) => (
                        <div key={`${log.timestamp}-${log.deviceId}`} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                          <p className="font-semibold capitalize">
                            {log.action} · {log.deviceType} · {log.deviceId?.slice(0, 8)}…
                          </p>
                          <p className={`text-xs ${subText}`}>
                            {new Date(log.timestamp).toLocaleString()} · {log.ip} · {log.userAgent}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default withAuth(UsersPage);

