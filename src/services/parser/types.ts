export interface VoteQuestion {
  question: string;
  image?: string;
  options: VoteOption[];
  metadata: TransactionMetadata;
}

export interface VoteOption {
  index: number;
  content: string;
  lockAmount: number;
  lockDuration: number;
}

export interface TransactionMetadata {
  txid: string;
  postId: string;
  totalOptions: number;
  optionsHash: string;
  timestamp: string;
  fundingAddress: string;
  fundingAmount: number;
}

export interface JungleBusTransaction {
  id: string;
  block_hash?: string;
  block_height?: number;
  block_time?: number;
  transaction?: string;
  outputs?: TransactionOutput[];
}

export interface TransactionOutput {
  value: number;
  script: string;
}

export interface OpReturnData {
  protocols: string[];
  content: string;
  metadata: Record<string, any>;
}

export interface VotingData {
  question: string;
  options: VoteOption[];
  metadata: {
    totalOptions: number;
    optionsHash: string;
    postId: string;
    protocol: string;
  };
}

export interface ParsedPost {
  type: string;
  content: string;
  postId: string;
  timestamp: string;
  sequence: number;
  parentSequence: number;
  votingData?: VotingData;
}

export interface BitcoinTransaction {
  txid: string;
  version: number;
  inputs: any[];
  outputs: TransactionOutput[];
  locktime: number;
  blockHash: string;
  blockHeight: number;
  timestamp: string;
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: string;
  sequence: number;
  witness: string[];
}

export interface DecodedTransaction {
  transaction: BitcoinTransaction;
  votingData: VotingData;
}
