import type { ReactNode } from 'react';
import type { InscribeRequest, SendResponse } from './inscribe';

declare module 'yours-wallet-provider' {
  export type MimeTypes = 
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

  export interface MAP {
    [key: string]: string;
  }

  export interface InscribeRequest {
    address: string;
    base64Data: string;
    mimeType: MimeTypes;
    map?: Record<string, string>;
    satoshis?: number;
  }

  export interface YoursWallet {
    isReady: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isConnected: () => Promise<boolean>;
    getAddresses: () => Promise<{ bsvAddress: string }>;
    getBalance: () => Promise<{ bsv: number; satoshis: number; usdInCents: number }>;
    on: (event: string, callback: Function) => void;
    off: (event: string, callback: Function) => void;
    sendBsv: (params: PaymentParams[]) => Promise<SendResponse>;
    inscribe: (params: InscribeRequest[]) => Promise<SendResponse>;
    getPaymentUtxos: () => Promise<Array<{
      satoshis: number;
      script: string;
      txid: string;
      vout: number;
    }>>;
  }

  export const useYoursWallet: () => YoursWallet | undefined;
  export const YoursProvider: (props: { children: ReactNode }) => JSX.Element;
}

declare global {
  interface Window {
    yours?: import('yours-wallet-provider').YoursWallet;
  }
}

export {}; 