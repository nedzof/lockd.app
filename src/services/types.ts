// src/services/types.ts
import { JungleBusTransaction } from "@gorillapool/js-junglebus";

export interface Output {
  script: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface Transaction {
  id?: string;
  outputs: Output[];
  blockHeight?: number;
  blockTime?: number;
  metadata?: Record<string, any>;
  type?: string;
  voteOption?: Record<string, any>;
}

export interface ParsedContent {
  type: string;
  data: any;
  encoding?: string;
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
  options: Array<{
    index: number;
    lockAmount: number;
    lockDuration: number;
  }>;
}

export interface LockLike {
  lockAmount: number;
  lockDuration: number;
}

export interface ParsedTransaction {
  txid: string;
  protocol: string;
  postId: string;
  type: string;
  contents: ParsedContent[];
  content: Record<string, any>;
  blockHeight?: number;
  blockTime?: number;
  sequence: number;
  parentSequence: number;
  vote?: Vote;
  voteQuestion?: VoteQuestion;
  voteOption?: VoteOption;
  lockLike?: LockLike;
}

export interface ParsedTransactionForProcessing {
  id: string;
  protocol: string;
  type: string;
  postId: string;
  sequence: number;
  parentSequence: number;
  blockHeight: number;
  blockTime: Date;
  contents: ParsedContent[];
  vote?: any;
  tags: string[];
}

export interface ProcessedTransaction {
  blockHeight?: number;
  blockTime?: Date;
  raw: Transaction;
}