import { BaseTransaction, TransactionInput, TransactionOutput } from '../common/types';

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
