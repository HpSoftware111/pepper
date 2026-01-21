'use client';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import SummaryCard from '@/components/SummaryCard';
import CalendarConnection from '@/components/CalendarConnection';
import { withAuth } from '@/components/withAuth';
import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { calendarClient, type CalendarEvent as GoogleCalendarEvent, type ConnectionStatus } from '@/lib/calendarClient';
import { reminderClient, type Reminder } from '@/lib/reminderClient';
import { useMCDData } from '@/hooks/useMCDData';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // ISO string
  time: string;
  caseName: string;
  location: string;
  source?: 'google' | 'local' | 'pepper'; // Event source
  allDay?: boolean; // For all-day events
  htmlLink?: string; // Google Calendar link
};

// AlertItem is now Reminder from backend
type AlertItem = Reminder & {
  due: string; // Display formatted string (e.g., "Tomorrow · 09:30")
};

const startOfWeek = (date: Date) => {
  const week = new Date(date);
  const day = week.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  week.setDate(week.getDate() + diff);
  week.setHours(0, 0, 0, 0);
  return week;
};

const startOfMonth = (date: Date) => {
  const month = new Date(date.getFullYear(), date.getMonth(), 1);
  month.setHours(0, 0, 0, 0);
  return month;
};

const addDays = (date: Date, days: number) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Parse event date - handle both all-day events (YYYY-MM-DD) and timed events (ISO strings)
const parseEventDate = (dateString: string, isAllDay?: boolean): Date => {
  // Check if it's an all-day event format (YYYY-MM-DD)
  if (isAllDay || /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    // Parse YYYY-MM-DD as local date to avoid timezone shift
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  // Timed event - parse as ISO string
  return new Date(dateString);
};

const toIso = (date: Date, time = '09:00') => {
  const [hours, minutes] = time.split(':').map(Number);
  const clone = new Date(date);
  clone.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return clone.toISOString();
};

// Demo data generation removed - using real data from Google Calendar API

const formatDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Format date for datetime-local input (YYYY-MM-DDTHH:mm)
const formatDateTimeLocal = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Format datetime string for display in alerts (e.g., "Tomorrow · 09:30", "Today · 14:00")
const formatDueDate = (dateTimeString: string): string => {
  if (!dateTimeString) return 'Soon';

  try {
    const date = new Date(dateTimeString);
    if (Number.isNaN(date.getTime())) {
      return dateTimeString; // Return original if invalid
    }

    const now = new Date();
    now.setSeconds(0, 0);
    now.setMilliseconds(0);

    const targetDate = new Date(date);
    targetDate.setSeconds(0, 0);
    targetDate.setMilliseconds(0);

    const diffMs = targetDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    const hours = targetDate.getHours().toString().padStart(2, '0');
    const minutes = targetDate.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    // Format based on time difference
    if (diffDays === 0) {
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins <= 0) return `Overdue · ${timeStr}`;
        return `In ${diffMins} min · ${timeStr}`;
      }
      return `Today · ${timeStr}`;
    }
    if (diffDays === 1) return `Tomorrow · ${timeStr}`;
    if (diffDays === -1) return `Yesterday · ${timeStr}`;
    if (diffDays > 0 && diffDays < 7) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return `${dayNames[targetDate.getDay()]} · ${timeStr}`;
    }
    // For dates further out, show full date
    return `${targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${timeStr}`;
  } catch (error) {
    console.error('Error formatting due date:', error);
    return dateTimeString;
  }
};

// Demo alerts removed - using real data

