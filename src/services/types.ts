// src/services/types.ts
import { JungleBusTransaction } from "@gorillapool/js-junglebus";
import { Prisma } from "@prisma/client";
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
  questionId: string;
  index: number;
  content: string;
}

export interface VoteQuestion {
  question: string;
  totalOptions: number;
  optionsHash: string;
}

export interface Vote {
  optionsHash: string;
  totalOptions: number;
  options: VoteOption[];
}

export interface LockLike {
  lockAmount: number;
  lockDuration: number;
}

export interface ParsedTransactionForProcessing {
  id: string;
  protocol: string;
  type: string;
  content: string;
  sequence: number;
  parentSequence: number;
  vote?: Vote;
  voteQuestion?: VoteQuestion;
  voteOption?: VoteOption;
  lockLike?: LockLike;
}

export interface ProcessedTransaction {
  blockHeight?: number;
  blockTime?: Date;
  raw: Transaction;
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
    blockHeight?: number;
    timestamp?: string;
    data?: any;
}

export type Transaction = JungleBusTransaction;

export interface Post {
    id: string;
    content: string;
    createdAt: Date;
    createdBy: string;
    updatedAt?: Date;
    updatedBy?: string;
}

export interface VoteQuestion {
    id: string;
    postId: string;
    question: string;
    totalOptions: number;
    optionsHash: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface VoteOption {
    id: string;
    postId: string;
    content: string;
    index: number;
    createdAt: Date;
    updatedAt?: Date;
}

export interface ProcessedTransaction {
    id: string;
    txid: string;
    blockHeight: number;
    blockTime: Date;
}

export interface ScannerEvents {
    'transaction': (tx: Transaction) => void;
    'transaction:parsed': (tx: ParsedTransaction) => void;
    'transaction:error': (error: { tx: Transaction; error: Error }) => void;
    'block:complete': (height: number) => void;
    'scanner:error': (error: Error) => void;
}

export interface DbError extends Error {
    code?: string;
    constraint?: string;
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
