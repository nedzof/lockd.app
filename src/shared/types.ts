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
  post_id: string;
  content: string;
  index: number;
  created_at: Date;
  updated_at?: Date;
  question_id?: string;
}

export interface VoteQuestion {
  id: string;
  post_id: string;
  question: string;
  total_options: number;
  options_hash: string;
  created_at: Date;
  updated_at?: Date;
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
  lock_amount: number;
  lock_duration: number;
  created_at?: Date;
  updated_at?: Date;
  post_id?: string;
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
        post_id: string;
        protocol: string;
        created_at: Date;
        updated_at: Date;
        question: string;
        total_options: number;
        options_hash: string;
    } | null;
    voteOptions: {
        id: string;
        post_id: string;
        content: string;
        index: number;
        created_at: Date;
        updated_at: Date;
        question_id: string;
    }[];
    lockLikes: {
        id: string;
        txid: string;
        lock_amount: number;
        lock_duration: number;
        created_at: Date;
        updated_at: Date;
        post_id: string;
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
        post_id: string;
        content: string;
        lock_amount?: number;
        lock_duration?: number;
        timestamp?: number;
        [key: string]: any;
    };
    sender_address?: string;
    block_height?: number;
    block_time?: number | bigint;
    sequence?: number;
    parent_sequence?: number;
    lock_like?: LockLike;
    vote_question?: VoteQuestion;
    vote_option?: VoteOption;
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
    post_id: string;
    lock_amount: number;
    lock_duration: number;
    content: string;
    vote_options: string[];
    vote_question: string;
    image: Buffer | null;
    image_metadata: {
        filename: string;
        content_type: string;
        width?: number;
        height?: number;
        size?: number;
        encoding?: string;
        format?: string;
        is_image?: boolean;
    };
    is_vote?: boolean;
    content_type?: string;
    options_hash?: string;
    tags?: string[];
    total_options?: number;
}

export interface TransactionMetadata {
    post_id: string;
    content: string;
    lock_amount: number;
    lock_duration: number;
    timestamp: number;
    vote_options?: string[];
    vote_question?: string;
    image?: Buffer;
    image_metadata?: {
        filename: string;
        content_type: string;
    };
    sequence?: number;
    parent_sequence?: number;
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
    post_id: string;
    voteQuestion?: {
        question: string;
        total_options: number;
        options_hash: string;
    };
    voteOptions?: Array<{
        index: number;
        content: string;
    }>;
}

export interface ProcessedTxMetadata {
    post_id: string;
    content: string;
    image?: Buffer | null;
    image_metadata?: {
        content_type: string;
        filename: string;
        width?: number;
        height?: number;
        size?: number;
        encoding: string;
    };
    raw_tx: JungleBusResponse;
    [key: string]: any;
}
