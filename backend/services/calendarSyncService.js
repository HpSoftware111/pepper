/**
 * Calendar Sync Service
 * Automatically creates calendar events from MCD and Dashboard Template data
 */

import { OAuth2Client } from 'google-auth-library';
import GoogleCalendarToken from '../models/GoogleCalendarToken.js';
import { getCalendarClient } from '../controllers/calendarController.js';

/**
 * Convert MCD deadlines to calendar events
 */
function convertDeadlinesToEvents(deadlines, caseId, caseName) {
    if (!Array.isArray(deadlines) || deadlines.length === 0) {
        return [];
    }

    return deadlines
        .filter((deadline) => {
            // Only include incomplete deadlines with valid dates
            return !deadline.completed && deadline.due_date;
        })
        .map((deadline) => {
            // Parse the due date - handle both Date objects (from MongoDB, in UTC) and date strings
            let dueDate;
            if (deadline.due_date instanceof Date) {
                // MongoDB stores dates as UTC, so we need to extract the UTC date components
                // and create a local date to avoid timezone shift
                // When MongoDB stores "2026-01-08" as UTC midnight, we want to preserve it as Jan 8 local
                const utcYear = deadline.due_date.getUTCFullYear();
                const utcMonth = deadline.due_date.getUTCMonth();
                const utcDay = deadline.due_date.getUTCDate();
                // Create a local date with the same year/month/day to preserve the date
                dueDate = new Date(utcYear, utcMonth, utcDay);
            } else if (typeof deadline.due_date === 'string') {
                // Parse as local date to avoid timezone issues
                const dateStr = deadline.due_date.toString();
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    // YYYY-MM-DD format - parse as local date
                    const [year, month, day] = dateStr.split('-').map(Number);
                    dueDate = new Date(year, month - 1, day);
                } else {
                    // Try parsing as ISO string or other format
                    const parsedDate = new Date(deadline.due_date);
                    if (!isNaN(parsedDate.getTime())) {
                        // Extract local date components to avoid timezone shift
                        const year = parsedDate.getFullYear();
                        const month = parsedDate.getMonth();
                        const day = parsedDate.getDate();
                        dueDate = new Date(year, month, day); // Create as local date
                    } else {
                        console.warn(`[CalendarSync] Invalid deadline date string for case ${caseId}: ${deadline.due_date}`);
                        return null;
                    }
                }
            } else {
                console.warn(`[CalendarSync] Invalid deadline date type for case ${caseId}: ${typeof deadline.due_date}`);
                return null;
            }

            // Validate the date
            if (isNaN(dueDate.getTime())) {
                console.warn(`[CalendarSync] Invalid deadline date for case ${caseId}: ${deadline.due_date}`);
                return null;
            }

            // Format date as YYYY-MM-DD for all-day event (avoids timezone issues)
            // Since deadlines are dates, not specific times, use all-day events
            // Use local date methods to get the correct date
            const year = dueDate.getFullYear();
            const month = String(dueDate.getMonth() + 1).padStart(2, '0');
            const day = String(dueDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            console.log(`[CalendarSync] MCD Deadline: "${deadline.title}" - Original: ${deadline.due_date}, Formatted: ${dateStr}`);

            return {
                title: `Deadline: ${deadline.title}`,
                description: `Case: ${caseName || caseId}\nOwner: ${deadline.owner || 'Unassigned'}`,
                start: dateStr, // YYYY-MM-DD format for all-day event
                end: dateStr, // Same date for all-day event
                location: '',
                allDay: true, // Use all-day event to avoid timezone issues
                caseId: caseId,
                caseName: caseName || caseId,
                source: 'mcd',
                deadlineId: deadline._id?.toString() || deadline.title,
            };
        })
        .filter((event) => event !== null); // Remove null entries
}

/**
 * Convert Dashboard Template data to calendar events
 */
