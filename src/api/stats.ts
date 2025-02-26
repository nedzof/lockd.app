import express from 'express';
import type { Post } from '@prisma/client';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [totalPosts, totalLockedPosts, totalBSVLocked] = await Promise.all([
      prisma.post.count(),
      prisma.post.count({
        where: { is_locked: true }
      }),
      prisma.post.aggregate({
        _sum: {
          lock_amount: true
        }
      })
    ]);

    res.json({
      totalPosts,
      totalLockedPosts,
      totalBSVLocked: totalBSVLocked._sum.lock_amount || 0
    });
  } catch (error: any) {
    logger.error('Error fetching stats', {
      error: error.message,
      code: error.code
    });

    if (error.code === 'P2010' || error.message.includes('prepared statement')) {
      return res.status(503).json({ 
        error: 'Database connection error, please try again',
        retryAfter: 1
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;