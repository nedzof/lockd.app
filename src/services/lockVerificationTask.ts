import { lockRecoveryService } from './lockRecoveryService';
import logger from './logger';

/**
 * Task to periodically verify lock data
 * This can be scheduled to run at regular intervals
 */
export async function verifyLockData(): Promise<void> {
  try {
    logger.info('Starting scheduled lock data verification task');
    
    // Verify lock records against blockchain data
    const result = await lockRecoveryService.verifyLockRecords();
    
    logger.info(`Lock verification completed: ${result.verified} verified, ${result.mismatched} mismatched, ${result.recovered} recovered`);
    
    // If we found mismatches, attempt recovery
    if (result.mismatched > 0) {
      logger.warn(`Found ${result.mismatched} mismatched lock records, attempting recovery`);
      
      // For now, just log this. In a production implementation, you would:
      // 1. Notify administrators
      // 2. Potentially trigger automatic recovery for simple cases
      // 3. Flag records for manual review in complex cases
    }
  } catch (error) {
    logger.error('Error during scheduled lock verification:', error);
  }
}

/**
 * Start scheduled lock verification
 * @param intervalMs Interval in milliseconds (default: 24 hours)
 */
export function startScheduledVerification(intervalMs = 24 * 60 * 60 * 1000): NodeJS.Timeout {
  logger.info(`Scheduling lock verification to run every ${intervalMs / (60 * 60 * 1000)} hours`);
  
  // Run once at startup
  verifyLockData();
  
  // Schedule regular runs
  return setInterval(verifyLockData, intervalMs);
}

/**
 * Stop scheduled verification
 * @param timer Timer reference from startScheduledVerification
 */
export function stopScheduledVerification(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  logger.info('Scheduled lock verification stopped');
} 