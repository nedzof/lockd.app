import * as React from 'react';
import { createContext, useContext, useState } from 'react';
import { useYoursWallet } from 'yours-wallet-provider';

interface WalletContextType {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
  publicKey: string | undefined;
  bsvAddress: string | null;
  balance: number;
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

  const connect = async () => {
    console.log('Connect called, wallet state:', {
      isReady: wallet.isReady,
      hasConnect: !!wallet.connect,
      wallet
    });

    const isReady = wallet.isReady;
    if (!isReady) {
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
        if (addresses?.[0]) {
          setBsvAddress(addresses[0]);
          const bal = await wallet.getBalance();
          setBalance(Number(bal));
        }
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      setIsConnected(false);
      setPublicKey(undefined);
      setBsvAddress(null);
      setBalance(0);
    }
  };

  const disconnect = async () => {
    if (!wallet.disconnect) return;
    try {
      await wallet.disconnect();
      setIsConnected(false);
      setPublicKey(undefined);
      setBsvAddress(null);
      setBalance(0);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        connect,
        disconnect,
        isConnected,
        publicKey,
        bsvAddress,
        balance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}; 