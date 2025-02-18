// src/types.ts
import { JungleBusTransaction } from "@gorillapool/js-junglebus";

export interface ParsedContent {
  type: string;
  data: string | Buffer;
  encoding?: string;
  filename?: string;
}

export interface ParsedVote {
  questionId: string;
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