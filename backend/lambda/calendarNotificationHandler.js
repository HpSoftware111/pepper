/**
 * AWS Lambda Handler: Calendar Notifications
 * 
 * Scheduled job: Every 5 minutes (America/New_York)
 * Purpose: Send WhatsApp notifications for upcoming calendar events
 * 
 * EventBridge Trigger: rate(5 minutes) or cron(*/5 * * * ? *)
 */

import { connectDB } from '../lib/mongo.js';
import { processCalendarNotifications } from '../services/calendarNotificationService.js';

/**
 * AWS Lambda handler for calendar notifications
 * @param {Object} event - EventBridge event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Lambda response
 */
export async function handler(event, context) {
  const startTime = Date.now();
  
  console.log('[Lambda:CalendarNotification] Starting scheduled notification check...');
  console.log('[Lambda:CalendarNotification] Event:', JSON.stringify(event, null, 2));
  
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('[Lambda:CalendarNotification] MongoDB connected');
    
    // Process notifications
    const result = await processCalendarNotifications();
    
    const duration = Date.now() - startTime;
    console.log(`[Lambda:CalendarNotification] Completed in ${duration}ms: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Calendar notifications processed: ${result.sent} sent, ${result.skipped} skipped, ${result.errors} errors`,
        result,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Lambda:CalendarNotification] Error:', error);
    
    // Return error response
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

// For local testing
if (import.meta.url === `file://${process.argv[1]}`) {
  handler({}, {
    functionName: 'calendarNotificationHandler-local',
    awsRequestId: 'local-test',
  }).then(result => {
    console.log('Local test result:', JSON.stringify(result, null, 2));
    process.exit(result.statusCode === 200 ? 0 : 1);
  }).catch(error => {
    console.error('Local test error:', error);
    process.exit(1);
  });
}