function CalendarPage() {
  const { themeMode, layoutDensity } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';
  const isCompact = layoutDensity === 'compact';
  const showSidebar = false;
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'agenda'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Get case filter from URL parameters
  const caseFilter = searchParams.get('case');
  const caseName = searchParams.get('caseName');

  // Get cases data for dropdown selection
  const { mcds, dashboardCases } = useMCDData();

  // Create cases list for dropdown (optional selection)
  const availableCases = useMemo(() => {
    const cases: Array<{ id: string; name: string }> = [];
    
    // Add MCD cases
    mcds.forEach((mcd) => {
      if ((mcd as any).is_deleted !== true) {
        const caseName = `${mcd.parties?.plaintiff || 'N/A'} vs. ${mcd.parties?.defendant || 'N/A'}`;
        cases.push({
          id: mcd.case_id,
          name: `${mcd.case_id}: ${caseName}`,
        });
      }
    });
    
    // Add Dashboard Agent cases
    dashboardCases.forEach((dc) => {
      if (dc.is_deleted !== true) {
        cases.push({
          id: dc.case_id,
          name: `${dc.case_id}: ${dc.client || 'Unknown Client'}`,
        });
      }
    });
    
    // Sort by case ID
    return cases.sort((a, b) => a.id.localeCompare(b.id));
  }, [mcds, dashboardCases]);

  // Start with empty arrays - will be populated with real data from Google Calendar
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [loadingGoogleEvents, setLoadingGoogleEvents] = useState(false);
  const [googleEventsError, setGoogleEventsError] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
    title: '',
    date: formatDateInput(currentDate),
    time: '09:00',
    caseName: '',
    location: '',
    syncToGoogle: false, // Sync to Google Calendar option
  });
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [syncingEvent, setSyncingEvent] = useState(false);
  const [alertForm, setAlertForm] = useState({
    title: '',
    due: '',
    owner: '',
  });

  const shellSpacing = isCompact ? 'pb-6 gap-4 lg:gap-6' : 'pb-8 gap-6 lg:gap-8';
  const panelWrapper = isLight
    ? 'rounded-[24px] border border-slate-200 bg-white shadow-[0_25px_55px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] border border-white/5 bg-[rgba(5,18,45,0.55)] shadow-[0_25px_55px_rgba(3,9,24,0.45)]';

  const headerColor = isLight ? 'text-slate-900' : 'text-slate-50';
  const subColor = isLight ? 'text-slate-600' : 'text-slate-300';
  const borderColor = isLight ? 'border-slate-200' : 'border-white/10';

  const calendarCellBg = (day: string) =>
    day === 'Sat' || day === 'Sun'
      ? isLight
        ? 'bg-slate-100'
        : 'bg-[rgba(255,255,255,0.04)]'
      : isLight
        ? 'bg-white'
        : 'bg-[rgba(255,255,255,0.02)]';

  const weekStart = useMemo(() => startOfWeek(currentDate), [currentDate]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)), [weekStart]);

  // Filter events by case if case filter is active
  const filteredEvents = useMemo(() => {
    if (!caseFilter) return events;

    // Filter events that match the case (by caseName or title containing case_id)
    return events.filter((event) => {
      const eventCaseName = event.caseName?.toLowerCase() || '';
      const eventTitle = event.title?.toLowerCase() || '';
      const caseFilterLower = caseFilter.toLowerCase();
      const caseNameLower = caseName?.toLowerCase() || '';

      // Match if caseName contains the case filter or case name
      return eventCaseName.includes(caseFilterLower) ||
        eventCaseName.includes(caseNameLower) ||
        eventTitle.includes(caseFilterLower) ||
        eventTitle.includes(caseNameLower);
    });
  }, [events, caseFilter, caseName]);

  // Calculate summary card values from real events data
  const eventsThisWeek = useMemo(() => {
    const weekEnd = addDays(weekStart, 7);
    return filteredEvents.filter((event) => {
      const eventDate = parseEventDate(event.date, event.allDay);
      return eventDate >= weekStart && eventDate < weekEnd;
    });
  }, [filteredEvents, weekStart]);

  const hearingsThisWeek = useMemo(() => {
    return eventsThisWeek.filter((event) => {
      const titleLower = event.title.toLowerCase();
      // English keywords
      const englishMatch = titleLower.includes('hearing') ||
        titleLower.includes('court') ||
        titleLower.includes('trial') ||
        titleLower.includes('motion');
      // Spanish keywords
      const spanishMatch = titleLower.includes('audiencia') ||
        titleLower.includes('tribunal') ||
        titleLower.includes('juzgado') ||
        titleLower.includes('juicio') ||
        titleLower.includes('vista') ||
        titleLower.includes('comparecencia');
      return englishMatch || spanishMatch;
    }).length;
  }, [eventsThisWeek]);

  const mediations = useMemo(() => {
    return filteredEvents.filter((event) => {
      const titleLower = event.title.toLowerCase();
      // English keywords
      const englishMatch = titleLower.includes('mediation') ||
        titleLower.includes('settlement');
      // Spanish keywords
      const spanishMatch = titleLower.includes('mediación') ||
        titleLower.includes('mediacion') || // without accent
        titleLower.includes('conciliación') ||
        titleLower.includes('conciliacion') || // without accent
        titleLower.includes('acuerdo');
      return englishMatch || spanishMatch;
    }).length;
  }, [filteredEvents]);

  const clientMeetings = useMemo(() => {
    return filteredEvents.filter((event) => {
      const titleLower = event.title.toLowerCase();
      // English keywords
      const englishMatch = titleLower.includes('client') ||
        titleLower.includes('meeting') ||
        titleLower.includes('consultation');
      // Spanish keywords
      const spanishMatch = titleLower.includes('cliente') ||
        titleLower.includes('reunión') ||
        titleLower.includes('reunion') || // without accent
        titleLower.includes('consulta') ||
        titleLower.includes('cita');
      return englishMatch || spanishMatch;
    }).length;
  }, [filteredEvents]);

  const pepperReminders = useMemo(() => {
    // Count incomplete reminders from backend + reminder events from Google Calendar
    const incompleteReminders = alerts.filter((alert) => !alert.completed).length;
    const reminderEvents = filteredEvents.filter((event) => {
      const titleLower = event.title.toLowerCase();
      return titleLower.includes('reminder') ||
        titleLower.includes('deadline') ||
        titleLower.includes('due');
    }).length;
    return incompleteReminders + reminderEvents;
  }, [filteredEvents, alerts]);

  const monthMatrix = useMemo(() => {
    const start = startOfMonth(currentDate);
    const firstWeekday = (start.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(null);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(new Date(start.getFullYear(), start.getMonth(), day));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    const matrix: Array<Array<Date | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      matrix.push(cells.slice(i, i + 7));
    }
    return matrix;
  }, [currentDate]);

  const handleToday = () => setCurrentDate(new Date());

  const handleNavigate = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      } else {
        next.setDate(prev.getDate() + (direction === 'next' ? 7 : -7));
      }
      return next;
    });
  };

  // Year navigation handlers
  const handleYearChange = (year: number) => {
    const newDate = new Date(currentDate);
    newDate.setFullYear(year);
    setCurrentDate(newDate);
  };

  const handleYearNavigate = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setFullYear(prev.getFullYear() + (direction === 'next' ? 1 : -1));
      return next;
    });
  };

  // Generate year options for dropdown (current year ± 10 years)
  const currentYear = currentDate.getFullYear();
  const yearOptions = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);

  const handleAddAlert = () => {
    // Set default to 1 hour from now
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() + 1);
    defaultDate.setMinutes(0); // Round to nearest hour
    setAlertForm({
      title: '',
      due: formatDateTimeLocal(defaultDate),
      owner: 'Pepper reminder'
    });
    setAlertModalOpen(true);
  };

  const handleAddEvent = () => {
    setEditingEvent(null);
    setEventForm({
      title: '',
      date: formatDateInput(currentDate),
      time: '09:00',
      caseName: '',
      location: '',
      syncToGoogle: googleCalendarConnected, // Default to sync if connected
    });
    setEventModalOpen(true);
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    const eventDate = new Date(event.date);
    setEventForm({
      title: event.title,
      date: formatDateInput(eventDate),
      time: event.time === 'All day' ? '09:00' : event.time,
      caseName: event.caseName,
      location: event.location,
      syncToGoogle: event.source === 'google', // If it's a Google event, sync changes
    });
    setEventModalOpen(true);
  };

  const handleEventFormChange = (field: keyof typeof eventForm, value: string | boolean) => {
    setEventForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAlertFormChange = (field: keyof typeof alertForm, value: string) =>
    setAlertForm((prev) => ({ ...prev, [field]: value }));

  const saveEvent = async () => {
    if (!eventForm.title.trim()) return;
    const parsedDate = new Date(`${eventForm.date}T${eventForm.time || '09:00'}`);
    if (Number.isNaN(parsedDate.getTime())) {
      alert('Invalid date or time.');
      return;
    }

    const endDate = new Date(parsedDate);
    endDate.setHours(endDate.getHours() + 1); // Default 1 hour duration

    const newEvent: CalendarEvent = {
      id: editingEvent?.id || `event-${Date.now()}`,
      title: eventForm.title.trim(),
      date: parsedDate.toISOString(),
      time: eventForm.time,
      caseName: eventForm.caseName || 'General matter',
      location: eventForm.location || 'TBD',
      source: editingEvent?.source || (eventForm.syncToGoogle ? 'google' : 'local'),
    };

    // If syncing to Google Calendar
    if (eventForm.syncToGoogle && googleCalendarConnected) {
      try {
        setSyncingEvent(true);

        if (editingEvent && editingEvent.source === 'google') {
          // Update existing Google Calendar event
          const googleEventId = editingEvent.id.replace('google-', '');
          await calendarClient.updateEvent(googleEventId, {
            title: newEvent.title,
            description: newEvent.caseName,
            start: parsedDate.toISOString(),
            end: endDate.toISOString(),
            location: newEvent.location,
            allDay: false,
          });

          // Update local event
          setEvents((prev) =>
            prev.map((e) => (e.id === editingEvent.id ? { ...newEvent, htmlLink: editingEvent.htmlLink } : e))
          );
        } else {
          // Create new Google Calendar event
          const { event: createdEvent } = await calendarClient.createEvent({
            title: newEvent.title,
            description: newEvent.caseName,
            start: parsedDate.toISOString(),
            end: endDate.toISOString(),
            location: newEvent.location,
            allDay: false,
          });

          // Add to local events with Google event ID
          const googleEvent: CalendarEvent = {
            ...newEvent,
            id: `google-${createdEvent.id}`,
            source: 'google',
            htmlLink: createdEvent.htmlLink,
          };

          if (editingEvent) {
            // Replace existing local event
            setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? googleEvent : e)));
          } else {
            // Add new event
            setEvents((prev) => [...prev, googleEvent]);
          }
        }

        // Refresh Google Calendar events to ensure sync
        await fetchGoogleCalendarEvents();
      } catch (error) {
        console.error('Error syncing event to Google Calendar:', error);
        alert(`Failed to sync to Google Calendar: ${(error as Error).message}`);

        // Still save locally if sync fails
        if (editingEvent) {
          setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? newEvent : e)));
        } else {
          setEvents((prev) => [...prev, newEvent]);
        }
      } finally {
        setSyncingEvent(false);
      }
    } else {
      // Save locally only
      if (editingEvent) {
        setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? newEvent : e)));
      } else {
        setEvents((prev) => [...prev, newEvent]);
      }
    }

    setEventModalOpen(false);
    setEditingEvent(null);
  };

  // Fetch reminders from backend
  const fetchReminders = async () => {
    try {
      setLoadingReminders(true);
      setRemindersError(null);

      const { reminders } = await reminderClient.getReminders({ upcoming: true });

      // Transform reminders to AlertItem format with formatted due dates
      const transformedReminders: AlertItem[] = reminders.map((reminder) => ({
        ...reminder,
        due: formatDueDate(reminder.due),
      }));

      setAlerts(transformedReminders);
    } catch (error: any) {
      console.error('[CalendarPage] Error fetching reminders:', error);
      setRemindersError(error.message || 'Failed to fetch reminders');
    } finally {
      setLoadingReminders(false);
    }
  };

  const saveAlert = async () => {
    if (!alertForm.title.trim()) return;

    try {
      // Convert datetime-local to ISO string
      const dueDate = new Date(alertForm.due);
      if (Number.isNaN(dueDate.getTime())) {
        alert('Invalid date or time.');
        return;
      }

      // Create reminder via API
      const { reminder } = await reminderClient.createReminder({
        title: alertForm.title.trim(),
        due: dueDate.toISOString(),
        owner: alertForm.owner || 'Pepper reminder',
      });

      // Format the due date for display
      const formattedDue = formatDueDate(reminder.due);

      // Add to local state
      setAlerts((prev) => [
        {
          ...reminder,
          due: formattedDue,
        },
        ...prev,
      ]);

      setAlertModalOpen(false);
    } catch (error: any) {
      console.error('[CalendarPage] Error creating reminder:', error);
      alert(`Failed to create reminder: ${error.message}`);
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm(t('calendar.deleteReminderConfirm'))) {
      return;
    }

    try {
      await reminderClient.deleteReminder(alertId);
      // Remove from local state
      setAlerts((prev) => prev.filter((alert) => alert.id !== alertId));
    } catch (error: any) {
      console.error('[CalendarPage] Error deleting reminder:', error);
      alert(`Failed to delete reminder: ${error.message}`);
    }
  };

  const today = useMemo(() => new Date(), []);

  const formatDateLabel = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  // Format date with year for display in header
  const formatDateWithYear = (date: Date) =>
    date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

  const weekEvents = useMemo(
    () =>
      weekDates.map((day) => {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        return {
          day,
          items: filteredEvents.filter((event) => {
            try {
              const eventDate = parseEventDate(event.date, event.allDay);
              // Normalize both dates to local time for comparison
              const normalizedEventDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
              const normalizedDayStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());
              const normalizedDayEnd = new Date(dayEnd.getFullYear(), dayEnd.getMonth(), dayEnd.getDate());

              return normalizedEventDate >= normalizedDayStart && normalizedEventDate <= normalizedDayEnd;
            } catch (error) {
              console.error('[CalendarPage] Error filtering event for week view:', error, event);
              return false;
            }
          }),
        };
      }),
    [events, weekDates],
  );

  const monthEventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((event) => {
      try {
        // Parse the event date - handle both ISO strings and date-only strings
        const eventDate = parseEventDate(event.date, event.allDay);

        // Normalize to local date (ignore time for date matching)
        const normalizedDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const key = formatDateInput(normalizedDate);

        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)?.push(event);
      } catch (error) {
        console.error('[CalendarPage] Error processing event for month map:', error, event);
      }
    });
    console.log('[CalendarPage] Month events map created with', map.size, 'days');
    return map;
  }, [events]);

  // Transform Google Calendar events to local format
  const transformGoogleEvent = (googleEvent: GoogleCalendarEvent): CalendarEvent => {
    try {
      // Check if it's an all-day event (date-only format or allDay flag)
      const isAllDay = googleEvent.allDay || !googleEvent.start.includes('T') || googleEvent.start.split('T')[1] === undefined;

      let startDate: Date;
      let dateString: string;

      if (isAllDay) {
        // All-day event - parse YYYY-MM-DD as local date to avoid timezone shift
        if (/^\d{4}-\d{2}-\d{2}$/.test(googleEvent.start)) {
          const [year, month, day] = googleEvent.start.split('-').map(Number);
          startDate = new Date(year, month - 1, day); // Local date, not UTC
          dateString = googleEvent.start; // Keep YYYY-MM-DD format for all-day events
        } else {
          // Fallback - try parsing as ISO string
          startDate = new Date(googleEvent.start);
          // Extract local date components
          const year = startDate.getFullYear();
          const month = String(startDate.getMonth() + 1).padStart(2, '0');
          const day = String(startDate.getDate()).padStart(2, '0');
          dateString = `${year}-${month}-${day}`;
        }
      } else {
        // Timed event - parse ISO string
        startDate = new Date(googleEvent.start);
        dateString = startDate.toISOString();
      }

      // Format time for display
      let timeDisplay: string;
      if (isAllDay) {
        timeDisplay = 'All day';
      } else {
        // Format as HH:MM (24-hour format) using local time
        const hours = startDate.getHours().toString().padStart(2, '0');
        const minutes = startDate.getMinutes().toString().padStart(2, '0');
        timeDisplay = `${hours}:${minutes}`;
      }

      // Use description or default text
      const caseName = googleEvent.description?.trim() || 'Google Calendar Event';

      return {
        id: `google-${googleEvent.id}`,
        title: googleEvent.title || 'Untitled Event',
        date: dateString, // Use properly formatted date string
        time: timeDisplay,
        caseName: caseName,
        location: googleEvent.location || '',
        source: 'google',
        allDay: isAllDay,
        htmlLink: googleEvent.htmlLink,
      };
    } catch (error) {
      console.error('[CalendarPage] Error transforming Google event:', error, googleEvent);
      // Return a fallback event
      return {
        id: `google-${googleEvent.id}`,
        title: googleEvent.title || 'Untitled Event',
        date: googleEvent.start,
        time: 'Unknown',
        caseName: 'Google Calendar',
        location: '',
        source: 'google',
        allDay: false,
        htmlLink: googleEvent.htmlLink,
      };
    }
  };

  // Fetch Google Calendar events
  const fetchGoogleCalendarEvents = async () => {
    if (!googleCalendarConnected) {
      console.log('[CalendarPage] Skipping fetch - Google Calendar not connected');
      return;
    }

    try {
      setLoadingGoogleEvents(true);
      setGoogleEventsError(null);

      // Calculate date range based on view mode
      let startDate: Date;
      let endDate: Date;

      if (viewMode === 'month') {
        startDate = startOfMonth(currentDate);
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (viewMode === 'week') {
        startDate = startOfWeek(currentDate);
        endDate = addDays(startDate, 7);
      } else {
        // Agenda view - show next 30 days
        startDate = new Date();
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
      }

      // Set to start/end of day
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      console.log('[CalendarPage] Fetching events from', startDate.toISOString(), 'to', endDate.toISOString());

      const { events: googleEvents } = await calendarClient.getEvents({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        maxResults: 250,
      });

      console.log('[CalendarPage] Received', googleEvents.length, 'events from Google Calendar');

      // Transform Google Calendar events to local format
      const transformedGoogleEvents = googleEvents.map(transformGoogleEvent);
      console.log('[CalendarPage] Transformed events:', transformedGoogleEvents.length);

      // Set events to only Google Calendar events (real data)
      // If you want to support local events in the future, you can merge them here
      setEvents(transformedGoogleEvents);
      console.log('[CalendarPage] Set events - Google Calendar events:', transformedGoogleEvents.length);
    } catch (error: any) {
      console.error('[CalendarPage] Error fetching Google Calendar events:', error);
      let errorMessage = (error as Error).message || 'Failed to fetch Google Calendar events';

      // Check if this is a token decryption error that requires reconnection
      if (errorMessage.includes('decrypt') || errorMessage.includes('Token decryption failed') || errorMessage.includes('requiresReconnect')) {
        errorMessage = 'Token decryption failed. Please disconnect and reconnect Google Calendar.';
        // Optionally, you could automatically disconnect here
        // But it's better to let the user do it manually
      }

      // Check if API is not enabled
      if (errorMessage.includes('Google Calendar API is not enabled') || error?.requiresApiEnable) {
        errorMessage = 'Google Calendar API is not enabled in Google Cloud Console.';
      }

      setGoogleEventsError(errorMessage);
      console.error('[CalendarPage] Error details:', {
        message: errorMessage,
        stack: (error as Error).stack,
        requiresReconnect: error?.requiresReconnect,
        requiresApiEnable: error?.requiresApiEnable,
        troubleshooting: error?.troubleshooting,
      });
      // Don't clear existing events on error
    } finally {
      setLoadingGoogleEvents(false);
    }
  };

  // Check connection status on mount and periodically
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const status = await calendarClient.getConnectionStatus();
        console.log('[CalendarPage] Connection status:', status);
        setGoogleCalendarConnected(status.connected);
      } catch (error) {
        console.error('[CalendarPage] Error checking connection status:', error);
        setGoogleCalendarConnected(false);
      }
    };

    // Check immediately
    checkConnection();

    // Also check periodically (every 30 seconds) in case connection status changes
    const interval = setInterval(checkConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  // Fetch reminders on mount
  useEffect(() => {
    fetchReminders();
  }, []);

  // Fetch events when connection status changes or date/view changes
  useEffect(() => {
    console.log('[CalendarPage] Connection status changed:', googleCalendarConnected);
    if (googleCalendarConnected) {
      console.log('[CalendarPage] Fetching Google Calendar events...');
      fetchGoogleCalendarEvents();
    } else {
      // Clear all events when disconnected (no demo data, only real data)
      console.log('[CalendarPage] Clearing Google Calendar events');
      setEvents([]);
      setGoogleEventsError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleCalendarConnected, currentDate, viewMode]);

  const agendaEvents = useMemo(
    () =>
      [...filteredEvents]
        .sort((a, b) => parseEventDate(a.date, a.allDay).getTime() - parseEventDate(b.date, b.allDay).getTime())
        .slice(0, 10),
    [filteredEvents],
  );

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    const limit = new Date(now);
    limit.setHours(limit.getHours() + 48);
    return filteredEvents
      .filter((event) => {
        const eventDate = parseEventDate(event.date, event.allDay);
        return eventDate >= now && eventDate <= limit;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events]);

  return (
    <div className="app-shell">
      <Header />

      <div className={`flex flex-1 flex-col lg:flex-row px-4 sm:px-6 lg:px-20 ${shellSpacing}`}>
        {showSidebar && (
          <div className="w-full lg:w-[30%] lg:max-w-sm">
            <Sidebar showQuickActions={false} showRecentCases={false} />
          </div>
        )}

        <main
          className={`w-full ${showSidebar ? 'lg:w-[70%]' : 'lg:w-full'} flex-1 ${isCompact ? 'pt-1' : 'pt-2'
            } lg:pt-0 ${showSidebar ? 'lg:pl-6 lg:pr-8' : 'lg:px-0'} ${showSidebar
              ? isLight
                ? 'lg:border-l lg:border-slate-200'
                : 'lg:border-l lg:border-slate-800/70'
              : ''
            }`}
        >
          <div className={`${panelWrapper} ${isCompact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'} lg:p-0 lg:border-none lg:bg-transparent lg:shadow-none lg:rounded-none`}>
            <div className={isCompact ? 'space-y-4 lg:space-y-5' : 'space-y-6 lg:space-y-8'}>
              {/* Header */}
              <section className={isCompact ? 'mt-2' : 'mt-4'}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className={`text-3xl font-semibold ${headerColor}`}>{t('calendar.title')}</h1>
                      {caseFilter && caseName && (
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${subColor}`}>•</span>
                          <span className={`text-sm font-medium px-3 py-1 rounded-full ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            {caseName}
                          </span>
                          <button
                            onClick={() => {
                              const url = new URL(window.location.href);
                              url.searchParams.delete('case');
                              url.searchParams.delete('caseName');
                              window.history.replaceState({}, '', url.pathname + url.search);
                              window.location.reload();
                            }}
                            className={`text-xs ${subColor} hover:${headerColor} transition`}
                            title="Clear case filter"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    <p className={`text-sm ${subColor}`}>
                      {caseFilter && caseName
                        ? `${t('calendar.subtitleFiltered')} ${caseName}.`
                        : t('calendar.subtitle')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddEvent}
                      className="rounded-xl bg-[linear-gradient(135deg,_#fbbf24,_#f97316)] text-slate-900 font-semibold px-4 py-2 shadow-[0_10px_20px_rgba(249,115,22,0.35)] hover:brightness-105 transition"
                    >
                      + {t('calendar.newEvent')}
                    </button>
                  </div>
                </div>
              </section>

              {/* Google Calendar Connection */}
              <section>
                <CalendarConnection onConnectionChange={(connected) => {
                  console.log('[CalendarPage] Connection status changed via callback:', connected);
                  setGoogleCalendarConnected(connected);
                }} />
                {googleEventsError && (
                  <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
                    <p className="font-semibold">⚠️ Error loading Google Calendar events</p>
                    <p className="text-xs mt-1">{googleEventsError}</p>
                    {googleEventsError.includes('Google Calendar API is not enabled') && (
                      <div className="mt-3 text-xs space-y-1">
                        <p className="font-semibold">To fix this:</p>
                        <ol className="list-decimal list-inside space-y-1 ml-2">
                          <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                          <li>Select the project that contains your OAuth Client ID</li>
                          <li>Navigate to: <strong>APIs & Services → Library</strong></li>
                          <li>Search for <strong>"Google Calendar API"</strong></li>
                          <li>Click <strong>"ENABLE"</strong></li>
                          <li>Wait 1-2 minutes for the API to activate</li>
                          <li>Try connecting again</li>
                        </ol>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setGoogleEventsError(null);
                        if (googleCalendarConnected) {
                          fetchGoogleCalendarEvents();
                        }
                      }}
                      className="mt-2 text-xs underline hover:no-underline"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {loadingGoogleEvents && googleCalendarConnected && (
                  <div className={`mt-3 rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${isLight ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-blue-400/30 bg-blue-500/10 text-blue-200'}`}>
                    <div className={`animate-spin rounded-full h-4 w-4 border-b-2 ${isLight ? 'border-blue-500' : 'border-blue-400'}`}></div>
                    <p>Loading Google Calendar events...</p>
                  </div>
                )}
              </section>

              {/* Summary cards */}
              <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <SummaryCard
                    title={t('calendar.hearingsThisWeek')}
                    value={hearingsThisWeek}
                    icon={
                      <svg className={`w-7 h-7 ${isLight ? 'text-slate-800' : 'text-white'}`} viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 20h14M7.5 9.5l6-6M14.5 9.5l-6-6M7 13h6.5M4 14.5h12.5"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <rect x="15" y="11.25" width="5" height="8" rx="1" stroke="currentColor" strokeWidth={1.5} />
                      </svg>
                    }
                  />
                  <SummaryCard
                    title={t('calendar.mediations')}
                    value={mediations}
                    color="yellow"
                    icon={
                      <svg className={`w-7 h-7 ${isLight ? 'text-slate-800' : 'text-white'}`} viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 8a3 3 0 116 0 3 3 0 01-6 0zm6 0v7.5A2.5 2.5 0 019.5 18H4m14-10a3 3 0 11-6 0 3 3 0 016 0zm-6 0v7.5A2.5 2.5 0 0014.5 18H20"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                  />
                  <SummaryCard
                    title={t('calendar.pepperReminders')}
                    value={pepperReminders}
                    color="blue"
                    icon={
                      <svg className={`w-7 h-7 ${isLight ? 'text-slate-800' : 'text-white'}`} viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 5.5c3.59 0 6.5 2.33 6.5 5.2v2.3a2 2 0 001 1.73l.4.2c.58.3.2 1.07-.45 1.07H4.55c-.65 0-1.03-.78-.45-1.07l.4-.2a2 2 0 001-1.73v-2.3c0-2.87 2.91-5.2 6.5-5.2zm-2.5 10.5h5m-3 3h1.5"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                  />
                  <SummaryCard
                    title={t('calendar.clientMeetings')}
                    value={clientMeetings}
                    color="purple"
                    icon={
                      <svg className={`w-7 h-7 ${isLight ? 'text-slate-800' : 'text-white'}`} viewBox="0 0 24 24" fill="none">
                        <path
                          d="M7.5 11.5a4 4 0 018 0V14H7.5v-2.5zM5 14h14v5.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19.5V14zM9.75 7.5a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0z"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                  />
                </div>
              </section>

              {/* Date/Year Display and Navigation */}
              <section className="flex flex-col gap-3">
                {/* Date and Year Display with Navigation */}
                <div className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center justify-between ${isLight ? 'bg-slate-50' : 'bg-[rgba(58, 89, 119, 0.8)]'}`}>
                  <div className="flex items-center gap-3">
                    <h2 className={`text-xl font-bold ${headerColor}`}>
                      {formatDateWithYear(currentDate)}
                    </h2>
                  </div>
                  {/* Year Selector */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleYearNavigate('prev')}
                      className={`rounded-lg border ${borderColor} px-3 py-1.5 text-sm font-semibold ${isLight
                        ? 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/15'
                        } transition`}
                      title="Previous Year"
                    >
                      ← Year
                    </button>
                    <select
                      value={currentYear}
                      onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
                      className={`rounded-lg border ${borderColor} px-3 py-1.5 text-sm font-semibold focus:outline-none ${isLight
                        ? 'bg-white text-slate-700 border-slate-200'
                        : 'bg-[rgba(10,40,64,0.85)] text-white border-white/15'
                        }`}
                      title="Select Year"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleYearNavigate('next')}
                      className={`rounded-lg border ${borderColor} px-3 py-1.5 text-sm font-semibold ${isLight
                        ? 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/15'
                        } transition`}
                      title="Next Year"
                    >
                      Year →
                    </button>
                  </div>
                </div>

                {/* View Mode, Today, and Month/Week Navigation */}
                <div className="flex flex-row items-center justify-between gap-3">
                  <div className={`w-[40%] rounded-2xl border ${borderColor} px-2 py-2 flex items-center gap-3 ${isLight ? 'bg-slate-50' : 'bg-[rgba(58, 89, 119, 0.8)]'}`}>
                  <svg className={`w-5 h-5 ${isLight ? 'text-slate-500' : 'text-slate-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5h18M3 12h12M3 19h6" />
                  </svg>
                  <select
                    value={viewMode}
                    onChange={(event) => setViewMode(event.target.value as 'week' | 'month' | 'agenda')}
                    className={`flex-1 text-sm focus:outline-none rounded-xl px-3 py-1.5 appearance-none border ${isLight
                      ? 'bg-white text-slate-700 border-slate-200'
                      : 'bg-[rgba(10,40,64,0.85)] text-white border-white/15'
                      }`}
                  >
                    <option value="week">{t('calendar.weekView')}</option>
                    <option value="month">{t('calendar.monthView')}</option>
                    <option value="agenda">{t('calendar.agenda')}</option>
                  </select>
                </div>
                  <div className="w-[30%]">
                  <button
                    onClick={handleToday}
                      className={`w-full rounded-xl border border-emerald-400 text-emerald-200 font-semibold px-3 py-2 text-sm ${isLight ? 'bg-emerald-50/50 hover:bg-emerald-100/50' : 'bg-emerald-500/20 hover:bg-emerald-500/30'} transition`}
                  >
                    {t('common.today')} · {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </button>
                </div>
                  <div className="flex gap-1 w-[30%] justify-end">
                  <button
                    onClick={() => handleNavigate('prev')}
                      className={`rounded-full border ${borderColor} px-3 py-2 text-sm ${isLight
                        ? 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/20'
                        } transition`}
                  >
                      ← {viewMode === 'month' ? 'Month' : 'Week'}
                  </button>
                  <button
                    onClick={() => handleNavigate('next')}
                      className={`rounded-full border ${borderColor} px-3 py-2 text-sm ${isLight
                        ? 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        : 'bg-white/10 text-white/80 hover:bg-white/20 border-white/20'
                        } transition`}
                  >
                      {viewMode === 'month' ? 'Month' : 'Week'} →
                  </button>
                  </div>
                </div>
              </section>

              {/* Calendar view */}
              {viewMode === 'week' && (
                <section className="grid grid-cols-1 gap-4">
                  <div className="rounded-2xl border border-white/10 overflow-hidden">
                    <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide bg-white/5">
                      {weekDates.map((date) => (
                        <div key={date.toISOString()} className="py-2 text-slate-300">
                          {formatDateLabel(date)}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-px bg-white/5">
                      {weekEvents.map(({ day, items }) => (
                        <div
                          key={day.toISOString()}
                          className={`min-h-[130px] rounded-none px-3 py-2 text-sm ${calendarCellBg(weekDays[day.getDay() === 0 ? 6 : day.getDay() - 1])} border border-white/5 flex flex-col gap-2`}
                        >
                          <div className="text-xs font-semibold text-slate-400">{formatDateLabel(day)}</div>
                          {items.map((event) => (
                            <div
                              key={event.id}
                              onClick={() => handleEditEvent(event)}
                              className={`rounded-xl border px-2 py-1.5 text-xs cursor-pointer transition hover:opacity-80 ${event.source === 'google'
                                ? 'border-blue-300/40 bg-blue-500/10 text-blue-100'
                                : 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                                }`}
                            >
                              <div className="flex items-center gap-1 mb-0.5">
                                {event.source === 'google' && (
                                  <svg className="w-3 h-3" viewBox="0 0 48 48">
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.91-6.91C35.9 2.16 30.47 0 24 0 14.62 0 6.43 5.38 2.58 13.22l8.04 6.24C12.57 13.28 17.78 9.5 24 9.5z" />
                                    <path fill="#34A853" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9.04h12.7c-.55 2.92-2.18 5.39-4.65 7.04l7.24 5.62C43.44 37.04 46.5 31.28 46.5 24.5z" />
                                    <path fill="#4A90E2" d="M13.54 28.46a9.46 9.46 0 010-8.92l-8.04-6.32C2.05 15.21 0 19.35 0 24s2.05 8.79 5.5 11.78l8.04-6.32z" />
                                    <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.93-5.76l-7.24-5.62C30.67 38.7 27.54 39.5 24 39.5c-6.22 0-11.43-3.78-13.38-9.96l-8.04 6.24C6.43 42.62 14.62 48 24 48z" />
                                  </svg>
                                )}
                                <p className="font-semibold">{event.time}</p>
                              </div>
                              <p>{event.caseName}</p>
                              <p className="text-[10px]">{event.title}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {viewMode === 'month' && (
                <section className="grid grid-cols-1 gap-4">
                  <div className="rounded-2xl border border-white/10 overflow-hidden">
                    <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide bg-white/5">
                      {weekDays.map((day) => (
                        <div key={`month-head-${day}`} className="py-2 text-slate-300">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col">
                      {monthMatrix.map((week, idx) => (
                        <div key={`month-row-${idx}`} className="grid grid-cols-7 gap-px bg-white/5">
                          {week.map((value, colIdx) => {
                            const key = value ? formatDateInput(value) : `empty-${idx}-${colIdx}`;
                            const eventsForDay = value ? monthEventsMap.get(key) ?? [] : [];
                            return (
                              <div
                                key={key}
                                className={`min-h-[110px] rounded-none px-3 py-2 text-sm ${value
                                  ? calendarCellBg(weekDays[colIdx])
                                  : isLight
                                    ? 'bg-slate-100'
                                    : 'bg-[rgba(255,255,255,0.04)]'
                                  } border border-white/5 flex flex-col gap-2`}
                              >
                                <div className="text-xs font-semibold text-slate-400">{value ? formatDateLabel(value) : ''}</div>
                                {eventsForDay.map((event) => (
                                  <div
                                    key={event.id}
                                    onClick={() => handleEditEvent(event)}
                                    className={`rounded-xl border px-2 py-1.5 text-xs cursor-pointer transition hover:opacity-80 ${event.source === 'google'
                                      ? 'border-blue-300/40 bg-blue-500/10 text-blue-100'
                                      : 'border-emerald-300/40 bg-emerald-500/10 text-emerald-100'
                                      }`}
                                  >
                                    <div className="flex items-center gap-1">
                                      {event.source === 'google' && (
                                        <svg className="w-2.5 h-2.5" viewBox="0 0 48 48">
                                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.91-6.91C35.9 2.16 30.47 0 24 0 14.62 0 6.43 5.38 2.58 13.22l8.04 6.24C12.57 13.28 17.78 9.5 24 9.5z" />
                                          <path fill="#34A853" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9.04h12.7c-.55 2.92-2.18 5.39-4.65 7.04l7.24 5.62C43.44 37.04 46.5 31.28 46.5 24.5z" />
                                          <path fill="#4A90E2" d="M13.54 28.46a9.46 9.46 0 010-8.92l-8.04-6.32C2.05 15.21 0 19.35 0 24s2.05 8.79 5.5 11.78l8.04-6.32z" />
                                          <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.93-5.76l-7.24-5.62C30.67 38.7 27.54 39.5 24 39.5c-6.22 0-11.43-3.78-13.38-9.96l-8.04 6.24C6.43 42.62 14.62 48 24 48z" />
                                        </svg>
                                      )}
                                      <p className="font-semibold">{event.time}</p>
                                    </div>
                                    <p className="truncate">{event.caseName}</p>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {viewMode === 'agenda' && (
                <section className="grid grid-cols-1 gap-3">
                  {loadingGoogleEvents && googleCalendarConnected && (
                    <div className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center gap-3 ${isLight ? 'bg-white' : 'bg-white/5'}`}>
                      <div className={`animate-spin rounded-full h-4 w-4 border-b-2 ${isLight ? 'border-slate-500' : 'border-emerald-500'}`}></div>
                      <p className={`text-sm ${subColor}`}>Loading Google Calendar events...</p>
                    </div>
                  )}
                  {googleEventsError && (
                    <div className={`rounded-2xl border px-4 py-3 ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
                      <p className="text-sm">{googleEventsError}</p>
                    </div>
                  )}
                  {agendaEvents.map((event) => (
                    <div
                      key={`agenda-${event.id}`}
                      onClick={() => handleEditEvent(event)}
                      className={`rounded-2xl border ${borderColor} px-4 py-3 flex items-center justify-between cursor-pointer transition hover:opacity-80 ${isLight ? 'bg-white' : 'bg-white/5'}`}
                    >
                      <div className="flex items-center gap-2">
                        {event.source === 'google' && (
                          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.91-6.91C35.9 2.16 30.47 0 24 0 14.62 0 6.43 5.38 2.58 13.22l8.04 6.24C12.57 13.28 17.78 9.5 24 9.5z" />
                            <path fill="#34A853" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9.04h12.7c-.55 2.92-2.18 5.39-4.65 7.04l7.24 5.62C43.44 37.04 46.5 31.28 46.5 24.5z" />
                            <path fill="#4A90E2" d="M13.54 28.46a9.46 9.46 0 010-8.92l-8.04-6.32C2.05 15.21 0 19.35 0 24s2.05 8.79 5.5 11.78l8.04-6.32z" />
                            <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.93-5.76l-7.24-5.62C30.67 38.7 27.54 39.5 24 39.5c-6.22 0-11.43-3.78-13.38-9.96l-8.04 6.24C6.43 42.62 14.62 48 24 48z" />
                          </svg>
                        )}
                        <div>
                          <p className={`text-sm font-semibold ${headerColor}`}>{event.title}</p>
                          <p className={`text-xs ${subColor}`}>
                            {event.caseName} · {event.location}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${event.source === 'google' ? 'text-blue-300' : 'text-emerald-300'}`}>
                          {parseEventDate(event.date, event.allDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {event.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Upcoming events list */}
              <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className={`rounded-2xl border ${borderColor} ${isLight ? 'bg-white' : 'bg-white/5'} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-lg font-semibold ${headerColor}`}>{t('calendar.next48Hours')}</h3>
                    <button
                      onClick={handleAddAlert}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
                    >
                      {t('calendar.addAlert')}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {loadingGoogleEvents && googleCalendarConnected && (
                      <div className="flex items-center gap-2 py-2">
                        <div className={`animate-spin rounded-full h-3 w-3 border-b-2 ${isLight ? 'border-slate-500' : 'border-emerald-500'}`}></div>
                        <p className={`text-xs ${subColor}`}>Loading events...</p>
                      </div>
                    )}
                    {upcomingEvents.length === 0 && !loadingGoogleEvents && (
                      <p className={`text-sm ${subColor}`}>{t('calendar.noEvents48Hours')}</p>
                    )}
                    {upcomingEvents.map((event) => (
                      <div key={`upcoming-${event.id}`} className="rounded-xl border border-white/10 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {event.source === 'google' && (
                            <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 48 48">
                              <path fill="#EA4335" d="M24 9.5c3.54 0 6.72 1.22 9.22 3.6l6.91-6.91C35.9 2.16 30.47 0 24 0 14.62 0 6.43 5.38 2.58 13.22l8.04 6.24C12.57 13.28 17.78 9.5 24 9.5z" />
                              <path fill="#34A853" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.75H24v9.04h12.7c-.55 2.92-2.18 5.39-4.65 7.04l7.24 5.62C43.44 37.04 46.5 31.28 46.5 24.5z" />
                              <path fill="#4A90E2" d="M13.54 28.46a9.46 9.46 0 010-8.92l-8.04-6.32C2.05 15.21 0 19.35 0 24s2.05 8.79 5.5 11.78l8.04-6.32z" />
                              <path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.93-5.76l-7.24-5.62C30.67 38.7 27.54 39.5 24 39.5c-6.22 0-11.43-3.78-13.38-9.96l-8.04 6.24C6.43 42.62 14.62 48 24 48z" />
                            </svg>
                          )}
                          <div>
                            <p className="font-semibold text-white">{event.title}</p>
                            <p className="text-xs text-slate-300">
                              {event.caseName} · {event.location}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-semibold ${event.source === 'google' ? 'text-blue-300' : 'text-emerald-300'}`}>
                          {parseEventDate(event.date, event.allDay).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`rounded-2xl border ${borderColor} ${isLight ? 'bg-white' : 'bg-white/5'} p-4`}>
                  <h3 className={`text-lg font-semibold mb-3 ${headerColor}`}>{t('calendar.pepperReminders')}</h3>
                  {loadingReminders && (
                    <div className="flex items-center gap-2 py-2">
                      <div className={`animate-spin rounded-full h-3 w-3 border-b-2 ${isLight ? 'border-slate-500' : 'border-emerald-500'}`}></div>
                      <p className={`text-xs ${subColor}`}>{t('calendar.loadingReminders')}</p>
                    </div>
                  )}
                  {remindersError && (
                    <div className={`rounded-xl border px-3 py-2 text-xs mb-3 ${isLight ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}>
                      <p>⚠️ {remindersError}</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {!loadingReminders && alerts.length === 0 && (
                      <p className={`text-sm ${subColor}`}>{t('calendar.noReminders')}</p>
                    )}
                    {alerts.map((item) => (
                      <div key={item.id} className={`rounded-xl border ${borderColor} px-4 py-3 ${item.completed ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`font-semibold ${item.completed ? 'line-through' : ''}`}>{item.title}</p>
                              {item.completed && (
                                <span className="text-xs text-emerald-400">✓ Completed</span>
                              )}
                            </div>
                            <p className={`text-xs ${subColor} mt-1`}>{item.due}</p>
                            <p className="text-xs text-emerald-400 mt-1">{item.owner}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteAlert(item.id)}
                            className="text-slate-400 hover:text-rose-400 transition text-xs"
                            title={t('calendar.deleteReminder')}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
      {eventModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
          <div className={`w-full max-w-lg rounded-[24px] border ${borderColor} ${isLight ? 'bg-white' : 'bg-[#060d1b]'} p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-2xl font-semibold ${headerColor}`}>
                {editingEvent ? t('calendar.editEvent') : t('calendar.createEvent')}
              </h2>
              <button
                onClick={() => {
                  setEventModalOpen(false);
                  setEditingEvent(null);
                }}
                className="text-sm text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              {/* Title */}
              <label className="block text-sm space-y-1">
                <span className={`${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('calendar.eventTitle')}</span>
                <input
                  type="text"
                  placeholder={t('calendar.eventTitlePlaceholder')}
                  value={eventForm.title}
                  onChange={(e) => handleEventFormChange('title', e.target.value)}
                  className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'}`}
                />
              </label>
              
              {/* Case - Dropdown (Optional) */}
              <label className="block text-sm space-y-1">
                <span className={`${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('calendar.eventCase')}</span>
                <select
                  value={eventForm.caseName}
                  onChange={(e) => handleEventFormChange('caseName', e.target.value)}
                  className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'}`}
                >
                  <option value="">{t('calendar.noCase')}</option>
                  {availableCases.map((caseOption) => (
                    <option key={caseOption.id} value={caseOption.name}>
                      {caseOption.name}
                    </option>
                  ))}
                </select>
              </label>
              
              {/* Location */}
              <label className="block text-sm space-y-1">
                <span className={`${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('calendar.eventLocation')}</span>
                <input
                  type="text"
                  placeholder={t('calendar.eventLocationPlaceholder')}
                  value={eventForm.location}
                  onChange={(e) => handleEventFormChange('location', e.target.value)}
                  className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'}`}
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm space-y-1">
                  <span className={`${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('calendar.eventDate')}</span>
                  <input
                    type="date"
                    value={eventForm.date}
                    onChange={(e) => handleEventFormChange('date', e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'
                      }`}
                  />
                </label>
                <label className="block text-sm space-y-1">
                  <span className={`${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{t('calendar.eventTime')}</span>
                  <input
                    type="time"
                    value={eventForm.time}
                    onChange={(e) => handleEventFormChange('time', e.target.value)}
                    className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'
                      }`}
                  />
                </label>
              </div>
              {googleCalendarConnected && (
                <label className="flex items-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5">
                  <input
                    type="checkbox"
                    checked={eventForm.syncToGoogle}
                    onChange={(e) => handleEventFormChange('syncToGoogle', e.target.checked.toString())}
                    className="rounded border-white/20 bg-white/10 text-emerald-400 focus:ring-emerald-400"
                  />
                  <div className="flex-1">
                    <span className={`text-sm font-medium ${headerColor}`}>{t('calendar.syncToGoogle')}</span>
                    <p className={`text-xs ${subColor}`}>
                      {editingEvent?.source === 'google'
                        ? t('calendar.syncToGoogleDescriptionEdit')
                        : t('calendar.syncToGoogleDescription')}
                    </p>
                  </div>
                </label>
              )}
            </div>
            <div className="flex justify-between items-center pt-2">
              {editingEvent && editingEvent.source === 'google' && (
                <button
                  onClick={async () => {
                    if (!confirm(t('calendar.deleteConfirm'))) {
                      return;
                    }
                    try {
                      const googleEventId = editingEvent.id.replace('google-', '');
                      await calendarClient.deleteEvent(googleEventId);
                      setEvents((prev) => prev.filter((e) => e.id !== editingEvent.id));
                      setEventModalOpen(false);
                      setEditingEvent(null);
                      await fetchGoogleCalendarEvents();
                    } catch (error) {
                      console.error('Error deleting event:', error);
                      alert(`Failed to delete event: ${(error as Error).message}`);
                    }
                  }}
                  className={`px-4 py-2 rounded-2xl border text-sm font-semibold ${isLight
                    ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                    : 'border-rose-400/30 text-rose-300 hover:bg-rose-500/10'
                    }`}
                >
                  {t('calendar.delete')}
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  onClick={() => {
                    setEventModalOpen(false);
                    setEditingEvent(null);
                  }}
                  className={`px-4 py-2 rounded-2xl border text-sm font-semibold ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-white/80 hover:bg-white/10'
                    }`}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEvent}
                  disabled={syncingEvent}
                  className="px-5 py-2 rounded-2xl bg-emerald-500 text-white text-sm font-semibold shadow-[0_15px_35px_rgba(16,185,129,0.35)] hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {syncingEvent && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  {syncingEvent ? t('calendar.syncing') : editingEvent ? t('calendar.updateEvent') : t('calendar.saveEvent')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {alertModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 p-4">
          <div className={`w-full max-w-md rounded-[24px] border ${borderColor} ${isLight ? 'bg-white' : 'bg-[#060d1b]'} p-6 space-y-4`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-2xl font-semibold ${headerColor}`}>New alert</h2>
              <button onClick={() => setAlertModalOpen(false)} className="text-sm text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <label className="block text-sm space-y-1">
                <span className={subColor}>Title</span>
                <input
                  type="text"
                  value={alertForm.title}
                  onChange={(e) => handleAlertFormChange('title', e.target.value)}
                  placeholder="Call client, prep hearing"
                  className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'
                    }`}
                />
              </label>
              <label className="block text-sm space-y-1">
                <span className={subColor}>Due Date & Time</span>
                <input
                  type="datetime-local"
                  value={alertForm.due}
                  onChange={(e) => handleAlertFormChange('due', e.target.value)}
                  min={formatDateTimeLocal(new Date())} // Prevent selecting past dates
                  className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'
                    }`}
                />
                {alertForm.due && (
                  <p className={`text-xs mt-1 ${subColor}`}>
                    {formatDueDate(alertForm.due)}
                  </p>
                )}
              </label>
              <label className="block text-sm space-y-1">
                <span className={subColor}>Owner</span>
                <input
                  type="text"
                  value={alertForm.owner}
                  onChange={(e) => handleAlertFormChange('owner', e.target.value)}
                  placeholder="Pepper reminder"
                  className={`w-full rounded-2xl border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/15 bg-white/10 text-white'
                    }`}
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setAlertModalOpen(false)}
                className={`px-4 py-2 rounded-2xl border text-sm font-semibold ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/20 text-white/80 hover:bg-white/10'
                  }`}
              >
                Cancel
              </button>
              <button
                onClick={saveAlert}
                className="px-5 py-2 rounded-2xl bg-emerald-500 text-white text-sm font-semibold shadow-[0_15px_35px_rgba(16,185,129,0.35)] hover:bg-emerald-400"
              >
                Add alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withAuth(CalendarPage);