function convertDashboardTemplateToEvents(template) {
    const events = [];
    const caseId = template.case_id;
    const caseName = template.client || template.sidebar_case?.name || caseId;

    console.log(`[CalendarSync] Converting template to events for case ${caseId}:`, {
        hearing: template.hearing,
        important_dates: template.important_dates?.length || 0,
        deadlines: template.deadlines?.length || 0,
    });

    // Convert hearing date
    if (template.hearing && template.hearing.toLowerCase() !== 'none') {
        try {
            let hearingDate;
            // Check if it's in YYYY-MM-DD format
            if (/^\d{4}-\d{2}-\d{2}$/.test(template.hearing)) {
                // Parse YYYY-MM-DD as local date to avoid timezone issues
                const [year, month, day] = template.hearing.split('-').map(Number);
                hearingDate = new Date(year, month - 1, day);
                // Validate the parsed date
                if (hearingDate.getFullYear() !== year || hearingDate.getMonth() !== month - 1 || hearingDate.getDate() !== day) {
                    console.warn(`[CalendarSync] Invalid hearing date for case ${caseId}: ${template.hearing}`);
                    return;
                }
            } else {
                // Try parsing as other format
                hearingDate = new Date(template.hearing);
                if (Number.isNaN(hearingDate.getTime())) {
                    console.warn(`[CalendarSync] Invalid hearing date for case ${caseId}: ${template.hearing}`);
                    return;
                }
            }

            if (!Number.isNaN(hearingDate.getTime())) {
                // For hearings, use timed events with local timezone
                hearingDate.setHours(9, 0, 0, 0); // Default to 9 AM in local timezone
                const endDate = new Date(hearingDate);
                endDate.setHours(10, 30, 0, 0); // 1.5 hours for hearing

                // Store ISO strings - Google Calendar API will handle timezone conversion
                // The date/time is already set in local timezone, so we preserve it
                const startStr = hearingDate.toISOString();
                const endStr = endDate.toISOString();

                console.log(`[CalendarSync] Creating hearing event for ${caseId} on ${hearingDate.toLocaleDateString()} at ${hearingDate.toLocaleTimeString()}`);

                events.push({
                    title: `Hearing: ${caseName}`,
                    description: `Case: ${caseName}\nStage: ${template.stage || 'N/A'}\nAttorney: ${template.attorney || 'N/A'}`,
                    start: startStr,
                    end: endStr,
                    location: '',
                    allDay: false,
                    caseId: caseId,
                    caseName: caseName,
                    source: 'dashboard',
                    eventType: 'hearing',
                });
            } else {
                console.warn(`[CalendarSync] Invalid hearing date for case ${caseId}: ${template.hearing}`);
            }
        } catch (error) {
            console.error(`[CalendarSync] Error parsing hearing date for case ${caseId}:`, error);
        }
    } else {
        console.log(`[CalendarSync] No hearing date for case ${caseId} (hearing: ${template.hearing})`);
    }

    // Convert important dates
    if (Array.isArray(template.important_dates) && template.important_dates.length > 0) {
        console.log(`[CalendarSync] Processing ${template.important_dates.length} important date(s) for case ${caseId}`);
        template.important_dates.forEach((importantDate, index) => {
            if (importantDate.date && importantDate.title) {
                try {
                    let eventDate;
                    // Check if it's in YYYY-MM-DD format
                    if (/^\d{4}-\d{2}-\d{2}$/.test(importantDate.date)) {
                        // Parse YYYY-MM-DD as local date to avoid timezone issues
                        const [year, month, day] = importantDate.date.split('-').map(Number);
                        eventDate = new Date(year, month - 1, day);
                        // Validate the parsed date
                        if (eventDate.getFullYear() !== year || eventDate.getMonth() !== month - 1 || eventDate.getDate() !== day) {
                            console.warn(`[CalendarSync] Invalid important date #${index + 1} for case ${caseId}: ${importantDate.date}`);
                            return;
                        }
                    } else {
                        // Try parsing as other format
                        eventDate = new Date(importantDate.date);
                        if (Number.isNaN(eventDate.getTime())) {
                            console.warn(`[CalendarSync] Invalid important date #${index + 1} for case ${caseId}: ${importantDate.date}`);
                            return;
                        }
                    }

                    if (!Number.isNaN(eventDate.getTime())) {
                        // Format as YYYY-MM-DD for all-day event (avoids timezone issues)
                        const year = eventDate.getFullYear();
                        const month = String(eventDate.getMonth() + 1).padStart(2, '0');
                        const day = String(eventDate.getDate()).padStart(2, '0');
                        const dateStr = `${year}-${month}-${day}`;

                        console.log(`[CalendarSync] Creating important date event #${index + 1} for ${caseId}: ${importantDate.title} on ${dateStr}`);

                        events.push({
                            title: importantDate.title,
                            description: `Case: ${caseName}\nImportant date for ${caseId}`,
                            start: dateStr, // YYYY-MM-DD format for all-day event
                            end: dateStr, // Same date for all-day event
                            location: '',
                            allDay: true, // Use all-day event to avoid timezone issues
                            caseId: caseId,
                            caseName: caseName,
                            source: 'dashboard',
                            eventType: 'important_date',
                        });
                    } else {
                        console.warn(`[CalendarSync] Invalid important date #${index + 1} for case ${caseId}: ${importantDate.date}`);
                    }
                } catch (error) {
                    console.error(`[CalendarSync] Error parsing important date #${index + 1} for case ${caseId}:`, error);
                }
            } else {
                console.warn(`[CalendarSync] Important date #${index + 1} for case ${caseId} missing date or title:`, importantDate);
            }
        });
    } else {
        console.log(`[CalendarSync] No important dates for case ${caseId}`);
    }

    // Convert deadlines
    if (Array.isArray(template.deadlines) && template.deadlines.length > 0) {
        console.log(`[CalendarSync] Processing ${template.deadlines.length} deadline(s) for case ${caseId}`);
        template.deadlines.forEach((deadline, index) => {
            console.log(`[CalendarSync] Processing deadline #${index + 1}:`, {
                title: deadline.title,
                due: deadline.due,
                completed: deadline.completed,
                owner: deadline.owner,
                caseId: deadline.caseId,
            });

            // Check if deadline is valid and not completed
            if (!deadline.due) {
                console.warn(`[CalendarSync] Deadline #${index + 1} for case ${caseId} missing 'due' field:`, deadline);
                return;
            }

            if (!deadline.title) {
                console.warn(`[CalendarSync] Deadline #${index + 1} for case ${caseId} missing 'title' field:`, deadline);
                return;
            }

            if (deadline.completed === true) {
                console.log(`[CalendarSync] Skipping completed deadline #${index + 1} for case ${caseId}: ${deadline.title}`);
                return;
            }

            try {
                // Parse the due date - handle both YYYY-MM-DD strings and Date objects
                let dueDate;
                if (typeof deadline.due === 'string') {
                    // Check if it's in YYYY-MM-DD format
                    if (/^\d{4}-\d{2}-\d{2}$/.test(deadline.due)) {
                        // Parse YYYY-MM-DD as local date to avoid timezone issues
                        const [year, month, day] = deadline.due.split('-').map(Number);
                        dueDate = new Date(year, month - 1, day);
                        // Validate the parsed date
                        if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month - 1 || dueDate.getDate() !== day) {
                            console.warn(`[CalendarSync] Invalid YYYY-MM-DD date #${index + 1} for case ${caseId}: "${deadline.due}"`);
                            return;
                        }
                    } else {
                        // Try parsing as other format (DD-MM-YYYY, ISO string, etc.)
                        // Check for DD-MM-YYYY format
                        const ddMMyyyyMatch = deadline.due.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
                        if (ddMMyyyyMatch) {
                            const [, day, month, year] = ddMMyyyyMatch.map(Number);
                            dueDate = new Date(year, month - 1, day);
                            // Validate the parsed date
                            if (dueDate.getFullYear() !== year || dueDate.getMonth() !== month - 1 || dueDate.getDate() !== day) {
                                console.warn(`[CalendarSync] Invalid DD-MM-YYYY date #${index + 1} for case ${caseId}: "${deadline.due}"`);
                                return;
                            }
                        } else {
                            // Try parsing as ISO string or other format
                            dueDate = new Date(deadline.due);
                            // Validate the parsed date
                            if (Number.isNaN(dueDate.getTime())) {
                                console.warn(`[CalendarSync] Invalid deadline date #${index + 1} for case ${caseId}: "${deadline.due}" (parsed as NaN)`);
                                return;
                            }
                        }
                    }
                } else if (deadline.due instanceof Date) {
                    // If it's already a Date object, use it
                    dueDate = new Date(deadline.due);
                    // Validate the date
                    if (Number.isNaN(dueDate.getTime())) {
                        console.warn(`[CalendarSync] Invalid Date object #${index + 1} for case ${caseId}`);
                        return;
                    }
                } else {
                    console.warn(`[CalendarSync] Deadline #${index + 1} for case ${caseId} has invalid 'due' type:`, typeof deadline.due, deadline.due);
                    return;
                }

                // Format date as YYYY-MM-DD for all-day event (avoids timezone issues)
                // Since deadlines are dates, not specific times, use all-day events
                // IMPORTANT: Use local date methods (not UTC) to preserve the correct date
                // If the date was parsed as local (e.g., new Date(2025, 0, 2)), we must use local methods
                const year = dueDate.getFullYear();
                const month = String(dueDate.getMonth() + 1).padStart(2, '0');
                const day = String(dueDate.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;

                // Log for debugging
                console.log(`[CalendarSync] Deadline date components - Year: ${year}, Month: ${month}, Day: ${day}, Date string: ${dateStr}`);

                console.log(`[CalendarSync] ✅ Creating deadline event #${index + 1} for ${caseId}: "${deadline.title}" on ${dateStr}`);

                events.push({
                    title: `Deadline: ${deadline.title}`,
                    description: `Case: ${caseName}\nOwner: ${deadline.owner || 'Unassigned'}`,
                    start: dateStr, // YYYY-MM-DD format for all-day event
                    end: dateStr, // Same date for all-day event
                    location: '',
                    allDay: true, // Use all-day event to avoid timezone issues
                    caseId: caseId,
                    caseName: caseName,
                    source: 'dashboard',
                    eventType: 'deadline',
                });
            } catch (error) {
                console.error(`[CalendarSync] ❌ Error parsing deadline #${index + 1} for case ${caseId}:`, error);
                console.error(`[CalendarSync] Deadline data:`, deadline);
            }
        });
    } else {
        if (!template.deadlines) {
            console.log(`[CalendarSync] No deadlines array for case ${caseId} (deadlines is ${typeof template.deadlines})`);
        } else {
            console.log(`[CalendarSync] Empty deadlines array for case ${caseId}`);
        }
    }

    console.log(`[CalendarSync] Total events created for case ${caseId}: ${events.length}`);
    return events;
}

