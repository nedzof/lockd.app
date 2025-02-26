import express from 'express';
import { getStats, updateStats } from '../controllers/statsController';

const router = express.Router();

// Get platform statistics
router.get('/', getStats);

// Update statistics (admin only)
router.post('/update', updateStats);

export default router;