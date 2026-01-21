/**
 * Calendar Notification Controller
 * Handles manual triggers and status checks for calendar notifications
 */

import { processUserNotifications, processCalendarNotifications } from '../services/calendarNotificationService.js';
import CalendarEventNotification from '../models/CalendarEventNotification.js';

/**
 * Manually trigger notification check for authenticated user
 * POST /api/calendar-notifications/trigger
 */
export async function triggerUserNotifications(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log(`[CalendarNotification] Manual trigger requested by user ${userId}`);

    const result = await processUserNotifications(userId);

    if (result.success) {
      return res.json({
        success: true,
        message: 'Notification check completed',
        results: {
          sent: result.sent,
          skipped: result.skipped,
          errors: result.errors,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to process notifications',
      });
    }
  } catch (error) {
    console.error('[CalendarNotification] Error in triggerUserNotifications:', error);
    return res.status(500).json({ error: 'Failed to trigger notifications' });
  }
}

/**
 * Get notification history for authenticated user
 * GET /api/calendar-notifications/history
 */
export async function getNotificationHistory(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { limit = 50, notificationType, success } = req.query;

    const query = { userId };

    if (notificationType) {
      query.notificationType = notificationType;
    }

    if (success !== undefined) {
      query.success = success === 'true';
    }

    const notifications = await CalendarEventNotification.find(query)
      .sort({ sentAt: -1 })
      .limit(parseInt(limit, 10))
      .lean();

    const transformed = notifications.map((notif) => ({
      id: notif._id.toString(),
      calendarEventId: notif.calendarEventId,
      eventTitle: notif.eventTitle,
      eventStart: notif.eventStart,
      notificationType: notif.notificationType,
      phoneNumber: notif.phoneNumber.replace(/(\+\d{1,3})\d+(\d{4})/, '$1****$2'), // Mask phone number
      messageId: notif.messageId,
      sentAt: notif.sentAt,
      success: notif.success,
      error: notif.error,
      _id: undefined,
    }));

    return res.json({ notifications: transformed });
  } catch (error) {
    console.error('[CalendarNotification] Error fetching notification history:', error);
    return res.status(500).json({ error: 'Failed to fetch notification history' });
  }
}

/**
 * Admin endpoint: Manually trigger notification check for all users
 * POST /api/calendar-notifications/trigger-all
 * Requires admin authentication (handled by requireAdmin middleware)
 */
export async function triggerAllNotifications(req, res) {
  try {

    console.log('[CalendarNotification] Manual trigger-all requested by admin');

    const result = await processCalendarNotifications();

    return res.json({
      success: true,
      message: 'Notification check completed for all users',
      results: {
        processed: result.processed,
        sent: result.sent,
        skipped: result.skipped,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('[CalendarNotification] Error in triggerAllNotifications:', error);
    return res.status(500).json({ error: 'Failed to trigger notifications' });
  }
}