/**
 * Sync events to Google Calendar
 */
async function syncEventsToGoogleCalendar(userId, events) {
    if (!events || events.length === 0) {
        console.log(`[CalendarSync] No events to sync for user ${userId}`);
        return { success: true, created: 0, errors: [] };
    }

    try {
        // Ensure userId is a string
        const userIdStr = userId.toString();
        console.log(`[CalendarSync] Attempting to sync ${events.length} event(s) to Google Calendar for user ${userIdStr}`);

        // Check if user has Google Calendar connected
        const tokenDoc = await GoogleCalendarToken.findOne({ userId: userIdStr });
        if (!tokenDoc) {
            console.warn(`[CalendarSync] ⚠️ User ${userIdStr} does not have Google Calendar token document. Calendar not connected.`);
            return { success: false, created: 0, skipped: true, message: 'Google Calendar not connected - no token found' };
        }

        const accessToken = tokenDoc.getAccessToken();
        if (!accessToken) {
            console.warn(`[CalendarSync] ⚠️ User ${userIdStr} has token document but no valid access token. Calendar not connected.`);
            return { success: false, created: 0, skipped: true, message: 'Google Calendar not connected - invalid token' };
        }

        console.log(`[CalendarSync] ✅ User ${userIdStr} has Google Calendar connected. Proceeding with sync.`);

        const calendar = await getCalendarClient(userIdStr);
        const results = { success: true, created: 0, skipped: 0, errors: [] };

        // Get existing events for the date range to check for duplicates
        // Handle both all-day events (YYYY-MM-DD) and timed events (ISO strings)
        const eventTimes = events.map(e => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.start)) {
                // All-day event - parse as local date to avoid timezone shift
                const [year, month, day] = e.start.split('-').map(Number);
                return new Date(year, month - 1, day).getTime();
            } else {
                return new Date(e.start).getTime();
            }
        });
        const startDate = new Date(Math.min(...eventTimes));
        const endDate = new Date(Math.max(...eventTimes));
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        let existingEvents = [];
        try {
            const existingEventsResponse = await calendar.events.list({
                calendarId: 'primary',
                timeMin: startDate.toISOString(),
                timeMax: endDate.toISOString(),
                maxResults: 250,
            });
            existingEvents = existingEventsResponse.data.items || [];
        } catch (error) {
            console.warn('[CalendarSync] Could not fetch existing events for deduplication:', error.message);
        }

        // Create events in Google Calendar
        for (const event of events) {
            try {
                // Check for duplicate events (same title and same date)
                // Handle both all-day events (YYYY-MM-DD) and timed events
                let eventStartDateStr;
                if (event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(event.start)) {
                    // All-day event - date is already in YYYY-MM-DD format
                    eventStartDateStr = event.start;
                } else {
                    // Timed event - extract date using local methods to avoid timezone shift
                    const eventStartDate = new Date(event.start);
                    // Use local date methods, not UTC, to preserve the correct date
                    const year = eventStartDate.getFullYear();
                    const month = String(eventStartDate.getMonth() + 1).padStart(2, '0');
                    const day = String(eventStartDate.getDate()).padStart(2, '0');
                    eventStartDateStr = `${year}-${month}-${day}`;
                }

                const isDuplicate = existingEvents.some((existing) => {
                    const existingStart = existing.start?.dateTime || existing.start?.date;
                    if (!existingStart) return false;
                    let existingDateStr;
                    if (typeof existingStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(existingStart)) {
                        // All-day event
                        existingDateStr = existingStart;
                    } else {
                        // Timed event - use local date methods to avoid timezone shift
                        const existingDate = new Date(existingStart);
                        const year = existingDate.getFullYear();
                        const month = String(existingDate.getMonth() + 1).padStart(2, '0');
                        const day = String(existingDate.getDate()).padStart(2, '0');
                        existingDateStr = `${year}-${month}-${day}`;
                    }
                    return existing.summary === event.title && existingDateStr === eventStartDateStr;
                });

                if (isDuplicate) {
                    console.log(`[CalendarSync] Skipping duplicate event: ${event.title} on ${eventStartDateStr}`);
                    results.skipped++;
                    continue;
                }

                const googleEvent = {
                    summary: event.title,
                    description: event.description || '',
                    location: event.location || '',
                };

                // Handle all-day events vs timed events
                if (event.allDay || /^\d{4}-\d{2}-\d{2}$/.test(event.start)) {
                    // All-day event - use date field (YYYY-MM-DD format)
                    // The date string is already in YYYY-MM-DD format, use it directly
                    googleEvent.start = { date: event.start };
                    // For all-day events, end date should be the day after (exclusive)
                    // IMPORTANT: Parse as local date to avoid timezone shift
                    const [year, month, day] = event.start.split('-').map(Number);
                    const endDate = new Date(year, month - 1, day + 1); // Add 1 day in local timezone
                    const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
                    googleEvent.end = { date: endDateStr };

                    console.log(`[CalendarSync] 📅 Creating all-day event "${event.title}": start=${event.start}, end=${endDateStr}`);
                } else {
                    // Timed event - use dateTime with proper timezone
                    // The ISO string represents UTC time, but we need to tell Google Calendar
                    // what timezone the event should be displayed in
                    const startDate = new Date(event.start);
                    const endDate = new Date(event.end);

                    // Get the server's local timezone
                    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

                    // Google Calendar API expects RFC3339 format with timezone
                    // Since we stored the date in local time, we need to format it correctly
                    // Format: YYYY-MM-DDTHH:mm:ss (without timezone, Google will use the timeZone field)
                    const formatDateTime = (date) => {
                        const year = date.getUTCFullYear();
                        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                        const day = String(date.getUTCDate()).padStart(2, '0');
                        const hours = String(date.getUTCHours()).padStart(2, '0');
                        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
                        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
                    };

                    googleEvent.start = {
                        dateTime: formatDateTime(startDate),
                        timeZone: timeZone,
                    };
                    googleEvent.end = {
                        dateTime: formatDateTime(endDate),
                        timeZone: timeZone,
                    };
                }

                const response = await calendar.events.insert({
                    calendarId: 'primary',
                    requestBody: googleEvent,
                });

                console.log(`[CalendarSync] ✅ Created Google Calendar event: ${response.data.id} - ${event.title}`);
                results.created++;

                // Add to existing events list to prevent duplicates in same batch
                existingEvents.push({
                    summary: event.title,
                    start: { dateTime: event.start },
                });
            } catch (error) {
                console.error(`[CalendarSync] ❌ Error creating event "${event.title}":`, error);
                results.errors.push({
                    event: event.title,
                    error: error.message,
                });
            }
        }

        // Update last sync time only if we created at least one event
        if (results.created > 0) {
            await GoogleCalendarToken.findOneAndUpdate(
                { userId: userIdStr },
                { lastSyncAt: new Date() }
            );
            console.log(`[CalendarSync] ✅ Updated last sync time for user ${userIdStr}`);
        }

        return results;
    } catch (error) {
        console.error('[CalendarSync] Error syncing to Google Calendar:', error);
        return {
            success: false,
            created: 0,
            errors: [{ error: error.message }],
        };
    }
}

