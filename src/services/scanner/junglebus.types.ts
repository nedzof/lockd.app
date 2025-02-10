export interface Transaction {
  id: string;
  block_hash: string;
  block_height: number;
  block_index: number;
  block_time: number;
  transaction: string;
  merkle_proof: string;
}

export interface JungleBusTransaction {
  tx: Transaction;
  blockHeight: number;
}

export interface ControlMessage {
  statusCode: number;
  status: string;
  message: string;
  block: number;
  transactions: number;
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

// Keywords for detecting relevant transactions
export const TRANSACTION_TYPES_OLD = {
  IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  OUTPUT_TYPES: {
    ORD: 'ord',
    PUBKEYHASH: 'bitcoin.pubkeyhash',
    MAP: 'map'
  }
} as const; 