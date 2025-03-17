import express, { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db';
import { logger } from '../utils/logger';

const router = Router();

// Helper function to get the current block height
async function getCurrentBlockHeight(): Promise<number> {
  try {
    // Try to get the latest block height from the processed_transaction table
    const latestTransaction = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      }
    });
    
    if (latestTransaction && latestTransaction.block_height > 0) {
      return latestTransaction.block_height;
    }
    
    // Fallback to a default value if no transactions are found
    return 800000; // Approximate current BSV block height
  } catch (error) {
    logger.error('Error getting current block height:', error);
    return 800000; // Fallback to approximate current BSV block height
  }
}

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
  unlock_height: number | null;
  created_at: Date;
  post_id: string;
  vote_option_id?: string | null;
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

    // Get the current block height
    const currentBlockHeight = await getCurrentBlockHeight();
    
    // Calculate unlock height based on lock duration (in blocks)
    const unlock_height = currentBlockHeight + lock_duration;

    // Create the lock like record using the post's id
    const lockLike = await prisma.lock_like.create({
      data: {
        tx_id: `lock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        post_id: post.id,
        author_address,
        amount,
        unlock_height // Store the lock_duration as unlock_height
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

    // Get the current block height
    const currentBlockHeight = await getCurrentBlockHeight();
    
    // Calculate unlock height based on lock duration (in blocks)
    const unlock_height = currentBlockHeight + lock_duration;

    // Create a new lock like for the vote option
    const lockLike = await prisma.lock_like.create({
      data: {
        tx_id: `lock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        author_address,
        amount,
        unlock_height, // Store the lock_duration as unlock_height
        post_id: vote_option.post_id,
        vote_option_id: vote_option.id
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