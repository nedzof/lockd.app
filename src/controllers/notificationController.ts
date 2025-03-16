import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import webpush from 'web-push';
import { notificationSubscriptionService } from '../services/notificationSubscriptionService';
import { PrismaClient } from '@prisma/client';

// Define interfaces for our notification models
interface NotificationSubscription {
  id: string;
  wallet_address: string;
  session_id?: string | null;
  threshold_value: number;
  notifications_enabled: boolean;
  subscription_data: any;
  endpoint?: string | null;
  created_at: Date;
  updated_at: Date;
  last_notified_at?: Date | null;
}

// Initialize Prisma client with types
const prisma = new PrismaClient() as PrismaClient & {
  notification_subscription: {
    findMany: (args: any) => Promise<NotificationSubscription[]>;
  }
};

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VITE_PUBLIC_VAPID_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || '';

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
  logger.info('Web Push VAPID keys configured');
} else {
  logger.warn('Web Push VAPID keys not configured. Push notifications will not work.');
}

// In-memory storage for notifications since they're not in the Prisma schema yet
interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  created_at: Date;
}

// In-memory storage
const notifications: Notification[] = [];

// Generate a simple UUID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Get subscription status for a user
 * @param req Express request object
 * @param res Express response object
 */
export const getSubscriptionStatus = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Get subscription status from database
    const status = await notificationSubscriptionService.getSubscriptionStatus(user_id);
    
    return res.status(200).json({
      success: true,
      subscribed: status.isSubscribed,
      count: status.subscriptionCount,
      activeCount: status.activeSubscriptions,
      threshold: status.threshold
    });
  } catch (error) {
    logger.error('Error getting subscription status:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to get subscription status',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
};

/**
 * Send a test notification to a user
 * @param req Express request object
 * @param res Express response object
 */
export const sendTestNotification = async (req: Request, res: Response) => {
  try {
    const { user_id, title, body } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const success = await sendNotification(
      user_id, 
      title || 'Test Notification', 
      body || 'This is a test notification', 
      '/'
    );
    
    return res.status(200).json({
      success: true,
      notificationSent: success
    });
  } catch (error) {
    logger.error('Error sending test notification:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
};

/**
 * Send a notification to a user
 * @param user_id The ID of the user to send the notification to
 * @param title The title of the notification
 * @param body The body of the notification
 * @param url The URL to redirect to when the notification is clicked
 */
export async function sendNotification(
  user_id: string,
  title: string,
  body: string,
  url: string
): Promise<boolean> {
  try {
    logger.info(`Sending notification to user ${user_id}`, {
      title,
      body_preview: body.substring(0, 50),
      url
    });
    
    // Store notification in memory
    const notification: Notification = {
      id: generateId(),
      user_id,
      title,
      body,
      url,
      read: false,
      created_at: new Date()
    };
    
    notifications.push(notification);
    
    // Get active subscriptions for this user from database
    const userStatus = await notificationSubscriptionService.getSubscriptionStatus(user_id);
    
    if (!userStatus.isSubscribed) {
      logger.info(`User ${user_id} has no active subscriptions`);
      return false;
    }
    
    // Get all subscriptions for this user
    const subscriptions = await prisma.notification_subscription.findMany({
      where: {
        wallet_address: user_id,
        notifications_enabled: true
      },
      orderBy: {
        updated_at: 'desc'
      }
    });
    
    if (subscriptions.length === 0) {
      logger.info(`No active subscriptions found for user ${user_id}`);
      return false;
    }
    
    // Only use the most recent active subscription to avoid duplicate notifications
    const activeSubscription = subscriptions[0];
    logger.info(`Using most recent active subscription for user ${user_id}`, {
      subscription_id: activeSubscription.id,
      updated_at: activeSubscription.updated_at
    });
    
    // Send notification to the active subscription
    let sentCount = 0;
    
    try {
      // The subscription data stored in the database
      const pushSubscription = activeSubscription.subscription_data;
      
      if (!pushSubscription) {
        logger.warn(`Invalid subscription data for user ${user_id}, subscription ${activeSubscription.id}`);
        return false;
      }
      
      // Payload
      const payload = JSON.stringify({
        title,
        body,
        url,
        timestamp: new Date().getTime(),
        icon: '/favicon.ico'
      });
      
      // Send push notification
      await webpush.sendNotification(pushSubscription, payload);
      
      // Update last notified timestamp
      await notificationSubscriptionService.updateLastNotified(activeSubscription.id);
      
      sentCount = 1;
    } catch (subscriptionError) {
      logger.error(`Failed to send notification to subscription:`, {
        user_id,
        subscription_id: activeSubscription.id,
        error: subscriptionError instanceof Error ? subscriptionError.message : String(subscriptionError)
      });
      
      // Check if the subscription is invalid (expired, unsubscribed, etc.)
      if (
        subscriptionError instanceof Error && 
        (subscriptionError.message.includes('410') || subscriptionError.message.includes('404'))
      ) {
        // Subscription is expired or invalid, disable it
        await notificationSubscriptionService.unsubscribe(user_id, activeSubscription.endpoint as string | undefined);
        logger.info(`Disabled invalid subscription for user ${user_id}`);
      }
    }
    
    logger.info(`Sent notification to user ${user_id}: ${sentCount > 0 ? 'success' : 'failed'}`);
    return sentCount > 0;
  } catch (error) {
    logger.error('Error sending notification:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Get notifications for a user
 * @param req Express request object
 * @param res Express response object
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.params;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Get notifications from in-memory storage
    const userNotifications = notifications.filter(
      notification => notification.user_id === user_id
    ).sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    
    return res.status(200).json({
      success: true,
      data: userNotifications
    });
  } catch (error) {
    logger.error('Error getting notifications:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
};

/**
 * Mark a notification as read
 * @param req Express request object
 * @param res Express response object
 */
export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { notification_id } = req.params;
    
    if (!notification_id) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      });
    }
    
    // Find notification in in-memory storage
    const notificationIndex = notifications.findIndex(
      notification => notification.id === notification_id
    );
    
    if (notificationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Mark notification as read
    notifications[notificationIndex].read = true;
    
    return res.status(200).json({
      success: true,
      data: notifications[notificationIndex]
    });
  } catch (error) {
    logger.error('Error marking notification as read:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
};

/**
 * Update notification threshold for a user
 * @param req Express request object
 * @param res Express response object
 */
export const updateNotificationThreshold = async (req: Request, res: Response) => {
  try {
    const { user_id, threshold_value } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    if (threshold_value === undefined || isNaN(Number(threshold_value)) || Number(threshold_value) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid threshold value is required'
      });
    }
    
    // Update threshold in the database
    const success = await notificationSubscriptionService.updateNotificationThreshold(
      user_id,
      Number(threshold_value)
    );
    
    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found for this user'
      });
    }
    
    logger.info(`Threshold updated for user ${user_id} to ${threshold_value}`);
    
    return res.status(200).json({
      success: true,
      message: 'Notification threshold updated successfully',
      data: {
        threshold: Number(threshold_value)
      }
    });
  } catch (error) {
    logger.error('Error updating notification threshold:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to update notification threshold',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
};

/**
 * Subscribe to push notifications
 * @param req Express request object
 * @param res Express response object
 */
export const subscribeToPushNotifications = async (req: Request, res: Response) => {
  try {
    const { user_id, subscription, threshold_value, session_id } = req.body;
    
    if (!user_id || !subscription) {
      return res.status(400).json({
        success: false,
        message: 'User ID and subscription are required'
      });
    }
    
    // Store subscription in the database
    const result = await notificationSubscriptionService.subscribe(
      user_id,
      subscription,
      threshold_value || 1.0,
      session_id
    );
    
    logger.info(`Subscription created for user ${user_id}`);
    
    return res.status(200).json({
      success: true,
      data: {
        id: result.id,
        threshold: result.threshold_value
      }
    });
  } catch (error) {
    logger.error('Error subscribing to push notifications:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to subscribe to push notifications',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
};

/**
 * Unsubscribe from push notifications
 * @param req Express request object
 * @param res Express response object
 */
export const unsubscribeFromPushNotifications = async (req: Request, res: Response) => {
  try {
    const { user_id, endpoint } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Unsubscribe in the database
    await notificationSubscriptionService.unsubscribe(user_id, endpoint);
    
    logger.info(`Unsubscribed user ${user_id} from push notifications`);
    
    return res.status(200).json({
      success: true,
      message: 'Successfully unsubscribed from push notifications'
    });
  } catch (error) {
    logger.error('Error unsubscribing from push notifications:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      success: false,
      message: 'Failed to unsubscribe from push notifications',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : String(error) : undefined
    });
  }
}; 