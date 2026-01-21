import mongoose from 'mongoose';

/**
 * Calendar Event Notification Model
 * Tracks WhatsApp notifications sent for calendar events
 */
const calendarEventNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    calendarEventId: {
      type: String,
      required: true,
      index: true,
      comment: 'Google Calendar event ID',
    },
    eventTitle: {
      type: String,
      required: true,
    },
    eventStart: {
      type: Date,
      required: true,
      index: true,
    },
    notificationType: {
      type: String,
      enum: ['24h', '10min'],
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    messageId: {
      type: String,
      comment: 'WhatsApp message ID from provider API (Meta or Twilio)',
    },
    provider: {
      type: String,
      enum: ['meta', 'twilio'],
      default: () => process.env.TWILIO_WHATSAPP_ENABLED === 'true' ? 'twilio' : 'meta',
      comment: 'WhatsApp provider used to send notification',
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
      default: true,
    },
    error: {
      type: String,
      comment: 'Error message if notification failed',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'calendar_event_notifications',
  }
);

// Compound index to prevent duplicate notifications
// Same event, same notification type should only be sent once
calendarEventNotificationSchema.index(
  { userId: 1, calendarEventId: 1, notificationType: 1 },
  { unique: true }
);

// Index for querying upcoming notifications
calendarEventNotificationSchema.index({ userId: 1, eventStart: 1, notificationType: 1 });

const CalendarEventNotification =
  mongoose.models.CalendarEventNotification ||
  mongoose.model('CalendarEventNotification', calendarEventNotificationSchema);

export default CalendarEventNotification;

