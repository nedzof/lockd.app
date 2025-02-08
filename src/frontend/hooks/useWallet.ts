import { useState, useEffect } from 'react';
import { WalletManager } from '../services/wallet-manager.service';
import { YoursWallet } from '../services/yours-wallet.service';
import { WalletError } from '../../shared/utils/errors';

export function useWallet() {
  const [wallet, setWallet] = useState<YoursWallet | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const walletManager = WalletManager.getInstance({
      defaultNetwork: process.env.REACT_APP_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
    });

    if (walletManager.isWalletConnected()) {
      setWallet(walletManager.getWallet());
      setIsConnected(true);
    }
  }, []);

  const connect = async () => {
    try {
      const walletManager = WalletManager.getInstance();
      await walletManager.connectWallet();
      setWallet(walletManager.getWallet());
      setIsConnected(true);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      throw err;
    }
  };

  const disconnect = async () => {
    try {
      const walletManager = WalletManager.getInstance();
      await walletManager.disconnectWallet();
      setWallet(null);
      setIsConnected(false);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to disconnect wallet';
      setError(errorMessage);
      throw err;
    }
  };

  return {
    wallet,
    isConnected,
    error,
    connect,
    disconnect
  };
} 