/**
 * Sync MCD to calendar
 */
export async function syncMCDToCalendar(userId, mcd) {
    try {
        console.log(`[CalendarSync] Syncing MCD ${mcd.case_id} to calendar for user ${userId}`);
        console.log(`[CalendarSync] MCD deadlines debug:`, mcd.deadlines?.map(d => ({
            title: d.title,
            due_date: d.due_date,
            due_date_type: typeof d.due_date,
            due_date_instance: d.due_date instanceof Date,
            due_date_iso: d.due_date instanceof Date ? d.due_date.toISOString() : d.due_date,
            due_date_utc: d.due_date instanceof Date ? `${d.due_date.getUTCFullYear()}-${String(d.due_date.getUTCMonth() + 1).padStart(2, '0')}-${String(d.due_date.getUTCDate()).padStart(2, '0')}` : 'N/A',
        })));

        const caseName = mcd.parties?.plaintiff || mcd.parties?.defendant || mcd.case_id;
        const events = [];

        // 1. Convert deadlines to events
        const deadlineEvents = convertDeadlinesToEvents(mcd.deadlines || [], mcd.case_id, caseName);
        events.push(...deadlineEvents);
        console.log(`[CalendarSync] Converted ${deadlineEvents.length} deadline(s) to calendar events`);

        // 2. Convert CPNU actuaciones to events (if they exist)
        // IMPORTANT: When creating a case, only create calendar event for the LATEST actuación
        // This prevents calendar clutter and focuses on the most recent action
        // Note: Auto-sync (daily sync) will create events for all new actuaciones separately
        if (mcd.cpnu_actuaciones && Array.isArray(mcd.cpnu_actuaciones) && mcd.cpnu_actuaciones.length > 0) {
            console.log(`[CalendarSync] Found ${mcd.cpnu_actuaciones.length} CPNU actuaciones for case ${mcd.case_id}`);
            // Only take the latest (first) actuación when creating a case
            // Actuaciones are already sorted by newest first (based on fecha_registro)
            const latestActuacion = mcd.cpnu_actuaciones[0];
            const cpnuEvents = convertCPNUActuacionesToEvents([latestActuacion], mcd.case_id, caseName);
            if (cpnuEvents.length > 0) {
                events.push(...cpnuEvents);
                console.log(`[CalendarSync] Created 1 calendar event from latest CPNU actuacion (only latest when creating case): "${latestActuacion.descripcion || 'N/A'}" on ${cpnuEvents[0].start}`);
            } else {
                console.log(`[CalendarSync] Latest actuacion could not be converted to calendar event for case ${mcd.case_id}`);
            }
        } else {
            console.log(`[CalendarSync] No CPNU actuaciones found for case ${mcd.case_id}`);
        }

        if (events.length === 0) {
            console.log(`[CalendarSync] No events to sync for MCD ${mcd.case_id}`);
            return { success: true, created: 0, message: 'No events to sync' };
        }

        console.log(`[CalendarSync] Total events to sync for MCD ${mcd.case_id}: ${events.length} (${deadlineEvents.length} deadlines + ${events.length - deadlineEvents.length} CPNU actuaciones)`);

        const result = await syncEventsToGoogleCalendar(userId, events);
        console.log(`[CalendarSync] MCD ${mcd.case_id} sync result:`, result);

        return result;
    } catch (error) {
        console.error('[CalendarSync] Error syncing MCD to calendar:', error);
        return {
            success: false,
            created: 0,
            error: error.message,
        };
    }
}

