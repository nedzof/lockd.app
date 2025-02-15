import express, { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router: Router = express.Router();
const prisma = new PrismaClient();

interface LockLikeRequest {
  postId: string;
  handle: string;
  amount: number;
  nLockTime: number;
  txid: string;
}

router.post('/', async (req: Request<{}, {}, LockLikeRequest>, res: Response) => {
  try {
    const { postId, handle, amount, nLockTime, txid } = req.body;

    if (!postId || !amount || !handle || !nLockTime || !txid) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Create the lock like record
    const lockLike = await prisma.lockLike.create({
      data: {
        txid,
        postId,
        amount,
        handle,
        lockPeriod: nLockTime,
      }
    });

    // Update the post's total locked amount
    await prisma.post.update({
      where: {
        id: postId
      },
      data: {
        amount: {
          increment: amount
        }
      }
    });

    return res.json(lockLike);
  } catch (error) {
    console.error('Error creating lock like:', error);
    return res.status(500).json({ message: 'Error creating lock like', error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router; 