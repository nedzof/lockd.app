// Common interfaces shared across services
export interface BaseTransaction {
    id: string;
    blockHash?: string;
    blockHeight?: number;
    blockTime?: number;
    transaction?: string;
}

export interface TransactionOutput {
    value: number;
    script: string;
}

export interface TransactionInput {
    txid: string;
    vout: number;
    scriptSig: string;
    sequence: number;
    witness: string[];
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
    metadata: {
        totalOptions: number;
        optionsHash: string;
        postId: string;
        protocol: string;
        blockHeight?: number;
        blockTime?: number;
    };
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
export interface TransactionEvent {
    type: 'TRANSACTION_SCANNED' | 'TRANSACTION_PARSED' | 'TRANSACTION_SAVED';
    data: BaseTransaction | BasePost | null;
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
