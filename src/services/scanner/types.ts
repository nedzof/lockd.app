export interface BlockchainTransaction {
  txid: string;
  content: string;
  author_address: string;
  media_type: string;
  blockHeight: number;
  amount?: number;
  locked_until?: number;
  description?: string;
  media_url?: string | undefined;
  metadata?: Record<string, any>;
}

export interface ChainInfo {
  blocks: number;
}

export interface Block {
  tx: string[];
}

export interface TransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    hex: string;
    asm: string;
    type: string;
    addresses?: string[];
  };
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: {
    hex: string;
    asm: string;
  };
  sequence: number;
}

export interface Transaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  locktime: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
  blockhash: string;
  confirmations: number;
  time: number;
  blocktime: number;
  blockheight: number;
}

export interface MediaContent {
  content: Buffer;
  type: string;
}

export interface VoteOption {
  option: string;
  lockAmount: number;
  lockDuration: number;
  timestamp: string;
}

export interface StructuredTransaction {
  transaction_id: string;
  block_height: number;
  block_hash: string;
  timestamp: number;
  vote_question: string | null;
  vote_options: VoteOption[];
  metadata: {
    version: string | null;
    app: string;
    type: string;
    severity: string;
    tags: string[];
  };
} 