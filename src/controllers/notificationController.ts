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

    // Create the push_subscription table if it doesn't exist
    try {
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS push_subscription (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          threshold_value FLOAT NOT NULL DEFAULT 1,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, endpoint)
        );
        CREATE INDEX IF NOT EXISTS push_subscription_user_id_idx ON push_subscription(user_id);
      `;
    } catch (dbError) {
      logger.error('Error creating push_subscription table:', dbError);
      // Continue even if there's an error, as the table might already exist
    }

    // Store subscription in database using raw SQL
    const result = await prisma.$executeRaw`
      INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, threshold_value)
      VALUES (${userId}, ${typedSubscription.endpoint}, ${typedSubscription.keys.p256dh}, ${typedSubscription.keys.auth}, ${thresholdValue || 1})
      ON CONFLICT (user_id, endpoint) 
      DO UPDATE SET 
        p256dh = ${typedSubscription.keys.p256dh},
        auth = ${typedSubscription.keys.auth},
        threshold_value = ${thresholdValue || 1},
        updated_at = NOW()
      RETURNING *;
    `;

    logger.info(`User ${userId} subscribed to push notifications with threshold ${thresholdValue}`);
    return res.status(201).json({ success: true });
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

    // Remove subscription from database using raw SQL
    await prisma.$executeRaw`
      DELETE FROM push_subscription
      WHERE user_id = ${userId} AND endpoint = ${endpoint};
    `;

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

    // Update threshold for all subscriptions of this user using raw SQL
    await prisma.$executeRaw`
      UPDATE push_subscription
      SET threshold_value = ${thresholdValue}, updated_at = NOW()
      WHERE user_id = ${userId};
    `;

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
    // Get all subscriptions for this user using raw SQL
    const subscriptions = await prisma.$queryRaw`
      SELECT id, endpoint, p256dh, auth, threshold_value
      FROM push_subscription
      WHERE user_id = ${userId};
    `;

    if (!subscriptions || (subscriptions as any[]).length === 0) {
      logger.info(`No push subscriptions found for user ${userId}`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      url
    });

    // Send notification to each subscription
    const sendPromises = (subscriptions as any[]).map(async (subscription) => {
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
          await prisma.$executeRaw`
            DELETE FROM push_subscription
            WHERE id = ${subscription.id};
          `;
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