import { PrismaClient } from '@prisma/client';
import { Lock, Transaction, TxType, TxStatus, LockStatus } from '../../frontend/types';
import { PusherBackendService } from './pusher.service';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';
import { getTransaction } from '../../shared/utils/blockchain';

export class LockTrackingService {
  private prisma: PrismaClient;
  private pusher: PusherBackendService;

  constructor() {
    this.prisma = new PrismaClient();
    this.pusher = PusherBackendService.getInstance();
  }

  /**
   * Creates a new lock record
   */
  public async createLock(
    txId: string,
    creatorId: string,
    recipientId: string,
    amount: number,
    lockUntilHeight: number,
    metadata?: Record<string, any>
  ): Promise<Lock> {
    try {
      // Create lock record
      const lock = await this.prisma.lock.create({
        data: {
          txId,
          creatorId,
          recipientId,
          amount,
          lockUntilHeight,
          status: LockStatus.PENDING,
          metadata
        }
      });

      // Create transaction record
      await this.prisma.transaction.create({
        data: {
          lockId: lock.id,
          txId,
          type: TxType.LOCK,
          amount,
          status: TxStatus.PENDING,
          metadata
        }
      });

      // Notify subscribers
      await this.pusher.triggerNewLock(txId, {
        lockId: lock.id,
        status: lock.status
      });

      return lock;
    } catch (error) {
      throw new WalletError(
        'Failed to create lock record',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Updates a lock's status
   */
  public async updateLockStatus(
    lockId: string,
    status: LockStatus,
    unlockTxId?: string
  ): Promise<Lock> {
    try {
      const lock = await this.prisma.lock.update({
        where: { id: lockId },
        data: {
          status,
          unlockTxId,
          unlockTime: status === LockStatus.UNLOCKED ? new Date() : undefined
        }
      });

      // Notify subscribers
      await this.pusher.triggerLockUpdate(lock.txId, {
        lockId: lock.id,
        status: lock.status,
        unlockTxId
      });

      return lock;
    } catch (error) {
      throw new WalletError(
        'Failed to update lock status',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Gets locks for a user
   */
  public async getUserLocks(userId: string): Promise<Lock[]> {
    try {
      return await this.prisma.lock.findMany({
        where: {
          OR: [
            { creatorId: userId },
            { recipientId: userId }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      throw new WalletError(
        'Failed to get user locks',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Gets a specific lock
   */
  public async getLock(lockId: string): Promise<Lock> {
    try {
      const lock = await this.prisma.lock.findUnique({
        where: { id: lockId }
      });

      if (!lock) {
        throw new WalletError(
          'Lock not found',
          ErrorCodes.LOCK_NOT_FOUND
        );
      }

      return lock;
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        'Failed to get lock',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Gets transactions for a lock
   */
  public async getLockTransactions(lockId: string): Promise<Transaction[]> {
    try {
      return await this.prisma.transaction.findMany({
        where: { lockId },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } catch (error) {
      throw new WalletError(
        'Failed to get lock transactions',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Updates transaction status
   */
  public async updateTransactionStatus(
    txId: string,
    status: TxStatus
  ): Promise<Transaction> {
    try {
      const transaction = await this.prisma.transaction.update({
        where: { txId },
        data: { status }
      });

      // If this is a lock transaction, update the lock status
      if (transaction.type === TxType.LOCK) {
        await this.updateLockStatus(
          transaction.lockId,
          status === TxStatus.CONFIRMED ? LockStatus.CONFIRMED : LockStatus.FAILED
        );
      }
      // If this is an unlock transaction, update the lock status
      else if (transaction.type === TxType.UNLOCK && status === TxStatus.CONFIRMED) {
        await this.updateLockStatus(
          transaction.lockId,
          LockStatus.UNLOCKED,
          txId
        );
      }

      return transaction;
    } catch (error) {
      throw new WalletError(
        'Failed to update transaction status',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Monitors transaction confirmations
   */
  public async monitorTransaction(txId: string): Promise<void> {
    try {
      const txDetails = await getTransaction(txId);
      
      if (txDetails.confirmations > 0) {
        await this.updateTransactionStatus(txId, TxStatus.CONFIRMED);
      } else if (txDetails.confirmations === -1) {
        await this.updateTransactionStatus(txId, TxStatus.FAILED);
      }
    } catch (error) {
      throw new WalletError(
        'Failed to monitor transaction',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }
} 