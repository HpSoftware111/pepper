/**
 * Calendar Notification Service
 * Sends WhatsApp notifications for calendar events:
 * - 24 hours before the event
 * - 10 minutes before the event
 */

import { getCalendarClient } from '../controllers/calendarController.js';
import GoogleCalendarToken from '../models/GoogleCalendarToken.js';
import User from '../models/User.js';
import CalendarEventNotification from '../models/CalendarEventNotification.js';
import { trackResourceUsage } from './resourceTrackingService.js';

// Dynamic provider selection based on feature flag
// Supports both Meta WhatsApp and Twilio WhatsApp
import { 
  sendWhatsAppMessage as sendMetaWhatsApp, 
  formatCalendarNotificationMessage as formatMetaMessage,
  sendWhatsAppTemplateMessage as sendMetaWhatsAppTemplate 
} from './whatsappService.js';
import { sendWhatsAppMessage as sendTwilioWhatsApp, formatCalendarNotificationMessage as formatTwilioMessage } from './twilioWhatsAppService.js';

// Determine which provider to use
const TWILIO_ENABLED = process.env.TWILIO_WHATSAPP_ENABLED === 'true';

// Select provider functions
const sendWhatsAppMessage = TWILIO_ENABLED ? sendTwilioWhatsApp : sendMetaWhatsApp;
const formatCalendarNotificationMessage = TWILIO_ENABLED ? formatTwilioMessage : formatMetaMessage;

// Log provider selection on module load
if (TWILIO_ENABLED) {
  console.log('[CalendarNotification] ✅ Using Twilio WhatsApp service');
} else {
  console.log('[CalendarNotification] ✅ Using Meta WhatsApp service');
}

/**
 * Check if notification was already sent for an event
 * @param {string} userId - User ID
 * @param {string} calendarEventId - Google Calendar event ID
 * @param {string} notificationType - '24h' or '10min'
 * @returns {Promise<boolean>}
 */
async function wasNotificationSent(userId, calendarEventId, notificationType) {
  const existing = await CalendarEventNotification.findOne({
    userId,
    calendarEventId,
    notificationType,
    success: true,
  });
  return !!existing;
}

/**
 * Record notification in database
 * @param {Object} params - Notification parameters
 * @returns {Promise<CalendarEventNotification>}
 */
