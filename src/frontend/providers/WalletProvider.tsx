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

  // Cleanup function to reset state
  const resetState = useCallback(() => {
    setIsConnected(false);
    setPublicKey(undefined);
    setBsvAddress(null);
    setBalance({ bsv: 0, satoshis: 0, usdInCents: 0 });
  }, []);

  // Function to refresh balance - defined early to avoid circular dependencies
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

  // Handle wallet disconnection - defined early to avoid circular dependencies
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
          // Check if isConnected is a function or a property
          let connected = false;
          if (typeof wallet.isConnected === 'function') {
            connected = await wallet.isConnected();
            console.log('isConnected() function returned:', connected);
          } else if (wallet.isConnected !== undefined) {
            connected = wallet.isConnected;
            console.log('isConnected property value:', connected);
          } else {
            console.log('No isConnected function or property found on wallet, assuming connected');
            connected = true;
          }
          
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
    if (!wallet) return;
    
    // Only set up listeners if the 'on' method exists
    if (typeof wallet.on === 'function') {
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
    } else {
      console.log('Wallet does not support event listeners (no "on" method)');
    }
  }, [wallet, disconnect, refreshBalance]);

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
      // Log wallet object structure to help diagnose API differences
      console.log('Wallet object structure:', {
        isReady: wallet.isReady,
        isConnected: wallet.isConnected,
        hasConnect: typeof wallet.connect === 'function',
        hasDisconnect: typeof wallet.disconnect === 'function',
        hasGetAddresses: typeof wallet.getAddresses === 'function',
        hasGetBalance: typeof wallet.getBalance === 'function',
        hasGetPubKeys: typeof wallet.getPubKeys === 'function',
        hasOn: typeof wallet.on === 'function',
        methods: Object.keys(wallet).filter(key => typeof wallet[key] === 'function'),
        properties: Object.keys(wallet).filter(key => typeof wallet[key] !== 'function')
      });

      // Try to connect and log all outputs for debugging
      console.log('Calling wallet.connect()...');
      const connectResult = await wallet.connect();
      console.log('wallet.connect() returned:', connectResult);
      
      // Check if already connected
      console.log('Checking connection status...');
      let isConnectedResult = false;
      if (typeof wallet.isConnected === 'function') {
        isConnectedResult = await wallet.isConnected();
        console.log('isConnected() function returned:', isConnectedResult);
      } else if (wallet.isConnected !== undefined) {
        isConnectedResult = wallet.isConnected;
        console.log('isConnected property value:', isConnectedResult);
      } else {
        console.log('No isConnected function or property found, assuming connected after connect() call');
        isConnectedResult = true; // Assume connected if we can't check
      }
      
      if (isConnectedResult) {
        setIsConnected(true);
        
        // Get addresses and public keys
        console.log('Getting addresses...');
        try {
          const addresses = await wallet.getAddresses();
          console.log('wallet.getAddresses() returned:', addresses);
          
          if (addresses?.bsvAddress) {
            console.log('Setting BSV address:', addresses.bsvAddress);
            setBsvAddress(addresses.bsvAddress);
            
            // Fetch balance after successful connection
            console.log('Refreshing balance...');
            await refreshBalance();
            console.log('Balance refreshed');
          } else {
            console.error('No BSV address found in wallet response');
            resetState();
          }
        } catch (addressError) {
          console.error('Error getting addresses:', addressError);
          // Try alternative methods if available
          if (typeof wallet.getAddress === 'function') {
            try {
              console.log('Trying alternative getAddress method...');
              const address = await wallet.getAddress();
              console.log('Alternative address method returned:', address);
              if (address) {
                setBsvAddress(address);
                await refreshBalance();
              }
            } catch (altAddressError) {
              console.error('Alternative address method failed:', altAddressError);
              resetState();
            }
          } else {
            resetState();
          }
        }
        
        // Try to get public keys as well
        try {
          console.log('Getting public keys...');
          const pubKeys = await wallet.getPubKeys();
          console.log('wallet.getPubKeys() returned:', pubKeys);
          if (pubKeys?.identityPubKey) {
            setPublicKey(pubKeys.identityPubKey);
          }
        } catch (pubKeyError) {
          console.warn('Could not get public keys:', pubKeyError);
          // Continue anyway since this is not critical
        }
      } else {
        console.error('Wallet reported not connected after connect() call');
        resetState();
      }
    } catch (error) {
      console.error('Failed to connect:', error);
      resetState();
    }
  }, [wallet, resetState, refreshBalance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wallet?.disconnect) {
        try {
          wallet.disconnect();
        } catch (error) {
          console.error('Error disconnecting wallet on unmount:', error);
        }
      }
    };
  }, [wallet]);

  // Set up periodic balance refresh
  useEffect(() => {
    if (!isConnected) return;
    
    // Refresh balance every 30 seconds
    const intervalId = setInterval(() => {
      refreshBalance();
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isConnected, refreshBalance]);

  return (
    <WalletContext.Provider
      value={{
        connect,
        disconnect,
        isConnected,
        publicKey,
        bsvAddress,
        balance,
        isWalletDetected,
        wallet,
        refreshBalance
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};