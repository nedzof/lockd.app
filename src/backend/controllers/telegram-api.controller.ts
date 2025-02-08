import { Router, Request, Response } from 'express';
import { LockTrackingService } from '../services/lock-tracking.service';
import { TransactionService } from '../services/transaction.service';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';
import { validateBsvAddress, validateAmount } from '../../shared/utils/validation';
import { getBlockHeight } from '../../shared/utils/blockchain';

const router = Router();
const lockTrackingService = new LockTrackingService();
const transactionService = new TransactionService();

/**
 * Get user's locks
 * GET /api/telegram/locks/:userId
 */
router.get('/locks/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const locks = await lockTrackingService.getUserLocks(userId);
    
    // Format response for Telegram
    const formattedLocks = locks.map(lock => ({
      id: lock.id,
      txId: lock.txId,
      amount: lock.amount,
      status: lock.status,
      lockUntilHeight: lock.lockUntilHeight,
      createdAt: lock.createdAt,
      unlockTime: lock.unlockTime
    }));

    res.json({ success: true, locks: formattedLocks });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof WalletError ? error.message : 'Failed to get locks'
    });
  }
});

/**
 * Get lock details
 * GET /api/telegram/lock/:lockId
 */
router.get('/lock/:lockId', async (req: Request, res: Response) => {
  try {
    const { lockId } = req.params;
    const lock = await lockTrackingService.getLock(lockId);
    const transactions = await lockTrackingService.getLockTransactions(lockId);

    // Get estimated unlock time
    const currentHeight = await getBlockHeight();
    const remainingBlocks = Math.max(0, lock.lockUntilHeight - currentHeight);
    const estimatedUnlockTime = new Date(Date.now() + remainingBlocks * 10 * 60 * 1000); // 10 minutes per block

    res.json({
      success: true,
      lock: {
        ...lock,
        remainingBlocks,
        estimatedUnlockTime
      },
      transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof WalletError ? error.message : 'Failed to get lock details'
    });
  }
});

/**
 * Create new lock
 * POST /api/telegram/lock
 * Body: {
 *   creatorId: string;
 *   recipientAddress: string;
 *   amount: number;
 *   lockPeriodDays: number;
 * }
 */
router.post('/lock', async (req: Request, res: Response) => {
  try {
    const { creatorId, recipientAddress, amount, lockPeriodDays } = req.body;

    // Validate inputs
    if (!validateBsvAddress(recipientAddress)) {
      throw new WalletError('Invalid recipient address', ErrorCodes.INVALID_ADDRESS);
    }
    if (!validateAmount(amount)) {
      throw new WalletError('Invalid amount', ErrorCodes.INVALID_AMOUNT);
    }
    if (!lockPeriodDays || lockPeriodDays < 1 || lockPeriodDays > 365) {
      throw new WalletError('Lock period must be between 1 and 365 days', ErrorCodes.INVALID_LOCK_PERIOD);
    }

    // Calculate lock height (assuming ~144 blocks per day)
    const currentHeight = await getBlockHeight();
    const lockUntilHeight = currentHeight + (lockPeriodDays * 144);

    // Create lock
    const lock = await lockTrackingService.createLock(
      '', // txId will be set after transaction is created
      creatorId,
      recipientAddress,
      amount,
      lockUntilHeight,
      { source: 'telegram' }
    );

    res.json({
      success: true,
      lock,
      message: `Lock created successfully. Amount: ${amount} satoshis, Duration: ${lockPeriodDays} days`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof WalletError ? error.message : 'Failed to create lock'
    });
  }
});

/**
 * Get lock status
 * GET /api/telegram/lock/:lockId/status
 */
router.get('/lock/:lockId/status', async (req: Request, res: Response) => {
  try {
    const { lockId } = req.params;
    const lock = await lockTrackingService.getLock(lockId);
    const currentHeight = await getBlockHeight();

    const status = {
      lockStatus: lock.status,
      currentHeight,
      targetHeight: lock.lockUntilHeight,
      remainingBlocks: Math.max(0, lock.lockUntilHeight - currentHeight),
      isUnlockable: currentHeight >= lock.lockUntilHeight,
      amount: lock.amount,
      unlockTime: lock.unlockTime
    };

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof WalletError ? error.message : 'Failed to get lock status'
    });
  }
});

/**
 * Get transaction status
 * GET /api/telegram/transaction/:txId/status
 */
router.get('/transaction/:txId/status', async (req: Request, res: Response) => {
  try {
    const { txId } = req.params;
    const transactions = await lockTrackingService.getLockTransactions(txId);
    const transaction = transactions[0]; // Get the most recent transaction

    if (!transaction) {
      throw new WalletError('Transaction not found', ErrorCodes.TX_NOT_FOUND);
    }

    res.json({
      success: true,
      status: transaction.status,
      type: transaction.type,
      amount: transaction.amount,
      createdAt: transaction.createdAt
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof WalletError ? error.message : 'Failed to get transaction status'
    });
  }
});

/**
 * Get user's statistics
 * GET /api/telegram/user/:userId/stats
 */
router.get('/user/:userId/stats', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const locks = await lockTrackingService.getUserLocks(userId);

    const stats = {
      totalLocks: locks.length,
      activeLocks: locks.filter(l => l.status === 'CONFIRMED').length,
      totalAmountLocked: locks.reduce((sum, l) => sum + l.amount, 0),
      completedLocks: locks.filter(l => l.status === 'UNLOCKED').length,
      failedLocks: locks.filter(l => l.status === 'FAILED').length
    };

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof WalletError ? error.message : 'Failed to get user statistics'
    });
  }
});

export default router; 