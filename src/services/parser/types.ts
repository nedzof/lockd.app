export interface VoteQuestion {
  question: string;
  image?: string;
  options: VoteOption[];
  metadata: TransactionMetadata;
}

export interface VoteOption {
  optionindex: number;
  content: string;
  lockamount: string;
  lockduration: string;
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
  txid: string;
  postId: string;
  author: string;
  blockHeight: number;
  blockTime: number;
  timestamp: number;
  content: {
    text: string;
    title?: string;
    description?: string;
  };
  metadata: {
    app: string;
    version: string;
    type: string;
    postId: string;
    sequence: number;
    timestamp: string;
    voteOptions?: VoteOption[];
    optionsHash?: string;
    lockAmount?: string;
    lockDuration?: string;
    optionIndex?: number;
    parentSequence?: number;
  };
  images: Array<{
    data: Buffer | null;
    contentType: string;
    dataURL: string | null;
  }>;
  tags: string[];
}

export interface BitcoinTransaction {
  txid: string;
  version: number;
  inputs: TransactionInput[];
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
  scriptPubKey: string;
  addresses: string[];
  type: string;
  opReturn?: OpReturnData;
}

export interface OpReturnData {
  protocols: string[];
  contentType?: string;
  content?: string;
  metadata?: Record<string, any>;
}

export interface DecodedTransaction {
  transaction: BitcoinTransaction;
  votingData: {
    question: string;
    options: VoteOption[];
    metadata: {
      postId: string;
      totalOptions: number;
      optionsHash: string;
    };
  };
}
