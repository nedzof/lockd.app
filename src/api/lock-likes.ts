import express, { Router, Request, Response } from 'express';
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

/**
 * Extremely simplified handler for both post and vote option locks
 * This immediately records the lock in the database without any validation
 * or verification of the transaction, post, or vote option
 */
const handleLock = async (
  req: Request,
  res: Response,
  isVoteOption: boolean = false
): Promise<void> => {
  const requestId = `lock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const startTime = logPerformance(requestId, 'Request received');
  
  try {
    logger.info(`[${requestId}] Received lock request: ${JSON.stringify(req.body)}`);
    
    // Extract fields from request
    const { 
      author_address, 
      amount, 
      lock_duration, 
      tx_id: provided_tx_id,
      post_id,
      vote_option_id 
    } = req.body;

    // Add detailed logging for amount diagnostics
    logger.info(`[${requestId}] 🔍 AMOUNT DEBUG:`, {
      raw_amount: amount,
      amount_type: typeof amount,
      is_defined: amount !== undefined,
      is_null: amount === null,
      string_value: String(amount),
      number_value: Number(amount),
      parsed_float: parseFloat(String(amount)),
      body_keys: Object.keys(req.body)
    });

    // Validate minimum required fields
    if (!provided_tx_id || (isVoteOption && !vote_option_id) || (!isVoteOption && !post_id)) {
      logger.warn(`[${requestId}] Missing critical fields`);
        res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
      });
      return;
    }

    // Improved amount validation - ensure it's properly converted to a number
    // First check if it's already a number type
    let numericAmount = typeof amount === 'number' ? amount : 0;
    
    // If not a number, try to parse it
    if (!numericAmount && typeof amount === 'string') {
      try {
        numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) {
          numericAmount = 0;
        }
      } catch (e) {
        logger.warn(`[${requestId}] Failed to parse amount: ${amount}`);
        numericAmount = 0;
      }
    }
    
    // Additional amount parsing diagnostics
    logger.info(`[${requestId}] 🔍 AMOUNT PARSING:`, {
      original: amount,
      after_parsing: numericAmount,
      is_zero: numericAmount === 0,
      is_falsy: !numericAmount
    });
    
    // Ensure the amount is a positive number
    if (numericAmount <= 0) {
      logger.warn(`[${requestId}] Invalid amount provided: ${amount}, using fallback`);
      numericAmount = 1000; // Default to 1000 sats if invalid
      logger.info(`[${requestId}] 🔍 FALLBACK AMOUNT SET: ${numericAmount}`);
    }
    
    logger.info(`[${requestId}] Parsed amount: ${numericAmount} (original: ${amount})`);
    
    // Get current block height to calculate unlock height
    const currentBlockHeight = await getCurrentBlockHeight();
    const unlock_height = currentBlockHeight + (lock_duration || 10); // Default to 10 blocks if not provided
    
    // Create the lock record - directly store without any validation
    const lockData = {
        tx_id: provided_tx_id,
      author_address: author_address || '',
      amount: numericAmount,
      unlock_height,
      post_id: post_id || '', // For vote option locks, this will be updated below
      vote_option_id: isVoteOption ? vote_option_id : null
    };
    
    // Log the final data being saved to the database
    logger.info(`[${requestId}] 🔍 FINAL DATA BEING SAVED:`, lockData);
    
    // For vote option locks, we need the post_id that corresponds to the vote_option_id
    if (isVoteOption && vote_option_id) {
      try {
        // Try to get the post_id from the vote option, but don't fail if not found
        const vote_option = await prisma.vote_option.findUnique({
          where: { id: vote_option_id },
          select: { post_id: true }
        });
        
        if (vote_option) {
          lockData.post_id = vote_option.post_id;
        }
      } catch (error) {
        // If we can't find the vote option, just log and continue with the provided or empty post_id
        logger.warn(`[${requestId}] Could not find vote option with id ${vote_option_id}, using fallback post_id: ${post_id || ''}`);
      }
    }
    
    logger.info(`[${requestId}] Creating lock with data:`, lockData);
    
    // Create the lock record directly - no validation, just store it
    const lockLike = await prisma.lock_like.create({ data: lockData });
    logPerformance(requestId, 'Lock record created', startTime);
    
    logger.info(`[${requestId}] Lock created successfully with ID: ${lockLike.id}`);

    res.status(201).json({
      success: true,
      data: lockLike
    });
  } catch (error) {
    logger.error(`[${requestId}] Error creating lock: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

// Handle routes with the unified handler
router.post('/', (req, res) => handleLock(req, res, false));
router.post('/posts', (req, res) => handleLock(req, res, false)); // Alias for /
router.post('/vote-options', (req, res) => handleLock(req, res, true));

export default router;