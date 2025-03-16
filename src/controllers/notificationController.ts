import { Request, Response } from 'express';
import webpush from 'web-push';
import prisma from '../db';
import { logger } from '../utils/logger';

// Generate VAPID keys using: npx web-push generate-vapid-keys
// These should be stored in environment variables in production
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BLBz5U0ynWG4O3RsQKR9Lm0K1-oFhLfEEbZV0MdkbiCUuH4U5C-V2yU9xCYhjuCw-V5AULjJqSRZVlSMjTmxqTo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'uVCdji5r_CBr8TTy1-2hxCXbYOYCHGAZ4WgplJqIJGo';

// Configure web-push with VAPID details
webpush.setVapidDetails(
  'mailto:contact@lockd.app',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Define the PushSubscription type
interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface WebPushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/**
 * Get the VAPID public key
 */
export const getVapidPublicKey = (req: Request, res: Response) => {
  try {
    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
  } catch (error) {
    logger.error('Error getting VAPID public key:', error);
    return res.status(500).json({ error: 'Failed to get VAPID public key' });
  }
};

/**
 * Subscribe to push notifications
 */
export const subscribe = async (req: Request, res: Response) => {
  try {
    const { subscription, userId, thresholdValue } = req.body;
    const typedSubscription = subscription as WebPushSubscription;

    if (!typedSubscription || !userId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Store subscription in database using Prisma
    const newSubscription = await prisma.push_subscription.upsert({
      where: {
        user_id_endpoint: {
          user_id: userId,
          endpoint: typedSubscription.endpoint
        }
      },
      update: {
        p256dh: typedSubscription.keys.p256dh,
        auth: typedSubscription.keys.auth,
        threshold_value: thresholdValue || 1,
        updated_at: new Date()
      },
      create: {
        user_id: userId,
        endpoint: typedSubscription.endpoint,
        p256dh: typedSubscription.keys.p256dh,
        auth: typedSubscription.keys.auth,
        threshold_value: thresholdValue || 1
      }
    });

    logger.info(`User ${userId} subscribed to push notifications with threshold ${thresholdValue}`);
    return res.status(201).json({ success: true, subscription: newSubscription });
  } catch (error) {
    logger.error('Error subscribing to push notifications:', error);
    return res.status(500).json({ error: 'Failed to subscribe to push notifications' });
  }
};

/**
 * Unsubscribe from push notifications
 */
export const unsubscribe = async (req: Request, res: Response) => {
  try {
    const { endpoint, userId } = req.body;

    if (!endpoint || !userId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Remove subscription from database using Prisma
    await prisma.push_subscription.deleteMany({
      where: {
        user_id: userId,
        endpoint: endpoint
      }
    });

    logger.info(`User ${userId} unsubscribed from push notifications`);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error unsubscribing from push notifications:', error);
    return res.status(500).json({ error: 'Failed to unsubscribe from push notifications' });
  }
};

/**
 * Update notification threshold
 */
export const updateThreshold = async (req: Request, res: Response) => {
  try {
    const { userId, thresholdValue } = req.body;

    if (!userId || thresholdValue === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Update threshold for all subscriptions of this user using Prisma
    await prisma.push_subscription.updateMany({
      where: {
        user_id: userId
      },
      data: {
        threshold_value: thresholdValue,
        updated_at: new Date()
      }
    });

    logger.info(`User ${userId} updated notification threshold to ${thresholdValue}`);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error updating notification threshold:', error);
    return res.status(500).json({ error: 'Failed to update notification threshold' });
  }
};

/**
 * Send notification to a specific user
 */
export const sendNotification = async (userId: string, title: string, body: string, url?: string) => {
  try {
    // Get all subscriptions for this user using Prisma
    const subscriptions = await prisma.push_subscription.findMany({
      where: {
        user_id: userId
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        threshold_value: true
      }
    });

    if (!subscriptions || subscriptions.length === 0) {
      logger.info(`No push subscriptions found for user ${userId}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      url
    });

    // Send notification to each subscription
    const sendPromises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        }, payload);
        logger.info(`Notification sent to user ${userId}`);
      } catch (error: any) {
        // If subscription is expired or invalid, remove it
        if (error.statusCode === 404 || error.statusCode === 410) {
          await prisma.push_subscription.delete({
            where: {
              id: subscription.id
            }
          });
          logger.info(`Removed invalid subscription for user ${userId}`);
        } else {
          logger.error(`Error sending notification to user ${userId}:`, error);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error) {
    logger.error(`Error in sendNotification for user ${userId}:`, error);
  }
}; 