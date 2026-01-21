/**
 * AWS Lambda Handler: Case Cleanup
 * 
 * Scheduled job: Daily at 2:00 AM (America/New_York)
 * Purpose: Clean up closed cases after retention period
 * 
 * EventBridge Trigger: cron(0 2 * * ? *)
 */

import { connectDB } from '../lib/mongo.js';
import { cleanupClosedCases } from '../services/caseCleanupService.js';

/**
 * AWS Lambda handler for case cleanup
 * @param {Object} event - EventBridge event
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Lambda response
 */
export async function handler(event, context) {
  const startTime = Date.now();
  
  console.log('[Lambda:CaseCleanup] Starting scheduled case cleanup...');
  console.log('[Lambda:CaseCleanup] Event:', JSON.stringify(event, null, 2));
  
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('[Lambda:CaseCleanup] MongoDB connected');
    
    // Run cleanup
    const result = await cleanupClosedCases();
    
    const duration = Date.now() - startTime;
    console.log(`[Lambda:CaseCleanup] Completed in ${duration}ms: ${result.deleted} deleted, ${result.errors} errors`);
    
    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Case cleanup completed: ${result.deleted} cases deleted, ${result.errors} errors`,
        result,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      }),
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Lambda:CaseCleanup] Error:', error);
    
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
    functionName: 'caseCleanupHandler-local',
    awsRequestId: 'local-test',
  }).then(result => {
    console.log('Local test result:', JSON.stringify(result, null, 2));
    process.exit(result.statusCode === 200 ? 0 : 1);
  }).catch(error => {
    console.error('Local test error:', error);
    process.exit(1);
  });
}
