import { BaseTransaction, TransactionInput, TransactionOutput, TransactionEvent, TransactionError } from '../common/types';

export { BaseTransaction, TransactionInput, TransactionOutput, TransactionEvent, TransactionError };

export interface ScannerConfig {
    jungleBusUrl: string;
    startHeight?: number;
    batchSize?: number;
}

export interface RawTransaction extends BaseTransaction {
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
}

export interface ScannerStats {
    processedTransactions: number;
    failedTransactions: number;
    lastProcessedHeight: number;
    startTime: Date;
    lastUpdateTime: Date;
}
