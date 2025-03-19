import { Router, Request, Response } from 'express';
import { getStats, updateStats } from '../controllers/statsController';
import logger from '../services/logger';

const router = Router();

/**
 * @route GET /api/stats
 * @desc Get platform statistics
 * @access Public
 */
router.get('/', getStats);

/**
 * @route POST /api/stats/update
 * @desc Manually trigger an update of platform statistics
 * @access Public
 */
router.post('/update', async (req: Request, res: Response) => {
  logger.info('Manual stats update triggered');
  await updateStats(req, res);
});

export default router;