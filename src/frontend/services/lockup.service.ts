import { Lock, CreateLockParams } from '../types';
import { WalletError } from '../../shared/utils/errors';
import { YoursWallet } from './yours-wallet.service';

export class LockupService {
  constructor(private wallet: YoursWallet) {}

  async createLock(params: CreateLockParams): Promise<string> {
    try {
      const { recipientAddress, amount, lockUntilHeight } = params;

      // Validate parameters
      if (!recipientAddress) throw new WalletError('Recipient address is required');
      if (!amount || amount <= 0) throw new WalletError('Invalid amount');
      if (!lockUntilHeight || lockUntilHeight <= 0) throw new WalletError('Invalid lock height');

      // Create lock transaction
      const txId = await this.wallet.createLockTransaction({
        recipientAddress,
        amount,
        lockUntilHeight
      });

      return txId;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to create lock');
    }
  }

  async getLocks(): Promise<Lock[]> {
    try {
      const locks = await this.wallet.getLocks();
      return locks;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to get locks');
    }
  }

  async unlock(lockId: string): Promise<string> {
    try {
      if (!lockId) throw new WalletError('Lock ID is required');

      const txId = await this.wallet.unlockTransaction(lockId);
      return txId;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to unlock');
    }
  }
} 