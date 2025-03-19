import { CronJob } from 'cron';
import prisma from '../db';
import { logger } from '../utils/logger';
import { sendNotification } from '../controllers/notificationController';
import { notificationSubscriptionService } from '../services/notificationSubscriptionService';
import { PrismaClient } from '@prisma/client';

// Define interface for notification subscription
interface NotificationSubscription {
  id: string;
  wallet_address: string;
  session_id?: string | null;
  threshold_value: number;
  notifications_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

// Add type definitions for prisma client
const prismaWithTypes = prisma as PrismaClient & {
  notification_subscription: {
    findMany: (args: any) => Promise<NotificationSubscription[]>;
  }
};

/**
 * Check for posts that have reached user-defined thresholds and send notifications
 */
async function checkThresholds() {
  try {
    logger.info('Running threshold check');
    
    // Find all active subscriptions with their threshold values
    const thresholds = await findUniqueThresholds();
    
    if (thresholds.length === 0) {
      return;
    }
    
    // For each threshold value, find posts that have reached it
    for (const threshold of thresholds) {
      const subscriptions = await notificationSubscriptionService.findSubscriptionsByThreshold(threshold);
      
      if (subscriptions.length === 0) {
        continue;
      }
      
      // Find posts that have reached the threshold since the last check
      const recentPosts = await findPostsAboveThreshold(threshold);
      
      if (recentPosts.length > 0) {
        logger.info(`Found ${recentPosts.length} posts that reached ${threshold} BSV threshold`);
        
        // For each post, notify all subscribers for this threshold
        for (const post of recentPosts) {
          const title = 'Threshold Alert';
          const body = `A post has reached ${post.total_locked} BSV: "${post.content.substring(0, 50)}${post.content.length > 50 ? '...' : ''}"`;
          const url = `/posts/${post.id}`;
          
          // Notify each subscriber for this threshold, excluding the post author
          for (const subscription of subscriptions) {
            // Skip notification if the subscriber is the post author
            if (subscription.wallet_address === post.author_address) {
              logger.debug(`Skipping notification for post author ${post.author_address}`);
              continue;
            }
            
            await sendNotification(subscription.wallet_address, title, body, url);
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error in threshold notification job:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Find unique threshold values from all active subscriptions
 */
async function findUniqueThresholds(): Promise<number[]> {
  try {
    // Get all active subscriptions
    const allActiveSubscriptions = await prismaWithTypes.notification_subscription.findMany({
      where: {
        notifications_enabled: true
      },
      select: {
        threshold_value: true
      },
      distinct: ['threshold_value']
    });
    
    // Extract and return unique threshold values
    return allActiveSubscriptions.map((sub: { threshold_value: number }) => sub.threshold_value);
  } catch (error) {
    logger.error('Error finding unique thresholds:', error);
    return [];
  }
}

/**
 * Find posts that have reached a specific threshold in the last minute
 */
async function findPostsAboveThreshold(threshold: number) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  
  // First get post IDs with lock amounts that meet the threshold
  const postAggregations = await prisma.lock_like.groupBy({
    by: ['post_id'],
    where: {
      created_at: {
        gte: oneMinuteAgo
      }
    },
    having: {
      amount: {
        _sum: {
          gte: threshold
        }
      }
    },
    _sum: {
      amount: true
    }
  });
  
  if (postAggregations.length === 0) {
    return [];
  }
  
  const postIds = postAggregations.map(agg => agg.post_id);
  
  // Then get the actual post details for those IDs
  const posts = await prisma.post.findMany({
    where: {
      id: {
        in: postIds
      }
    },
    select: {
      id: true,
      content: true,
      author_address: true
    }
  });
  
  // Combine post data with lock amounts
  return posts.map(post => {
    const postAgg = postAggregations.find(agg => agg.post_id === post.id);
    const total_locked = postAgg?._sum.amount || 0;
    
    return {
      ...post,
      total_locked
    };
  });
}

/**
 * Initialize the threshold notification job
 */
export function initializeThresholdNotificationJob() {
  try {
    // Run every minute
    const job = new CronJob('* * * * *', checkThresholds);
    
    job.start();
    logger.info('Threshold notification job scheduled to run every minute');
    
    // Run immediately on startup
    checkThresholds();
    logger.info('Threshold notification job initialized');
    
    return job;
  } catch (error) {
    logger.error('Error initializing threshold notification job:', error instanceof Error ? error.message : String(error));
    return null;
  }
} 