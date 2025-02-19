// src/services/types.ts
import { JungleBusTransaction } from "@gorillapool/js-junglebus";

export interface BmapTransaction {
    tx: {
        h: string;  // txid
    };
    in?: {
        i: number;  // input index
        e: {
            h: string;  // previous txid
            i: number;  // previous output index
            a: string;  // address
        };
    }[];
    out?: {
        i?: number;  // output index
        s: string;  // script
        e?: {
            v: number;  // value
            i?: number;  // index (optional)
            a: string;  // address
        };
    }[];
    blk?: {
        i: number;  // block height
        t: number;  // block time
    };
}

export interface Output {
  script: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface Transaction extends BmapTransaction {
    metadata?: {
        application?: string;
        postId: string;
        tags?: string[];
        content: string;
        type: string;
    };
    type?: string;
    voteOption?: {
        questionId: string;
        index: number;
        content: string;
    };
}

export type RawTransaction = Transaction;

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

export interface ParsedTransaction {
  txid: string;
  type: string;
  blockHeight?: number;
  blockTime?: number;
  senderAddress?: string;
  metadata: any;
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