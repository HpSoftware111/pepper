import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import authRoutes from './routes/authRoutes.js';
import adminUserRoutes from './routes/adminUserRoutes.js';
import adminBillingRoutes from './routes/adminBillingRoutes.js';
import adminResourceRoutes from './routes/adminResourceRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import speechRoutes from './routes/speechRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import extractedTextRoutes from './routes/extractedTextRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import mcdRoutes from './routes/mcdRoutes.js';
import dashboardAgentRoutes from './routes/dashboardAgentRoutes.js';
import reminderRoutes from './routes/reminderRoutes.js';
import caseFilesRoutes from './routes/caseFilesRoutes.js';
import caseCleanupRoutes from './routes/caseCleanupRoutes.js';
import calendarNotificationRoutes from './routes/calendarNotificationRoutes.js';
import cpnuRoutes from './routes/cpnuRoutes.js';
import { cleanupClosedCases } from './services/caseCleanupService.js';
import { processCalendarNotifications } from './services/calendarNotificationService.js';
import { processCPNUAutoSync } from './services/cpnuAutoSyncService.js';

dotenv.config();

// =========================================================
// Global Error Handlers - Prevent Server Crashes
// =========================================================

/**
 * Handle unhandled promise rejections
 * Prevents server crashes from uncaught async errors
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [CRITICAL] Unhandled Promise Rejection:', reason);
  console.error('   Promise:', promise);
  console.error('   Stack:', reason?.stack || 'No stack trace');
  
  // Log additional context if it's an error object
  if (reason instanceof Error) {
    console.error('   Error name:', reason.name);
    console.error('   Error message:', reason.message);
    console.error('   Error code:', reason.code);
  }
  
  // Check if it's a Puppeteer-related error
  const reasonString = reason?.toString() || '';
  const reasonMessage = reason?.message || '';
  if (reasonString.includes('Puppeteer') || reasonString.includes('puppeteer') || 
      reasonString.includes('Chromium') || reasonMessage.includes('Puppeteer') || 
      reasonMessage.includes('puppeteer') || reasonMessage.includes('Chromium')) {
    console.error('   ⚠️  Puppeteer-related error detected. This may be due to missing dependencies.');
    console.error('   💡 Solution: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth');
    console.error('   💡 Or set PUPPETEER_EXECUTABLE_PATH environment variable if Chromium is installed separately');
  }
  
  // Don't exit - log and continue (prevent server crash)
  // In production, you might want to restart the server or take other actions
  // This prevents server restarts from unhandled async errors
  console.error('⚠️  Server will continue running. Please fix the underlying issue.');
});

/**
 * Handle uncaught exceptions
 * Prevents server crashes from synchronous errors
 */
process.on('uncaughtException', (error) => {
  console.error('❌ [CRITICAL] Uncaught Exception:', error);
  console.error('   Error name:', error.name);
  console.error('   Error message:', error.message);
  console.error('   Stack:', error.stack);
  
  // For uncaught exceptions, we should exit gracefully
  // But log first to help with debugging
  console.error('⚠️  Uncaught exception detected. Server will exit in 5 seconds...');
  
  // Give time for logs to be written
  setTimeout(() => {
    console.error('🛑 Exiting due to uncaught exception...');
    process.exit(1);
  }, 5000);
});

/**
 * Handle SIGTERM and SIGINT for graceful shutdown
 */
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ADDITIONAL_ORIGINS?.split(',') ?? []),
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, origin || true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// MongoDB Connection (reuse from Tutelas)
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

connectDB();

// =========================================================
// Scheduled Tasks - Automatic Case Cleanup
// =========================================================

/**
 * Schedule automatic cleanup of closed cases
 * Default: Daily at 2:00 AM
 * Configure via CASE_CLEANUP_SCHEDULE environment variable (cron format)
 * Examples:
 *   - "0 2 * * *" (daily at 2 AM) - default
 *   - "0 0 * * 0" (weekly on Sunday at midnight)
 *   - "0 *\/6 * * *" (every 6 hours)
 * Set to empty string or "disabled" to disable automatic cleanup
 */
const CASE_CLEANUP_SCHEDULE = process.env.CASE_CLEANUP_SCHEDULE || '0 2 * * *'; // Daily at 2 AM
const ENABLE_AUTO_CLEANUP = process.env.ENABLE_AUTO_CLEANUP !== 'false' && CASE_CLEANUP_SCHEDULE !== 'disabled' && CASE_CLEANUP_SCHEDULE !== '';

