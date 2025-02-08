interface Window {
  yours?: {
    isReady: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isConnected: () => Promise<boolean>;
    getAddresses: () => Promise<{ bsvAddress: string }>;
    getBalance: () => Promise<number>;
    on: (event: string, handler: () => void) => void;
    off: (event: string, handler: () => void) => void;
  };
} 