/**
 * Sync Dashboard Template to calendar
 */
export async function syncDashboardTemplateToCalendar(userId, template) {
    try {
        // Ensure userId is a string
        const userIdStr = userId.toString();
        console.log(`[CalendarSync] Syncing Dashboard Template ${template.case_id} to calendar for user ${userIdStr}`);
        console.log(`[CalendarSync] Template data:`, {
            case_id: template.case_id,
            hearing: template.hearing,
            important_dates_count: template.important_dates?.length || 0,
            deadlines_count: template.deadlines?.length || 0,
        });

        const events = convertDashboardTemplateToEvents(template);
        console.log(`[CalendarSync] Converted ${events.length} event(s) from template ${template.case_id}:`,
            events.map(e => ({ title: e.title, start: e.start, type: e.eventType })));

        if (events.length === 0) {
            console.log(`[CalendarSync] ⚠️ No events to sync for template ${template.case_id} - check if hearing, important_dates, or deadlines are provided`);
            return { success: true, created: 0, message: 'No events to sync' };
        }

        const result = await syncEventsToGoogleCalendar(userIdStr, events);
        console.log(`[CalendarSync] ✅ Dashboard Template ${template.case_id} sync result:`, {
            success: result.success,
            created: result.created,
            skipped: result.skipped,
            errors: result.errors?.length || 0,
        });

        return result;
    } catch (error) {
        console.error('[CalendarSync] ❌ Error syncing Dashboard Template to calendar:', error);
        console.error('[CalendarSync] Error stack:', error.stack);
        return {
            success: false,
            created: 0,
            error: error.message,
        };
    }
}

