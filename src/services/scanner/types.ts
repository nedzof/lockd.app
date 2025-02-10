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
}

export interface ChainInfo {
  blocks: number;
}

export interface Block {
  tx: string[];
}

export interface Transaction {
  txid: string;
  vin: Array<{ addr?: string }>;
  vout: Array<{
    value: number;
    scriptPubKey: {
      hex: string;
      type?: string;
    };
  }>;
  locktime?: number;
  blockheight?: number;
}

export interface MediaContent {
  content: Buffer;
  type: string;
} 