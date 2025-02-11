import express, { Request, Response, Router, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';

const router: Router = express.Router();
const prisma = new PrismaClient();

interface LockLikeRequest {
  postId: string;
  handle?: string;
  amount: number;
  lockPeriod?: number;
}

const handleLockLike: RequestHandler = async (req, res) => {
  try {
    const { postId, handle, amount, lockPeriod } = req.body as LockLikeRequest;

    if (!postId || !amount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const lockLike = await prisma.post.update({
      where: {
        id: postId
      },
      data: {
        amount: {
          increment: Math.floor(amount * 100000000) // Convert BSV to satoshis
        }
      }
    });

    res.json(lockLike);
  } catch (error) {
    console.error('Error creating lock like:', error);
    res.status(500).json({ message: 'Error creating lock like' });
  }
};

router.post('/', handleLockLike);

export default router; 