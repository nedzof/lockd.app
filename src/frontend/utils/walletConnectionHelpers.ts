import { useYoursWallet, YoursProviderType, YoursEvents, YoursEventListeners } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';
import { useState, useEffect, useCallback } from 'react';

// Add typings to the wallet object with more flexibility
export interface WalletInterface {
  connect?: () => Promise<string | undefined | void>;
  getBalance?: () => Promise<{ bsv: number } | any>;
  getAddresses?: () => Promise<{ identityAddress: string; bsvAddress?: string } | any>;
  lockBsv?: (locks: any) => Promise<{ txid: string } | any>;
  lock?: (locks: any) => Promise<{ txid: string } | any>;
  isConnected?: boolean | (() => Promise<boolean>);
  isReady?: boolean;
  getPubKeys?: () => Promise<{ identityPubKey: string } | any>;
  on?: ((event: string, callback: Function) => void) | ((event: YoursEvents, listener: YoursEventListeners) => void);
  removeListener?: ((event: string, callback: Function) => void) | ((event: YoursEvents, listener: YoursEventListeners) => void);
  disconnect?: () => Promise<void>;
  [key: string]: any; // Allow additional properties
}

type YoursWallet = ReturnType<typeof useYoursWallet>;

/**
 * Helper function to retrieve BSV address from wallet
 * @param wallet The wallet instance
 * @returns The BSV address if found, otherwise null
 */
