import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import logger from '../services/logger';
import { getPostLockStats, getUserLocks, getCurrentBlockHeight } from '../utils/lockTrackingUtils';

const prisma = new PrismaClient();

/**
 * Get lock statistics for a specific post
 */
export const getPostLockStatsHandler = async (
  req: Request<{ postId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { postId } = req.params;
    
    if (!postId) {
      res.status(400).json({ message: 'Missing post ID' });
      return;
    }
    
    // Get lock statistics for the post
    const stats = await getPostLockStats(postId);
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error getting post lock stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving lock statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get all locks for a specific user
 */
export const getUserLocksHandler = async (
  req: Request<{ address: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { address } = req.params;
    
    if (!address) {
      res.status(400).json({ message: 'Missing wallet address' });
      return;
    }
    
    // Get all locks by this user
    const userLocks = await getUserLocks(address);
    
    res.status(200).json({
      success: true,
      data: userLocks
    });
  } catch (error) {
    logger.error('Error getting user locks:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user locks',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get overall lock statistics
 */
export const getOverallLockStatsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get current block height
    const currentHeight = await getCurrentBlockHeight();
    
    // Get total locks and amount
    const totalStats = await prisma.lock_like.aggregate({
      _count: { id: true },
      _sum: { amount: true }
    });
    
    // Get active locks (those that haven't expired yet)
    const activeLocks = await prisma.lock_like.findMany({
      where: {
        unlock_height: {
          gt: currentHeight
        }
      },
      select: {
        id: true,
        amount: true
      }
    });
    
    // Calculate active lock statistics
    const activeStats = {
      count: activeLocks.length,
      amount: activeLocks.reduce((sum, lock) => sum + lock.amount, 0)
    };
    
    // Get top lockers by amount
    const topLockers = await prisma.lock_like.groupBy({
      by: ['author_address'],
      _sum: {
        amount: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          amount: 'desc'
        }
      },
      take: 10,
      where: {
        author_address: {
          not: null
        }
      }
    });
    
    // Get top locked posts
    const topPosts = await prisma.lock_like.groupBy({
      by: ['post_id'],
      _sum: {
        amount: true
      },
      _count: {
        id: true
      },
      orderBy: {
        _sum: {
          amount: 'desc'
        }
      },
      take: 10
    });
    
    // Format the response
    res.status(200).json({
      success: true,
      data: {
        currentBlockHeight: currentHeight,
        totalLocks: totalStats._count.id || 0,
        totalAmountLocked: totalStats._sum.amount || 0,
        activeLocks: activeStats.count,
        activeAmountLocked: activeStats.amount,
        topLockers: topLockers.map(locker => ({
          address: locker.author_address,
          locks: locker._count.id,
          amountLocked: locker._sum.amount
        })),
        topPosts: topPosts.map(post => ({
          postId: post.post_id,
          locks: post._count.id,
          amountLocked: post._sum.amount
        }))
      }
    });
  } catch (error) {
    logger.error('Error getting overall lock stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving overall lock statistics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 