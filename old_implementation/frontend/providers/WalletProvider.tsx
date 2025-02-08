import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useYoursWallet, NetWork } from 'yours-wallet-provider';

type YoursEvent = 'switchAccount' | 'signedOut';

interface SignMessage {
  message: string;
  encoding?: 'utf8';
}

interface SignedMessage {
  sig: string;
}

interface WalletContextType {
  isYoursInstalled: boolean;
  connected: boolean;
  bsvAddress: string | null;
  balance: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  publicKey: string | null;
  isTestnet: boolean;
  setIsTestnet: (isTestnet: boolean) => void;
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
  const [isYoursInstalled, setIsYoursInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [bsvAddress, setBsvAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isTestnet, setIsTestnetState] = useState(false);

  const yoursWallet = useYoursWallet();

  const disconnect = useCallback(async () => {
    try {
      if (yoursWallet) {
        await yoursWallet.disconnect();
      }
      
      setConnected(false);
      setBsvAddress(null);
      setPublicKey(null);
    } catch (error) {
      console.error('Failed to disconnect:', error);
      throw error;
    }
  }, [yoursWallet]);

  const signMessage = async (message: string) => {
    if (!yoursWallet) {
      throw new Error('No wallet connected');
    }

    const signRequest: SignMessage = { message, encoding: 'utf8' };
    const result = await yoursWallet.signMessage(signRequest) as SignedMessage;
    return result.sig;
  };

  const connect = async () => {
    try {
      if (!yoursWallet?.isReady) {
        window.open('https://yours.org', '_blank');
        throw new Error('Yours Wallet is not ready');
      }

      try {
        console.log('Connecting to Yours wallet...');
        // Set connected state early to update UI
        setConnected(true);
        
        // Connect and get identity public key
        const identityPubKey = await yoursWallet.connect();
        console.log('Got identity public key:', identityPubKey);
        
        if (identityPubKey) {
          setPublicKey(identityPubKey);
          await handleYoursWalletState();
        }
      } catch (err: unknown) {
        console.error('Failed to connect to Yours wallet:', err);
        setConnected(false);
        setBsvAddress(null);
        setPublicKey(null);
        throw new Error(err instanceof Error ? err.message : 'Failed to connect to Yours wallet');
      }
    } catch (err: unknown) {
      console.error('Failed to connect:', err);
      setConnected(false);
      setBsvAddress(null);
      setPublicKey(null);
      throw new Error(err instanceof Error ? err.message : 'Failed to connect wallet');
    }
  };

  // Handle Yours wallet connection state
  const handleYoursWalletState = useCallback(async () => {
    if (!yoursWallet) {
      console.log('Yours wallet not available');
      return;
    }

    try {
      console.log('Checking Yours wallet state...');
      const isConnected = await yoursWallet.isConnected();
      console.log('Yours wallet connected:', isConnected);
      
      if (isConnected) {
        // First set the connected state to trigger UI updates
        setConnected(true);
        
        const addresses = await yoursWallet.getAddresses();
        console.log('Yours wallet addresses:', addresses);
        
        // Use bsvAddress from Yours wallet
        if (addresses && 'bsvAddress' in addresses) {
          const address = addresses.bsvAddress;
          console.log('Using BSV address:', address);
          
          const balance = await yoursWallet.getBalance();
          console.log('Yours wallet balance:', balance);
          
          if (balance !== undefined) {
            console.log('Setting Yours wallet state:', {
              address,
              balance: Number(balance)
            });
            
            setBsvAddress(address);
            setBalance(Number(balance));
          }
        } else {
          console.error('No BSV address found in wallet response');
          setConnected(false);
          setBsvAddress(null);
          setBalance(0);
        }
      } else {
        console.log('Yours wallet not connected, resetting state');
        setConnected(false);
        setBsvAddress(null);
        setBalance(0);
      }
    } catch (error) {
      console.error('Error checking Yours wallet state:', error);
      setConnected(false);
      setBsvAddress(null);
      setBalance(0);
    }
  }, [yoursWallet]);

  // Check if wallet is installed
  useEffect(() => {
    const checkWallet = async () => {
      try {
        const isYoursAvailable = yoursWallet?.isReady || false;
        setIsYoursInstalled(isYoursAvailable);

        if (isYoursAvailable) {
          const isConnected = await yoursWallet.isConnected();
          if (isConnected) {
            await handleYoursWalletState();
          }
        }

        console.log('Yours wallet available:', isYoursAvailable);
      } catch (error) {
        console.error('Error checking wallet availability:', error);
      }
    };

    checkWallet();
  }, [yoursWallet, handleYoursWalletState]);

  // Set up Yours wallet event listeners
  useEffect(() => {
    if (!yoursWallet?.on) {
      console.log('Yours wallet events not available');
      return;
    }

    console.log('Setting up Yours wallet event listeners');
    
    const handleSwitchAccount = async () => {
      console.log('Yours wallet: switchAccount event');
      await handleYoursWalletState();
    };

    const handleSignedOut = async () => {
      console.log('Yours wallet: signedOut event');
      await disconnect();
    };

    yoursWallet.on('switchAccount', handleSwitchAccount);
    yoursWallet.on('signedOut', handleSignedOut);

    return () => {
      if (yoursWallet) {
        yoursWallet.removeListener('switchAccount', handleSwitchAccount);
        yoursWallet.removeListener('signedOut', handleSignedOut);
      }
    };
  }, [yoursWallet, handleYoursWalletState, disconnect]);

  const handleNetworkChange = useCallback(async (newIsTestnet: boolean) => {
    setIsTestnetState(newIsTestnet);
    if (connected) {
      await handleYoursWalletState();
    }
  }, [connected, handleYoursWalletState]);

  // Check network state
  useEffect(() => {
    const checkNetworkState = async () => {
      if (yoursWallet && connected) {
        try {
          const network = await yoursWallet.getNetwork();
          setIsTestnetState(network === NetWork.Testnet);
        } catch (error) {
          console.error('Error checking network state:', error);
        }
      }
    };

    checkNetworkState();
  }, [connected, yoursWallet]);

  return (
    <WalletContext.Provider
      value={{
        isYoursInstalled,
        connected,
        bsvAddress,
        balance,
        connect,
        disconnect,
        signMessage,
        publicKey,
        isTestnet,
        setIsTestnet: handleNetworkChange,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}; 