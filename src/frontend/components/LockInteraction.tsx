import React, { useState } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';
import { SiBitcoinsv } from 'react-icons/si';
import { toast } from 'react-hot-toast';
import { API_URL } from '../config';
import { createPortal } from 'react-dom';

// Constants for locking
const SATS_PER_BSV = 100000000;
const MIN_SATS = 1; // Minimum amount in satoshis
const MIN_BSV_AMOUNT = MIN_SATS / SATS_PER_BSV; // Converted to BSV (0.00000001)
const DEFAULT_BSV_AMOUNT = 0.001; // Default amount
const DEFAULT_LOCK_DURATION = 10; // Default lock duration in blocks
const MIN_LOCK_DURATION = 1; // Minimum lock duration

// Block height cache to prevent repeated network calls
const BLOCK_HEIGHT_CACHE_DURATION = 600000; // 10 minutes
let cachedBlockHeight: number | null = null;
let blockHeightCacheTime: number = 0;

// Get current block height with caching
const getBlockHeight = async (): Promise<number> => {
  const now = Date.now();
  
  // Use cached value if available and not expired
  if (cachedBlockHeight && now - blockHeightCacheTime < BLOCK_HEIGHT_CACHE_DURATION) {
    return cachedBlockHeight;
  }

  try {
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    
    if (data.blocks) {
      cachedBlockHeight = data.blocks;
      blockHeightCacheTime = now;
      return data.blocks;
    }
    
    throw new Error('Block height not found in API response');
  } catch (error) {
    // Fallback to approximate BSV block height if we can't get real data
    return 800000;
  }
};

interface LockInteractionProps {
  id: string;
  connected?: boolean;
  isLocking?: boolean;
  wallet?: any; // Wallet instance, if available directly
  balance?: { bsv: number }; // Wallet balance, if available
  refreshBalance?: () => Promise<void>; // For refreshing wallet balance
  onLock: (id: string, amount: number, duration: number) => Promise<void>;
  modalTitle?: string;
  type?: 'post' | 'vote' | 'like';
  buttonStyle?: 'gradient' | 'icon'; // Different button styles
  onConnect?: () => Promise<void>; // Optional connect handler
}