/**
 * Convert CPNU Actuaciones to calendar events
 * Creates events from fecha_actuacion (e.g., "2025-12-16") for WhatsApp notifications
 * Includes past dates for complete case history
 */
function convertCPNUActuacionesToEvents(actuaciones, caseId, caseName) {
    if (!Array.isArray(actuaciones) || actuaciones.length === 0) {
        return [];
    }

    return actuaciones
        .filter((actuacion) => {
            // Prioritize fecha_actuacion, fallback to fecha_registro if needed
            // Must have at least one date field and descripcion
            return (actuacion.fecha_actuacion || actuacion.fecha_registro) && actuacion.descripcion;
        })
        .map((actuacion) => {
            try {
                // Use fecha_actuacion for calendar event date (e.g., "2025-12-16")
                // Fallback to fecha_registro if fecha_actuacion is not available
                const dateToUse = actuacion.fecha_actuacion || actuacion.fecha_registro;
                const dateSource = actuacion.fecha_actuacion ? 'fecha_actuacion' : 'fecha_registro';

                let eventDate;
                const dateStr = dateToUse.toString().trim();

                // Check if it's in YYYY-MM-DD format
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    const [year, month, day] = dateStr.split('-').map(Number);
                    eventDate = new Date(year, month - 1, day);
                } else if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(dateStr)) {
                    // Handle DD/MM/YYYY or DD-MM-YYYY format
                    const parts = dateStr.split(/[\/\-\.]/);
                    if (parts.length === 3) {
                        let day, month, year;
                        if (parts[2].length === 4) {
                            // DD/MM/YYYY format
                            day = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10) - 1;
                            year = parseInt(parts[2], 10);
                        } else {
                            // DD/MM/YY format
                            day = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10) - 1;
                            year = 2000 + parseInt(parts[2], 10);
                        }
                        eventDate = new Date(year, month, day);
                    } else {
                        eventDate = new Date(dateStr);
                    }
                } else {
                    // Try parsing as other format
                    eventDate = new Date(dateStr);
                }

                // Validate the date (including past dates - allow them for historical records)
                if (isNaN(eventDate.getTime())) {
                    console.warn(`[CalendarSync] Invalid date for case ${caseId} (${dateSource}): ${dateStr}`);
                    return null;
                }

                // Format as YYYY-MM-DD for all-day event (works for past, present, and future dates)
                const year = eventDate.getFullYear();
                const month = String(eventDate.getMonth() + 1).padStart(2, '0');
                const day = String(eventDate.getDate()).padStart(2, '0');
                const formattedDate = `${year}-${month}-${day}`;

                // Check if date is in the past for logging purposes only (still create the event)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const eventDateOnly = new Date(year, month - 1, day);
                eventDateOnly.setHours(0, 0, 0, 0);
                const isPastDate = eventDateOnly < today;
                const dateType = isPastDate ? 'PAST' : 'FUTURE/PRESENT';

                console.log(`[CalendarSync] Creating CPNU Actuacion event for case ${caseId}: "${actuacion.descripcion}" on ${formattedDate} (${dateType}, from ${dateSource})`);

                return {
                    title: `CPNU: ${actuacion.descripcion}`,
                    description: `Case: ${caseName || caseId}\nActuacion from CPNU\nFecha de actuación: ${actuacion.fecha_actuacion || 'N/A'}\nFecha de registro: ${actuacion.fecha_registro || 'N/A'}`,
                    start: formattedDate, // YYYY-MM-DD format for all-day event (past/present/future)
                    end: formattedDate, // Same date for all-day event
                    location: '',
                    allDay: true, // Use all-day event to avoid timezone issues
                    caseId: caseId,
                    caseName: caseName || caseId,
                    source: 'cpnu',
                    eventType: 'cpnu_actuacion',
                    fechaActuacion: actuacion.fecha_actuacion || null,
                    fechaRegistro: actuacion.fecha_registro || null,
                };
            } catch (error) {
                console.error(`[CalendarSync] Error parsing actuacion for case ${caseId}:`, error);
                return null;
            }
        })
        .filter((event) => event !== null); // Remove null entries
}

/**
 * Sync CPNU Actuaciones to calendar
 * Creates calendar events from fecha_actuacion (e.g., "2025-12-16") for WhatsApp notifications
 * Includes past dates for complete case history
 */
export async function syncCPNUActuacionesToCalendar(userId, caseId, caseName, actuaciones) {
    try {
        const userIdStr = userId.toString();
        console.log(`[CalendarSync] Syncing CPNU Actuaciones for case ${caseId} to calendar for user ${userIdStr}`);

        const events = convertCPNUActuacionesToEvents(actuaciones, caseId, caseName);

        if (events.length === 0) {
            console.log(`[CalendarSync] No CPNU events to sync for case ${caseId}`);
            return { success: true, created: 0, message: 'No events to sync' };
        }

        const result = await syncEventsToGoogleCalendar(userIdStr, events);
        console.log(`[CalendarSync] ✅ CPNU Actuaciones sync result for case ${caseId}:`, {
            success: result.success,
            created: result.created,
            skipped: result.skipped,
            errors: result.errors?.length || 0,
        });

        return result;
    } catch (error) {
        console.error('[CalendarSync] ❌ Error syncing CPNU Actuaciones to calendar:', error);
        return {
            success: false,
            created: 0,
            error: error.message,
        };
    }
}
