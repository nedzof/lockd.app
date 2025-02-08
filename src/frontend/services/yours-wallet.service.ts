import { BaseWallet, WalletConfig, SignMessageParams, PaymentParams } from './wallet.service';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';
import { YoursWallet as YoursSDK } from '@yours/sdk';

export class YoursWallet extends BaseWallet {
    private yoursWallet: YoursSDK | null = null;

    constructor(config: WalletConfig) {
        super(config);
    }

    /**
     * Connects to Yours wallet
     */
    async connect(): Promise<void> {
        try {
            // Initialize Yours wallet
            this.yoursWallet = new YoursSDK();
            
            // Request wallet connection
            await this.yoursWallet.connect();

            // Get wallet info
            const addresses = await this.yoursWallet.getAddresses();
            if (!addresses?.bsvAddress) {
                throw new WalletError(
                    'Failed to get BSV address',
                    ErrorCodes.WALLET_NOT_CONNECTED
                );
            }

            this.address = addresses.bsvAddress;
            this.publicKey = await this.yoursWallet.getPublicKey();
            
            // Get initial balance
            await this.updateBalance();
            
            this.initialized = true;
        } catch (error) {
            throw new WalletError(
                'Failed to connect to Yours wallet',
                ErrorCodes.WALLET_NOT_CONNECTED,
                'yours',
                error
            );
        }
    }

    /**
     * Disconnects from Yours wallet
     */
    async disconnect(): Promise<void> {
        if (this.yoursWallet) {
            try {
                await this.yoursWallet.disconnect();
            } finally {
                this.yoursWallet = null;
                this.publicKey = null;
                this.address = null;
                this.balance = 0;
                this.initialized = false;
            }
        }
    }

    /**
     * Gets the wallet's BSV address
     */
    async getAddress(): Promise<string> {
        if (!this.initialized || !this.address) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }
        return this.address;
    }

    /**
     * Gets the wallet's public key
     */
    async getPublicKey(): Promise<string> {
        if (!this.initialized || !this.publicKey) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }
        return this.publicKey;
    }

    /**
     * Gets the wallet's balance
     */
    async getBalance(): Promise<number> {
        if (!this.initialized || !this.yoursWallet) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }
        await this.updateBalance();
        return this.balance;
    }

    /**
     * Signs a message using Yours wallet
     */
    async signMessage(params: SignMessageParams): Promise<string> {
        if (!this.initialized || !this.yoursWallet) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }

        try {
            const result = await this.yoursWallet.signMessage({
                message: params.message,
                encoding: params.encoding || 'utf8'
            });

            if (!result?.sig) {
                throw new WalletError(
                    'Failed to get signature',
                    ErrorCodes.INVALID_SIGNATURE
                );
            }

            return result.sig;
        } catch (error) {
            throw new WalletError(
                'Failed to sign message',
                ErrorCodes.INVALID_SIGNATURE,
                undefined,
                error
            );
        }
    }

    /**
     * Verifies a message signature using Yours wallet
     */
    async verifyMessage(
        message: string,
        signature: string,
        publicKey: string
    ): Promise<boolean> {
        if (!this.initialized || !this.yoursWallet) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }

        try {
            const result = await this.yoursWallet.verifyMessage({
                message,
                signature,
                publicKey
            });

            return result?.valid || false;
        } catch (error) {
            throw new WalletError(
                'Failed to verify message',
                ErrorCodes.INVALID_SIGNATURE,
                undefined,
                error
            );
        }
    }

    /**
     * Sends a payment using Yours wallet
     */
    async sendPayment(params: PaymentParams): Promise<string> {
        if (!this.initialized || !this.yoursWallet) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }

        // Validate payment parameters
        this.validatePayment(params);

        try {
            // Send payment using Yours wallet
            const result = await this.yoursWallet.sendBsv([{
                address: params.address,
                satoshis: params.amount,
                data: params.data
            }]);

            if (!result?.txid) {
                throw new WalletError(
                    'Failed to get transaction ID',
                    ErrorCodes.TX_BUILD_FAILED
                );
            }

            // Update balance after successful payment
            await this.updateBalance();

            return result.txid;
        } catch (error) {
            throw new WalletError(
                'Failed to send payment',
                ErrorCodes.TX_BUILD_FAILED,
                undefined,
                error
            );
        }
    }

    /**
     * Updates the wallet's balance
     */
    private async updateBalance(): Promise<void> {
        if (!this.yoursWallet) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }

        try {
            const balance = await this.yoursWallet.getBalance();
            this.balance = Number(balance?.valueOf()) || 0;
        } catch (error) {
            throw new WalletError(
                'Failed to update balance',
                ErrorCodes.WALLET_NOT_CONNECTED,
                'yours',
                error
            );
        }
    }
} 