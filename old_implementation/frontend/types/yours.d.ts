import type { ReactNode } from 'react';

declare module 'yours-wallet-provider' {
  export interface YoursWallet {
    isReady: boolean;
    connect: () => Promise<string>;
    disconnect: () => Promise<void>;
    isConnected: () => Promise<boolean>;
    getAddresses: () => Promise<string[]>;
    getBalance: () => Promise<number>;
    signMessage: (message: string) => Promise<{ signature: string }>;
    on: (event: 'switchAccount' | 'signedOut', handler: () => void) => void;
    off: (event: 'switchAccount' | 'signedOut', handler: () => void) => void;
  }

  export function useYoursWallet(): YoursWallet | undefined;
  export function YoursProvider(props: { children: ReactNode }): JSX.Element;
}

declare global {
  interface Window {
    yours?: {
      isReady: boolean;
      connect: () => Promise<string>;
      disconnect: () => Promise<void>;
      isConnected: () => Promise<boolean>;
      getAddresses: () => Promise<string[]>;
      getBalance: () => Promise<number>;
      signMessage: (message: string) => Promise<{ signature: string }>;
      on: (event: 'switchAccount' | 'signedOut', handler: () => void) => void;
      off: (event: 'switchAccount' | 'signedOut', handler: () => void) => void;
    };
  }
} 