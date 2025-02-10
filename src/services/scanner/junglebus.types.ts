export interface JungleBusTransaction {
  tx: {
    h: string; // transaction hash
    inputs: Array<{
      o?: string; // output point
      h?: string; // previous transaction hash
      i?: number; // previous output index
      s?: string; // unlocking script
      a?: string; // bitcoin address
    }>;
    outputs: Array<{
      i: number; // output index
      s: string; // locking script
      a?: string; // bitcoin address
      t?: string; // type (e.g. 'pubkeyhash', 'nulldata')
    }>;
    lock?: number;
  };
  block?: {
    h: string; // block hash
    i: number; // block height
    t: number; // block time
  };
}

export interface JungleBusSubscription {
  fromBlock: number;
  toBlock?: number;
  outputs?: Array<{
    type: string;
    filter?: string;
  }>;
  inputs?: Array<{
    type: string;
    filter?: string;
  }>;
}

// Keywords for detecting relevant transactions
export const TRANSACTION_TYPES = {
  ORD_PREFIX: '6f7264', // 'ord' in hex
  IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  OUTPUT_TYPES: {
    ORD: 'ord',
    PUBKEYHASH: 'bitcoin.pubkeyhash'
  }
} as const; 