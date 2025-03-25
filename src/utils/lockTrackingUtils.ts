import { PrismaClient } from '@prisma/client';
import logger from '../services/logger';

const prisma = new PrismaClient();

/**
 * Format BSV amount for display
 * @param bsvAmount BSV amount in satoshis
 */
export const formatBsvAmount = (satoshis: number): string => {
  const bsv = satoshis / 100000000;
  return bsv.toFixed(bsv < 0.001 ? 8 : bsv < 0.1 ? 5 : 3);
};

/**
 * Get lock status - whether it's active or completed
 * @param unlockHeight Block height when lock expires
 * @param currentHeight Current block height
 */
export const getLockStatus = (unlockHeight: number | null, currentHeight: number): 'active' | 'completed' => {
  if (!unlockHeight) return 'completed';
  return unlockHeight > currentHeight ? 'active' : 'completed';
};

/**
 * Calculate remaining lock time in blocks
 * @param unlockHeight Block height when lock expires
 * @param currentHeight Current block height
 */
export const getRemainingLockBlocks = (unlockHeight: number | null, currentHeight: number): number => {
  if (!unlockHeight) return 0;
  const remaining = unlockHeight - currentHeight;
  return remaining > 0 ? remaining : 0;
};

/**
 * Get the current block height from the database
 */
export const getCurrentBlockHeight = async (): Promise<number> => {
  try {
    const latestBlock = await prisma.processed_transaction.findFirst({
      orderBy: {
        block_height: 'desc',
      },
      select: {
        block_height: true,
      },
    });
    
    return latestBlock?.block_height || 800000; // Fallback to approximate height
  } catch (error) {
    logger.error('Error getting current block height:', error);
    return 800000; // Fallback to approximate height
  }
};

/**
 * Get lock statistics for a post
 * @param postId Post ID
 */
export const getPostLockStats = async (postId: string) => {
  try {
    // Get current block height
    const currentHeight = await getCurrentBlockHeight();
    
    // Get all locks for this post
    const locks = await prisma.lock_like.findMany({
      where: {
        post_id: postId,
      },
      select: {
        id: true,
        amount: true,
        author_address: true,
        lock_height: true,
        unlock_height: true,
        created_at: true,
        vote_option_id: true,
      },
    });
    
    // Calculate statistics
    const totalLockCount = locks.length;
    const totalAmountLocked = locks.reduce((sum, lock) => sum + lock.amount, 0);
    
    // Separate by vote options if applicable
    const voteOptionLocks = new Map<string | null, { count: number; amount: number }>();
    locks.forEach(lock => {
      const optionId = lock.vote_option_id;
      if (!voteOptionLocks.has(optionId)) {
        voteOptionLocks.set(optionId, { count: 0, amount: 0 });
      }
      
      const stats = voteOptionLocks.get(optionId)!;
      stats.count++;
      stats.amount += lock.amount;
    });
    
    // Calculate active versus completed locks
    const activeLocks = locks.filter(lock => 
      lock.unlock_height !== null && lock.unlock_height > currentHeight
    );
    
    const completedLocks = locks.filter(lock => 
      lock.unlock_height === null || lock.unlock_height <= currentHeight
    );
    
    return {
      totalLockCount,
      totalAmountLocked,
      activeLockCount: activeLocks.length,
      activeAmountLocked: activeLocks.reduce((sum, lock) => sum + lock.amount, 0),
      completedLockCount: completedLocks.length,
      completedAmountLocked: completedLocks.reduce((sum, lock) => sum + lock.amount, 0),
      voteOptionStats: Object.fromEntries(voteOptionLocks),
      currentBlockHeight: currentHeight,
    };
  } catch (error) {
    logger.error(`Error getting lock stats for post ${postId}:`, error);
    throw error;
  }
};

/**
 * Get all locks for a specific user
 * @param authorAddress User's wallet address
 */
export const getUserLocks = async (authorAddress: string) => {
  try {
    // Get current block height
    const currentHeight = await getCurrentBlockHeight();
    
    // Get all locks by this user
    const locks = await prisma.lock_like.findMany({
      where: {
        author_address: authorAddress,
      },
      include: {
        post: {
          select: {
            id: true,
            content: true,
            created_at: true,
            author_address: true,
          },
        },
        vote_option: {
          select: {
            id: true,
            content: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
    
    // Add status and remaining blocks to each lock
    const locksWithStatus = locks.map(lock => ({
      ...lock,
      status: getLockStatus(lock.unlock_height, currentHeight),
      remainingBlocks: getRemainingLockBlocks(lock.unlock_height, currentHeight),
      lockDuration: lock.unlock_height && lock.lock_height ? 
        lock.unlock_height - lock.lock_height : 
        null,
    }));
    
    return {
      locks: locksWithStatus,
      totalLockCount: locks.length,
      totalAmountLocked: locks.reduce((sum, lock) => sum + lock.amount, 0),
      currentBlockHeight: currentHeight,
    };
  } catch (error) {
    logger.error(`Error getting locks for user ${authorAddress}:`, error);
    throw error;
  }
}; 