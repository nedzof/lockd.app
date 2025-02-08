import { YoursWallet } from './yours-wallet.service';
import { WalletError } from '../../shared/utils/errors';

interface WalletManagerConfig {
  defaultNetwork?: 'mainnet' | 'testnet';
}

export class WalletManager {
  private static instance: WalletManager;
  private wallet: YoursWallet | null = null;
  private config: WalletManagerConfig;

  private constructor(config: WalletManagerConfig = {}) {
    this.config = config;
  }

  static getInstance(config: WalletManagerConfig = {}): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager(config);
    }
    return WalletManager.instance;
  }

  async connectWallet(): Promise<void> {
    try {
      if (!this.wallet) {
        this.wallet = new YoursWallet();
      }

      await this.wallet.connect();
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to connect wallet');
    }
  }

  async disconnectWallet(): Promise<void> {
    try {
      if (!this.wallet) {
        throw new WalletError('No wallet instance');
      }

      await this.wallet.disconnect();
      this.wallet = null;
    } catch (err) {
      throw err instanceof WalletError ? err : new WalletError('Failed to disconnect wallet');
    }
  }

  isWalletConnected(): boolean {
    return !!this.wallet;
  }

  getWallet(): YoursWallet | null {
    return this.wallet;
  }
} 