import { YoursWallet } from './yours-wallet.service';
import { Lock, CreateLockParams, LockStatus } from '../types';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';
import { validateBsvAddress } from '../../shared/utils/validation';
import { getBlockHeight } from '../../shared/utils/blockchain';

export class LockupService {
  private wallet: YoursWallet;

  constructor(wallet: YoursWallet) {
    this.wallet = wallet;
  }

  /**
   * Creates a new lock
   */
  async createLock(params: CreateLockParams): Promise<string> {
    // Validate recipient address
    if (!validateBsvAddress(params.recipientAddress, this.wallet.getNetwork() === 'testnet')) {
      throw new WalletError(
        'Invalid recipient address',
        ErrorCodes.INVALID_ADDRESS
      );
    }

    // Validate amount
    if (params.amount <= 0) {
      throw new WalletError(
        'Invalid amount',
        ErrorCodes.INVALID_AMOUNT
      );
    }

    // Validate lock height
    const currentHeight = await getBlockHeight();
    if (params.lockUntilHeight <= currentHeight) {
      throw new WalletError(
        'Lock height must be greater than current block height',
        ErrorCodes.INVALID_BLOCK_HEIGHT
      );
    }

    try {
      // Get wallet address and public key
      const address = await this.wallet.getAddress();
      const publicKey = await this.wallet.getPublicKey();

      // Create lock transaction
      const txId = await this.wallet.sendPayment({
        address: params.recipientAddress,
        amount: params.amount,
        data: {
          type: 'LOCK',
          lockUntilHeight: params.lockUntilHeight,
          creatorPublicKey: publicKey
        }
      });

      return txId;
    } catch (error) {
      throw new WalletError(
        'Failed to create lock',
        ErrorCodes.TX_BUILD_FAILED,
        undefined,
        error
      );
    }
  }

  /**
   * Gets all locks for the current wallet
   */
  async getLocks(): Promise<Lock[]> {
    try {
      const address = await this.wallet.getAddress();
      
      // TODO: Implement API call to get locks from backend
      // This is a mock implementation
      return [];
    } catch (error) {
      throw new WalletError(
        'Failed to get locks',
        ErrorCodes.API_ERROR,
        undefined,
        error
      );
    }
  }

  /**
   * Unlocks a specific lock
   */
  async unlock(lockId: string): Promise<string> {
    try {
      // Get lock details
      const locks = await this.getLocks();
      const lock = locks.find(l => l.id === lockId);

      if (!lock) {
        throw new WalletError(
          'Lock not found',
          ErrorCodes.LOCK_NOT_FOUND
        );
      }

      if (lock.status !== LockStatus.CONFIRMED) {
        throw new WalletError(
          'Lock cannot be unlocked',
          ErrorCodes.INVALID_LOCK_STATUS
        );
      }

      // Check block height
      const currentHeight = await getBlockHeight();
      if (currentHeight < lock.lockUntilHeight) {
        throw new WalletError(
          'Lock is not yet unlockable',
          ErrorCodes.INVALID_BLOCK_HEIGHT
        );
      }

      // Create unlock transaction
      const txId = await this.wallet.sendPayment({
        address: await this.wallet.getAddress(), // Send back to wallet address
        amount: lock.amount,
        data: {
          type: 'UNLOCK',
          lockId: lock.id
        }
      });

      return txId;
    } catch (error) {
      throw new WalletError(
        'Failed to unlock',
        ErrorCodes.TX_BUILD_FAILED,
        undefined,
        error
      );
    }
  }
} 