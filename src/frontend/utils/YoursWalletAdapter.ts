import { 
    Signer, 
    SignatureResponse, 
    Provider, 
    MethodCallOptions, 
    SignatureRequest,
    SignTransactionOptions,
    TransactionResponse,
    UtxoQueryOptions,
    UTXO,
    bsv 
} from 'scrypt-ts';
import type { useYoursWallet } from 'yours-wallet-provider';

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

export class YoursWalletAdapter implements Signer {
    private wallet: YoursWallet;
    public provider: Provider;
    public readonly _isSigner = true;

    constructor(wallet: YoursWallet, provider: Provider) {
        this.wallet = wallet;
        this.provider = provider;
    }

    get connectedProvider(): Provider {
        return this.provider;
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

    async getDefaultAddress(): Promise<bsv.Address> {
        const addresses = await this.wallet.getAddresses();
        if (!addresses?.bsvAddress) {
            throw new Error('No BSV address available');
        }
        return bsv.Address.fromString(addresses.bsvAddress);
    }

    async getNetwork(): Promise<bsv.Networks.Network> {
        return bsv.Networks.testnet; // TODO: Get from wallet when available
    }

    async getDefaultPubKey(): Promise<bsv.PublicKey> {
        throw new Error('getDefaultPubKey not implemented');
    }

    async getPubKey(address: bsv.Address): Promise<bsv.PublicKey> {
        throw new Error('getPubKey not implemented');
    }

    async getBalance(address?: bsv.Address): Promise<{ confirmed: number; unconfirmed: number }> {
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

    async signTransaction(tx: bsv.Transaction, options?: SignTransactionOptions): Promise<bsv.Transaction> {
        // Convert the transaction to parameters for sendBsv
        const params = {
            satoshis: tx.outputs[0].satoshis,
            script: tx.outputs[0].script.toHex(),
            data: tx.outputs.slice(1).map(output => output.script.toHex())
        };

        // Send the transaction using the wallet's sendBsv method
        const result = await this.wallet.sendBsv([params]);

        if (!result?.txid) {
            throw new Error('Failed to sign transaction');
        }

        // Parse the raw transaction and return it
        return new bsv.Transaction(result.rawtx);
    }

    async signRawTransaction(rawTxHex: string, options: SignTransactionOptions): Promise<string> {
        throw new Error('signRawTransaction not implemented');
    }

    async getSignatures(rawTxHex: string, sigRequests: SignatureRequest[]): Promise<SignatureResponse[]> {
        throw new Error('getSignatures not implemented');
    }

    async signAndsendTransaction(tx: bsv.Transaction, options?: SignTransactionOptions): Promise<any> {
        // Sign and broadcast the transaction
        const signedTx = await this.signTransaction(tx, options);

        // Return the transaction response in the format expected by scrypt-ord
        return {
            id: signedTx.id,
            tx: signedTx
        };
    }

    async listUnspent(address: bsv.Address, options?: UtxoQueryOptions): Promise<UTXO[]> {
        const utxos = await this.wallet.getPaymentUtxos();
        if (!utxos) {
            return [];
        }
        return utxos.map(utxo => ({
            txId: utxo.txid,
            outputIndex: utxo.vout,
            satoshis: utxo.satoshis,
            script: utxo.script
        }));
    }

    async alignProviderNetwork(): Promise<void> {
        // No-op since we're already on testnet
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