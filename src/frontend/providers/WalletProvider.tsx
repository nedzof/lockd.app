import * as React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useYoursWallet } from 'yours-wallet-provider';

interface WalletContextType {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
  publicKey: string | undefined;
  bsvAddress: string | null;
  balance: number;
  isWalletDetected: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wallet = useYoursWallet();
  const [publicKey, setPublicKey] = useState<string>();
  const [bsvAddress, setBsvAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [isWalletDetected, setIsWalletDetected] = useState(false);

  // Check if wallet is detected
  useEffect(() => {
    setIsWalletDetected(!!wallet?.isReady);
  }, [wallet?.isReady]);

  // Cleanup function to reset state
  const resetState = useCallback(() => {
    setIsConnected(false);
    setPublicKey(undefined);
    setBsvAddress(null);
    setBalance(0);
  }, []);

  // Handle wallet connection
  const connect = useCallback(async () => {
    console.log('Connect called, wallet state:', {
      isReady: wallet?.isReady,
      hasConnect: !!wallet?.connect,
      wallet
    });

    if (!wallet?.isReady) {
      console.log('Wallet not ready, redirecting to yours.org');
      window.open('https://yours.org', '_blank');
      return;
    }

    try {
      const key = await wallet.connect();
      console.log('Got key:', key);
      if (key) {
        setPublicKey(key);
        setIsConnected(true);
        const addresses = await wallet.getAddresses();
        console.log('Got addresses:', addresses);
        if (addresses?.bsvAddress) {
          console.log('Setting BSV address:', addresses.bsvAddress);
          setBsvAddress(addresses.bsvAddress);
          const bal = await wallet.getBalance();
          console.log('Setting balance:', bal);
          setBalance(Number(bal));
        } else {
          console.error('No BSV address found in wallet response');
          resetState();
        }
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      resetState();
    }
  }, [wallet, resetState]);

  // Handle wallet disconnection
  const disconnect = useCallback(async () => {
    if (!wallet?.disconnect) return;
    try {
      await wallet.disconnect();
      resetState();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      resetState();
    }
  }, [wallet, resetState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      resetState();
    };
  }, [resetState]);

  // Check initial connection state
  useEffect(() => {
    const checkConnection = async () => {
      if (wallet?.isConnected) {
        const isConnected = await wallet.isConnected();
        if (!isConnected) {
          resetState();
        }
      }
    };
    
    checkConnection();
  }, [wallet, resetState]);

  const value = React.useMemo(() => ({
    connect,
    disconnect,
    isConnected,
    publicKey,
    bsvAddress,
    balance,
    isWalletDetected,
  }), [connect, disconnect, isConnected, publicKey, bsvAddress, balance, isWalletDetected]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}; 