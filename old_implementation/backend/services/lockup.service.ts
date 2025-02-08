import { 
    SmartContract, 
    ByteString,
    PubKey,
    Sig,
    toByteString,
    hash160,
    ContractTransaction,
    MethodCallOptions,
    bsv,
    SignatureResponse,
    Signer,
    DefaultProvider,
    findSig,
    Utils
} from 'scrypt-ts';

import { Lockup } from '../../contracts/lockup';
import { getUtxoData, broadcastTx, getAddressUtxos, getCurrentBlockHeight } from '../utils/blockchain';
import { validateBsvAddress } from '../../shared/utils/address';
import {
    TransactionError,
    ValidationError,
    BlockchainError,
    ErrorCodes,
    handleTransactionError,
    handleBlockchainError
} from '../../shared/utils/errors';

export class LockupService {
    private readonly signer: Signer;
    private readonly provider: DefaultProvider;
    private readonly MIN_AMOUNT = 1000n; // 1000 satoshis minimum
    private readonly MAX_AMOUNT = 100000000000n; // 1000 BSV maximum
    private readonly MIN_LOCK_PERIOD = 144n; // ~1 day
    private readonly MAX_LOCK_PERIOD = 52560n; // ~1 year

    constructor(signer: Signer, provider: DefaultProvider) {
        this.signer = signer;
        this.provider = provider;
    }

    async lockPost(
        content: string,
        creatorPubKey: PubKey,
        lockUntilHeight: bigint,
        amount: bigint,
        opReturnData?: ByteString[]
    ): Promise<ContractTransaction> {
        try {
            // Get current block height
            let currentBlockHeight: number;
            try {
                currentBlockHeight = await getCurrentBlockHeight();
            } catch (error) {
                throw handleBlockchainError(error);
            }
            
            // Validate lock period
            const lockPeriod = lockUntilHeight - BigInt(currentBlockHeight);
            if (lockPeriod < this.MIN_LOCK_PERIOD || lockPeriod > this.MAX_LOCK_PERIOD) {
                throw new ValidationError(
                    'Lock period must be between 1 day and 1 year',
                    ErrorCodes.INVALID_LOCK_PERIOD,
                    'lockPeriod',
                    lockPeriod.toString()
                );
            }

            // Validate amount
            if (amount < this.MIN_AMOUNT || amount > this.MAX_AMOUNT) {
                throw new ValidationError(
                    'Invalid amount specified',
                    ErrorCodes.INVALID_AMOUNT,
                    'amount',
                    amount.toString()
                );
            }

            // Get signer's address and validate
            const address = await this.signer.getDefaultAddress();
            if (!validateBsvAddress(address.toString(), false)) {
                throw new ValidationError(
                    'Invalid BSV address',
                    ErrorCodes.INVALID_ADDRESS,
                    'address',
                    address.toString()
                );
            }

            // Get and validate UTXOs
            let utxos;
            try {
                utxos = await getAddressUtxos(address.toString());
            } catch (error) {
                throw handleBlockchainError(error);
            }

            if (!utxos.length) {
                throw new TransactionError(
                    'No UTXOs available for transaction',
                    ErrorCodes.TX_INSUFFICIENT_FUNDS
                );
            }

            // Calculate and validate total available balance
            const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);
            if (totalBalance < Number(amount)) {
                throw new TransactionError(
                    'Insufficient balance for locking',
                    ErrorCodes.TX_INSUFFICIENT_FUNDS,
                    undefined,
                    { required: amount.toString(), available: totalBalance.toString() }
                );
            }

            // Create contract instance
            const instance = new Lockup(hash160(creatorPubKey), lockUntilHeight);
            try {
                await instance.connect(this.signer);
            } catch (error) {
                throw handleTransactionError(error);
            }

            // Build transaction
            let tx = new bsv.Transaction();

            // Add inputs with proper validation
            let inputAmount = 0;
            for (const utxo of utxos) {
                // Validate UTXO
                if (!Utils.isHex(utxo.txid) || utxo.txid.length !== 64) {
                    throw new ValidationError(
                        'Invalid UTXO txid',
                        ErrorCodes.TX_VALIDATION_FAILED,
                        'txid',
                        utxo.txid
                    );
                }
                if (utxo.satoshis <= 0) {
                    throw new ValidationError(
                        'Invalid UTXO amount',
                        ErrorCodes.TX_VALIDATION_FAILED,
                        'satoshis',
                        utxo.satoshis.toString()
                    );
                }

                try {
                    tx.addInput(new bsv.Transaction.Input({
                        prevTxId: utxo.txid,
                        outputIndex: utxo.vout,
                        script: new bsv.Script(),
                    }));
                } catch (error) {
                    throw handleTransactionError(error);
                }

                inputAmount += utxo.satoshis;
                
                if (inputAmount >= Number(amount) + this.estimateFee(tx)) {
                    break;
                }
            }

            // Validate final input amount
            if (inputAmount < Number(amount) + this.estimateFee(tx)) {
                throw new TransactionError(
                    'Insufficient funds including fees',
                    ErrorCodes.TX_INSUFFICIENT_FUNDS,
                    undefined,
                    {
                        required: (Number(amount) + this.estimateFee(tx)).toString(),
                        available: inputAmount.toString()
                    }
                );
            }

            try {
                return await instance.buildTxForDeployment(
                    hash160(creatorPubKey),
                    lockUntilHeight,
                    amount,
                    opReturnData
                );
            } catch (error) {
                throw handleTransactionError(error);
            }
        } catch (error) {
            if (error instanceof ValidationError || 
                error instanceof TransactionError || 
                error instanceof BlockchainError) {
                throw error;
            }
            throw handleTransactionError(error);
        }
    }

    private estimateFee(tx: bsv.Transaction): number {
        // Estimate fee based on transaction size
        const estimatedSize = tx.inputs.length * 180 + tx.outputs.length * 34 + 10;
        const feeRate = 0.5; // 0.5 satoshis/byte
        return Math.ceil(estimatedSize * feeRate);
    }
} 