import * as React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useYoursWallet, YoursProviderType } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';
import { getBsvAddress, isWalletConnected } from '../utils/walletConnectionHelpers';

// Helper function to safely check if a wallet method exists and is callable
const safeWalletMethodCheck = (wallet: any, methodName: string): boolean => {
  if (!wallet) return false;
  return typeof wallet[methodName] === 'function';
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
  queueTransaction: <T>(transaction_fn: () => Promise<T>) => Promise<T>;
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
  const [pending_transactions, set_pending_transactions] = useState<{ id: string; fn: () => Promise<any> }[]>([]);
  const [is_processing_transaction, set_is_processing_transaction] = useState(false);

  // Cleanup function to reset state
  const resetState = useCallback(() => {
    setIsConnected(false);
    setPublicKey(undefined);
    setBsvAddress(null);
    setBalance({ bsv: 0, satoshis: 0, usdInCents: 0 });
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
      // Use our helper to safely check method existence
      if (safeWalletMethodCheck(walletWithClearMethod, 'clearPendingTransactions')) {
        await walletWithClearMethod.clearPendingTransactions!();
      } else if (safeWalletMethodCheck(walletWithClearMethod, 'cancelAllTransactions')) {
        await walletWithClearMethod.cancelAllTransactions!();
      } else if (safeWalletMethodCheck(walletWithClearMethod, 'resetState')) {
        await walletWithClearMethod.resetState!();
      } else {
        // If no clear method exists, try to disconnect and reconnect
        console.log('No clear transaction method found, resetting wallet connection state...');
        
        // Force reset connection state - this helps when wallet dialogs are still open
        if (safeWalletMethodCheck(wallet, 'disconnect')) {
          try {
            // Don't await to avoid blocking if there's an error
            wallet.disconnect().catch(() => {});
          } catch (e) {
            // Ignore errors during forced disconnect
          }
        }
      }
    } catch (error) {
      // Silently handle errors to prevent console messages
      // console.error('Error clearing pending transactions:', error);
    }
  }, [wallet]);

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
        // Handle silently instead of logging to console
        // Common errors like Unauthorized should be handled gracefully
        // If we need to debug, we can uncomment this line
        // console.error('Error fetching balance:', error);
        
        // No need to show errors to the user, just continue with current balance value
      }
    }
  }, [wallet, isConnected]);

  // Handle wallet disconnection - defined early to avoid circular dependencies
  const disconnect = useCallback(async () => {
    if (!wallet?.disconnect) return;
    try {
      // Clear any pending transactions first
      await clearPendingTransactions();
      
      // Then disconnect
      await wallet.disconnect();
      resetState();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      resetState();
    }
  }, [wallet, resetState, clearPendingTransactions]);

  // Set wallet when yoursWallet changes
  useEffect(() => {
    if (yoursWallet) {
      setWallet(yoursWallet);
    }
  }, [yoursWallet]);

  // Updated function to get BSV address according to official docs
  const getWalletAddresses = async (walletInstance: YoursProviderType): Promise<string | null> => {
    try {
      // Try the method from the official docs first
      const addresses = await walletInstance.getAddresses();
      if (addresses && addresses.bsvAddress) {
        return addresses.bsvAddress;
      }
      
      // Fall back to the previous method if needed
      return await getBsvAddress(walletInstance);
    } catch (error) {
      console.error('Error getting wallet addresses:', error);
      return null;
    }
  };

  // Check if wallet is detected
  useEffect(() => {
    setIsWalletDetected(!!wallet?.isReady);
    
    // If wallet is ready and connected, fetch balance
    const checkAndFetchBalance = async () => {
      if (wallet?.isReady) {
        try {
          const isConnectedResult = await isWalletConnected(wallet);
          if (isConnectedResult) {
            setIsConnected(true);
            const address = await getWalletAddresses(wallet);
            if (address) {
              setBsvAddress(address);
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
    
    // Listen for custom wallet connection events from Lock buttons
    const handleWalletConnectedEvent = async () => {
      console.log('Received walletConnected event, refreshing connection state');
      try {
        const isConnectedResult = await isWalletConnected(wallet);
        if (isConnectedResult) {
          setIsConnected(true);
          const address = await getWalletAddresses(wallet);
          if (address) {
            setBsvAddress(address);
            await refreshBalance();
          }
        }
      } catch (error) {
        console.error('Error handling custom wallet connection event:', error);
      }
    };
    
    window.addEventListener('walletConnected', handleWalletConnectedEvent);
    
    // Only set up listeners if the 'on' method exists
    if (safeWalletMethodCheck(wallet, 'on')) {
      // Handle account switch
      wallet.on('switchAccount', async () => {
        console.log('Wallet account switched');
        try {
          // Update address and balance after account switch
          const address = await getWalletAddresses(wallet);
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
        // Remove the custom event listener
        window.removeEventListener('walletConnected', handleWalletConnectedEvent);
        
        // Clean up event listeners if possible
        try {
          if (safeWalletMethodCheck(wallet, 'removeAllListeners')) {
            (wallet as any).removeAllListeners();
          } else if (safeWalletMethodCheck(wallet, 'removeListener')) {
            // Fall back to removing individual listeners if available
            wallet.removeListener('switchAccount', () => {});
            wallet.removeListener('signedOut', () => {});
          }
        } catch (cleanupError) {
          // Silently handle errors during cleanup
          // console.error('Error cleaning up wallet event listeners:', cleanupError);
        }
      };
    } else {
      console.log('Wallet does not support event listeners (no "on" method)');
    }
  }, [wallet, disconnect, refreshBalance, clearPendingTransactions]);

  // Handle wallet connection
  const connect = useCallback(async () => {
    console.log('Connect called, wallet state:', {
      isReady: wallet?.isReady,
      hasConnect: !!wallet?.connect,
      wallet
    });

    if (!wallet?.isReady) {
      console.log('Wallet not ready, redirecting to yours.org');
      toast.error('Wallet not detected. Please install the Yours wallet extension.');
      window.open('https://yours.org', '_blank');
      return;
    }
    
    // Check if already connected first before attempting to connect again
    try {
      console.log('Pre-checking connection status...');
      const preCheckConnected = await isWalletConnected(wallet);
      
      if (preCheckConnected) {
        console.log('Already connected, validating connection...');
        
        // Validate the connection by trying to get the address
        const existingAddress = await getWalletAddresses(wallet);
        
        if (existingAddress) {
          console.log('Connection is valid with address:', existingAddress);
          // We're already connected with a valid address
          setIsConnected(true);
          setBsvAddress(existingAddress);
          await refreshBalance();
          return;
        }
        
        console.log('Connection seems invalid (no address), will reconnect...');
        // If we couldn't get an address, try disconnecting first
        try {
          await wallet.disconnect();
          // Add a short delay to allow the wallet to process the disconnect
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (disconnectError) {
          console.log('Error during pre-connect disconnect:', disconnectError);
          // Continue anyway
        }
      }
      
      // Clear any pending transactions first
      await clearPendingTransactions();
      
      // Try to connect and log all outputs for debugging
      console.log('Calling wallet.connect()...');
      const connectResult = await wallet.connect();
      console.log('wallet.connect() returned:', connectResult);
      
      // Check if connected
      console.log('Checking connection status...');
      const isConnectedResult = await isWalletConnected(wallet);
      console.log('isWalletConnected() returned:', isConnectedResult);
      
      // Add a short delay to allow the wallet to fully process the connection
      // This helps with race conditions in the wallet extension
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Get BSV address using the updated method
      console.log('Attempting to get BSV address...');
      const address = await getWalletAddresses(wallet);
      console.log('getWalletAddresses() returned:', address);
      
      // If we didn't get an address, try once more with a longer delay
      if (!address && isConnectedResult) {
        console.log('Connected but no address returned, waiting longer and trying again...');
        await new Promise(resolve => setTimeout(resolve, 800));
        const retryAddress = await getWalletAddresses(wallet);
        console.log('Retry getWalletAddresses() returned:', retryAddress);
        
        if (retryAddress) {
          console.log('Got address on retry');
          setBsvAddress(retryAddress);
          setIsConnected(true);
          await refreshBalance();
          return;
        }
      }
      
      console.log('Final connection state:', {
        isConnected: isConnectedResult,
        bsvAddress: address,
        wallet
      });
      
      // Update state
      if (isConnectedResult) {
        setIsConnected(true);
        
        // Set BSV address if we have one
        if (address) {
          setBsvAddress(address);
          
          // Refresh balance after successful connection
          try {
            console.log('Refreshing balance...');
            await refreshBalance();
            console.log('Balance refreshed');
          } catch (balanceError) {
            console.error('Error refreshing balance:', balanceError);
          }
        } else {
          console.warn('No BSV address found after connection attempt');
          // Use error toast instead of warning since warning is not available
          toast.error('Connected to wallet but could not retrieve address. Some features may be limited.', {
            style: { background: '#413A30', color: '#FFB74D' } // Use a yellowish style to indicate warning
          });
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
        console.log('Connection failed or was rejected');
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      toast.error('Failed to connect wallet');
      setIsConnected(false);
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
    const intervalId = setInterval(async () => {
      try {
        await refreshBalance();
      } catch (error) {
        // Silently handle any errors during balance refresh
        // This prevents console errors from automatic refresh attempts
      }
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isConnected, refreshBalance]);

  // Implement transaction queue manager with better timeout handling
  const queue_transaction = useCallback(async <T,>(transaction_fn: () => Promise<T>): Promise<T> => {
    // Set a unique ID for this transaction
    const tx_id = Date.now().toString();
    console.log(`📋 [WalletProvider] Queue transaction with ID: ${tx_id}`);
    
    // Create a promise that will resolve with the transaction result
    return new Promise<T>((resolve, reject) => {
      // Wrap the provided function to capture its result
      const wrapped_fn = async () => {
        console.log(`📋 [WalletProvider] Starting wrapped transaction function for ID: ${tx_id}`);
        try {
          // Add a timeout to the transaction function
          console.log(`📋 [WalletProvider] Starting transaction with timeout for ID: ${tx_id}`);
          
          // Execute transaction with timeout
          let timeout_id: NodeJS.Timeout | null = null;
          
          try {
            const transaction_promise = transaction_fn();
            
            // Create timeout promise
            const timeout_promise = new Promise<never>((_, timeout_reject) => {
              timeout_id = setTimeout(() => {
                console.log(`⏱️ [WalletProvider] Transaction function TIMEOUT for ID: ${tx_id}`);
                timeout_reject(new Error('Transaction function timed out'));
              }, 45000);
            });
            
            // Race the transaction against the timeout
            const result = await Promise.race([transaction_promise, timeout_promise]);
            
            console.log(`✅ [WalletProvider] Transaction function completed for ID: ${tx_id}`);
            resolve(result);
            return result;
          } finally {
            // Always clear timeout if it exists
            if (timeout_id) clearTimeout(timeout_id);
          }
        } catch (error) {
          console.error(`❌ [WalletProvider] Transaction function error for ID: ${tx_id}:`, error);
          reject(error);
          return null; // End function execution
        }
      };
      
      // Add to queue
      console.log(`📋 [WalletProvider] Adding transaction ID: ${tx_id} to queue`);
      set_pending_transactions(prev => [...prev, { id: tx_id, fn: wrapped_fn }]);
      
      // Start processing queue immediately if not already processing
      if (!is_processing_transaction) {
        console.log(`📋 [WalletProvider] Starting queue processing for new transaction`);
        
        const process_queue = async () => {
          if (pending_transactions.length === 0) {
            console.log(`📋 [WalletProvider] No transactions to process, setting processing=false`);
            set_is_processing_transaction(false);
            return;
          }
          
          console.log(`📋 [WalletProvider] Processing queue with ${pending_transactions.length} transactions`);
          set_is_processing_transaction(true);
          const tx = pending_transactions[0];
          console.log(`📋 [WalletProvider] Processing transaction ID: ${tx.id}`);
          
          try {
            // Execute the transaction function
            console.log(`📋 [WalletProvider] Executing function for transaction ID: ${tx.id}`);
            await tx.fn();
            console.log(`✅ [WalletProvider] Transaction ID: ${tx.id} completed successfully`);
          } catch (error: any) {
            console.error(`❌ [WalletProvider] Transaction failed ID: ${tx.id}:`, error);
            
            // If we get an unauthorized error, try to reconnect
            if (error?.message?.toLowerCase().includes('unauthorized')) {
              console.log(`🔄 [WalletProvider] Unauthorized error, attempting to reconnect wallet`);
              try {
                if (wallet?.connect) {
                  await wallet.connect();
                  console.log(`✅ [WalletProvider] Wallet reconnected successfully after unauthorized error`);
                }
              } catch (reconnectError) {
                console.error(`❌ [WalletProvider] Failed to reconnect after unauthorized error:`, reconnectError);
              }
            }
          } finally {
            // Remove from queue
            console.log(`🧹 [WalletProvider] Removing transaction ID: ${tx.id} from queue`);
            set_pending_transactions(prev => prev.filter(t => t.id !== tx.id));
            
            // Continue processing queue with a brief delay
            setTimeout(() => {
              if (pending_transactions.length > 0) {
                console.log(`📋 [WalletProvider] Starting next transaction in queue (${pending_transactions.length} remaining)`);
                process_queue();
              } else {
                console.log(`📋 [WalletProvider] Queue empty, setting processing=false`);
                set_is_processing_transaction(false);
              }
            }, 1000);
          }
        };
        
        process_queue();
      }
    });
  }, [is_processing_transaction, pending_transactions, wallet]);

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
        queueTransaction: queue_transaction
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};