if (ENABLE_AUTO_CLEANUP) {
  // Validate cron expression
  if (cron.validate(CASE_CLEANUP_SCHEDULE)) {
    cron.schedule(CASE_CLEANUP_SCHEDULE, async () => {
      console.log(`[Auto Cleanup] Starting scheduled cleanup of closed cases...`);
      try {
        const result = await cleanupClosedCases();
        console.log(`[Auto Cleanup] Completed: ${result.deleted} cases deleted, ${result.errors} errors`);
      } catch (error) {
        console.error('[Auto Cleanup] Error during scheduled cleanup:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/New_York', // Default to EST, configure via TZ env var
    });
    console.log(`✅ Automatic case cleanup scheduled: ${CASE_CLEANUP_SCHEDULE} (${process.env.TZ || 'America/New_York'})`);
  } else {
    console.warn(`⚠️ Invalid CASE_CLEANUP_SCHEDULE: "${CASE_CLEANUP_SCHEDULE}". Automatic cleanup disabled.`);
  }
} else {
  console.log('ℹ️ Automatic case cleanup is disabled. Use manual endpoint: POST /api/case-cleanup/manual');
}

// =========================================================
// Scheduled Tasks - Calendar WhatsApp Notifications
// =========================================================

/**
 * Schedule calendar notification checks
 * Default: Every 5 minutes
 * Configure via CALENDAR_NOTIFICATION_SCHEDULE environment variable (cron format)
 * Examples:
 *   - "*\/5 * * * *" (every 5 minutes) - default
 *   - "*\/1 * * * *" (every minute) - for testing
 *   - "0 * * * *" (every hour)
 * Set to empty string or "disabled" to disable automatic notifications
 */
const CALENDAR_NOTIFICATION_SCHEDULE = process.env.CALENDAR_NOTIFICATION_SCHEDULE || '*/5 * * * *'; // Every 5 minutes
const ENABLE_CALENDAR_NOTIFICATIONS = process.env.ENABLE_CALENDAR_NOTIFICATIONS !== 'false' && 
                                      CALENDAR_NOTIFICATION_SCHEDULE !== 'disabled' && 
                                      CALENDAR_NOTIFICATION_SCHEDULE !== '';

if (ENABLE_CALENDAR_NOTIFICATIONS) {
  // Validate cron expression
  if (cron.validate(CALENDAR_NOTIFICATION_SCHEDULE)) {
    cron.schedule(CALENDAR_NOTIFICATION_SCHEDULE, async () => {
      console.log(`[CalendarNotification] Starting scheduled notification check...`);
      try {
        const result = await processCalendarNotifications();
        console.log(`[CalendarNotification] Completed: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`);
      } catch (error) {
        console.error('[CalendarNotification] Error during scheduled notification check:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/New_York',
    });
    console.log(`✅ Calendar notifications scheduled: ${CALENDAR_NOTIFICATION_SCHEDULE} (${process.env.TZ || 'America/New_York'})`);
  } else {
    console.warn(`⚠️ Invalid CALENDAR_NOTIFICATION_SCHEDULE: "${CALENDAR_NOTIFICATION_SCHEDULE}". Automatic notifications disabled.`);
  }
} else {
  console.log('ℹ️ Automatic calendar notifications are disabled. Use manual endpoint: POST /api/calendar-notifications/trigger');
}

// =========================================================
// Scheduled Tasks - CPNU Automatic Sync
// =========================================================

/**
 * Schedule CPNU automatic sync
 * Runs at 12:00 PM and 7:00 PM daily (Colombia timezone)
 * Configure via CPNU_SYNC_ENABLED environment variable
 */
const CPNU_SYNC_ENABLED = process.env.CPNU_SYNC_ENABLED !== 'false';
const CPNU_SYNC_SCHEDULE_12PM = '0 12 * * *'; // 12:00 PM
const CPNU_SYNC_SCHEDULE_7PM = '0 19 * * *';  // 7:00 PM

if (CPNU_SYNC_ENABLED) {
  // Schedule 12:00 PM sync
  if (cron.validate(CPNU_SYNC_SCHEDULE_12PM)) {
    cron.schedule(CPNU_SYNC_SCHEDULE_12PM, async () => {
      console.log('[CPNU Auto-Sync] Starting 12:00 PM sync...');
      try {
        const result = await processCPNUAutoSync();
        console.log(`[CPNU Auto-Sync] 12:00 PM completed: ${result.processed} processed, ${result.updated} updated, ${result.noChanges} no changes, ${result.errors} errors`);
      } catch (error) {
        console.error('[CPNU Auto-Sync] Error during 12:00 PM sync:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Bogota', // Colombia timezone
    });
    console.log(`✅ CPNU auto-sync scheduled: 12:00 PM (${process.env.TZ || 'America/Bogota'})`);
  } else {
    console.warn(`⚠️ Invalid CPNU_SYNC_SCHEDULE_12PM. 12:00 PM sync disabled.`);
  }

  // Schedule 7:00 PM sync
  if (cron.validate(CPNU_SYNC_SCHEDULE_7PM)) {
    cron.schedule(CPNU_SYNC_SCHEDULE_7PM, async () => {
      console.log('[CPNU Auto-Sync] Starting 7:00 PM sync...');
      try {
        const result = await processCPNUAutoSync();
        console.log(`[CPNU Auto-Sync] 7:00 PM completed: ${result.processed} processed, ${result.updated} updated, ${result.noChanges} no changes, ${result.errors} errors`);
      } catch (error) {
        console.error('[CPNU Auto-Sync] Error during 7:00 PM sync:', error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Bogota', // Colombia timezone
    });
    console.log(`✅ CPNU auto-sync scheduled: 7:00 PM (${process.env.TZ || 'America/Bogota'})`);
  } else {
    console.warn(`⚠️ Invalid CPNU_SYNC_SCHEDULE_7PM. 7:00 PM sync disabled.`);
  }
} else {
  console.log('ℹ️ CPNU automatic sync is disabled. Set CPNU_SYNC_ENABLED=true to enable.');
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'pepper-2.0-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/billing', adminBillingRoutes);
app.use('/api/admin/resources', adminResourceRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/chat/speech', speechRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/extracted-text', extractedTextRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/mcd', mcdRoutes);
app.use('/api/dashboard-agent', dashboardAgentRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/case-files', caseFilesRoutes);
app.use('/api/case-cleanup', caseCleanupRoutes);
app.use('/api/calendar-notifications', calendarNotificationRoutes);
app.use('/api/cpnu', cpnuRoutes);

app.get('/api', (req, res) => {
  res.json({ message: 'Pepper 2.0 API' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Pepper 2.0 Backend running on port ${PORT}`);
});

