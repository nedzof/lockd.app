import * as React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useYoursWallet, YoursProviderType } from 'yours-wallet-provider';

interface WalletContextType {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
  publicKey: string | undefined;
  bsvAddress: string | null;
  balance: { bsv: number; satoshis: number; usdInCents: number };
  isWalletDetected: boolean;
  wallet: YoursProviderType | undefined;
  refreshBalance: () => Promise<void>;
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
  const yoursWallet = useYoursWallet();
  const [publicKey, setPublicKey] = useState<string>();
  const [bsvAddress, setBsvAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState<{ bsv: number; satoshis: number; usdInCents: number }>({
    bsv: 0,
    satoshis: 0,
    usdInCents: 0
  });
  const [isWalletDetected, setIsWalletDetected] = useState(false);
  const [wallet, setWallet] = useState<YoursProviderType>();

  const refreshBalance = useCallback(async () => {
    if (wallet && isConnected) {
      try {
        const balanceResult = await wallet.getBalance();
        if (balanceResult) {
          setBalance({
            bsv: balanceResult.bsv ?? 0,
            satoshis: balanceResult.satoshis ?? 0,
            usdInCents: balanceResult.usdInCents ?? 0
          });
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    }
  }, [wallet, isConnected]);

  // Set wallet when yoursWallet changes
  useEffect(() => {
    if (yoursWallet) {
      setWallet(yoursWallet);
    }
  }, [yoursWallet]);

  // Check if wallet is detected
  useEffect(() => {
    setIsWalletDetected(!!wallet?.isReady);
    
    // If wallet is ready and connected, fetch balance
    const checkAndFetchBalance = async () => {
      if (wallet?.isReady) {
        try {
          const connected = await wallet.isConnected();
          if (connected) {
            setIsConnected(true);
            const addresses = await wallet.getAddresses();
            if (addresses?.bsvAddress) {
              setBsvAddress(addresses.bsvAddress);
              await refreshBalance();
            }
          }
        } catch (error) {
          console.error('Error checking initial connection:', error);
        }
      }
    };
    
    checkAndFetchBalance();
  }, [wallet?.isReady, refreshBalance]);

  // Setup event listeners for wallet events
  useEffect(() => {
    if (!wallet?.on) return;
    
    // Handle account switch
    wallet.on('switchAccount', async () => {
      console.log('Wallet account switched');
      try {
        // Update address and balance after account switch
        const addresses = await wallet.getAddresses();
        if (addresses?.bsvAddress) {
          setBsvAddress(addresses.bsvAddress);
          await refreshBalance();
        }
      } catch (error) {
        console.error('Error handling account switch:', error);
      }
    });

    // Handle sign out
    wallet.on('signedOut', () => {
      console.log('User signed out of wallet');
      disconnect();
    });
    
    return () => {
      // Clean up event listeners if possible
      if (wallet.removeAllListeners) {
        wallet.removeAllListeners();
      }
    };
  }, [wallet]);

  // Cleanup function to reset state
  const resetState = useCallback(() => {
    setIsConnected(false);
    setPublicKey(undefined);
    setBsvAddress(null);
    setBalance({ bsv: 0, satoshis: 0, usdInCents: 0 });
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
      // Connect using the method from the documentation
      const identityPubKey = await wallet.connect();
      console.log('Connection successful, identity public key:', identityPubKey);
      
      if (identityPubKey) {
        setPublicKey(identityPubKey);
        setIsConnected(true);
        
        // Get addresses after successful connection
        const addresses = await wallet.getAddresses();
        console.log('Got addresses:', addresses);
        
        if (addresses?.bsvAddress) {
          console.log('Setting BSV address:', addresses.bsvAddress);
          setBsvAddress(addresses.bsvAddress);
          
          // Fetch balance after successful connection
          await refreshBalance();
        } else {
          console.error('No BSV address found in wallet response');
          resetState();
        }
      } else {
        console.error('No identity public key returned from wallet connection');
        resetState();
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      resetState();
    }
  }, [wallet, resetState, refreshBalance]);

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

  // Set up periodic balance refresh
  useEffect(() => {
    if (!isConnected) return;
    
    const balanceInterval = setInterval(() => {
      refreshBalance();
    }, 30000); // Refresh every 30 seconds

    return () => {
      clearInterval(balanceInterval);
    };
  }, [refreshBalance, isConnected]);

  const value = React.useMemo(() => ({
    connect,
    disconnect,
    isConnected,
    publicKey,
    bsvAddress,
    balance,
    isWalletDetected,
    wallet,
    refreshBalance
  }), [connect, disconnect, isConnected, publicKey, bsvAddress, balance, isWalletDetected, wallet, refreshBalance]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};