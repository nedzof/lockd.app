import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma';

const router = Router();

interface LockLikeRequest {
  post_id: string;  // The post's id
  author_address: string;
  amount: number;
  lock_duration: number;
}

interface LockLikeResponse {
  id: string;
  txid: string;
  author_address: string | null;
  amount: number;
  lock_duration: number;
  unlock_height: number | null;
  created_at: Date;
  post_id: string;
}

const handleLockLike = async (
  req: Request<{}, any, LockLikeRequest>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { post_id, author_address, amount, lock_duration } = req.body;

    if (!post_id || !amount || !author_address || !lock_duration) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    // First find the post by its id
    const post = await prisma.post.findUnique({
      where: {
        id: post_id
      }
    });

    if (!post) {
      res.status(404).json({ 
        success: false,
        error: `Post with id ${post_id} not found`
      });
      return;
    }

    // Create the lock like record using the post's id
    const lockLike = await prisma.lockLike.create({
      data: {
        txid: `${post.id}_${Date.now()}`, // Temporary txid until we get the real one
        post_id: post.id,
        author_address,
        amount,
        lock_duration,
        created_at: new Date()
      }
    });

    res.status(201).json({
      success: true,
      data: lockLike
    });
  } catch (error) {
    console.error('Error creating lock like:', error);
    res.status(500).json({ 
      message: 'Error creating lock like', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

router.post('/', handleLockLike);

export default router; 