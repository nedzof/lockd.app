import { Signer, SignatureResponse, Provider, MethodCallOptions, Address, Transaction, SignTransactionOptions } from 'scrypt-ts';
import type { useYoursWallet } from 'yours-wallet-provider';

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

export class YoursWalletAdapter implements Signer {
    private wallet: YoursWallet;
    private provider: Provider;

    constructor(wallet: YoursWallet, provider: Provider) {
        this.wallet = wallet;
        this.provider = provider;
    }

    async isAuthenticated(): Promise<boolean> {
        return this.wallet.isConnected?.() || false;
    }

    async requestAuth(): Promise<{ isAuthenticated: boolean; error: string }> {
        try {
            await this.wallet.connect();
            return { isAuthenticated: true, error: '' };
        } catch (e) {
            return { isAuthenticated: false, error: (e as Error).message };
        }
    }

    async getDefaultAddress(): Promise<Address> {
        const addresses = await this.wallet.getAddresses();
        if (!addresses?.bsvAddress) {
            throw new Error('No BSV address available');
        }
        return Address.fromString(addresses.bsvAddress);
    }

    async getBalance(address?: Address): Promise<{ confirmed: number; unconfirmed: number }> {
        const balance = await this.wallet.getBalance();
        if (!balance?.satoshis) {
            throw new Error('Could not get balance');
        }
        return {
            confirmed: balance.satoshis,
            unconfirmed: 0
        };
    }

    async signMessage(message: string): Promise<string> {
        throw new Error('signMessage not implemented');
    }

    async signTransaction(tx: Transaction, options?: SignTransactionOptions): Promise<Transaction> {
        throw new Error('signTransaction not implemented');
    }

    getProvider(): Provider {
        return this.provider;
    }

    setProvider(provider: Provider): void {
        this.provider = provider;
    }

    connect(provider: Provider): this {
        this.provider = provider;
        return this;
    }
} 