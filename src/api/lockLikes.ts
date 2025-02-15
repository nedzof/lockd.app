import express, { Request, Response, RequestHandler } from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

interface LockLikeRequest {
  postTxid: string;  // The post's txid
  handle: string;
  amount: number;
  nLockTime: number;
  txid: string;    // The lock transaction id
}

const handleLockLike: RequestHandler = async (req, res) => {
  try {
    const { postTxid, handle, amount, nLockTime, txid } = req.body as LockLikeRequest;

    if (!postTxid || !amount || !handle || !nLockTime || !txid) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // First find the post by its txid
    const post = await prisma.post.findUnique({
      where: {
        txid: postTxid
      }
    });

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Create the lock like record using the post's id
    const lockLike = await prisma.lockLike.create({
      data: {
        txid,
        postId: post.id,  // Use the post's id, not txid
        amount,
        handle,
        lockPeriod: nLockTime,
      }
    });

    // Update the post's total locked amount
    await prisma.post.update({
      where: {
        id: post.id
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
    return res.status(500).json({ 
      message: 'Error creating lock like', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

router.post('/', handleLockLike);

export default router; 