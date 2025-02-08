import { bsv } from 'scrypt-ts';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';
import { validateBsvAddress, validatePublicKey } from '../../shared/utils/address';

export interface WalletConfig {
    network: 'mainnet' | 'testnet';
    apiKey?: string;
    derivationPath?: string;
}

export interface SignMessageParams {
    message: string;
    encoding?: 'utf8' | 'hex';
}

export interface PaymentParams {
    address: string;
    amount: number;
    data?: string;
}

export interface WalletInfo {
    address: string;
    publicKey: string;
    balance: number;
    network: string;
}

/**
 * Abstract base class for wallet implementations
 */
export abstract class BaseWallet {
    protected network: bsv.Networks.Network;
    protected publicKey: string | null = null;
    protected address: string | null = null;
    protected balance: number = 0;
    protected initialized: boolean = false;

    constructor(config: WalletConfig) {
        this.network = config.network === 'testnet' ? bsv.Networks.testnet : bsv.Networks.mainnet;
    }

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract getAddress(): Promise<string>;
    abstract getPublicKey(): Promise<string>;
    abstract getBalance(): Promise<number>;
    abstract signMessage(params: SignMessageParams): Promise<string>;
    abstract verifyMessage(message: string, signature: string, publicKey: string): Promise<boolean>;
    abstract sendPayment(params: PaymentParams): Promise<string>;

    /**
     * Gets wallet information
     */
    async getInfo(): Promise<WalletInfo> {
        if (!this.initialized) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }

        return {
            address: await this.getAddress(),
            publicKey: await this.getPublicKey(),
            balance: await this.getBalance(),
            network: this.network.name
        };
    }

    /**
     * Validates a payment transaction before sending
     */
    protected validatePayment(params: PaymentParams): void {
        if (!this.initialized) {
            throw new WalletError(
                'Wallet not initialized',
                ErrorCodes.WALLET_NOT_CONNECTED
            );
        }

        if (!validateBsvAddress(params.address, this.network === bsv.Networks.testnet)) {
            throw new WalletError(
                'Invalid recipient address',
                ErrorCodes.INVALID_ADDRESS,
                undefined,
                params.address
            );
        }

        if (params.amount <= 0) {
            throw new WalletError(
                'Invalid amount',
                ErrorCodes.INVALID_AMOUNT,
                undefined,
                params.amount
            );
        }

        if (params.amount > this.balance) {
            throw new WalletError(
                'Insufficient funds',
                ErrorCodes.TX_INSUFFICIENT_FUNDS,
                undefined,
                { required: params.amount, available: this.balance }
            );
        }
    }

    /**
     * Creates a BSV transaction
     */
    protected async createTransaction(params: PaymentParams): Promise<bsv.Transaction> {
        const tx = new bsv.Transaction();

        // Add data output if provided
        if (params.data) {
            const dataScript = bsv.Script.buildDataOut(params.data);
            tx.addOutput(new bsv.Transaction.Output({
                script: dataScript,
                satoshis: 0
            }));
        }

        // Add payment output
        tx.to(params.address, params.amount);

        return tx;
    }

    /**
     * Signs a message using the wallet's private key
     */
    protected async signMessageWithKey(message: string, privateKey: bsv.PrivateKey): Promise<string> {
        try {
            const messageHash = bsv.crypto.Hash.sha256(Buffer.from(message));
            const signature = bsv.crypto.ECDSA.sign(messageHash, privateKey);
            return signature.toString();
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
     * Verifies a message signature
     */
    protected async verifyMessageSignature(
        message: string,
        signature: string,
        publicKey: string
    ): Promise<boolean> {
        try {
            if (!validatePublicKey(publicKey)) {
                throw new WalletError(
                    'Invalid public key',
                    ErrorCodes.INVALID_PUBLIC_KEY,
                    undefined,
                    publicKey
                );
            }

            const messageHash = bsv.crypto.Hash.sha256(Buffer.from(message));
            const sig = bsv.crypto.Signature.fromString(signature);
            const pub = bsv.PublicKey.fromString(publicKey);

            return bsv.crypto.ECDSA.verify(messageHash, sig, pub);
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
     * Estimates transaction fee
     */
    protected estimateFee(tx: bsv.Transaction): number {
        const estimatedSize = tx.inputs.length * 180 + tx.outputs.length * 34 + 10;
        const feeRate = 0.5; // 0.5 satoshis/byte
        return Math.ceil(estimatedSize * feeRate);
    }

    /**
     * Validates transaction before broadcast
     */
    protected validateTransaction(tx: bsv.Transaction): void {
        if (!tx.inputs.length || !tx.outputs.length) {
            throw new WalletError(
                'Invalid transaction format',
                ErrorCodes.TX_VALIDATION_FAILED,
                undefined,
                'Missing inputs or outputs'
            );
        }

        const totalOut = tx.outputs.reduce((sum, output) => sum + output.satoshis, 0);
        if (totalOut <= 0) {
            throw new WalletError(
                'Invalid transaction amount',
                ErrorCodes.TX_VALIDATION_FAILED,
                undefined,
                totalOut
            );
        }
    }
} 