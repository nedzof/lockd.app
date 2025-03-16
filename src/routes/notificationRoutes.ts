import express from 'express';
import { getVapidPublicKey, subscribe, unsubscribe, updateThreshold } from '../controllers/notificationController';

const router = express.Router();

// Get VAPID public key
router.get('/vapid-public-key', getVapidPublicKey);

// Subscribe to push notifications
router.post('/subscribe', subscribe);

// Unsubscribe from push notifications
router.post('/unsubscribe', unsubscribe);

// Update notification threshold
router.post('/update-threshold', updateThreshold);

export default router; 