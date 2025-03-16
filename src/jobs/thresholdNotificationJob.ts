import { CronJob } from 'cron';
import prisma from '../db';
import { logger } from '../utils/logger';
import { sendNotification, getPushSubscriptions } from '../controllers/notificationController';

/**
 * Check for posts that have reached user-defined thresholds and send notifications
 */
async function checkThresholds() {
  try {
    logger.info('Running threshold notification check');
    
    // Get all active push subscriptions from the in-memory storage
    const subscriptions = getPushSubscriptions();
    
    if (!subscriptions || subscriptions.length === 0) {
      logger.info('No push subscriptions found');
      return;
    }
    
    // Get unique user subscriptions with their threshold values
    const uniqueUserSubscriptions = subscriptions.reduce((acc: Array<{ user_id: string; threshold_value: number }>, sub: { user_id: string; threshold_value: number }) => {
      if (!acc.some((item: { user_id: string }) => item.user_id === sub.user_id)) {
        acc.push({
          user_id: sub.user_id,
          threshold_value: sub.threshold_value
        });
      }
      return acc;
    }, [] as Array<{ user_id: string; threshold_value: number }>);
    
    logger.info(`Found ${uniqueUserSubscriptions.length} users with push subscriptions`);
    
    // For each user with a subscription
    for (const subscription of uniqueUserSubscriptions) {
      const { user_id, threshold_value } = subscription;
      
      // Find posts that have reached the threshold since the last check
      // Using Prisma's groupBy feature
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // First get post IDs with lock amounts that meet the threshold
      const postAggregations = await prisma.lock_like.groupBy({
        by: ['post_id'],
        where: {
          created_at: {
            gte: oneHourAgo
          }
        },
        having: {
          amount: {
            _sum: {
              gte: threshold_value
            }
          }
        },
        _sum: {
          amount: true
        }
      });
      
      // Then get the actual post details for those IDs
      if (postAggregations.length > 0) {
        const postIds = postAggregations.map(agg => agg.post_id);
        
        const recentPosts = await prisma.post.findMany({
          where: {
            id: {
              in: postIds
            }
          },
          select: {
            id: true,
            content: true
          }
        });
        
        if (recentPosts.length > 0) {
          logger.info(`Found ${recentPosts.length} posts that reached threshold ${threshold_value} for user ${user_id}`);
          
          // Send notification for each post
          for (const post of recentPosts) {
            // Find the corresponding aggregation to get the total locked amount
            const postAgg = postAggregations.find(agg => agg.post_id === post.id);
            const totalLocked = postAgg?._sum.amount || 0;
            
            const title = 'Threshold Alert';
            const body = `A post has reached ${totalLocked} BSV: "${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}"`;
            const url = `/posts/${post.id}`;
            
            await sendNotification(user_id, title, body, url);
          }
        }
      }
    }
    
    logger.info('Threshold notification check completed');
  } catch (error) {
    logger.error('Error in threshold notification job:', error instanceof Error ? error.message : String(error));
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
    logger.error('Error initializing threshold notification job:', error instanceof Error ? error.message : String(error));
    return null;
  }
} 