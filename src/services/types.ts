// src/services/types.ts
import { JungleBusTransaction } from "@gorillapool/js-junglebus";

export interface ParsedContent {
  type: string;
  data: string | Buffer;
  encoding?: string;
  filename?: string;
}

export interface ParsedVote {
  questionId?: string;
  optionsHash: string;
  totalOptions: number;
  options: {
    index: number;
    lockAmount: number;
    lockDuration: number;
  }[];
}

export interface ParsedTransaction {
  txid: string;
  blockHeight: number;
  timestamp: Date;
  postId: string;
  sequence: number;
  parentSequence: number;
  contents: ParsedContent[];
  vote?: ParsedVote;
  tags: string[];
}

export interface Transaction {
  id: string;
  inputs: any[];
  outputs: Output[];
  blockHeight?: number;
  blockTime?: Date;
}

export interface Output {
  script: string;
  value?: number;
}

export interface ParsedTransactionForProcessing {
  id: string;
  protocol: string;
  type: string;
  postId?: string;
  content?: string;
  contentType?: string;
  data?: Buffer;
  tags?: string[];
  timestamp?: string;
  sequence?: number;
  parentSequence?: number;
  vote?: {
    optionsHash?: string;
    options?: VoteOption[];
  };
  lock?: {
    amount: number;
    duration: number;
  };
}

export interface VoteOption {
  index: number;
  text: string;
  value: string;
  lockAmount?: number;
  lockDuration?: number;
}

export interface ProcessedTransaction extends ParsedTransactionForProcessing {
  blockHeight?: number;
  blockTime?: Date;
  raw: Transaction;
}