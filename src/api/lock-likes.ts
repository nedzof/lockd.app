import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db/prisma';

const router = Router();

interface LockLikeRequest {
  post_id: string;  // The post's id
  author_address: string;
  amount: number;
  lock_duration: number;
}

interface vote_optionLockRequest {
  vote_option_id: string;  // The vote option's id
  author_address: string;
  amount: number;
  lock_duration: number;
}

interface LockLikeResponse {
  id: string;
  tx_id: string;
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
        tx_id: `${post.id}_${Date.now()}`, // Temporary tx_id until we get the real one
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

// Handle locking a vote option
const handlevote_optionLock = async (
  req: Request<{}, any, vote_optionLockRequest>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { vote_option_id, author_address, amount, lock_duration } = req.body;

    if (!vote_option_id || !amount || !author_address || !lock_duration) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    // First find the vote option by its id
    const vote_option = await prisma.vote_option.findUnique({
      where: {
        id: vote_option_id
      },
      include: {
        post: true
      }
    });

    if (!vote_option) {
      res.status(404).json({ 
        success: false,
        error: `Vote option with id ${vote_option_id} not found`
      });
      return;
    }

    // Create the lock like record for the vote option
    const lockLike = await prisma.lockLike.create({
      data: {
        tx_id: `${vote_option.id}_${Date.now()}`, // Temporary tx_id until we get the real one
        post_id: vote_option.post.id, // Link to the parent post
        vote_option_id: vote_option.id, // Link to the specific vote option
        author_address,
        amount,
        lock_duration,
        created_at: new Date()
      }
    });

    // Update the vote option's total locked amount
    await prisma.vote_option.update({
      where: {
        id: vote_option_id
      },
      data: {
        lock_amount: {
          increment: amount
        }
      }
    });

    res.status(201).json({
      success: true,
      data: lockLike
    });
  } catch (error) {
    console.error('Error creating vote option lock:', error);
    res.status(500).json({ 
      message: 'Error creating vote option lock', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

router.post('/', handleLockLike);
router.post('/vote-options', handlevote_optionLock);

export default router;