import { toast } from 'react-hot-toast';
import { useState, useEffect, useCallback } from 'react';

// Add typings to the wallet object with more flexibility
export interface WalletInterface {
  connect?: () => Promise<string | undefined | void>;
  getBalance?: () => Promise<{ bsv: number } | any>;
  getAddresses?: () => Promise<{ identityAddress: string } | any>;
  lockBsv?: (locks: any) => Promise<{ txid: string } | any>;
  lock?: (locks: any) => Promise<{ txid: string } | any>;
  [key: string]: any; // Allow additional properties
}

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
 * Check if wallet is properly connected
 * @param wallet - The wallet instance to check
 * @returns boolean indicating if wallet is connected and functional
 */
export const isWalletConnected = async (
  wallet: WalletInterface | null | undefined
): Promise<boolean> => {
  if (!wallet) return false;
  
  try {
    // Try to get basic wallet info to verify it's connected
    if (wallet.getAddresses) {
      const addresses = await wallet.getAddresses();
      return !!addresses?.identityAddress;
    }
    
    // If no getAddresses method, try getBalance
    if (wallet.getBalance) {
      const balance = await wallet.getBalance();
      return balance !== undefined;
    }
    
    // Can't verify connection
    return false;
  } catch (error) {
    // If we get errors, wallet is likely not properly connected
    return false;
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
    const connected = await isWalletConnected(wallet);
    
    if (connected) {
      await refreshBalance();
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
      const isConnected = await isWalletConnected(wallet);
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
    const actuallyConnected = await isWalletConnected(wallet);
    if (actuallyConnected) {
      return true;
    }
    // If we're not actually connected despite the prop saying we are,
    // continue to connection attempt
  }
  
  if (wallet && wallet.connect) {
    return await connectWallet(wallet, refreshBalance);
  }
  
  toast.error('Please connect your wallet first');
  return false;
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
    await connectWallet(wallet, handleRefreshBalance);
  }, [wallet, handleRefreshBalance]);

  // Cancel lock operation handler
  const handleCancel = useCallback(() => {
    setIsLocking(false);
  }, []);

  // Generic lock handler that can be customized by the implementing component
  const handleLock = useCallback(async (
    id: string, 
    amount: number, 
    duration: number,
    lockImplementation?: (id: string, amount: number, duration: number) => Promise<void>
  ) => {
    const isWalletConnected = await ensureWalletConnected(isConnected, wallet, handleRefreshBalance);
    
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
      toast.error(error instanceof Error ? error.message : 'Failed to lock BSV');
      throw error;
    } finally {
      setIsLocking(false);
    }
  }, [isConnected, wallet, handleRefreshBalance, onLockSuccess]);

  return {
    isLocking,
    balance,
    handleRefreshBalance,
    handleConnect,
    handleCancel,
    handleLock
  };
}; 