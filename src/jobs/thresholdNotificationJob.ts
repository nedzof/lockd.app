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

// We'll use prisma directly without type casting
// const prismaWithTypes = prisma as PrismaClient;

/**
 * Check for posts that have reached user-defined thresholds and send notifications
 */
async function checkThresholds() {
  try {
    logger.info('Running threshold check');
    
    // Find all unique threshold values from active subscriptions
    const thresholds = await findUniqueThresholds();
    logger.info(`Found ${thresholds.length} unique thresholds`);
    
    // For each threshold, find posts that have reached it in the last minute
    for (const threshold of thresholds) {
      const posts = await findPostsAboveThreshold(threshold);
      
      if (posts.length > 0) {
        logger.info(`Found ${posts.length} posts above threshold ${threshold}`);
        
        // For each post, notify users who have subscribed to this threshold
        for (const post of posts) {
          const subscriptions = await notificationSubscriptionService.findSubscriptionsByThreshold(threshold);
          
          if (subscriptions.length === 0) {
            continue;
          }
          
          logger.info(`Sending notifications to ${subscriptions.length} users for post ${post.id}`);
          
          // Create notification content
          const postContent = post.content.length > 100 ? `${post.content.substring(0, 97)}...` : post.content;
          const title = `Post reached ${post.total_locked} BSV locked`;
          const body = `A post with content "${postContent}" has reached ${post.total_locked} BSV locked!`;
          const url = `/post/${post.id}`;
          
          // Notify each subscriber for this threshold
          for (const subscription of subscriptions) {
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
    // Get all active subscriptions with threshold values
    const subscriptions = await notificationSubscriptionService.findSubscriptionsByThreshold(Number.MAX_VALUE);
    
    // Extract and deduplicate threshold values
    const uniqueThresholds = [...new Set(subscriptions.map(sub => sub.threshold_value))];
    
    return uniqueThresholds;
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
      content: true
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