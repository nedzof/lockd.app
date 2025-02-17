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

export interface ParsedPost {
  type: string;
  content: string;
  timestamp: number;
  postId: string;
  sequence: number;
  parentSequence: number;
  tags: string[];
  app: string;
  version: string;
  txid?: string;
  blockHeight?: number;
  blockTime?: number;
  votingData?: {
    question: string;
    options: Array<{
      index: number;
      content: string;
      lockAmount: number;
      lockDuration: number;
    }>;
    metadata: {
      totalOptions: number;
      optionsHash: string;
      postId: string;
    };
  };
  images: Array<{
    data: Buffer | null;
    contentType: string;
    dataURL: string | null;
  }>;
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

export interface TransactionOutput {
  value: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type: string;
    addresses?: string[];
  };
  addresses: string[];
  type: string;
  opReturn?: OpReturnData;
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
  };
}

export interface DecodedTransaction {
  transaction: BitcoinTransaction;
  votingData: VotingData;
}
