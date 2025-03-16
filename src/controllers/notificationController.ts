import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import webpush from 'web-push';

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

// In-memory storage for notifications and subscriptions since they're not in the Prisma schema
interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  url: string;
  read: boolean;
  created_at: Date;
}

interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  threshold_value: number;
}

// In-memory storage
const notifications: Notification[] = [];
const pushSubscriptions: PushSubscription[] = [];

// Generate a simple UUID
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Get all push subscriptions
 * @returns Array of push subscriptions
 */
export function getPushSubscriptions(): PushSubscription[] {
  return pushSubscriptions;
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
    
    // Check if user has any active subscriptions
    const userSubscriptions = pushSubscriptions.filter(sub => sub.user_id === user_id);
    
    return res.status(200).json({
      success: true,
      subscribed: userSubscriptions.length > 0,
      count: userSubscriptions.length,
      threshold: userSubscriptions.length > 0 ? userSubscriptions[0].threshold_value : null
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
    
    // Get the user's push subscriptions
    const subscriptions = pushSubscriptions.filter(sub => sub.user_id === user_id);
    
    if (!subscriptions || subscriptions.length === 0) {
      logger.info(`No push subscriptions found for user ${user_id}`);
      return false;
    }
    
    // Store the notification in memory
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
    
    logger.info(`Notification created with ID ${notification.id}`);
    
    // Send push notification to each subscription
    if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
      const notificationsSent = [];
      
      for (const subscription of subscriptions) {
        try {
          const pushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          };
          
          const payload = JSON.stringify({
            title,
            body,
            url
          });
          
          // Set options for the notification
          const options = {
            TTL: 60 * 60, // 1 hour in seconds
            vapidDetails: {
              subject: vapidSubject,
              publicKey: vapidPublicKey,
              privateKey: vapidPrivateKey
            },
            headers: {}
          };
          
          const result = await webpush.sendNotification(
            pushSubscription, 
            payload, 
            options
          );
          
          notificationsSent.push({
            subscriptionId: subscription.id,
            success: true,
            statusCode: result.statusCode
          });
          
          logger.info(`Push notification sent to subscription ${subscription.id}`, {
            statusCode: result.statusCode
          });
        } catch (error) {
          logger.error(`Failed to send push notification to subscription ${subscription.id}:`, 
            error instanceof Error ? error.message : String(error));
          
          notificationsSent.push({
            subscriptionId: subscription.id,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
          
          // If the subscription is no longer valid, remove it
          if (error instanceof Error && 
              (error.message.includes('410') || error.message.includes('404'))) {
            const index = pushSubscriptions.findIndex(sub => sub.id === subscription.id);
            if (index !== -1) {
              pushSubscriptions.splice(index, 1);
              logger.info(`Removed invalid subscription ${subscription.id}`);
            }
          }
        }
      }
      
      // Log summary
      const successCount = notificationsSent.filter(n => n.success).length;
      logger.info(`Push notification summary: ${successCount}/${notificationsSent.length} sent successfully`);
      
      return successCount > 0;
    }
    
    return false;
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
    
    // Get notifications for the user from memory
    const userNotifications = notifications
      .filter(notification => notification.user_id === user_id)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    
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
    
    // Find the notification in memory
    const notificationIndex = notifications.findIndex(n => n.id === notification_id);
    
    if (notificationIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    // Mark as read
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
 * Subscribe to push notifications
 * @param req Express request object
 * @param res Express response object
 */
export const subscribeToPushNotifications = async (req: Request, res: Response) => {
  try {
    const { user_id, subscription, threshold_value } = req.body;
    
    if (!user_id || !subscription) {
      return res.status(400).json({
        success: false,
        message: 'User ID and subscription are required'
      });
    }
    
    // Remove any existing subscriptions with the same endpoint
    const existingIndex = pushSubscriptions.findIndex(
      sub => sub.endpoint === subscription.endpoint
    );
    
    if (existingIndex !== -1) {
      pushSubscriptions.splice(existingIndex, 1);
      logger.info(`Removed existing subscription for endpoint ${subscription.endpoint}`);
    }
    
    // Store the subscription in memory
    const pushSubscription: PushSubscription = {
      id: generateId(),
      user_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      threshold_value: threshold_value || 1
    };
    
    pushSubscriptions.push(pushSubscription);
    
    logger.info(`Subscription created with ID ${pushSubscription.id} for user ${user_id}`);
    
    return res.status(200).json({
      success: true,
      data: {
        id: pushSubscription.id,
        threshold: pushSubscription.threshold_value
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
    
    // Remove the subscription from memory
    const initialLength = pushSubscriptions.length;
    
    // If endpoint is provided, remove specific subscription
    if (endpoint) {
      const filteredSubscriptions = pushSubscriptions.filter(
        sub => !(sub.user_id === user_id && sub.endpoint === endpoint)
      );
      
      // Update the array
      pushSubscriptions.length = 0;
      pushSubscriptions.push(...filteredSubscriptions);
    } 
    // Otherwise remove all subscriptions for this user
    else {
      const filteredSubscriptions = pushSubscriptions.filter(
        sub => sub.user_id !== user_id
      );
      
      // Update the array
      pushSubscriptions.length = 0;
      pushSubscriptions.push(...filteredSubscriptions);
    }
    
    const removed = initialLength - pushSubscriptions.length;
    logger.info(`Removed ${removed} subscription(s) for user ${user_id}`);
    
    return res.status(200).json({
      success: true,
      removed
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