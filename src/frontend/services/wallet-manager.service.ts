import { WalletConfig } from './wallet.service';
import { YoursWallet } from './yours-wallet.service';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';

export interface WalletManagerConfig {
    defaultNetwork: 'mainnet' | 'testnet';
}

/**
 * Manages Yours wallet integration
 */
export class WalletManager {
    private static instance: WalletManager;
    private wallet: YoursWallet | null = null;
    private readonly config: WalletManagerConfig;

    private constructor(config: WalletManagerConfig) {
        this.config = config;
    }

    /**
     * Gets the singleton instance
     */
    public static getInstance(config?: WalletManagerConfig): WalletManager {
        if (!WalletManager.instance) {
            if (!config) {
                throw new WalletError(
                    'Configuration required for initialization',
                    ErrorCodes.WALLET_NOT_CONNECTED
                );
            }
            WalletManager.instance = new WalletManager(config);
        }
        return WalletManager.instance;
    }

    /**
     * Gets the current wallet instance
     */
    public getWallet(): YoursWallet {
        if (!this.wallet) {
            throw new WalletError(
                'No wallet connected',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }
        return this.wallet;
    }

    /**
     * Checks if a wallet is connected
     */
    public isWalletConnected(): boolean {
        return this.wallet !== null;
    }

    /**
     * Connects to Yours wallet
     */
    public async connectWallet(config?: Partial<WalletConfig>): Promise<void> {
        // Disconnect existing wallet if any
        await this.disconnectWallet();

        try {
            // Create wallet configuration
            const walletConfig: WalletConfig = {
                network: this.config.defaultNetwork,
                ...config
            };

            // Create and initialize Yours wallet
            this.wallet = new YoursWallet(walletConfig);
            await this.wallet.connect();
        } catch (error) {
            this.wallet = null;
            if (error instanceof WalletError) {
                throw error;
            }
            throw new WalletError(
                'Failed to connect wallet',
                ErrorCodes.WALLET_NOT_CONNECTED,
                'yours',
                error
            );
        }
    }

    /**
     * Disconnects the current wallet
     */
    public async disconnectWallet(): Promise<void> {
        if (this.wallet) {
            try {
                await this.wallet.disconnect();
            } catch (error) {
                // Log error but don't throw
                console.error('Error disconnecting wallet:', error);
            } finally {
                this.wallet = null;
            }
        }
    }

    /**
     * Gets the current wallet's network
     */
    public getNetwork(): 'mainnet' | 'testnet' {
        return this.config.defaultNetwork;
    }

    /**
     * Updates the wallet's configuration
     */
    public updateConfig(config: Partial<WalletManagerConfig>): void {
        Object.assign(this.config, config);
    }
} 