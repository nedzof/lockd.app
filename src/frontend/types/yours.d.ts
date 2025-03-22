import type { ReactNode } from 'react';

declare module 'yours-wallet-provider' {
  export type MimeType = 
    | "text/plain"
    | "text/markdown"
    | "image/png"
    | "image/jpeg"
    | "image/gif"
    | "image/webp"
    | "image/svg+xml"
    | "application/pdf"
    | "application/json";

  export interface PaymentParams {
    satoshis: number;
    address?: string;
    paymail?: string;
    data?: string[]; // hex string array
    script?: string;  // hex string
  }

  export type MetadataMap = Record<string, string>;

  export interface InscriptionParams {
    address: string;
    base64_data: string;
    mime_type: string;
    map?: MetadataMap;
    satoshis?: number;
  }

  export interface LockParams {
    address: string;
    blockHeight: number;
    sats: number;
  }

  export interface SendResponse {
    tx_id: string;
    rawtx: string;
  }

  export interface WalletMethods {
    isReady: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isConnected: () => Promise<boolean>;
    getAddresses: () => Promise<{ bsvAddress: string; identityAddress: string }>;
    getBalance: () => Promise<{ bsv: number; satoshis: number; usdInCents: number }>;
    on: (event: string, callback: Function) => void;
    sendBsv: (params: PaymentParams[]) => Promise<SendResponse>;
    inscribe: (params: InscriptionParams[]) => Promise<SendResponse>;
    lockBsv: (params: LockParams[]) => Promise<SendResponse>;
    lock: (params: LockParams[]) => Promise<SendResponse>;
    getPaymentUtxos: () => Promise<Array<{
      satoshis: number;
      script: string;
      tx_id: string;
      vout: number;
    }>>;
  }

  export interface WalletProvider {
    useYoursWallet: () => WalletMethods;
    YoursProvider: (props: { children: ReactNode }) => JSX.Element;
  }
}

declare global {
  interface Window {
    yours: import('yours-wallet-provider').WalletMethods;
  }
}

export {}; 