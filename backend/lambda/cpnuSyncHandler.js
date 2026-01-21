/**
 * AWS Lambda Handler: CPNU Auto-Sync
 * 
 * Scheduled job: 12:00 PM and 7:00 PM daily (America/Bogota)
 * Purpose: Sync CPNU actuaciones for linked cases
 * 
 * EventBridge Triggers:
 *   - 12 PM: cron(0 12 * * ? *)
 *   - 7 PM: cron(0 19 * * ? *)
 * 
 * Note: This single handler is triggered twice daily via different EventBridge rules
 */

import { connectDB } from '../lib/mongo.js';
import { processCPNUAutoSync } from '../services/cpnuAutoSyncService.js';

/**
 * AWS Lambda handler for CPNU auto-sync
 * @param {Object} event - EventBridge event (contains source/time info)
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Lambda response
 */
export async function handler(event, context) {
  const startTime = Date.now();
  
  // Determine sync time from event source or current time
  const syncTime = event.source?.includes('12pm') ? '12:00 PM' : 
                   event.source?.includes('7pm') ? '7:00 PM' :
                   new Date().getHours() >= 12 && new Date().getHours() < 19 ? '12:00 PM' : '7:00 PM';
  
  console.log(`[Lambda:CPNUSync] Starting ${syncTime} sync...`);
  console.log('[Lambda:CPNUSync] Event:', JSON.stringify(event, null, 2));
  
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('[Lambda:CPNUSync] MongoDB connected');
    
    // Process CPNU sync
    const result = await processCPNUAutoSync();
    
    const duration = Date.now() - startTime;
    console.log(`[Lambda:CPNUSync] ${syncTime} sync completed in ${duration}ms: ${result.processed} processed, ${result.updated} updated, ${result.noChanges} no changes, ${result.errors} errors`);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `CPNU sync (${syncTime}) completed: ${result.processed} processed, ${result.updated} updated, ${result.noChanges} no changes, ${result.errors} errors`,
        result: {
          ...result,
          syncTime,
        },
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Lambda:CPNUSync] ${syncTime} sync error:`, error);
    
    // Return error response
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        syncTime,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

// For local testing
if (import.meta.url === `file://${process.argv[1]}`) {
  handler({ source: 'test' }, {
    functionName: 'cpnuSyncHandler-local',
    awsRequestId: 'local-test',
  }).then(result => {
    console.log('Local test result:', JSON.stringify(result, null, 2));
    process.exit(result.statusCode === 200 ? 0 : 1);
  }).catch(error => {
    console.error('Local test error:', error);
    process.exit(1);
  });
}
