declare module 'yours-wallet-provider' {
  export interface InscriptionParams {
    address: string;
    base64Data: string;
    mimeType: string;
    map?: Record<string, string>;
    satoshis?: number;
  }

  export interface SendResponse {
    txid: string;
    rawtx: string;
  }

  export interface TransactionResponse {
    id: string;
    tx: {
      toString: () => string;
    };
  }

  export interface YoursWallet {
    inscribe: (params: InscriptionParams[]) => Promise<SendResponse>;
  }
} 