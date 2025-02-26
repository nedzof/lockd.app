import { CronJob } from 'cron';
import { DynamicTagGenerator } from '../services/dynamicTagGenerator.js';
import { logger } from '../utils/logger.js';

const tagGenerator = new DynamicTagGenerator();

/**
 * Sets up a scheduled job to generate tags every 6 hours
 */
export function setupTagGenerationJob(): CronJob {
  // Schedule: run every 6 hours (at minute 0 of hours 0, 6, 12, 18)
  const job = new CronJob('0 0 */6 * * *', async () => {
    try {
      logger.info('Starting scheduled tag generation job');
      const tags = await tagGenerator.generateTags();
      logger.info(`Tag generation job completed successfully. Generated ${tags.length} tags.`);
    } catch (error) {
      logger.error('Error in scheduled tag generation job:', error);
    }
  });
  
  // Start the job
  job.start();
  
  return job;
}

/**
 * Manually runs the tag generation job once
 */
export async function runTagGenerationJob(): Promise<string[]> {
  try {
    logger.info('Running tag generation job manually');
    const tags = await tagGenerator.generateTags();
    logger.info(`Manual tag generation completed. Generated ${tags.length} tags.`);
    return tags;
  } catch (error) {
    logger.error('Error in manual tag generation:', error);
    return [];
  }
}

/**
 * Initializes the tag generation job and runs it once on startup
 */
export function initializeTagGenerationJob(): void {
  // Set up the scheduled job
  const job = setupTagGenerationJob();
  logger.info('Tag generation job scheduled');
  
  // Run the job once on startup (after a short delay to ensure the server is fully initialized)
  setTimeout(async () => {
    try {
      logger.info('Running initial tag generation on startup');
      await runTagGenerationJob();
    } catch (error) {
      logger.error('Error in initial tag generation:', error);
    }
  }, 5000); // 5 second delay
}
