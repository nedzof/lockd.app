import { Prisma } from '@prisma/client';
import { JsonValue } from "@prisma/client/runtime/library";

export interface Output {
  script: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface ParsedContent {
  type: string;
  data: any;
}

export interface VoteOption {
  id: string;
  postId: string;
  content: string;
  index: number;
  createdAt: Date;
  updatedAt?: Date;
  questionId?: string;
}

export interface VoteQuestion {
  id: string;
  postId: string;
  question: string;
  totalOptions: number;
  optionsHash: string;
  createdAt: Date;
  updatedAt?: Date;
  protocol?: string;
}

export interface Vote {
  optionsHash: string;
  totalOptions: number;
  options: VoteOption[];
}

export interface LockLike {
  id?: string;
  txid?: string;
  lockAmount: number;
  lockDuration: number;
  createdAt?: Date;
  updatedAt?: Date;
  postId?: string;
}

export interface Post {
    id: string;
    postId: string;
    type: string;
    content: any;
    blockTime: Date;
    sequence: number;
    parentSequence: number;
    createdAt: Date;
    updatedAt: Date;
    protocol: string;
    senderAddress?: string | null;
    blockHeight?: number | null;
    txid?: string | null;
    image?: Buffer | null;
    lockLikes?: LockLike[];
    voteOptions?: VoteOption[];
    voteQuestion?: VoteQuestion | null;
}

export interface PostWithVoteOptions extends Post {
    voteQuestion: {
        id: string;
        postId: string;
        protocol: string;
        createdAt: Date;
        updatedAt: Date;
        question: string;
        totalOptions: number;
        optionsHash: string;
    } | null;
    voteOptions: {
        id: string;
        postId: string;
        content: string;
        index: number;
        createdAt: Date;
        updatedAt: Date;
        voteQuestionId: string;
    }[];
    lockLikes: {
        id: string;
        txid: string;
        lockAmount: number;
        lockDuration: number;
        createdAt: Date;
        updatedAt: Date;
        postId: string;
    }[];
}

export interface ProcessedTransaction {
  id: string;
  txid: string;
  blockHeight: number;
  blockTime: bigint;
  type: string;
  protocol: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface JungleBusTransaction {
    id: string;
    transaction?: {
        hash: string;
        version: number;
        inputs: Array<{
            prevTxId: string;
            outputIndex: number;
            inputScript: string;
            outputScript: string;
            sequence: number;
        }>;
        outputs: Array<{
            value: number;
            outputScript: string;
        }>;
        locktime: number;
    };
    block?: {
        height: number;
        hash: string;
        timestamp: string;
    };
}

export interface JungleBusAddressInfo {
    address: string;
    transactions: number;
    balance: number;
}

export interface JungleBusBlockHeader {
    height: number;
    hash: string;
    prevHash: string;
    merkleRoot: string;
    timestamp: string;
    bits: string;
    nonce: number;
}

export interface ParsedTransaction {
    txid: string;
    type: string;
    protocol: string;
    content?: any;
    metadata: {
        postId: string;
        content: string;
        lockAmount?: number;
        lockDuration?: number;
        timestamp?: number;
        [key: string]: any;
    };
    senderAddress?: string;
    blockHeight?: number;
    blockTime?: number | bigint;
    sequence?: number;
    parentSequence?: number;
    lockLike?: LockLike;
    voteQuestion?: VoteQuestion;
    voteOption?: VoteOption;
}

export interface DecodedTransaction {
    txid: string;
    inputs: {
        index: number;
        script: string;
        prevTxId: string;
        outputIndex: number;
        sequenceNumber: number;
    }[];
    outputs: {
        index: number;
        script: string;
        satoshis: number;
        opReturn: string | null;
    }[];
}

export interface LockProtocolData {
    postId: string;
    lockAmount: number;
    lockDuration: number;
    content: string;
    voteOptions: string[];
    voteQuestion: string;
    image: Buffer | null;
    imageMetadata: {
        filename: string;
        contentType: string;
        width?: number;
        height?: number;
        size?: number;
        encoding?: string;
        format?: string;
    } | null;
}

export interface TransactionMetadata {
    postId: string;
    content: string;
    lockAmount: number;
    lockDuration: number;
    timestamp: number;
    voteOptions?: string[];
    voteQuestion?: string;
    image?: Buffer;
    imageMetadata?: {
        filename: string;
        contentType: string;
    };
    sequence?: number;
    parentSequence?: number;
    protocol?: string;
    [key: string]: any;
}

export interface DbError extends Error {
    code?: string;
    constraint?: string;
}

export interface ScannerEvents {
    'transaction': (tx: JungleBusTransaction) => void;
    'transaction:parsed': (tx: ParsedTransaction) => void;
    'transaction:error': (error: { tx: JungleBusTransaction; error: Error }) => void;
    'block:complete': (height: number) => void;
    'scanner:error': (error: Error) => void;
}

export const SCANNER_EVENTS = {
    TRANSACTION_RECEIVED: 'transactionReceived',
    TRANSACTION_PARSED: 'transactionParsed',
    TRANSACTION_SAVED: 'transactionSaved',
    ERROR: 'error'
} as const;

export interface ScannerConfig {
    startBlock: number;
    fromBlock?: number;
    toBlock?: number;
    batchSize?: number;
    maxRetries?: number;
}

export interface TestTxData {
    transactions: string[];
}

export interface JungleBusResponse {
    id: string;
    transaction: string;
    block_hash?: string;
    block_height?: number;
    block_time?: number;
    outputs: string[];
    data: string[];
    addresses?: string[];
}

export interface TransactionTestCase {
    txid: string;
    description?: string;
    expectedPostId?: string;
    expectedSenderAddress?: string;
    hasImage?: boolean;
    defaultLockAmount?: number;
    defaultLockDuration?: number;
    expectedImageMetadata?: {
        contentType: string;
        filename: string;
    };
}

export interface VerificationResults {
    hasPost: boolean;
    hasVoteQuestion: boolean;
    voteOptionsCount: number;
    hasLockLikes: boolean;
    txid: string;
    postId: string;
    voteQuestion?: {
        question: string;
        totalOptions: number;
        optionsHash: string;
    };
    voteOptions?: Array<{
        index: number;
        content: string;
    }>;
}

export interface ProcessedTxMetadata {
    postId: string;
    content: string;
    image?: Buffer | null;
    imageMetadata?: {
        contentType: string;
        filename: string;
        width?: number;
        height?: number;
        size?: number;
        encoding: string;
    };
    rawTx: JungleBusResponse;
    [key: string]: any;
}
