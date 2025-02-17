import { EventEmitter } from 'events';
import { JungleBusClient } from "@gorillapool/js-junglebus";
import { 
    ScannerConfig,
    RawTransaction,
    ScannerStats 
} from './scannerTypes';
import {
    BaseTransaction,
    TransactionEvent,
    TransactionError,
    TransactionInput,
    TransactionOutput,
    BasePost
} from '../common/types';
import { TransactionParser } from '../parser/transactionParser';
import { DBTransactionProcessor } from '../dbworker/transactionProcessor';

interface JungleBusTransaction {
    id: string;
    block_hash?: string;
    block_height?: number;
    block_time?: number;
    hex?: string;
    data?: string[];
    inputs?: Array<{
        script?: string;
        scriptSig?: { hex: string };
    }>;
    outputs?: Array<{
        scriptPubKey?: { hex: string };
        script?: string;
    }>;
    merkle_proof?: any;
}

export class TransactionScanner extends EventEmitter {
    private config: ScannerConfig;
    private parser: TransactionParser;
    private dbProcessor: DBTransactionProcessor;
    private stats: ScannerStats;
    private client: JungleBusClient;

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
        
        this.client = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            protocol: "json",
            onConnected(ctx) {
                console.log("CONNECTED", ctx);
            },
            onConnecting(ctx) {
                console.log("CONNECTING", ctx);
            },
            onDisconnected(ctx) {
                console.log("DISCONNECTED", ctx);
            },
            onError(ctx) {
                console.error(ctx);
            },
        });
    }

    async scanTransaction(txid: string): Promise<BasePost | null> {
        try {
            // Fetch transaction using the correct endpoint
            const response = await fetch(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch transaction: ${response.statusText}`);
            }

            const txData = await response.json() as JungleBusTransaction;
            console.log('Transaction data:', txData);

            // Convert to base transaction
            const transaction: BaseTransaction = {
                id: txid,
                blockHash: txData.block_hash,
                blockHeight: txData.block_height,
                blockTime: txData.block_time,
                transaction: txData.hex,
                data: txData.data
            };

            // Convert inputs and outputs
            const inputs: TransactionInput[] = txData.inputs?.map(input => ({
                script: input.script || '',
                scriptSig: input.scriptSig?.hex || '',
                sequence: 0,
                witness: []
            })) || [];

            const outputs: TransactionOutput[] = txData.outputs?.map(output => {
                const script = output.script || output.scriptPubKey?.hex || '';
                console.log('Raw output script:', script);
                return {
                    value: 0,
                    script: Buffer.from(script, 'hex').toString()
                };
            }) || [];

            // Emit scanned transaction event
            this.emit('TRANSACTION_SCANNED', {
                transaction,
                inputs,
                outputs
            });

            // Parse transaction using available protocol handlers
            const parsedTransaction = await this.parser.parseTransaction(transaction, outputs);
            if (parsedTransaction) {
                this.emit('POST_PARSED', parsedTransaction);
                await this.dbProcessor.processPost(parsedTransaction);
            }

            this.stats.processedTransactions++;
            return parsedTransaction;
        } catch (error) {
            this.stats.failedTransactions++;
            console.error('Error scanning transaction:', error);
            return null;
        }
    }

    async disconnect(): Promise<void> {
        // JungleBus client doesn't need explicit cleanup
        await this.dbProcessor.disconnect();
    }
}