const LockInteraction: React.FC<LockInteractionProps> = ({
  id,
  connected = false,
  isLocking = false,
  wallet = null,
  balance = { bsv: 0 },
  refreshBalance = async () => {},
  onLock,
  modalTitle = 'Lock Bitcoin',
  type = 'post',
  buttonStyle = 'gradient',
  onConnect,
}) => {
  const [amount, setAmount] = useState(DEFAULT_BSV_AMOUNT.toString());
  const [duration, setDuration] = useState(DEFAULT_LOCK_DURATION.toString());
  const [showOptions, setShowOptions] = useState(false);
  const [internalLoading, setInternalLoading] = useState(false);

  // Refresh balance when modal is opened
  React.useEffect(() => {
    if (showOptions && connected && refreshBalance) {
      refreshBalance();
    }
  }, [showOptions, connected, refreshBalance]);

  // Handle escape key press to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showOptions) {
        setShowOptions(false);
      }
    };

    if (showOptions) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      if (showOptions) {
        document.removeEventListener('keydown', handleEscape);
        // Restore body scrolling when modal is closed
        document.body.style.overflow = 'unset';
      }
    };
  }, [showOptions]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const parsedValue = parseFloat(newValue);
    
    // Don't allow negative numbers
    if (parsedValue < 0 || isNaN(parsedValue)) {
      setAmount(MIN_BSV_AMOUNT.toFixed(8));
      return;
    }

    // Don't allow more than max balance if we have wallet balance info
    if (balance?.bsv && parsedValue > balance.bsv) {
      setAmount(balance.bsv.toString());
      return;
    }

    // Make sure minimum amount is met
    if (parsedValue * SATS_PER_BSV < MIN_SATS && parsedValue !== 0) {
      setAmount(MIN_BSV_AMOUNT.toFixed(8));
      return;
    }

    setAmount(newValue);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const parsedValue = parseInt(newValue, 10);
    
    // Don't allow negative numbers or invalid values
    if (parsedValue < MIN_LOCK_DURATION || isNaN(parsedValue)) {
      setDuration(MIN_LOCK_DURATION.toString());
      return;
    }

    // Cap at 52560 blocks (approximately 1 year)
    if (parsedValue > 52560) {
      setDuration('52560');
      return;
    }

    setDuration(newValue);
  };

  const handleOpen = async () => {
    // If not connected but we have a connect handler, connect first
    if (!connected && onConnect) {
      try {
        await onConnect();
      } catch (error) {
        toast.error('Failed to connect wallet');
        return;
      }
    }
    
    setShowOptions(true);
  };

  const handleCancel = () => {
    setShowOptions(false);
  };

  const handleLock = async () => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return;
    }
    
    try {
      setInternalLoading(true);
      
      const parsedAmount = parseFloat(amount);
      const parsedDuration = parseInt(duration, 10);
      
      if (isNaN(parsedAmount) || parsedAmount * SATS_PER_BSV < MIN_SATS) {
        throw new Error(`Minimum amount is ${MIN_BSV_AMOUNT} BSV`);
      }
      
      if (isNaN(parsedDuration) || parsedDuration < MIN_LOCK_DURATION) {
        throw new Error(`Minimum duration is ${MIN_LOCK_DURATION} block`);
      }
      
      await onLock(id, parsedAmount, parsedDuration);
      setShowOptions(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to lock BSV');
    } finally {
      setInternalLoading(false);
    }
  };

  const isCurrentlyLocking = isLocking || internalLoading;

  // Render either gradient button or icon-style button
  const renderButton = () => {
    if (buttonStyle === 'gradient') {
      return (
        <button
          onClick={handleOpen}
          disabled={isCurrentlyLocking}
          className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transform hover:scale-105"
        >
          {isCurrentlyLocking ? (
            <FiLoader className="animate-spin mr-1" size={14} />
          ) : (
            <FiLock className="mr-1" size={14} />
          )}
          <span>Lock</span>
        </button>
      );
    } else {
      return (
        <button
          onClick={handleOpen}
          disabled={isCurrentlyLocking}
          className="flex items-center space-x-1 text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400"
        >
          {isCurrentlyLocking ? (
            <FiLoader className="animate-spin h-4 w-4" />
          ) : (
            <SiBitcoinsv className="h-4 w-4" />
          )}
          <span>Lock</span>
        </button>
      );
    }
  };

  // Render compact modal variant
  const renderCompactModal = () => {
    // Create a temporary button in the original position that user clicked 
    // to provide visual context, but render the actual modal in a portal
    return (
      <>
        <button
          disabled={true}
          className="inline-flex items-center justify-center w-8 h-8 text-xs font-medium rounded-full shadow-sm text-gray-200 bg-gray-700/50 border border-gray-700/30 opacity-50 cursor-not-allowed"
        >
          <FiX size={16} />
        </button>
        {createPortal(
          <div className="fixed inset-0 isolate" style={{ zIndex: 999999 }}>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              onClick={handleCancel}
              aria-hidden="true"
            />
            
            {/* Modal container */}
            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4">
                {/* Modal panel */}
                <div 
                  className="relative transform overflow-hidden rounded-lg bg-[#2A2A40]/95 border border-gray-800/50 shadow-xl transition-all w-full max-w-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="p-3">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-sm font-semibold text-white">{modalTitle}</h3>
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
                            step="0.00000001"
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
                        <div className="text-xs text-gray-400 mt-1">≈ {Math.round(parseInt(duration, 10) / 144)} days</div>
                      </div>
                      <div className="flex space-x-2 pt-2">
                        <button
                          onClick={handleLock}
                          disabled={isCurrentlyLocking || parseFloat(amount) < MIN_BSV_AMOUNT || parseInt(duration, 10) < MIN_LOCK_DURATION}
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
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  };

  // Render full portal modal (light theme variant)
  const renderPortalModal = () => createPortal(
    <div className="fixed inset-0 isolate" style={{ zIndex: 999999 }}>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleCancel}
        aria-hidden="true"
      />
      
      {/* Modal container */}
      <div className="fixed inset-0 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          {/* Modal panel */}
          <div 
            className="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 shadow-xl transition-all w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="absolute right-0 top-0 pr-4 pt-4 z-10">
              <button
                type="button"
                className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                onClick={handleCancel}
              >
                <span className="sr-only">Close</span>
                <FiX className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            
            {/* Modal header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">{modalTitle}</h3>
            </div>
            
            {/* Modal body */}
            <div className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Amount (BSV)
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <input
                      type="number"
                      name="amount"
                      id="amount"
                      className="focus:ring-orange-500 focus:border-orange-500 block w-full rounded-md sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder={DEFAULT_BSV_AMOUNT.toString()}
                      value={amount}
                      onChange={handleAmountChange}
                      step="0.00000001" // Allow for satoshi-level precision
                      min={MIN_BSV_AMOUNT}
                    />
                  </div>
                  {balance?.bsv > 0 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Available: {balance.bsv.toFixed(8)} BSV
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Minimum: {MIN_BSV_AMOUNT} BSV ({MIN_SATS} sat)
                  </p>
                </div>
                
                <div>
                  <label htmlFor="lockDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                    Lock Duration (blocks)
                  </label>
                  <div className="mt-1 relative rounded-md shadow-sm">
                    <input
                      type="number"
                      name="lockDuration"
                      id="lockDuration"
                      className="focus:ring-orange-500 focus:border-orange-500 block w-full rounded-md sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder={DEFAULT_LOCK_DURATION.toString()}
                      value={duration}
                      onChange={handleDurationChange}
                      step="1"
                      min={MIN_LOCK_DURATION}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Approximately {Math.round(parseInt(duration, 10) * 10 / 60 / 24)} days
                  </p>
                </div>
              </div>
            </div>
            
            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                type="button"
                className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ml-3 inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-orange-600 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                onClick={handleLock}
                disabled={isCurrentlyLocking || parseFloat(amount) < MIN_BSV_AMOUNT || parseInt(duration, 10) < MIN_LOCK_DURATION}
              >
                {isCurrentlyLocking ? 'Locking...' : 'Lock BSV'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <div className="relative" onClick={type === 'like' ? (e) => e.stopPropagation() : undefined}>
      {!showOptions ? (
        renderButton()
      ) : (
        type === 'like' ? renderPortalModal() : renderCompactModal()
      )}
    </div>
  );
};

export default LockInteraction; 