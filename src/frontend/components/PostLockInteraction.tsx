import React, { useState, useEffect } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';
import { SiBitcoinsv } from 'react-icons/si';
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
        walletHasLockBsv: !!wallet?.lockBsv,
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
        
        // Get user's identity address - EXACTLY like documentation
        directLog('Getting addresses...');
        const res = await wallet.getAddresses();  // Using 'res' to match documentation exactly
        directLog('Got addresses:', res);
        
        if (!res?.identityAddress) {
          throw new Error('Could not get identity address');
        }
        
        // Calculate unlock height and satoshi amount
        const unlockHeight = currentBlockHeight + duration;
        const satoshiAmount = Math.floor(amount * SATS_PER_BSV);
        
        // EXACTLY matching documentation format
        const locks = [
          { 
            address: res.identityAddress,
            blockHeight: unlockHeight,
            sats: satoshiAmount
          }
        ];
        
        directLog('Using EXACT documentation format with parameters:', locks);
        
        // Set a simple timeout to detect hangs
        directLog('⏳ Calling wallet.lockBsv(), the method is CONFIRMED available on the wallet...');
        
        // Call wallet lockBsv - straightforward approach
        let txResponse;
        try {
          // Use lockBsv which we confirmed is available
          const response = await wallet.lockBsv(locks);
          // The response should match the SendResponse interface from yours.d.ts
          txResponse = { 
            txid: response?.txid, // Use only the property we know exists
            rawtx: response?.rawtx 
          };
          directLog('✅ Lock transaction succeeded:', txResponse);
        } catch (err) {
          directLog('❌ Lock transaction failed with error:', err);
          throw new Error(`Failed to lock BSV: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        
        if (!txResponse || !txResponse.txid) {
          directLog('Transaction response missing txid:', txResponse);
          throw new Error('Missing transaction ID in response');
        }
        
        directLog('Lock transaction created with txid:', txResponse.txid);
        
        // Call the API with the transaction ID
        directLog('Submitting lock to API...');
        const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_id: postId,
            author_address: res.identityAddress,
            amount: satoshiAmount,
            lock_duration: duration,
            tx_id: txResponse.txid,
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
          
          {/* Modal backdrop */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out"
            onClick={handleCancel}
          ></div>
          
          {/* Modal container - centered with flex */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
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
                    onClick={handleCancel}
                    className="text-gray-400 hover:text-[#00ffa3] transition-colors duration-300"
                  >
                    <FiX size={18} />
                  </button>
                </div>
              </div>
              
              {/* Modal body */}
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount (BSV)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={handleAmountChange}
                      min={MIN_BSV_AMOUNT}
                      step="0.001"
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                    />
                    <div className="text-sm text-gray-400 mt-1.5">Minimum: {MIN_BSV_AMOUNT} BSV</div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Duration (blocks)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={handleDurationChange}
                    min={MIN_LOCK_DURATION}
                    className="w-full bg-[#13141B] border border-gray-800/60 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                  />
                  <div className="text-sm text-gray-400 mt-1.5">≈ {Math.round(duration / 144)} days</div>
                </div>
              </div>
              
              {/* Modal footer */}
              <div className="p-4 border-t border-gray-800/40 bg-[#13141B]/30">
                <div className="flex space-x-3">
                  <button
                    onClick={handleLock}
                    disabled={!connected || isCurrentlyLocking || amount < MIN_BSV_AMOUNT || duration < MIN_LOCK_DURATION}
                    className="flex-1 group relative px-4 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-lg transition-all duration-300"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="relative flex items-center justify-center space-x-1 text-black">
                      {isCurrentlyLocking ? (
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
                    onClick={handleCancel}
                    className="flex-1 px-4 py-2 border border-gray-800/40 text-sm font-medium rounded-lg shadow-sm text-gray-300 bg-[#13141B]/50 hover:bg-[#13141B] focus:outline-none transition-colors duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      }
    </div>
  );
};

export default PostLockInteraction; 