export const getBsvAddress = async (wallet: WalletInterface | YoursWallet): Promise<string | null> => {
  if (!wallet) {
    console.error('No wallet provided to getBsvAddress');
    return null;
  }

  try {
    // Check if getAddresses exists before calling it
    if (typeof wallet.getAddresses !== 'function') {
      console.error('Wallet does not have getAddresses method');
      return null;
    }
    
    const addresses = await wallet.getAddresses();
    
    // Check different property names that might contain the BSV address
    if (addresses) {
      if (typeof addresses === 'object') {
        if ('bsvAddress' in addresses) {
          return addresses.bsvAddress;
        }
        if ('identityAddress' in addresses) {
          return addresses.identityAddress;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error getting BSV address:', error);
    return null;
  }
};

/**
 * Helper function to ensure wallet connection with retry mechanism
 * @param wallet The wallet instance
 * @param connect The connect function from wallet context
 * @param maxRetries Maximum number of retries (default: 2)
 * @returns Object containing success status and address if successful
 */
export const ensureWalletConnection = async (
  wallet: WalletInterface | YoursWallet,
  connect: () => Promise<void>,
  maxRetries = 2
): Promise<{ success: boolean; address: string | null }> => {
  if (!wallet) {
    console.error('No wallet provided to ensureWalletConnection');
    return { success: false, address: null };
  }

  // Check if wallet is ready
  if (!wallet.isReady) {
    console.log('Wallet is not ready');
    return { success: false, address: null };
  }

  // Check if we already have an address
  let address = await getBsvAddress(wallet);
  if (address) {
    console.log('Already have wallet address:', address);
    return { success: true, address };
  }

  // Try to connect
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log(`Connection attempt ${retries + 1}/${maxRetries}...`);
      await connect();
      
      // Check if we have an address after connecting
      address = await getBsvAddress(wallet);
      if (address) {
        console.log('Successfully got address after connection:', address);
        return { success: true, address };
      }
      
      // Wait a moment before retrying
      console.log('No address after connection, waiting before retry...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check again after waiting
      address = await getBsvAddress(wallet);
      if (address) {
        console.log('Successfully got address after waiting:', address);
        return { success: true, address };
      }
      
      retries++;
    } catch (error) {
      console.error(`Error during connection attempt ${retries + 1}:`, error);
      retries++;
      
      // Wait longer between retries if there was an error
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.error('Failed to connect wallet after multiple attempts');
  return { success: false, address: null };
};

/**
 * Helper function to validate wallet connection status
 * @param wallet The wallet instance
 * @returns True if wallet is connected, false otherwise
 */
export const isWalletConnected = async (wallet?: WalletInterface | YoursWallet): Promise<boolean> => {
  if (!wallet) {
    return false;
  }

  try {
    // Handle both function and boolean property
    if (typeof wallet.isConnected === 'function') {
      return await wallet.isConnected();
    } else if (typeof wallet.isConnected === 'boolean') {
      return wallet.isConnected;
    }
    
    // Fallback to checking getAddresses
    try {
      // Check if getAddresses exists before calling it
      if (typeof wallet.getAddresses !== 'function') {
        return false;
      }
      
      const addresses = await wallet.getAddresses();
      return !!addresses && (
        ('bsvAddress' in addresses && !!addresses.bsvAddress) || 
        ('identityAddress' in addresses && !!addresses.identityAddress)
      );
    } catch (e) {
      return false;
    }
  } catch (error) {
    console.error('Error checking wallet connection:', error);
    return false;
  }
};

/**
 * Helper function to display wallet connection status with detailed information
 * @param wallet The wallet instance
 * @returns Detailed wallet status object
 */
export const getWalletStatus = async (wallet?: WalletInterface | YoursWallet): Promise<{
  isReady: boolean;
  isConnected: boolean;
  hasAddress: boolean;
  address: string | null;
  hasBalance: boolean;
  balance?: { bsv?: number; satoshis?: number };
}> => {
  if (!wallet) {
    // Return a default response instead of trying to use window.yours
    return {
      isReady: false,
      isConnected: false,
      hasAddress: false,
      address: null,
      hasBalance: false
    };
  }

  const isReady = !!wallet.isReady;
  const isConnected = await isWalletConnected(wallet);
  const address = await getBsvAddress(wallet);
  
  let balance;
  let hasBalance = false;
  
  if (address && typeof wallet.getBalance === 'function') {
    try {
      balance = await wallet.getBalance();
      hasBalance = true;
    } catch (error) {
      console.error('Error getting wallet balance:', error);
    }
  }
  
  return {
    isReady,
    isConnected,
    hasAddress: !!address,
    address,
    hasBalance,
    balance
  };
};

/**
 * Helper function to detect if the Yours wallet is installed
 * @returns True if wallet is installed, false otherwise
 */
export const isWalletInstalled = (): boolean => {
  return 'yours' in window && !!window.yours?.isReady;
};

/**
 * Helper function to refresh wallet balance with proper error handling
 * @param wallet - The wallet instance
 * @param setBalance - State setter function for balance
 */
export const refreshWalletBalance = async (
  wallet: WalletInterface | null | undefined,
  setBalance: (balance: { bsv: number }) => void
): Promise<void> => {
  if (!wallet || !wallet.getBalance) {
    return;
  }
  
  try {
    const balanceInfo = await wallet.getBalance();
    setBalance({ bsv: balanceInfo?.bsv || 0 });
  } catch (error: unknown) {
    // Don't display error in console if it's an authorization error
    if (error && typeof error === 'object' && 'message' in error && 
        typeof error.message === 'string' && error.message.includes('Unauthorized')) {
      // Silently fail, this is expected when wallet is not connected
      return;
    }
    console.error('Failed to refresh balance:', error);
  }
};

/**
 * Handles wallet connection with error handling
 * @param wallet - The wallet instance
 * @param refreshBalance - Function to refresh balance after connection
 * @returns true if connection successful, false otherwise
 */
export const connectWallet = async (
  wallet: WalletInterface | null | undefined,
  refreshBalance: () => Promise<void>
): Promise<boolean> => {
  if (!wallet || !wallet.connect) {
    toast.error('Wallet provider not available');
    return false;
  }
  
  try {
    toast.success('Please connect your wallet to continue');
    await wallet.connect();
    
    // Verify that connection was successful
    const connected = await isWalletConnected(wallet as WalletInterface);
    
    if (connected) {
      await refreshBalance();
      
      // Dispatch custom event for successful wallet connection
      const walletConnectedEvent = new CustomEvent('walletConnected', { 
        detail: { source: 'connectWallet' } 
      });
      window.dispatchEvent(walletConnectedEvent);
      
      return true;
    } else {
      toast.error('Wallet connection failed');
      return false;
    }
  } catch (error) {
    toast.error('Failed to connect wallet');
    return false;
  }
};

/**
 * Checks if the user is connected to a wallet and attempts to connect if not
 * @param connected - Current connection status
 * @param wallet - The wallet instance
 * @param refreshBalance - Function to refresh balance after connection
 * @returns true if connected or successfully connected, false otherwise
 */
export const ensureWalletConnected = async (
  connected: boolean,
  wallet: WalletInterface | null | undefined,
  refreshBalance: () => Promise<void>
): Promise<boolean> => {
  // First check if already connected according to props
  if (connected) {
    // Double-check by calling the wallet API
    const actuallyConnected = await isWalletConnected(wallet as WalletInterface);
    if (actuallyConnected) {
      return true;
    }
    // If we're not actually connected despite the prop saying we are,
    // continue to connection attempt
  }
  
  if (wallet && wallet.connect) {
    const success = await connectWallet(wallet, refreshBalance);
    
    // Dispatch a custom event to notify the application about the connection change
    // This allows the Layout component to update its state
    if (success) {
      const walletConnectedEvent = new CustomEvent('walletConnected', { 
        detail: { source: 'lockButton' } 
      });
      window.dispatchEvent(walletConnectedEvent);
    }
    
    return success;
  }
  
  toast.error('Please connect your wallet first');
  return false;
};

/**
 * React hook for handling wallet connection status
 * @param wallet - The wallet instance
 * @param initialConnected - Initial connection status
 * @returns Object with connection state and methods
 */
export const useWalletConnection = (
  wallet: WalletInterface | null | undefined,
  initialConnected = false
) => {
  const [connected, setConnected] = useState(initialConnected);
  const [balance, setBalance] = useState({ bsv: 0 });
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  
  const refreshBalance = useCallback(async () => {
    await refreshWalletBalance(wallet, setBalance);
  }, [wallet]);
  
  const checkConnection = useCallback(async () => {
    if (isCheckingConnection) return connected;
    
    setIsCheckingConnection(true);
    try {
      // Handle null/undefined wallet appropriately
      const isConnected = wallet ? await isWalletConnected(wallet as WalletInterface) : false;
      setConnected(isConnected);
      return isConnected;
    } finally {
      setIsCheckingConnection(false);
    }
  }, [wallet, connected, isCheckingConnection]);
  
  const connectToWallet = useCallback(async () => {
    const success = await connectWallet(wallet, refreshBalance);
    if (success) {
      setConnected(true);
    }
    return success;
  }, [wallet, refreshBalance]);
  
  const ensureConnected = useCallback(async () => {
    if (connected) {
      // Verify connection
      const isConnected = await checkConnection();
      if (isConnected) return true;
    }
    
    return await connectToWallet();
  }, [connected, checkConnection, connectToWallet]);
  
  // Check connection status when component mounts
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);
  
  return {
    connected,
    balance,
    refreshBalance,
    connectToWallet,
    ensureConnected,
    checkConnection
  };
};

/**
 * Shared lock handler hook to reduce duplication across components
 * @param wallet - The wallet instance
 * @param isConnected - Current connection status
 * @param refreshBalance - Function to refresh wallet balance
 * @param onLockSuccess - Optional callback for successful lock
 * @returns Lock handler state and methods
 */
export const useLockHandler = (
  wallet: WalletInterface | null | undefined,
  isConnected: boolean,
  refreshBalance: () => Promise<void>,
  onLockSuccess?: (id: string, amount: number, duration: number) => Promise<void>
) => {
  const [isLocking, setIsLocking] = useState(false);
  const [balance, setBalance] = useState({ bsv: 0 });
  const [connectionInProgress, setConnectionInProgress] = useState(false);

  // Function to refresh wallet balance
  const handleRefreshBalance = useCallback(async () => {
    await refreshWalletBalance(wallet, setBalance);
  }, [wallet]);
  
  // Effect to refresh balance on mount
  useEffect(() => {
    if (isConnected && wallet) {
      handleRefreshBalance();
    }
  }, [isConnected, wallet, handleRefreshBalance]);

  // Connect wallet handler
  const handleConnect = useCallback(async () => {
    setConnectionInProgress(true);
    try {
      const success = await connectWallet(wallet, handleRefreshBalance);
      return success;
    } finally {
      setConnectionInProgress(false);
    }
  }, [wallet, handleRefreshBalance]);

  // Cancel lock operation handler
  const handleCancel = useCallback(() => {
    setIsLocking(false);
    setConnectionInProgress(false);
  }, []);

  // Generic lock handler that can be customized by the implementing component
  const handleLock = useCallback(async (
    id: string, 
    amount: number, 
    duration: number,
    lockImplementation?: (id: string, amount: number, duration: number) => Promise<void>
  ) => {
    // If we're already in a locking state, don't start another operation
    if (isLocking || connectionInProgress) {
      return;
    }
    
    setConnectionInProgress(true);
    const isWalletConnected = await ensureWalletConnected(isConnected, wallet, handleRefreshBalance);
    setConnectionInProgress(false);
    
    if (!isWalletConnected) {
      return;
    }
    
    setIsLocking(true);
    
    try {
      // If custom implementation is provided, use it
      if (lockImplementation) {
        await lockImplementation(id, amount, duration);
      } 
      // Otherwise use default callback if provided
      else if (onLockSuccess) {
        await onLockSuccess(id, amount, duration);
      }
      
      // Refresh balance after successful lock
      await handleRefreshBalance();
    } catch (error) {
      // Handle actual errors but allow cancellations to pass silently
      if (error instanceof Error && !error.message.includes('canceled') && !error.message.includes('rejected')) {
        toast.error(error.message);
      }
      throw error;
    } finally {
      setIsLocking(false);
    }
  }, [isConnected, wallet, handleRefreshBalance, onLockSuccess, isLocking, connectionInProgress]);

  return {
    isLocking,
    connectionInProgress,
    balance,
    handleRefreshBalance,
    handleConnect,
    handleCancel,
    handleLock
  };
};
