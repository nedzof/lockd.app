// Common interfaces shared across services
export interface BaseTransaction {
    id: string;
    blockHash?: string;
    blockHeight?: number;
    blockTime?: number;
    transaction?: string;
    data?: string[];
}

export interface TransactionOutput {
    value: number;
    script: string;
}

export interface TransactionInput {
    script: string;
    scriptSig: string;
    sequence: number;
    witness: string[];
    txid?: string;
    vout?: number;
}

export interface BaseMetadata {
    protocol?: string;
    blockHeight?: number;
    blockTime?: number;
    postId?: string;
    type?: string;
    timestamp?: string;
    [key: string]: any;
}

export interface BasePost {
    id: string;
    type: string;
    content: string;
    metadata: BaseMetadata;
}

// Protocol-specific interfaces
export interface VoteOption {
    index: number;
    content: string;
    lockAmount: number;
    lockDuration: number;
}

export interface VotingData {
    question: string;
    options: VoteOption[];
    totalOptions: number;
    optionsHash: string;
    protocol: string;
}

export interface VotePost extends BasePost {
    votingData: VotingData;
}

// Service communication interfaces
export interface ScannerToParserMessage {
    transaction: BaseTransaction;
    outputs: TransactionOutput[];
    inputs: TransactionInput[];
}

export interface ParserToDBMessage {
    post: BasePost | VotePost;
    rawTransaction: BaseTransaction;
}

// Service configuration interfaces
export interface ScannerConfig {
    jungleBusUrl: string;
    startHeight?: number;
    batchSize?: number;
}

export interface DBConfig {
    maxRetries?: number;
    batchSize?: number;
}

// Event interfaces
export interface ScannedTransactionData {
    transaction: BaseTransaction;
    inputs: TransactionInput[];
    outputs: TransactionOutput[];
}

export interface ParsedTransactionData {
    post: BasePost | VotePost;
    rawTransaction: BaseTransaction;
}

export interface SavedTransactionData {
    post: {
        id: string;
        postId: string;
        type: string;
        content: string;
        timestamp: Date;
        sequence: number;
        parentSequence: number;
        createdAt: Date;
        updatedAt: Date;
        voteQuestion?: {
            id: string;
            question: string;
            totalOptions: number;
            optionsHash: string;
            protocol: string;
            voteOptions: Array<{
                id: string;
                index: number;
                content: string;
                lockAmount: number;
                lockDuration: number;
            }>;
        };
    };
}

export interface TransactionEvent {
    type: 'TRANSACTION_SCANNED' | 'TRANSACTION_PARSED' | 'TRANSACTION_SAVED';
    data: ScannedTransactionData | ParsedTransactionData | SavedTransactionData | null;
    error?: Error;
    timestamp: Date;
}

// Protocol handler interface
export interface ProtocolHandler {
    canHandle(outputs: TransactionOutput[]): boolean;
    parseTransaction(
        transaction: BaseTransaction,
        outputs: TransactionOutput[]
    ): Promise<BasePost | null>;
}

// Error interfaces
export class TransactionError extends Error {
    constructor(
        message: string,
        public readonly txid: string,
        public readonly code: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'TransactionError';
    }
}

export class ProtocolError extends Error {
    constructor(
        message: string,
        public readonly protocol: string,
        public readonly txid: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'ProtocolError';
    }
}

export class DBError extends Error {
    constructor(
        message: string,
        public readonly operation: string,
        public readonly model: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'DBError';
    }
}
