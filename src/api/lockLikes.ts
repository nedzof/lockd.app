import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
  try {
    const { postId, handle, amount, lockPeriod } = req.body;

    if (!postId || !amount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const lockLike = await prisma.lockLike.create({
      data: {
        post_id: postId,
        handle: handle || 'anon',
        amount: Math.floor(amount * 100000000), // Convert BSV to satoshis
        lock_period: lockPeriod || 30, // 30 days default lock period
      }
    });

    res.json(lockLike);
  } catch (error) {
    console.error('Error creating lock like:', error);
    res.status(500).json({ message: 'Error creating lock like' });
  }
});

export default router; 