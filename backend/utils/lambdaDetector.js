/**
 * Lambda Environment Detection Utility
 * 
 * Detects if code is running in AWS Lambda vs EC2/local environment
 * Used to determine file system paths and behavior differences
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Check if running in AWS Lambda environment
 * @returns {boolean} True if running in Lambda
 */
export function isLambdaEnvironment() {
  // AWS Lambda sets these environment variables
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.LAMBDA_TASK_ROOT ||
    process.env._HANDLER
  );
}

/**
 * Get the base cases directory path
 * In Lambda: uses /tmp (writable, but cleared between invocations)
 * In EC2: uses relative path from project root
 * 
 * @returns {string} Base path for cases directory
 */
export function getCasesBaseDir() {
  if (isLambdaEnvironment()) {
    // Lambda: Use /tmp directory (writable, 512MB-10GB depending on config)
    // Note: /tmp is cleared between invocations, so files won't persist
    // For production, consider using S3 for persistent storage
    const lambdaCasesDir = '/tmp/pepper-2.0/cases';
    console.log('[lambdaDetector] Using Lambda /tmp directory:', lambdaCasesDir);
    return lambdaCasesDir;
  } else {
    // EC2/Local: Use relative path from project root
    const ec2CasesDir = path.join(__dirname, '..', 'cases');
    console.log('[lambdaDetector] Using EC2/local directory:', ec2CasesDir);
    return ec2CasesDir;
  }
}

/**
 * Get environment context information
 * @returns {Object} Environment details
 */
export function getEnvironmentInfo() {
  return {
    isLambda: isLambdaEnvironment(),
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME || null,
    executionEnv: process.env.AWS_EXECUTION_ENV || null,
    casesBaseDir: getCasesBaseDir(),
    tmpDir: isLambdaEnvironment() ? '/tmp' : null,
  };
}
