import React, { useState, useEffect } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';
import { useYoursWallet } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';
import { API_URL } from '../config';

// Simple direct logging to ensure logs are captured
function directLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [PostLock Debug] ${message}`;
  
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// Create a performance logging utility
const logPerformance = (step: string, startTime?: number) => {
  const now = performance.now();
  const elapsed = startTime ? `${Math.round(now - startTime)}ms` : 'start';
  const message = `[PostLock Performance] ${step}: ${elapsed}`;
  
  // Log to console directly to ensure it appears
  console.log(message);
  directLog(message);
  
  return now;
};

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

interface PostLockInteractionProps {
  postId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock: (postId: string, amount: number, duration: number) => Promise<void>;
}

const SATS_PER_BSV = 100000000;

const PostLockInteraction: React.FC<PostLockInteractionProps> = ({
  postId,
  connected = false,
  isLocking = false,
  onLock,
}) => {
  const [amount, setAmount] = useState(0.00001);
  const [duration, setDuration] = useState(1000);
  const [showOptions, setShowOptions] = useState(false);
  const [buttonClickCount, setButtonClickCount] = useState(0);
  const [internalLoading, setInternalLoading] = useState(false);
  
  // Get wallet directly in the component
  const wallet = useYoursWallet();

  // Debug component lifecycle
  useEffect(() => {
    directLog(`PostLockInteraction mounted for post ${postId}`);
    directLog(`Initial state: connected=${connected}, isLocking=${isLocking}`);
    
    return () => {
      directLog(`PostLockInteraction unmounting for post ${postId}`);
    };
  }, [postId, connected, isLocking]);

  // Log state changes
  useEffect(() => {
    directLog(`showOptions changed: ${showOptions}`);
  }, [showOptions]);

  useEffect(() => {
    directLog(`isLocking changed: ${isLocking}`);
  }, [isLocking]);

  const handleShowOptions = () => {
    // Direct log first to ensure we see it
    directLog('🔵 LOCK BUTTON CLICKED 🔵');
    directLog('Current state:', { 
      postId,
      connected,
      isLocking,
      showOptions,
      buttonClickCount: buttonClickCount + 1 
    });
    
    // Performance logging
    const startTime = logPerformance('Lock button clicked');
    
    // Increase click count for debugging
    setButtonClickCount(prev => prev + 1);
    
    // Set options visibility
    setShowOptions(true);
    
    logPerformance('Showing options completed', startTime);
  };

  const handleLock = async () => {
    try {
      // Direct log first to ensure we see it
      directLog('🔵 CONFIRM LOCK BUTTON CLICKED 🔵');
      directLog('Lock confirmation state:', { 
        postId, 
        amount, 
        duration,
        connected,
        isLocking,
        hasWallet: !!wallet
      });
      
      const startTime = logPerformance('Confirm lock button clicked');
      
      if (!connected || !wallet) {
        directLog('Not connected or no wallet, cannot lock');
        toast.error('Please connect your wallet first');
        return;
      }
      
      if (isLocking || internalLoading) {
        directLog('Already locking, ignoring duplicate click');
        return;
      }
      
      directLog(`Starting lock process for post ${postId}`);
      directLog(`Lock parameters: amount=${amount}, duration=${duration}`);
      
      // Set internal loading state
      setInternalLoading(true);
      
      try {
        // 1. Get current block height
        directLog('Getting current block height');
        const blockHeightStartTime = logPerformance('Fetching current block height');
        const currentBlockHeight = await getBlockHeight();
        directLog(`Current block height: ${currentBlockHeight}`);
        logPerformance('Got current block height', blockHeightStartTime);
        
        // 2. Get user's identity address
        directLog('Getting user identity address');
        const addressStartTime = logPerformance('Getting user identity address');
        const addresses = await wallet.getAddresses();
        directLog('Got addresses:', addresses);
        logPerformance('Got user identity address', addressStartTime);
        
        if (!addresses?.identityAddress) {
          throw new Error('Could not get identity address');
        }
        
        // 3. Calculate unlock height
        const unlockHeight = currentBlockHeight + duration;
        directLog(`Calculated unlock height: ${unlockHeight}`);
        
        // 4. Convert BSV to satoshis
        const satoshiAmount = Math.floor(amount * SATS_PER_BSV);
        directLog(`Converting ${amount} BSV to ${satoshiAmount} satoshis`);
        
        // 5. Create lock parameters for wallet.lockBsv
        const lockParams = [{
          address: addresses.identityAddress,
          blockHeight: Math.floor(unlockHeight),
          sats: Math.floor(satoshiAmount),
        }];
        directLog('Lock parameters for wallet:', lockParams);
        
        // 6. Call wallet.lockBsv to trigger wallet confirmation prompt
        directLog('Calling wallet.lockBsv to trigger confirmation prompt');
        const walletStartTime = logPerformance('Calling wallet.lockBsv');
        
        try {
          const lockResponse = await wallet.lockBsv(lockParams);
          directLog('Wallet lock response:', lockResponse);
          logPerformance('Received wallet lock response', walletStartTime);
          
          if (!lockResponse || !lockResponse.txid) {
            throw new Error('Failed to create lock transaction');
          }
          
          // 7. Now call the API with the transaction ID
          directLog(`Calling API with tx_id: ${lockResponse.txid}`);
          const apiStartTime = logPerformance('Calling lock API');
          
          // Create the API request body with the tx_id from the wallet
          const apiRequestBody = {
            post_id: postId,
            author_address: addresses.identityAddress,
            amount: Math.floor(satoshiAmount), // Ensure integer
            lock_duration: Math.floor(duration), // Ensure integer
            tx_id: lockResponse.txid,
          };
          
          directLog('API request payload:', apiRequestBody);
          
          // Call the lock API
          const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(apiRequestBody),
          });
          
          const responseStatus = apiResponse.status;
          directLog(`API response status: ${responseStatus}`);
          
          let responseBody;
          try {
            responseBody = await apiResponse.json();
            directLog('API response body:', responseBody);
          } catch (jsonError) {
            directLog('Error parsing API response:', jsonError);
            responseBody = null;
          }
          
          logPerformance('API call completed', apiStartTime);
          
          if (!apiResponse.ok) {
            throw new Error(responseBody?.message || responseBody?.error || `API error: ${responseStatus}`);
          }
          
          // 8. Hide options and show success toast
          directLog('Lock successful, hiding options');
          toast.success(`Successfully locked ${amount} BSV for ${duration} blocks!`);
          setShowOptions(false);
          
          // 9. Call the original onLock handler to refresh UI
          directLog('Calling original onLock handler to refresh UI');
          await onLock(postId, amount, duration);
          
          logPerformance('Entire lock process completed', startTime);
        } catch (walletError) {
          directLog('Error during wallet lock operation:', walletError);
          logPerformance('Wallet lock process failed', walletStartTime);
          toast.error(walletError instanceof Error ? walletError.message : 'Failed to lock BSV');
          throw walletError;
        }
      } catch (error) {
        directLog('Error during lock process:', error);
        logPerformance('Lock process failed', startTime);
        toast.error(error instanceof Error ? error.message : 'Failed to lock BSV');
        throw error;
      } finally {
        setInternalLoading(false);
      }
    } catch (error) {
      directLog('❌ Error in handleLock:', error);
      console.error('Failed to lock:', error);
    }
  };

  const handleCancel = () => {
    directLog('Cancel button clicked, hiding options');
    setShowOptions(false);
  };

  const isCurrentlyLocking = isLocking || internalLoading;

  return (
    <div className="relative">
      {!showOptions ? (
        <button
          onClick={handleShowOptions}
          disabled={!connected || isCurrentlyLocking}
          className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transform hover:scale-105"
        >
          {isCurrentlyLocking ? (
            <FiLoader className="animate-spin mr-1" size={14} />
          ) : (
            <FiLock className="mr-1" size={14} />
          )}
          <span>Lock</span>
        </button>
      ) :
        <>
          <button
            onClick={handleCancel}
            disabled={isCurrentlyLocking}
            className="inline-flex items-center justify-center w-8 h-8 text-xs font-medium rounded-full shadow-sm text-gray-200 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-600"
          >
            <FiX size={16} />
          </button>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-[#2A2A40]/95 p-3 rounded-lg border border-gray-800/50 shadow-xl w-64 backdrop-blur-sm">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-white">Lock Bitcoin</h3>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-white"
                >
                  <FiX size={16} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Amount (₿)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      directLog(`Amount changed: ${e.target.value}`);
                      setAmount(Number(e.target.value))
                    }}
                    min="0.00001"
                    step="0.00001"
                    className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1.5 px-2 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Duration (blocks)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => {
                    directLog(`Duration changed: ${e.target.value}`);
                    setDuration(Number(e.target.value))
                  }}
                  min="1"
                  className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1.5 px-2 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                />
                <div className="text-xs text-gray-400 mt-1">≈ {Math.round(duration / 144)} days</div>
              </div>
              <div className="flex space-x-2 pt-2">
                <button
                  onClick={handleLock}
                  disabled={!connected || isCurrentlyLocking || amount <= 0 || duration <= 0}
                  className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50"
                >
                  {isCurrentlyLocking ? (
                    <>
                      <FiLoader className="animate-spin mr-1" size={12} /> Locking...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-gray-800/20 text-xs font-medium rounded-md shadow-sm text-gray-300 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          {/* Add overlay to prevent clicking through */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={handleCancel}
          ></div>
        </>
      }
    </div>
  );
};

export default PostLockInteraction; 