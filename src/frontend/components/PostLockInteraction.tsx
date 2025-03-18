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

// Constants for locking
const SATS_PER_BSV = 100000000;
const MIN_BSV_AMOUNT = 0.001; // Minimum amount in BSV (100,000 satoshis)
const DEFAULT_BSV_AMOUNT = 0.001; // Default amount
const DEFAULT_LOCK_DURATION = 10; // Default lock duration in blocks
const MIN_LOCK_DURATION = 1; // Minimum lock duration

const PostLockInteraction: React.FC<PostLockInteractionProps> = ({
  postId,
  connected = false,
  isLocking = false,
  onLock,
}) => {
  const [amount, setAmount] = useState(DEFAULT_BSV_AMOUNT);
  const [duration, setDuration] = useState(DEFAULT_LOCK_DURATION);
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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    directLog(`Amount input changed: ${e.target.value}`);
    const newValue = parseFloat(e.target.value);
    
    // Don't allow negative numbers
    if (newValue < 0 || isNaN(newValue)) {
      directLog('Amount negative or invalid, setting to minimum');
      setAmount(MIN_BSV_AMOUNT);
      return;
    }

    // Make sure minimum amount is met
    if (newValue < MIN_BSV_AMOUNT) {
      directLog(`Amount below minimum (${MIN_BSV_AMOUNT}), setting to minimum`);
      setAmount(MIN_BSV_AMOUNT);
      return;
    }

    directLog(`Setting amount to: ${newValue}`);
    setAmount(newValue);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    directLog(`Duration input changed: ${e.target.value}`);
    const newValue = parseInt(e.target.value, 10);
    
    // Don't allow negative numbers or invalid values
    if (newValue < MIN_LOCK_DURATION || isNaN(newValue)) {
      directLog(`Duration invalid, setting to minimum (${MIN_LOCK_DURATION})`);
      setDuration(MIN_LOCK_DURATION);
      return;
    }

    directLog(`Setting duration to: ${newValue}`);
    setDuration(newValue);
  };

  const handleLock = async () => {
    try {
      // Direct log first to ensure we see it
      directLog('🔵 CONFIRM LOCK BUTTON CLICKED 🔵');
      
      // Log state at start of function
      directLog('Starting lock process with state:', { 
        postId, 
        amount, 
        duration,
        connected,
        isLocking,
        hasWallet: !!wallet,
        walletIsReady: wallet?.isReady,
        walletHasSendBsv: !!wallet?.sendBsv,
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
      
      // Set internal loading state
      setInternalLoading(true);
      
      try {
        // Get current block height
        directLog('Getting block height...');
        const currentBlockHeight = await getBlockHeight();
        directLog(`Current block height: ${currentBlockHeight}`);
        
        // Get user's identity address
        directLog('Getting addresses...');
        const addresses = await wallet.getAddresses();
        directLog('Got addresses:', addresses);
        
        if (!addresses?.identityAddress) {
          throw new Error('Could not get identity address');
        }
        
        // Calculate unlock height and satoshi amount
        const unlockHeight = currentBlockHeight + duration;
        const satoshiAmount = Math.floor(amount * SATS_PER_BSV);
        
        directLog('Preparing payment with parameters:', {
          address: addresses.identityAddress,
          unlockHeight,
          satoshis: satoshiAmount
        });
        
        // Use sendBsv instead of lockBsv
        // Create the params object for sendBsv
        const paymentParams = [{
          satoshis: satoshiAmount,
          address: addresses.identityAddress,
          // Optional data to track the lock information
          data: [`Lock until block: ${unlockHeight}`]
        }];
        
        directLog('Calling wallet.sendBsv with params:', paymentParams);
        
        // Set a timer to detect if the wallet call is hanging
        const timeoutMs = 15000; // 15 seconds timeout
        let isTimedOut = false;
        const timeoutId = setTimeout(() => {
          isTimedOut = true;
          directLog(`⚠️ sendBsv call timed out after ${timeoutMs}ms`);
        }, timeoutMs);
        
        // Warn about potential wallet UI prompt
        directLog('The wallet may show a confirmation prompt - check for popups or extensions');
        
        // Call wallet sendBsv instead of lockBsv
        let lockResponse;
        try {
          directLog('⏳ wallet.sendBsv call started...');
          lockResponse = await wallet.sendBsv(paymentParams);
          clearTimeout(timeoutId);
          
          if (isTimedOut) {
            directLog('sendBsv call completed after timeout');
          }
          
          directLog('✅ wallet.sendBsv call succeeded:', lockResponse);
        } catch (err) {
          clearTimeout(timeoutId);
          directLog('❌ wallet.sendBsv call failed with error:', err);
          throw err;
        }
        
        if (!lockResponse || !lockResponse.txid) {
          directLog('lockResponse missing txid:', lockResponse);
          throw new Error('Missing transaction ID in response');
        }
        
        directLog('Transaction created with txid:', lockResponse.txid);
        
        // Call the API with the transaction ID
        directLog('Submitting lock to API...');
        const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_id: postId,
            author_address: addresses.identityAddress,
            amount: satoshiAmount,
            lock_duration: duration,
            tx_id: lockResponse.txid,
          }),
        });
        
        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          directLog('API error:', errorText);
          throw new Error(`API error: ${apiResponse.status} ${errorText}`);
        }
        
        directLog('API call successful');
        
        // Success! Hide options and show toast
        toast.success(`Successfully locked ${amount} BSV for ${duration} blocks!`);
        setShowOptions(false);
        
        // Refresh UI
        await onLock(postId, amount, duration);
        
        directLog('Lock process completed successfully');
        
      } catch (error) {
        directLog('Error during lock process:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to lock BSV');
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
                    onChange={handleAmountChange}
                    min={MIN_BSV_AMOUNT}
                    step="0.001"
                    className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1.5 px-2 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                  />
                  <div className="text-xs text-gray-400 mt-1">Minimum: {MIN_BSV_AMOUNT} BSV</div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Duration (blocks)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={handleDurationChange}
                  min={MIN_LOCK_DURATION}
                  className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1.5 px-2 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                />
                <div className="text-xs text-gray-400 mt-1">≈ {Math.round(duration / 144)} days</div>
              </div>
              <div className="flex space-x-2 pt-2">
                <button
                  onClick={handleLock}
                  disabled={!connected || isCurrentlyLocking || amount < MIN_BSV_AMOUNT || duration < MIN_LOCK_DURATION}
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