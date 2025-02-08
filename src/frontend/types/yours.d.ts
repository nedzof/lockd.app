import type { ReactNode } from 'react';

declare module 'yours-wallet-provider' {
  export interface YoursWallet {
    isReady: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isConnected: () => Promise<boolean>;
    getAddresses: () => Promise<{ bsvAddress: string }>;
    getBalance: () => Promise<number>;
    on: (event: string, callback: Function) => void;
    off: (event: string, callback: Function) => void;
  }

  export function useYoursWallet(): YoursWallet | undefined;
  export function YoursProvider(props: { children: ReactNode }): JSX.Element;
}

declare global {
  interface Window {
    yours?: YoursWallet;
  }
}

export {}; 