import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import { 
    BaseTransaction, 
    ScannerConfig, 
    TransactionEvent, 
    TransactionError, 
    TransactionInput, 
    TransactionOutput, 
    RawTransaction, 
    ScannerStats 
} from './scannerTypes';
import { TransactionParser } from '../parser/transactionParser';
import { DBTransactionProcessor } from '../dbworker/transactionProcessor';

export class TransactionScanner extends EventEmitter {
    private config: ScannerConfig;
    private parser: TransactionParser;
    private dbProcessor: DBTransactionProcessor;
    private stats: ScannerStats;

    constructor(config: ScannerConfig) {
        super();
        this.config = {
            batchSize: 100,
            ...config
        };
        this.parser = new TransactionParser();
        this.dbProcessor = new DBTransactionProcessor();
        this.stats = {
            processedTransactions: 0,
            failedTransactions: 0,
            lastProcessedHeight: config.startHeight || 0,
            startTime: new Date(),
            lastUpdateTime: new Date()
        };
    }

    async scanTransaction(txid: string): Promise<void> {
        try {
            // Fetch transaction
            const response = await fetch(`${this.config.jungleBusUrl}${txid}`);
            if (!response.ok) {
                throw new TransactionError(
                    `Failed to fetch transaction: ${response.statusText}`,
                    txid,
                    'FETCH_ERROR'
                );
            }

            const txData = await response.json();

            // Convert to base transaction
            const transaction: BaseTransaction = {
                id: txid,
                blockHash: txData.block_hash,
                blockHeight: txData.block_height,
                blockTime: txData.block_time,
                transaction: txData.hex
            };

            // Convert inputs and outputs
            const inputs: TransactionInput[] = txData.inputs.map((input: any) => ({
                txid: input.txid,
                vout: input.vout,
                scriptSig: input.scriptSig?.hex || '',
                sequence: input.sequence,
                witness: input.witness || []
            }));

            const outputs: TransactionOutput[] = txData.outputs.map((output: any) => ({
                value: output.value,
                script: output.scriptPubKey?.hex || output.script || ''
            }));

            // Emit scanned transaction event
            this.emit('transaction', {
                type: 'TRANSACTION_SCANNED',
                data: {
                    transaction,
                    inputs,
                    outputs
                },
                timestamp: new Date()
            } as TransactionEvent);

            // Parse transaction
            const rawTx: RawTransaction = {
                id: txid,
                blockHash: txData.block_hash,
                blockHeight: txData.block_height,
                blockTime: txData.block_time,
                inputs: txData.inputs.map((input: any) => ({
                    txid: input.txid,
                    vout: input.vout,
                    scriptSig: input.scriptSig?.hex || '',
                    sequence: input.sequence,
                    witness: input.witness || []
                })),
                outputs: txData.outputs.map((output: any) => ({
                    value: output.value,
                    script: output.scriptPubKey?.hex || output.script || ''
                }))
            };

            const parsedPost = await this.parser.parseTransaction(rawTx, rawTx.outputs);
            if (parsedPost) {
                // Process in database
                await this.dbProcessor.processPost(parsedPost);
            }

            this.stats.processedTransactions++;
        } catch (error) {
            this.stats.failedTransactions++;
            
            const txError = error instanceof TransactionError 
                ? error 
                : new TransactionError(
                    'Failed to scan transaction',
                    txid,
                    'SCAN_ERROR',
                    error instanceof Error ? error : undefined
                );

            this.emit('error', txError);
            throw txError;
        } finally {
            this.stats.lastUpdateTime = new Date();
        }
    }

    async scanBatch(txids: string[]): Promise<void> {
        const batchSize = this.config.batchSize || 100;
        for (let i = 0; i < txids.length; i += batchSize) {
            const batch = txids.slice(i, i + batchSize);
            await Promise.all(batch.map(txid => this.scanTransaction(txid)));
        }
    }

    getStats(): ScannerStats {
        return { ...this.stats };
    }

    async disconnect(): Promise<void> {
        await this.dbProcessor.disconnect();
    }
}
