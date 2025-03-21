import { API_URL } from "../config";
import * as React from 'react';
import { SiBitcoinsv } from 'react-icons/si';
import { FiX, FiLoader } from 'react-icons/fi';
import { LockLike } from '../types';
import { DEFAULT_LOCKLIKE_AMOUNT, DEFAULT_LOCKLIKE_BLOCKS } from '../types';
import { useWallet } from '../providers/WalletProvider';
import { toast } from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';
import { createPortal } from 'react-dom';

// Simple direct logging to ensure logs are captured
function directLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [LockLike Debug] ${message}`;
  
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// Log a function call
function logCall(fnName: string) {
  directLog(`${fnName} called`);
  return performance.now();
}

// Log completion of a function
function logComplete(fnName: string, startTime: number) {
  const elapsed = performance.now() - startTime;
  directLog(`${fnName} completed in ${Math.round(elapsed)}ms`);
}

// Block height cache to prevent repeated network calls
// This caches the block height for 10 minutes (600000ms)
const BLOCK_HEIGHT_CACHE_DURATION = 600000;
let cachedBlockHeight: number | null = null;
let blockHeightCacheTime: number = 0;

// Get current block height with caching
const getBlockHeight = async (): Promise<number> => {
  directLog('getBlockHeight called');
  const startTime = performance.now();
  
  const now = Date.now();
  
  // Use cached value if available and not expired
  if (cachedBlockHeight && now - blockHeightCacheTime < BLOCK_HEIGHT_CACHE_DURATION) {
    directLog(`Using cached block height: ${cachedBlockHeight}`);
    return cachedBlockHeight;
  }

  try {
    directLog('Fetching block height from API...');
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    
    directLog('Block height API response:', data);
    
    if (data.blocks) {
      cachedBlockHeight = data.blocks;
      blockHeightCacheTime = now;
      directLog(`Updated cached block height: ${cachedBlockHeight}`);
      
      const elapsed = performance.now() - startTime;
      directLog(`getBlockHeight completed in ${Math.round(elapsed)}ms`);
      
      return data.blocks;
    }
    
    throw new Error('Block height not found in API response');
  } catch (error) {
    directLog('Error fetching block height:', error);
    // Fallback to approximate BSV block height if we can't get real data
    return 800000;
  }
};

// Create a performance logging utility
const logPerformance = (step: string, startTime?: number) => {
  const now = performance.now();
  const elapsed = startTime ? `${Math.round(now - startTime)}ms` : 'start';
  const message = `[LockLike Performance] ${step}: ${elapsed}`;
  
  // Log to console directly to ensure it appears
  console.log(message);
  directLog(message);
  
  return now;
};

interface LockLikeInteractionProps {
  posttx_id?: string;
  replytx_id?: string;
  postLockLike: (
    tx_id: string,
    amount: number,
    nLockTime: number,
    handle: string,
    posttx_id?: string,
    replytx_id?: string
  ) => Promise<LockLike>;
}

const SATS_PER_BSV = 100000000;
const MIN_SATS = 1;

export default function LockLikeInteraction({ posttx_id, replytx_id, postLockLike }: LockLikeInteractionProps) {
  directLog('LockLikeInteraction rendering', { posttx_id, replytx_id });
  
  const { wallet, connect, isConnected, isWalletDetected, balance, refreshBalance } = useWallet();
  const [loading, setLoading] = React.useState(false);
  const [showInput, setShowInput] = React.useState(false);
  const [amount, setAmount] = React.useState(DEFAULT_LOCKLIKE_AMOUNT.toString());
  const [lockDuration, setLockDuration] = React.useState(DEFAULT_LOCKLIKE_BLOCKS.toString());
  
  // Add a ref to track the operation sequence
  const operationIdRef = React.useRef(0);
  
  // Add extra debugging info
  React.useEffect(() => {
    directLog('Component mounted with props:', { posttx_id, replytx_id });
    directLog('Wallet state on mount:', { isConnected, isWalletDetected, balance });
    
    return () => {
      directLog('Component unmounting');
    };
  }, []);
  
  // Log state changes
  React.useEffect(() => {
    directLog('showInput state changed:', showInput);
  }, [showInput]);
  
  React.useEffect(() => {
    directLog('loading state changed:', loading);
  }, [loading]);
  
  React.useEffect(() => {
    directLog('wallet connection state changed:', { isConnected, isWalletDetected });
  }, [isConnected, isWalletDetected]);
  
  // Pre-fetch block height on component mount
  React.useEffect(() => {
    directLog('Pre-fetching block height');
    getBlockHeight().catch(err => directLog("Failed to pre-fetch block height:", err));
  }, []);

  // Handle escape key press and body scroll lock
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showInput) {
        directLog('Escape key pressed, closing modal');
        setShowInput(false);
      }
    };

    if (showInput) {
      directLog('Adding escape key listener and disabling body scroll');
      document.addEventListener('keydown', handleEscape);
      // Prevent body scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      if (showInput) {
        directLog('Removing escape key listener and enabling body scroll');
        document.removeEventListener('keydown', handleEscape);
        // Restore body scrolling when modal is closed
        document.body.style.overflow = 'unset';
      }
    };
  }, [showInput]);

  // Fetch wallet balance when showing input
  React.useEffect(() => {
    if (showInput && isConnected) {
      directLog('Modal shown and wallet connected, refreshing balance');
      const startTime = logPerformance('Begin refreshBalance');
      refreshBalance().finally(() => {
        logPerformance('End refreshBalance', startTime);
      });
    }
  }, [showInput, isConnected, refreshBalance]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    directLog('Amount input changed:', e.target.value);
    const newValue = e.target.value;
    const parsedValue = parseFloat(newValue);
    
    // Don't allow negative numbers
    if (parsedValue < 0) {
      directLog('Amount negative, setting to 0');
      setAmount('0');
      return;
    }

    // Don't allow more than max balance
    if (parsedValue > balance.bsv) {
      directLog('Amount exceeds balance, setting to max balance:', balance.bsv);
      setAmount(balance.bsv.toString());
      return;
    }

    // Ensure we have at least 1 sat
    if (parsedValue * SATS_PER_BSV < MIN_SATS && parsedValue !== 0) {
      const minAmount = (MIN_SATS / SATS_PER_BSV).toString();
      directLog('Amount below minimum, setting to:', minAmount);
      setAmount(minAmount);
      return;
    }

    directLog('Setting amount to:', newValue);
    setAmount(newValue);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    directLog('Duration input changed:', e.target.value);
    const newValue = e.target.value;
    const parsedValue = parseInt(newValue, 10);
    
    // Don't allow negative numbers
    if (parsedValue < 0) {
      directLog('Duration negative, setting to 1');
      setLockDuration('1');
      return;
    }

    // Don't allow less than 1 block
    if (parsedValue < 1) {
      directLog('Duration below minimum, setting to 1');
      setLockDuration('1');
      return;
    }

    // Cap at 52560 blocks (approximately 1 year)
    if (parsedValue > 52560) {
      directLog('Duration above maximum, setting to 52560');
      setLockDuration('52560');
      return;
    }

    directLog('Setting duration to:', newValue);
    setLockDuration(newValue);
  };

  const handleLockClick = async () => {
    try {
      // Direct log first to ensure we see it
      directLog('🔵 LOCK BUTTON CLICKED 🔵');
      directLog('Current wallet state:', { 
        isConnected, 
        isWalletDetected, 
        balance, 
        showInput,
        loading
      });
      
      // Now use performance logging
      const operationId = ++operationIdRef.current;
      const startTime = logPerformance(`[${operationId}] Lock button clicked`);
      
      directLog(`[${operationId}] Wallet status: detected=${isWalletDetected}, connected=${isConnected}`);
      
      if (!isWalletDetected) {
        directLog(`[${operationId}] Wallet not detected, redirecting to yours.org`);
        window.open('https://yours.org', '_blank');
        return;
      }

      // Set showInput immediately for better UX
      directLog(`[${operationId}] Setting showInput to true for immediate feedback`);
      setShowInput(true);
      
      // If wallet is not connected, connect it
      if (!isConnected) {
        directLog(`[${operationId}] Wallet not connected, attempting to connect`);
        let connectStartTime: number | undefined;
        
        try {
          connectStartTime = logPerformance(`[${operationId}] Starting wallet connection`);
          await connect();
          logPerformance(`[${operationId}] Wallet connection completed`, connectStartTime);
          directLog(`[${operationId}] Wallet connection successful`);
          toast.success('Wallet connected successfully!');
        } catch (error) {
          // Safe access to connectStartTime
          if (connectStartTime) {
            logPerformance(`[${operationId}] Wallet connection failed`, connectStartTime);
          }
          directLog(`[${operationId}] Wallet connection error:`, error);
          console.error('Error connecting wallet:', error);
          toast.error(error instanceof Error ? error.message : 'Failed to connect wallet');
          setShowInput(false); // Close modal if connection fails
          return;
        }
      }

      // Start pre-fetching block height asynchronously, but don't wait for it
      directLog(`[${operationId}] Starting background block height fetch`);
      getBlockHeight().catch(err => directLog(`[${operationId}] Prefetch block height error:`, err));
      
      logPerformance(`[${operationId}] Lock button click processing complete`, startTime);
    } catch (error) {
      directLog('❌ Error in handleLockClick:', error);
      console.error('Error handling lock click:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred');
      setShowInput(false);
    }
  };

  const handleLockLike = async () => {
    try {
      // Direct log first to ensure we see it
      directLog('🔵 LOCK BSV BUTTON CLICKED 🔵');
      directLog('Wallet and form state:', {
        isConnected,
        isWalletDetected,
        balance,
        amount,
        lockDuration,
        loading
      });
      
      const operationId = ++operationIdRef.current;
      const startTime = logPerformance(`[${operationId}] Lock BSV button clicked`);
      
      if (!wallet || !isConnected) {
        directLog(`[${operationId}] Wallet not connected, aborting`);
        logPerformance(`[${operationId}] Wallet not connected, aborting`, startTime);
        toast.error('Please connect your wallet first');
        setShowInput(false);
        return;
      }

      directLog(`[${operationId}] Setting loading state to true`);
      setLoading(true);
      
      try {
        const parsedAmount = parseFloat(amount);
        const parsedDuration = parseInt(lockDuration, 10);

        directLog(`[${operationId}] Parsed values: amount=${parsedAmount}, duration=${parsedDuration}`);
        logPerformance(`[${operationId}] Input validation: amount=${parsedAmount}, duration=${parsedDuration}`, startTime);

        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          directLog(`[${operationId}] Invalid amount: ${parsedAmount}`);
          throw new Error('Invalid amount');
        }

        if (parsedAmount > balance.bsv) {
          directLog(`[${operationId}] Amount ${parsedAmount} exceeds balance ${balance.bsv}`);
          throw new Error('Amount exceeds available balance');
        }

        if (isNaN(parsedDuration) || parsedDuration <= 0) {
          directLog(`[${operationId}] Invalid duration: ${parsedDuration}`);
          throw new Error('Invalid lock duration');
        }

        // Get the user's identity address
        directLog(`[${operationId}] Getting identity address`);
        const addressStartTime = logPerformance(`[${operationId}] Getting user identity address`);
        const addresses = await wallet.getAddresses();
        directLog(`[${operationId}] Got addresses:`, addresses);
        logPerformance(`[${operationId}] Got user identity address`, addressStartTime);
        
        if (!addresses?.identityAddress) {
          directLog(`[${operationId}] No identity address found`);
          throw new Error('Could not get identity address');
        }

        // Get current block height from the network using our optimized cached getter
        directLog(`[${operationId}] Getting block height`);
        const blockHeightStartTime = logPerformance(`[${operationId}] Fetching current block height`);
        const currentblock_height = await getBlockHeight();
        directLog(`[${operationId}] Got block height: ${currentblock_height}`);
        logPerformance(`[${operationId}] Got current block height: ${currentblock_height}`, blockHeightStartTime);

        if (!currentblock_height) {
          directLog(`[${operationId}] No block height received`);
          throw new Error('Could not get current block height');
        }

        const nLockTime = currentblock_height + parsedDuration;
        directLog(`[${operationId}] Calculated nLockTime: ${nLockTime}`);

        // Create the lock transaction using the wallet's lockBsv function
        directLog(`[${operationId}] Creating lock transaction`);
        const lockStartTime = logPerformance(`[${operationId}] Creating lock transaction`);
        const satoshiAmount = Math.floor(parsedAmount * SATS_PER_BSV);
        directLog(`[${operationId}] Locking ${satoshiAmount} sats to ${addresses.identityAddress} until block ${nLockTime}`);
        
        const lockParams = [{
          address: addresses.identityAddress,
          blockHeight: nLockTime,
          sats: satoshiAmount,
        }];
        directLog(`[${operationId}] Lock params:`, lockParams);
        
        const lockResponse = await wallet.lockBsv(lockParams);
        directLog(`[${operationId}] Lock response:`, lockResponse);
        logPerformance(`[${operationId}] Lock transaction created`, lockStartTime);

        if (!lockResponse || !lockResponse.txid) {
          directLog(`[${operationId}] Lock response invalid:`, lockResponse);
          throw new Error('Failed to create lock transaction');
        }

        // Create the lock like record
        directLog(`[${operationId}] Creating lock like record via API`);
        const apiStartTime = logPerformance(`[${operationId}] Creating lock like record via API`);
        const apiRequestBody = {
          post_id: posttx_id || replytx_id,
          author_address: addresses.identityAddress,
          amount: satoshiAmount,
          lock_duration: parsedDuration,
          tx_id: lockResponse.txid,
        };
        
        directLog(`[${operationId}] API request:`, apiRequestBody);
        
        const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiRequestBody),
        });
        
        const responseStatus = apiResponse.status;
        directLog(`[${operationId}] API response status: ${responseStatus}`);
        
        const responseBody = await apiResponse.json();
        directLog(`[${operationId}] API response body:`, responseBody);
        
        logPerformance(`[${operationId}] API response status: ${responseStatus}`, apiStartTime);

        if (!apiResponse.ok) {
          directLog(`[${operationId}] API error: ${responseStatus}`, responseBody);
          throw new Error(responseBody.message || responseBody.error || 'Error creating lock like');
        }

        directLog(`[${operationId}] Lock successful, cleaning up`);
        toast.success(`Successfully locked ${parsedAmount} BSV for ${parsedDuration} blocks!`);
        setShowInput(false);
        setAmount(DEFAULT_LOCKLIKE_AMOUNT.toString());
        setLockDuration(DEFAULT_LOCKLIKE_BLOCKS.toString());
        
        // Refresh balance after successful lock
        directLog(`[${operationId}] Refreshing balance`);
        const refreshStartTime = logPerformance(`[${operationId}] Refreshing balance after lock`);
        await refreshBalance();
        logPerformance(`[${operationId}] Balance refreshed`, refreshStartTime);
        
        logPerformance(`[${operationId}] Lock operation completed successfully`, startTime);
      } catch (error) {
        directLog(`[${operationId}] Error in lock operation:`, error);
        logPerformance(`[${operationId}] Error in lock operation`, startTime);
        console.error('Error locking:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to lock BSV');
      } finally {
        directLog(`[${operationId}] Setting loading state to false`);
        setLoading(false);
      }
    } catch (e) {
      // This is a safety catch for any errors that might occur in the outer scope
      directLog('❌ Unexpected error in handleLockLike:', e);
      console.error('Unexpected error:', e);
      toast.error('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-0 relative items-center" onClick={(e) => e.stopPropagation()}>
      {loading ? (
        <div role="status">
          <svg
            aria-hidden="true"
            className="inline w-4 h-4 mr-2 text-gray-200 animate-spin dark:text-gray-600 fill-orange-400"
            viewBox="0 0 100 101"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      ) : (
        <>
          <button
            onClick={handleLockClick}
            className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400"
          >
            <SiBitcoinsv className="h-4 w-4" />
            <span>Lock</span>
          </button>

          {showInput && createPortal(
            <div className="fixed inset-0 isolate z-[999999]">
              {/* Modal backdrop */}
              <div 
                className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 ease-in-out"
                onClick={() => setShowInput(false)}
                aria-hidden="true"
              />
              
              {/* Modal container - centered with flex */}
              <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
                <div className="my-auto bg-[#1A1B23] rounded-xl overflow-hidden border border-gray-800/40 shadow-xl shadow-black/30 w-full max-w-sm max-h-[90vh] overflow-y-auto">
                  {/* Modal header with gradient border */}
                  <div className="relative">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d]"></div>
                    <div className="p-4 flex justify-between items-center border-b border-gray-800/40">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-[#00ffa3]/10 rounded-md">
                          <SiBitcoinsv className="text-[#00ffa3] w-4 h-4" />
                        </div>
                        <h3 className="text-base font-semibold text-white">Lock BSV</h3>
                      </div>
                      <button
                        onClick={() => setShowInput(false)}
                        className="text-gray-400 hover:text-[#00ffa3] transition-colors duration-300"
                      >
                        <FiX size={18} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Modal body */}
                  <div className="p-5 space-y-4">
                    <div>
                      <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-2">
                        Amount (BSV)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="amount"
                          id="amount"
                          className="w-full bg-[#13141B] border border-gray-800/60 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                          placeholder="0.001"
                          value={amount}
                          onChange={handleAmountChange}
                          step="0.00000001" // Allow for satoshi-level precision
                          min="0"
                          max={balance.bsv.toString()}
                        />
                      </div>
                      <p className="mt-1.5 text-sm text-gray-400">
                        Available: {balance.bsv.toFixed(8)} BSV
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="lockDuration" className="block text-sm font-medium text-gray-300 mb-2">
                        Lock Duration (blocks)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          name="lockDuration"
                          id="lockDuration"
                          className="w-full bg-[#13141B] border border-gray-800/60 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                          placeholder={DEFAULT_LOCKLIKE_BLOCKS.toString()}
                          value={lockDuration}
                          onChange={handleDurationChange}
                          step="1"
                          min="1"
                        />
                      </div>
                      <p className="mt-1.5 text-sm text-gray-400">
                        Approximately {Math.round(parseInt(lockDuration, 10) * 10 / 60 / 24)} days
                      </p>
                    </div>
                  </div>
                  
                  {/* Modal footer */}
                  <div className="p-4 border-t border-gray-800/40 bg-[#13141B]/30">
                    <div className="flex space-x-3">
                      <button
                        onClick={handleLockLike}
                        disabled={loading || parseFloat(amount) <= 0}
                        className="flex-1 group relative px-4 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-lg transition-all duration-300"></div>
                        <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                        <div className="relative flex items-center justify-center space-x-1 text-black">
                          {loading ? (
                            <>
                              <FiLoader className="animate-spin w-4 h-4" /> 
                              <span>Locking...</span>
                            </>
                          ) : (
                            <span>Confirm</span>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-lg"></div>
                      </button>
                      
                      <button
                        onClick={() => setShowInput(false)}
                        className="flex-1 px-4 py-2 border border-gray-800/40 text-sm font-medium rounded-lg shadow-sm text-gray-300 bg-[#13141B]/50 hover:bg-[#13141B] focus:outline-none transition-colors duration-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
} 