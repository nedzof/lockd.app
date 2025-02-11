// JungleBus Types
export interface JungleBusTransaction {
  id: string;
  transaction: string;
  block_hash?: string;
  block_height?: number;
  block_time?: number;
  block_index?: number;
  merkle_proof?: any;
  output_types?: string[];
  contexts?: string[];
  sub_contexts?: string[];
  data?: string[];
}

export interface ControlMessage {
  statusCode: number;
  status?: string;
  message?: string;
  block?: number;
}

export interface SubscriptionErrorContext {
  type: string;
  error: {
    code: number;
    message: string;
    temporary: boolean;
  };
}

export interface JungleBusSubscription {
  subscriptionID: string;
  currentBlock: number;
  Subscribe: () => void;
  UnSubscribe: () => void;
  GetCurrentBlock: () => number;
}

export interface JungleBusClient {
  Subscribe(
    from: string,
    fromBlock: number,
    onTransaction: (tx: JungleBusTransaction) => void,
    onStatus: (message: ControlMessage) => void,
    onError: (error: any) => void,
    onMempool: (tx: JungleBusTransaction) => void
  ): Promise<any>;
  GetTransaction(txid: string): Promise<JungleBusTransaction>;
}

// Transaction Types
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

// Vote Types
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

// Media Types
export interface MediaContent {
  content: Buffer;
  type: string;
}

// Constants
export const TRANSACTION_TYPES = {
  IMAGE_TYPES: ['image/'],
  ORDINAL_TYPES: ['ord'],
  MAP: {
    PREFIX: '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5',
    APP: 'lockd.app',
    TYPE: 'post'
  },
  OUTPUT_TYPES: {
    ORD: 'ord',
    PUBKEYHASH: 'bitcoin.pubkeyhash',
    MAP: 'map'
  },
  ORD_PREFIX: '6f7264' // 'ord' in hex
} as const; 