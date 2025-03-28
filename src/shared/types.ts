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
  index: number;
  content: string;
}

export interface vote_option {
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
  options: vote_option[];
}

export interface LockLike {
  id?: string;
  tx_id?: string;
  lock_amount: number;
  lock_duration: number;
  created_at?: Date;
  updated_at?: Date;
  post_id?: string;
}

export interface ImageMetadata {
  media_type: string;
  content_type: string;
  filename: string;
  width?: number;
  height?: number;
  size?: number;
  encoding?: string;
  format?: string;
}

export interface BasePost {
  id: string;
  post_id: string;
  content: any;
  created_at: Date;
  tx_id?: string | null;
  block_height?: number | null;
  is_locked?: boolean;
  lock_duration?: number;
  tags?: string[];
}

export interface Post extends BasePost {
  type: string;
  block_time: Date;
  sequence: number;
  parent_sequence: number;
  updated_at: Date;
  protocol: string;
  sender_address?: string | null;
  image?: Buffer | null;
  lock_likes?: LockLike[];
  vote_options?: vote_option[];
  vote_question?: VoteQuestion | null;
}

export interface PostWithvote_options extends Post {
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
    tx_id: string;
    lock_amount: number;
    lock_duration: number;
    created_at: Date;
    updated_at: Date;
    post_id: string;
  }[];
}

export interface ProcessedTransaction {
  id?: string;
  tx_id: string;  // Only required field
  block_height?: number;  // Maps to block_height in database
  block_time?: number;    // Maps to block_time in database (BigInt in DB, Number in TS)
  type?: string;
  protocol?: string;
  metadata?: Record<string, any>;
  created_at?: Date;      // Maps to created_at in database
  updated_at?: Date;      // Maps to updated_at in database
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

export interface TransactionMetadata {
  post_id: string;
  content: string;
  lock_amount?: number;
  lock_duration?: number;
  timestamp?: number;
  sender_address?: string;
  block_height?: number;
  block_time?: number;
  sequence?: number;
  parent_sequence?: number;
  protocol?: string;
  vote_options?: string[];
  vote_question?: string;
  image?: Buffer;
  image_metadata?: ImageMetadata;
  is_vote?: boolean;
  content_type?: string;
  options_hash?: string;
  tags?: string[];
  total_options?: number;
  [key: string]: any;
}

export interface LockProtocolData {
  post_id: string;
  lock_amount: number;
  lock_duration: number;
  content: string;
  vote_options: string[];
  vote_question: string;
  image: Buffer | null;
  image_metadata: ImageMetadata;
  is_vote?: boolean;
  content_type?: string;
  options_hash?: string;
  tags?: string[];
  total_options?: number;
}

export interface ParsedTransaction {
  tx_id: string;
  type?: string;
  protocol?: string;
  content?: any;
  metadata: LockProtocolData;
  block_height?: number;
  block_time?: string;
  author_address?: string;
}

export interface DecodedTransaction {
  tx_id: string;
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
  tx_id: string;
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
  tx_id: string;
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
  image_metadata?: ImageMetadata;
  raw_tx: JungleBusResponse;
  [key: string]: any;
}

export interface OrdinalInscription {
  content: string;
  metadata: OrdinalMetadata;
  vote_data?: VoteData;
  image_metadata?: ImageMetadata;
}

export interface OrdinalMetadata {
  protocol: string; // Always "lockd.app"
  post_id: string;
  author_address?: string;
  tx_id?: string;
  block_height?: number;
  created_at: string;
  is_locked: boolean;
  lock_amount?: number;
  lock_duration?: number;
  content_type?: string;
  tags?: string[];
  is_vote: boolean;
}

export interface VoteData {
  question: string;
  options: VoteOption[];
  total_options: number;
}
