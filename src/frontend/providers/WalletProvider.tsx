import * as React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useYoursWallet, YoursProviderType } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';
import { getBsvAddress, isWalletConnected } from '../utils/walletConnectionHelpers';

// Helper function to safely check if a wallet method exists and is callable
const safe_wallet_method_check = (wallet: any, method_name: string): boolean => {
  if (!wallet) return false;
  return typeof wallet[method_name] === 'function';
};

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
  clearPendingTransactions: () => Promise<void>;
  queueTransaction: <T>(transactionFn: () => Promise<T>) => Promise<T>;
  recoverFromFailedTransaction: () => Promise<boolean>;
  wallet_state: 'not_installed' | 'not_connected' | 'connecting' | 'connected' | 'error';
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
  const yours_wallet = useYoursWallet();
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
  const [wallet_state, set_wallet_state] = useState<'not_installed' | 'not_connected' | 'connecting' | 'connected' | 'error'>('not_installed');
  const [pending_transactions, set_pending_transactions] = useState<Array<{ id: string; fn: () => Promise<any> }>>([]);
  const [is_processing_transaction, set_is_processing_transaction] = useState(false);

  // Cleanup function to reset state
  const reset_state = useCallback(() => {
    setIsConnected(false);
    setPublicKey(undefined);
    setBsvAddress(null);
    setBalance({ bsv: 0, satoshis: 0, usdInCents: 0 });
    set_wallet_state('not_connected');
  }, []);

  // Add clearPendingTransactions function
  const clearPendingTransactions = useCallback(async () => {
    if (!wallet) return;

    console.log('Clearing any pending wallet transactions...');
    
    try {
      // Type assertion to access potential wallet-specific methods
      const walletWithClearMethod = wallet as YoursProviderType & { 
        clearPendingTransactions?: () => Promise<void>;
        cancelAllTransactions?: () => Promise<void>;
        resetState?: () => Promise<void>;
      };
      
      // Try various methods that might exist to clear transactions
      if (safe_wallet_method_check(walletWithClearMethod, 'clearPendingTransactions')) {
        await walletWithClearMethod.clearPendingTransactions!();
      } else if (safe_wallet_method_check(walletWithClearMethod, 'cancelAllTransactions')) {
        await walletWithClearMethod.cancelAllTransactions!();
      } else if (safe_wallet_method_check(walletWithClearMethod, 'resetState')) {
        await walletWithClearMethod.resetState!();
      } else {
        // If no clear method exists, try to disconnect and reconnect
        console.log('No clear transaction method found, resetting wallet connection state...');
        
        // Force reset connection state - this helps when wallet dialogs are still open
        if (safe_wallet_method_check(wallet, 'disconnect')) {
          try {
            // Don't await to avoid blocking if there's an error
            wallet.disconnect().catch(() => {});
          } catch (e) {
            // Ignore errors during forced disconnect
          }
        }
      }
      
      // Always clear our internal transaction queue regardless of wallet response
      set_pending_transactions([]);
      set_is_processing_transaction(false);
    } catch (error) {
      // Silently handle errors to prevent console messages
      // Reset our transaction state anyway
      set_pending_transactions([]);
      set_is_processing_transaction(false);
    }
  }, [wallet]);

  // Implement transaction queue manager
  const queue_transaction = useCallback(async <T,>(transaction_fn: () => Promise<T>): Promise<T> => {
    // Set a unique ID for this transaction
    const tx_id = Date.now().toString();
    
    // Create a promise that will resolve with the transaction result
    const result_promise = new Promise<T>((resolve, reject) => {
      // Wrap the provided function to capture its result
      const wrapped_fn = async () => {
        try {
          const result = await transaction_fn();
          resolve(result);
          return result;
        } catch (error) {
          reject(error);
          throw error;
        }
      };
      
      // Add to queue
      set_pending_transactions(prev => [...prev, { id: tx_id, fn: wrapped_fn }]);
    });
    
    // Process queue if not already processing
    if (!is_processing_transaction) {
      process_transaction_queue();
    }
    
    return result_promise;
  }, [is_processing_transaction]);

  // Process transaction queue
  const process_transaction_queue = useCallback(async () => {
    if (pending_transactions.length === 0) {
      set_is_processing_transaction(false);
      return;
    }
    
    set_is_processing_transaction(true);
    const tx = pending_transactions[0];
    
    try {
      await tx.fn();
    } catch (error) {
      console.error('Transaction failed:', error);
    } finally {
      // Remove from queue regardless of success/failure
      set_pending_transactions(prev => prev.filter(t => t.id !== tx.id));
      
      // Process next transaction
      setTimeout(() => {
        if (pending_transactions.length > 0) {
          process_transaction_queue();
        } else {
          set_is_processing_transaction(false);
        }
      }, 100);
    }
  }, [pending_transactions]);

  // Function to refresh balance - defined early to avoid circular dependencies
  const refreshBalance = useCallback(async () => {
    if (wallet && isConnected) {
      try {
        const balance_result = await wallet.getBalance();
        if (balance_result) {
          setBalance({
            bsv: balance_result.bsv ?? 0,
            satoshis: balance_result.satoshis ?? 0,
            usdInCents: balance_result.usdInCents ?? 0
          });
        }
      } catch (error) {
        // Handle silently instead of logging to console
        // No need to show errors to the user, just continue with current balance value
      }
    }
  }, [wallet, isConnected]);

  // Implement proper transaction recovery system
  const recoverFromFailedTransaction = useCallback(async () => {
    console.log('Attempting to recover from failed transaction...');
    
    // First, try to clear any pending transactions
    await clearPendingTransactions();
    
    // Then disconnect and reconnect the wallet
    try {
      set_wallet_state('connecting');
      
      if (wallet?.disconnect) {
        await wallet.disconnect();
      }
      
      // Wait a moment before reconnecting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reconnect
      if (wallet?.connect) {
        await wallet.connect();
        
        // Verify connection
        const address = await getBsvAddress(wallet);
        if (address) {
          setBsvAddress(address);
          setIsConnected(true);
          set_wallet_state('connected');
          await refreshBalance();
          return true;
        }
      }
      set_wallet_state('error');
      return false;
    } catch (error) {
      console.error('Recovery failed:', error);
      set_wallet_state('error');
      return false;
    }
  }, [wallet, clearPendingTransactions, refreshBalance]);

  // Handle wallet disconnection
  const disconnect = useCallback(async () => {
    if (!wallet?.disconnect) return;
    try {
      // Clear any pending transactions first
      await clearPendingTransactions();
      
      // Then disconnect
      await wallet.disconnect();
      reset_state();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      reset_state();
    }
  }, [wallet, reset_state, clearPendingTransactions]);

  // Set wallet when yours_wallet changes
  useEffect(() => {
    if (yours_wallet) {
      setWallet(yours_wallet);
    }
  }, [yours_wallet]);

  // Updated function to get BSV address according to official docs
  const get_wallet_addresses = async (wallet_instance: YoursProviderType): Promise<string | null> => {
    try {
      // Try the method from the official docs first
      const addresses = await wallet_instance.getAddresses();
      if (addresses && addresses.bsvAddress) {
        return addresses.bsvAddress;
      }
      
      // Fall back to the previous method if needed
      return await getBsvAddress(wallet_instance);
    } catch (error) {
      console.error('Error getting wallet addresses:', error);
      return null;
    }
  };

  // Check if wallet is detected
  useEffect(() => {
    const wallet_ready = !!wallet?.isReady;
    setIsWalletDetected(wallet_ready);
    
    if (!wallet_ready) {
      set_wallet_state('not_installed');
    } else if (!isConnected) {
      set_wallet_state('not_connected');
    }
    
    // If wallet is ready and connected, fetch balance
    const check_and_fetch_balance = async () => {
      if (wallet?.isReady) {
        try {
          const is_connected_result = await isWalletConnected(wallet);
          if (is_connected_result) {
            setIsConnected(true);
            set_wallet_state('connected');
            const address = await get_wallet_addresses(wallet);
            if (address) {
              setBsvAddress(address);
              await refreshBalance();
            }
          }
        } catch (error) {
          console.error('Error checking initial connection:', error);
          set_wallet_state('error');
        }
      }
    };
    
    if (wallet_ready) {
      check_and_fetch_balance();
    }
  }, [wallet?.isReady, refreshBalance, isConnected]);

  // Setup event listeners for wallet events
  useEffect(() => {
    if (!wallet) return;
    
    // Only set up listeners if the 'on' method exists
    if (safe_wallet_method_check(wallet, 'on')) {
      // Handle account switch
      wallet.on('switchAccount', async () => {
        console.log('Wallet account switched');
        try {
          // Update address and balance after account switch
          const address = await get_wallet_addresses(wallet);
          if (address) {
            setBsvAddress(address);
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
        try {
          if (safe_wallet_method_check(wallet, 'removeAllListeners')) {
            (wallet as any).removeAllListeners();
          } else if (safe_wallet_method_check(wallet, 'removeListener')) {
            // Fall back to removing individual listeners if available
            wallet.removeListener('switchAccount', () => {});
            wallet.removeListener('signedOut', () => {});
          }
        } catch (cleanupError) {
          // Silently handle errors during cleanup
        }
      };
    } else {
      console.log('Wallet does not support event listeners (no "on" method)');
    }
  }, [wallet, disconnect, refreshBalance]);

  // Simplified wallet connection
  const connect = useCallback(async () => {
    if (!wallet?.isReady) {
      console.log('Wallet not ready, redirecting to yours.org');
      toast.error('Wallet not detected. Please install the Yours wallet extension.');
      window.open('https://yours.org', '_blank');
      set_wallet_state('not_installed');
      return;
    }
    
    set_wallet_state('connecting');
    
    try {
      // Clear any pending transactions first
      await clearPendingTransactions();
      
      // Simple connection with timeout
      const connection_result = await Promise.race([
        wallet.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
      ]);
      
      // Verify address to confirm connection
      const address = await get_wallet_addresses(wallet);
      if (!address) {
        throw new Error('Failed to get wallet address');
      }
      
      // Set connection state
      setIsConnected(true);
      setBsvAddress(address);
      set_wallet_state('connected');
      
      // Refresh balance
      await refreshBalance();
      
      // Try to get public keys
      try {
        const pub_keys = await wallet.getPubKeys();
        if (pub_keys?.identityPubKey) {
          setPublicKey(pub_keys.identityPubKey);
        }
      } catch (error) {
        // Not critical, continue without public key
      }
      
      // Don't return any value to match the Promise<void> type in the interface
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
      setIsConnected(false);
      set_wallet_state('error');
      throw error;
    }
  }, [wallet, refreshBalance, clearPendingTransactions]);

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
    const interval_id = setInterval(async () => {
      try {
        await refreshBalance();
      } catch (error) {
        // Silently handle any errors during balance refresh
      }
    }, 30000);
    
    return () => {
      clearInterval(interval_id);
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
        refreshBalance,
        clearPendingTransactions,
        queueTransaction: queue_transaction,
        recoverFromFailedTransaction,
        wallet_state
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};