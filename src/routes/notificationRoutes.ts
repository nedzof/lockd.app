import express from 'express';
import {
  getNotifications,
  markNotificationAsRead,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getSubscriptionStatus,
  sendTestNotification,
  updateNotificationThreshold
} from '../controllers/notificationController';

const router = express.Router();

// Get subscription status for a user
router.get('/status/:user_id', getSubscriptionStatus);

// Get notifications for a user
router.get('/:user_id', getNotifications);

// Mark a notification as read
router.put('/:notification_id/read', markNotificationAsRead);

// Subscribe to push notifications
router.post('/subscribe', subscribeToPushNotifications);

// Unsubscribe from push notifications
router.post('/unsubscribe', unsubscribeFromPushNotifications);

// Update notification threshold
router.post('/threshold', updateNotificationThreshold);

// Send a test notification
router.post('/test', sendTestNotification);

export default router; 