import express, { Router, Request, Response, NextFunction } from 'express';
import prisma from '../db';
import { logger } from '../utils/logger';

const router = Router();

// Helper function to log performance
const logPerformance = (requestId: string, step: string, startTime?: number) => {
  const now = Date.now();
  const elapsed = startTime ? `${now - startTime}ms` : 'start';
  logger.info(`[${requestId}] [LockLikes API] ${step}: ${elapsed}`);
  return now;
};

// Helper function to get the current block height
async function getCurrentBlockHeight(): Promise<number> {
  try {
    const startTime = Date.now();
    // Try to get the latest block height from the processed_transaction table
    const latestTransaction = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc'
      }
    });
    
    const elapsed = Date.now() - startTime;
    logger.debug(`getCurrentBlockHeight took ${elapsed}ms, result: ${latestTransaction?.block_height || 'not found'}`);
    
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
  tx_id?: string;   // Optional transaction id from the wallet
}

interface vote_optionLockRequest {
  vote_option_id: string;  // The vote option's id
  author_address: string;
  amount: number;
  lock_duration: number;
  tx_id?: string;   // Optional transaction id from the wallet
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
  const requestId = `lock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const startTime = logPerformance(requestId, 'Request received');
  
  try {
    logger.info(`[${requestId}] Received lock like request: ${JSON.stringify(req.body)}`);
    const { post_id, author_address, amount, lock_duration } = req.body;

    if (!post_id || !amount || !author_address || !lock_duration) {
      logger.warn(`[${requestId}] Missing required fields`);
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    // First find the post by its id
    const findPostStart = logPerformance(requestId, 'Finding post');
    const post = await prisma.post.findUnique({
      where: {
        id: post_id
      }
    });
    logPerformance(requestId, 'Post found', findPostStart);

    if (!post) {
      logger.warn(`[${requestId}] Post with id ${post_id} not found`);
      res.status(404).json({ 
        success: false,
        error: `Post with id ${post_id} not found`
      });
      return;
    }

    // Get the current block height
    const blockHeightStart = logPerformance(requestId, 'Getting current block height');
    const currentBlockHeight = await getCurrentBlockHeight();
    logPerformance(requestId, `Current block height: ${currentBlockHeight}`, blockHeightStart);
    
    // Calculate unlock height based on lock duration (in blocks)
    const unlock_height = currentBlockHeight + lock_duration;
    logger.info(`[${requestId}] Calculated unlock height: ${unlock_height} (current: ${currentBlockHeight} + duration: ${lock_duration})`);

    // Create the lock like record using the post's id
    const createLockStart = logPerformance(requestId, 'Creating lock like record');
    const tx_id = req.body.tx_id || `lock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    logger.info(`[${requestId}] Using transaction ID: ${tx_id}`);
    
    const lockLike = await prisma.lock_like.create({
      data: {
        tx_id,
        post_id: post.id,
        author_address,
        amount,
        unlock_height // Store the lock_duration as unlock_height
      }
    });
    logPerformance(requestId, 'Lock like record created', createLockStart);

    const totalTime = logPerformance(requestId, 'Request completed', startTime);
    logger.info(`[${requestId}] Lock like created successfully in ${totalTime - startTime}ms`);

    res.status(201).json({
      success: true,
      data: lockLike
    });
  } catch (error) {
    const errorTime = logPerformance(requestId, 'Error occurred', startTime);
    console.error(`[${requestId}] Error creating lock like:`, error);
    logger.error(`[${requestId}] Error creating lock like: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
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
  const requestId = `vote-lock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const startTime = logPerformance(requestId, 'Request received');
  
  try {
    logger.info(`[${requestId}] Received vote option lock request: ${JSON.stringify(req.body)}`);
    const { vote_option_id, author_address, amount, lock_duration } = req.body;

    if (!vote_option_id || !amount || !author_address || !lock_duration) {
      logger.warn(`[${requestId}] Missing required fields`);
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    // First find the vote option by its id
    const findOptionStart = logPerformance(requestId, 'Finding vote option');
    const vote_option = await prisma.vote_option.findUnique({
      where: {
        id: vote_option_id
      },
      include: {
        post: true
      }
    });
    logPerformance(requestId, 'Vote option found', findOptionStart);

    if (!vote_option) {
      logger.warn(`[${requestId}] Vote option with id ${vote_option_id} not found`);
      res.status(404).json({ 
        success: false,
        error: `Vote option with id ${vote_option_id} not found`
      });
      return;
    }

    // Get the current block height
    const blockHeightStart = logPerformance(requestId, 'Getting current block height');
    const currentBlockHeight = await getCurrentBlockHeight();
    logPerformance(requestId, `Current block height: ${currentBlockHeight}`, blockHeightStart);
    
    // Calculate unlock height based on lock duration (in blocks)
    const unlock_height = currentBlockHeight + lock_duration;
    logger.info(`[${requestId}] Calculated unlock height: ${unlock_height} (current: ${currentBlockHeight} + duration: ${lock_duration})`);

    // Create a new lock like for the vote option
    const createLockStart = logPerformance(requestId, 'Creating vote option lock record');
    const tx_id = req.body.tx_id || `lock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    logger.info(`[${requestId}] Using transaction ID: ${tx_id}`);
    
    const lockLike = await prisma.lock_like.create({
      data: {
        tx_id,
        author_address,
        amount,
        unlock_height, // Store the lock_duration as unlock_height
        post_id: vote_option.post_id,
        vote_option_id: vote_option.id
      }
    });
    logPerformance(requestId, 'Vote option lock record created', createLockStart);

    const totalTime = logPerformance(requestId, 'Request completed', startTime);
    logger.info(`[${requestId}] Vote option lock created successfully in ${totalTime - startTime}ms`);

    res.status(201).json({
      success: true,
      data: lockLike
    });
  } catch (error) {
    const errorTime = logPerformance(requestId, 'Error occurred', startTime);
    console.error(`[${requestId}] Error creating vote option lock:`, error);
    logger.error(`[${requestId}] Error creating vote option lock: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    res.status(500).json({ 
      message: 'Error creating vote option lock', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

router.post('/', handleLockLike);
router.post('/vote-options', handlevote_optionLock);

export default router;