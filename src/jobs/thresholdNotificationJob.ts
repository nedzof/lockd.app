import { CronJob } from 'cron';
import prisma from '../db';
import { logger } from '../utils/logger';
import { sendNotification } from '../controllers/notificationController';

/**
 * Check for posts that have reached user-defined thresholds and send notifications
 */
async function checkThresholds() {
  try {
    logger.info('Running threshold notification check');
    
    // Get all active push subscriptions
    const subscriptions = await prisma.$queryRaw`
      SELECT DISTINCT user_id, threshold_value
      FROM push_subscription;
    ` as { user_id: string; threshold_value: number }[];
    
    if (!subscriptions || subscriptions.length === 0) {
      logger.info('No push subscriptions found');
      return;
    }
    
    logger.info(`Found ${subscriptions.length} users with push subscriptions`);
    
    // For each user with a subscription
    for (const subscription of subscriptions) {
      const { user_id, threshold_value } = subscription;
      
      // Find posts that have reached the threshold since the last check
      const recentPosts = await prisma.$queryRaw`
        SELECT p.id, p.content, SUM(l.amount) as total_locked
        FROM post p
        JOIN lock_like l ON p.id = l.post_id
        WHERE l.created_at > NOW() - INTERVAL '1 hour'
        GROUP BY p.id, p.content
        HAVING SUM(l.amount) >= ${threshold_value}
      ` as { id: string; content: string; total_locked: number }[];
      
      if (recentPosts.length > 0) {
        logger.info(`Found ${recentPosts.length} posts that reached threshold ${threshold_value} for user ${user_id}`);
        
        // Send notification for each post
        for (const post of recentPosts) {
          const title = 'Threshold Alert';
          const body = `A post has reached ${post.total_locked} BSV: "${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}"`;
          const url = `/posts/${post.id}`;
          
          await sendNotification(user_id, title, body, url);
        }
      }
    }
    
    logger.info('Threshold notification check completed');
  } catch (error) {
    logger.error('Error in threshold notification job:', error);
  }
}

/**
 * Initialize the threshold notification job
 */
export function initializeThresholdNotificationJob() {
  try {
    // Run every 15 minutes
    const job = new CronJob('*/15 * * * *', checkThresholds);
    
    job.start();
    logger.info('Threshold notification job scheduled');
    
    // Run immediately on startup
    checkThresholds();
    logger.info('Threshold notification job initialized');
    
    return job;
  } catch (error) {
    logger.error('Error initializing threshold notification job:', error);
    return null;
  }
} 