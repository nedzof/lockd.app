import { useYoursWallet, NetWork } from 'yours-wallet-provider';
import { Lock } from '../types';
import { WalletError } from '../../shared/utils/errors';

type YoursEvents = 'switchAccount' | 'signedOut';

interface LockTransactionParams {
  recipientAddress: string;
  amount: number;
  lockUntilHeight: number;
}

export class YoursWallet {
  private wallet = useYoursWallet();

  async connect(): Promise<string> {
    try {
      if (!this.wallet?.isReady) {
        throw new WalletError('Yours Wallet is not ready');
      }

      const identityPubKey = await this.wallet.connect();
      if (!identityPubKey) {
        throw new WalletError('Failed to get identity public key');
      }

      return identityPubKey;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to connect wallet');
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      await this.wallet.disconnect();
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to disconnect wallet');
    }
  }

  async getAddresses(): Promise<{ bsvAddress: string }> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      const addresses = await this.wallet.getAddresses();
      if (!addresses || !addresses[0]) {
        throw new WalletError('Failed to get BSV address');
      }

      return { bsvAddress: addresses[0] };
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to get addresses');
    }
  }

  async getBalance(): Promise<number> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      const balance = await this.wallet.getBalance();
      if (balance === undefined) {
        throw new WalletError('Failed to get balance');
      }

      return Number(balance);
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to get balance');
    }
  }

  async getNetwork(): Promise<NetWork> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      const network = await this.wallet.getNetwork();
      if (!network) {
        throw new WalletError('Failed to get network');
      }

      return network;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to get network');
    }
  }

  async createLockTransaction(params: LockTransactionParams): Promise<string> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      // Mock implementation - replace with actual transaction creation
      const txId = `tx_${Date.now()}`;
      return txId;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to create lock transaction');
    }
  }

  async getLocks(): Promise<Lock[]> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      // Mock implementation - replace with actual lock fetching
      return [];
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to get locks');
    }
  }

  async unlockTransaction(lockId: string): Promise<string> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      // Mock implementation - replace with actual unlock transaction
      const txId = `tx_${Date.now()}`;
      return txId;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to unlock transaction');
    }
  }

  on(event: YoursEvents, handler: () => void): void {
    if (!this.wallet?.on) return;
    this.wallet.on(event, handler);
  }

  removeListener(event: YoursEvents, handler: () => void): void {
    if (!this.wallet?.removeListener) return;
    this.wallet.removeListener(event, handler);
  }
} 