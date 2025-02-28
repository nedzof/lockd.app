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
  options_hash: string;
  total_options: number;
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
    post_id: string;
    type: string;
    content: any;
    block_time: Date;
    sequence: number;
    parent_sequence: number;
    created_at: Date;
    updated_at: Date;
    protocol: string;
    sender_address?: string | null;
    block_height?: number | null;
    txid?: string | null;
    image?: Buffer | null;
    lock_likes?: LockLike[];
    vote_options?: VoteOption[];
    vote_question?: VoteQuestion | null;
}

export interface PostWithVoteOptions extends Post {
    vote_question: {
        id: string;
        post_id: string;
        protocol: string;
        created_at: Date;
        updated_at: Date;
        question: string;
        total_options: number;
        options_hash: string;
    } | null;
    vote_options: {
        id: string;
        post_id: string;
        content: string;
        index: number;
        created_at: Date;
        updated_at: Date;
        question_id: string;
    }[];
    lock_likes: {
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
    id?: string;
    txid: string;  // Only required field
    blockHeight?: number;  // Maps to block_height in database
    blockTime?: number;    // Maps to block_time in database (BigInt in DB, Number in TS)
    type?: string;
    protocol?: string;
    metadata?: Record<string, any>;
    createdAt?: Date;      // Maps to created_at in database
    updatedAt?: Date;      // Maps to updated_at in database
}

export interface JungleBusTransaction {
    id: string;
    transaction?: {
        hash: string;
        version: number;
        inputs: Array<{
            prev_tx_id: string;
            output_index: number;
            input_script: string;
            output_script: string;
            sequence: number;
        }>;
        outputs: Array<{
            value: number;
            output_script: string;
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
    prev_hash: string;
    merkle_root: string;
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
    post_id?: string;
    content?: string;
    lock_amount?: number;
    lock_duration?: number;
    timestamp?: number;
    sender_address?: string;
    blockHeight?: number;  // camelCase for consistency in code
    blockTime?: number;    // camelCase for consistency in code
    sequence?: number;
    parent_sequence?: number;
    lock_like?: LockLike;
    vote_question?: VoteQuestion;
    vote_option?: VoteOption;
}

export interface DecodedTransaction {
    txid: string;
    inputs: {
        input_index: number;
        input_script: string;
        prev_tx_id: string;
        output_index: number;
        sequence_number: number;
    }[];
    outputs: {
        output_index: number;
        output_script: string;
        satoshis: number;
        op_return: string | null;
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
    start_block: number;
    from_block?: number;
    to_block?: number;
    batch_size?: number;
    max_retries?: number;
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
    expected_post_id?: string;
    expected_sender_address?: string;
    has_image?: boolean;
    default_lock_amount?: number;
    default_lock_duration?: number;
    expected_image_metadata?: {
        content_type: string;
        filename: string;
    };
}

export interface VerificationResults {
    has_post: boolean;
    has_vote_question: boolean;
    vote_options_count: number;
    has_lock_likes: boolean;
    txid: string;
    post_id: string;
    vote_question?: {
        question: string;
        total_options: number;
        options_hash: string;
    };
    vote_options?: Array<{
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