async function recordNotification({
  userId,
  calendarEventId,
  eventTitle,
  eventStart,
  notificationType,
  phoneNumber,
  messageId,
  success,
  error,
}) {
  try {
    // Determine provider based on feature flag
    const provider = TWILIO_ENABLED ? 'twilio' : 'meta';

    // Use findOneAndUpdate with upsert to prevent duplicate key errors
    const notification = await CalendarEventNotification.findOneAndUpdate(
      {
      userId,
      calendarEventId,
        notificationType,
      },
      {
        $set: {
      eventTitle,
          eventStart: new Date(eventStart),
      phoneNumber,
      messageId,
      success,
      error,
          provider,
          sentAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return notification;
  } catch (error) {
    console.error(`[CalendarNotification] Error recording notification:`, error);
    // Don't throw - allow processing to continue even if recording fails
      return null;
  }
}

/**
 * Get upcoming calendar events for a user
 * @param {string} userId - User ID
 * @param {Date} startTime - Start time for query
 * @param {Date} endTime - End time for query
 * @returns {Promise<Array>} Array of calendar events
 */
async function getUpcomingEvents(userId, startTime, endTime) {
  try {
    const calendar = await getCalendarClient(userId);
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (response.data.items || []).map((event) => ({
      id: event.id,
      title: event.summary || 'No title',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      location: event.location || '',
      allDay: !event.start?.dateTime,
      htmlLink: event.htmlLink,
    }));
  } catch (error) {
    console.error(`[CalendarNotification] Error fetching events for user ${userId}:`, error);
    return [];
  }
}

/**
 * Send notification for a calendar event
 * @param {Object} params - Notification parameters
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendEventNotification({ userId, event, notificationType, phoneNumber }) {
  try {
    // Check if notification was already sent
    const alreadySent = await wasNotificationSent(userId, event.id, notificationType);
    if (alreadySent) {
      console.log(
        `[CalendarNotification] ⏭️  Skipping ${notificationType} notification for event ${event.id} - already sent`
      );
      return { success: true, skipped: true };
    }

    // IMPORTANT: Use template messages for calendar notifications
    // Template messages work outside the 24-hour window and comply with WhatsApp policies
    console.log(`[CalendarNotification] 📝 Preparing ${notificationType} notification:`, {
      eventTitle: event.title,
      eventDate: event.start,
      eventLocation: event.location || 'No especificada',
    });

    // Send WhatsApp message
    // For Meta WhatsApp, use template messages (required for calendar reminders)
    // For Twilio, use text messages (if Twilio supports templates, update this)
    let result;
    if (TWILIO_ENABLED) {
      // Twilio: Use text message (update if Twilio template support is added)
      const message = formatCalendarNotificationMessage(event, notificationType);
      console.log(`[CalendarNotification] 📤 Attempting to send ${notificationType} notification via Twilio WhatsApp...`);
      result = await sendWhatsAppMessage(phoneNumber, message);
    } else {
      // Meta WhatsApp: Use template messages (required for calendar reminders)
      console.log(`[CalendarNotification] 📤 Attempting to send ${notificationType} notification via Meta WhatsApp template...`);
      result = await sendMetaWhatsAppTemplate(phoneNumber, event, notificationType);
    }

    // Record notification (even if sending failed, so we don't retry indefinitely)
    try {
    await recordNotification({
      userId,
      calendarEventId: event.id,
      eventTitle: event.title,
      eventStart: new Date(event.start),
      notificationType,
      phoneNumber,
      messageId: result.messageId,
      success: result.success,
      error: result.error,
    });
    } catch (recordError) {
      console.error(`[CalendarNotification] ⚠️  Failed to record notification (non-fatal):`, recordError);
      // Continue even if recording fails
    }

    if (result.success) {
      console.log(
        `[CalendarNotification] ✅ Sent ${notificationType} notification for event "${event.title}" to ${phoneNumber}`
      );

      // Track WhatsApp message usage
      if (userId && result.success) {
        trackResourceUsage(userId, 'whatsappMessages', 1, {
          messageType: TWILIO_ENABLED ? 'text' : 'template',
          phoneNumber: phoneNumber.replace(/(\+\d{1,3})\d+(\d{4})/, '$1****$2'), // Masked
        }).catch((err) => {
          console.error('[CalendarNotification] Error tracking WhatsApp usage:', err);
          // Don't fail if tracking fails
        });
      }
    } else {
      console.error(
        `[CalendarNotification] ❌ Failed to send ${notificationType} notification for event "${event.title}": ${result.error}`
      );
    }

    return result;
  } catch (error) {
    console.error(`[CalendarNotification] ❌ Error sending notification:`, error);
    console.error(`[CalendarNotification] Error stack:`, error.stack);
    // Record the failure so we don't retry indefinitely
    try {
      await recordNotification({
        userId,
        calendarEventId: event.id,
        eventTitle: event.title,
        eventStart: new Date(event.start),
        notificationType,
        phoneNumber,
        messageId: null,
        success: false,
        error: error.message,
      });
    } catch (recordError) {
      console.error(`[CalendarNotification] ⚠️  Failed to record error notification (non-fatal):`, recordError);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Process notifications for all users with connected calendars
 * Checks for events that need 24h or 10min notifications
 */
export async function processCalendarNotifications() {
  console.log('\n[CalendarNotification] 🔔 Starting calendar notification processing...');
  console.log(`[CalendarNotification] 📱 WhatsApp Provider: ${TWILIO_ENABLED ? 'Twilio' : 'Meta'}`);
  console.log(`[CalendarNotification] 🔧 TWILIO_WHATSAPP_ENABLED: ${process.env.TWILIO_WHATSAPP_ENABLED || 'not set'}`);
  
  // Log Meta WhatsApp configuration status (if using Meta)
  if (!TWILIO_ENABLED) {
    const hasAccessToken = !!process.env.WHATSAPP_ACCESS_TOKEN;
    const hasPhoneNumberId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
    console.log(`[CalendarNotification] 📋 Meta WhatsApp Config:`, {
      accessToken: hasAccessToken ? '✅ Set' : '❌ Missing',
      phoneNumberId: hasPhoneNumberId ? '✅ Set' : '❌ Missing',
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0 (default)',
    });
    if (!hasAccessToken || !hasPhoneNumberId) {
      console.warn(`[CalendarNotification] ⚠️  Meta WhatsApp not fully configured. Notifications may fail.`);
    }
  }

  try {
    // Get all users with connected Google Calendar
    const usersWithCalendar = await GoogleCalendarToken.find({
      syncEnabled: true,
    });

    if (usersWithCalendar.length === 0) {
      console.log('[CalendarNotification] ⚠️  No users with connected calendars found');
      console.log('[CalendarNotification] 💡 Tip: Users need to connect Google Calendar and enable sync');
      return { processed: 0, sent: 0, errors: 0 };
    }

    console.log(`[CalendarNotification] ✅ Found ${usersWithCalendar.length} user(s) with connected calendars`);

    const now = new Date();
    const results = {
      processed: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };

    for (const tokenDoc of usersWithCalendar) {
      const userId = tokenDoc.userId;
      if (!userId) continue;
      
      // Convert to string if it's an ObjectId
      const userIdStr = userId.toString ? userId.toString() : userId;

      try {
        // Get user details including phone number
        const user = await User.findById(userIdStr);
        if (!user || !user.phone) {
          console.log(`[CalendarNotification] ⚠️  User ${userIdStr} has no phone number, skipping`);
          continue;
        }

        // Validate phone number format
        const phoneNumber = user.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          console.log(
            `[CalendarNotification] ⚠️  User ${userIdStr} has invalid phone number format (must be E.164: +1234567890), skipping`
          );
          continue;
        }

        results.processed++;

        // Calculate time windows for notifications
        // Use wider windows to account for cron interval (default: 5 minutes)
        // This ensures we catch events even if cron runs slightly off schedule

        // 24 hours notification: Query events between 23h 50m and 24h 10m from now
        // This 20-minute window ensures we catch events within ±5 minutes of exactly 24 hours
        const in24HoursStart = new Date(now.getTime() + (24 * 60 - 10) * 60 * 1000); // 23h 50m
        const in24HoursEnd = new Date(now.getTime() + (24 * 60 + 10) * 60 * 1000);   // 24h 10m

        // 10 minutes notification: Query events between 7min and 13min from now
        // This 6-minute window ensures we catch events within ±3 minutes of exactly 10 minutes
        // Increased tolerance to account for 5-minute cron interval
        const in10MinutesStart = new Date(now.getTime() + (10 - 3) * 60 * 1000); // 7 minutes
        const in10MinutesEnd = new Date(now.getTime() + (10 + 3) * 60 * 1000);   // 13 minutes

        // Log time windows for diagnostics
        console.log(`[CalendarNotification] ⏰ Time windows for user ${userIdStr}:`, {
          currentTime: now.toISOString(),
          '24h_window': {
            start: in24HoursStart.toISOString(),
            end: in24HoursEnd.toISOString(),
            duration: '20 minutes',
            target: '24 hours ± 5 minutes',
          },
          '10min_window': {
            start: in10MinutesStart.toISOString(),
            end: in10MinutesEnd.toISOString(),
            duration: '6 minutes',
            target: '10 minutes ± 3 minutes',
          },
        });

        // Get events in the 24h window
        const events24h = await getUpcomingEvents(userIdStr, in24HoursStart, in24HoursEnd);
        // Get events in the 10min window
        const events10min = await getUpcomingEvents(userIdStr, in10MinutesStart, in10MinutesEnd);

        console.log(`[CalendarNotification] 📅 Found ${events24h.length} event(s) in 24h window, ${events10min.length} event(s) in 10min window`);
        
        // Log event details for debugging
        if (events24h.length > 0) {
          console.log(`[CalendarNotification] 📋 24h window events:`, events24h.map(e => ({
            id: e.id,
            title: e.title,
            start: e.start,
            timeUntil: Math.round((new Date(e.start).getTime() - now.getTime()) / (60 * 1000)) + ' minutes',
          })));
        }
        if (events10min.length > 0) {
          console.log(`[CalendarNotification] 📋 10min window events:`, events10min.map(e => ({
            id: e.id,
            title: e.title,
            start: e.start,
            timeUntil: Math.round((new Date(e.start).getTime() - now.getTime()) / (60 * 1000)) + ' minutes',
          })));
        }

        // Process 24h notifications
        for (const event of events24h) {
          const eventStart = new Date(event.start);
          // Only send if event is within 24h ± 5 minutes
          const timeDiff = eventStart.getTime() - now.getTime();
          const hours24 = 24 * 60 * 60 * 1000;
          const diffFrom24h = timeDiff - hours24;
          const diffMinutes = Math.abs(diffFrom24h) / (60 * 1000);

          if (Math.abs(diffFrom24h) <= 5 * 60 * 1000) {
            console.log(`[CalendarNotification] 🎯 Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 24h mark (${diffFrom24h >= 0 ? 'after' : 'before'}) - sending notification`);
            const result = await sendEventNotification({
              userId: userIdStr,
              event,
              notificationType: '24h',
              phoneNumber,
            });
            if (result.success && !result.skipped) {
              results.sent++;
            } else if (result.skipped) {
              results.skipped++;
            } else {
              results.errors++;
            }
          } else {
            console.log(`[CalendarNotification] ⏭️  Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 24h mark - outside tolerance (±5min), skipping`);
          }
        }

        // Process 10min notifications
        for (const event of events10min) {
          const eventStart = new Date(event.start);
          // Only send if event is within 10min ± 3 minutes (increased from ±2 to account for 5min cron interval)
          const timeDiff = eventStart.getTime() - now.getTime();
          const minutes10 = 10 * 60 * 1000;
          const diffFrom10min = timeDiff - minutes10;
          const diffMinutes = Math.abs(diffFrom10min) / (60 * 1000);

          if (Math.abs(diffFrom10min) <= 3 * 60 * 1000) {
            console.log(`[CalendarNotification] 🎯 Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 10min mark (${diffFrom10min >= 0 ? 'after' : 'before'}) - sending notification`);
            const result = await sendEventNotification({
              userId: userIdStr,
              event,
              notificationType: '10min',
              phoneNumber,
            });
            if (result.success && !result.skipped) {
              results.sent++;
            } else if (result.skipped) {
              results.skipped++;
            } else {
              results.errors++;
            }
          } else {
            console.log(`[CalendarNotification] ⏭️  Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 10min mark - outside tolerance (±3min), skipping`);
          }
        }
      } catch (error) {
        console.error(`[CalendarNotification] Error processing user ${userIdStr}:`, error);
        results.errors++;
      }
    }

    console.log(`[CalendarNotification] ✅ Processing complete:`);
    console.log(`   - Processed: ${results.processed} users`);
    console.log(`   - Sent: ${results.sent} notifications`);
    console.log(`   - Skipped: ${results.skipped} (already sent)`);
    console.log(`   - Errors: ${results.errors}`);

    return results;
  } catch (error) {
    console.error('[CalendarNotification] ❌ Error in processCalendarNotifications:', error);
    return { processed: 0, sent: 0, errors: 1 };
  }
}

/**
 * Manually trigger notification check for a specific user
 * Useful for testing
 * @param {string} userId - User ID
 * @returns {Promise<Object>}
 */
export async function processUserNotifications(userId) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.phone) {
      return { success: false, error: 'User not found or no phone number' };
    }

    const phoneNumber = user.phone.trim();
    if (!phoneNumber.startsWith('+')) {
      return { success: false, error: 'Invalid phone number format (must be E.164: +1234567890)' };
    }

    const now = new Date();

    // 24 hours notification: Query events between 23h 50m and 24h 10m from now
    // This 20-minute window ensures we catch events within ±5 minutes of exactly 24 hours
    const in24HoursStart = new Date(now.getTime() + (24 * 60 - 10) * 60 * 1000); // 23h 50m
    const in24HoursEnd = new Date(now.getTime() + (24 * 60 + 10) * 60 * 1000);   // 24h 10m

    // 10 minutes notification: Query events between 7min and 13min from now
    // This 6-minute window ensures we catch events within ±3 minutes of exactly 10 minutes
    // Increased tolerance to account for 5-minute cron interval
    const in10MinutesStart = new Date(now.getTime() + (10 - 3) * 60 * 1000); // 7 minutes
    const in10MinutesEnd = new Date(now.getTime() + (10 + 3) * 60 * 1000);   // 13 minutes

    console.log(`[CalendarNotification] ⏰ Time windows for user ${userId}:`, {
      currentTime: now.toISOString(),
      '24h_window': {
        start: in24HoursStart.toISOString(),
        end: in24HoursEnd.toISOString(),
      },
      '10min_window': {
        start: in10MinutesStart.toISOString(),
        end: in10MinutesEnd.toISOString(),
      },
    });

    const events24h = await getUpcomingEvents(userId, in24HoursStart, in24HoursEnd);
    const events10min = await getUpcomingEvents(userId, in10MinutesStart, in10MinutesEnd);

    console.log(`[CalendarNotification] 📅 Found ${events24h.length} event(s) in 24h window, ${events10min.length} event(s) in 10min window`);

    const results = { sent: 0, skipped: 0, errors: 0 };

    for (const event of events24h) {
      const eventStart = new Date(event.start);
      const timeDiff = eventStart.getTime() - now.getTime();
      const hours24 = 24 * 60 * 60 * 1000;
      const diffFrom24h = timeDiff - hours24;
      const diffMinutes = Math.abs(diffFrom24h) / (60 * 1000);

      if (Math.abs(diffFrom24h) <= 5 * 60 * 1000) {
        console.log(`[CalendarNotification] 🎯 Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 24h mark - sending notification`);
        const result = await sendEventNotification({
          userId,
          event,
          notificationType: '24h',
          phoneNumber,
        });
        if (result.success && !result.skipped) results.sent++;
        else if (result.skipped) results.skipped++;
        else results.errors++;
      } else {
        console.log(`[CalendarNotification] ⏭️  Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 24h mark - outside tolerance (±5min), skipping`);
      }
    }

    for (const event of events10min) {
      const eventStart = new Date(event.start);
      // Only send if event is within 10min ± 3 minutes (increased from ±2 to account for 5min cron interval)
      const timeDiff = eventStart.getTime() - now.getTime();
      const minutes10 = 10 * 60 * 1000;
      const diffFrom10min = timeDiff - minutes10;
      const diffMinutes = Math.abs(diffFrom10min) / (60 * 1000);

      if (Math.abs(diffFrom10min) <= 3 * 60 * 1000) {
        console.log(`[CalendarNotification] 🎯 Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 10min mark - sending notification`);
        const result = await sendEventNotification({
          userId,
          event,
          notificationType: '10min',
          phoneNumber,
        });
        if (result.success && !result.skipped) results.sent++;
        else if (result.skipped) results.skipped++;
        else results.errors++;
      } else {
        console.log(`[CalendarNotification] ⏭️  Event "${event.title}" is ${diffMinutes.toFixed(1)} minutes from 10min mark - outside tolerance (±3min), skipping`);
      }
    }

    return { success: true, ...results };
  } catch (error) {
    console.error(`[CalendarNotification] Error processing notifications for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

