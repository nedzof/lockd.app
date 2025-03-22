import React, { useState } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';

// Constants for locking
const SATS_PER_BSV = 100000000;
const MIN_BSV_AMOUNT = 0.001; // Minimum amount in BSV (100,000 satoshis)
const DEFAULT_BSV_AMOUNT = 0.001; // Default amount
const DEFAULT_LOCK_DURATION = 10; // Default lock duration in blocks
const MIN_LOCK_DURATION = 1; // Minimum lock duration

interface VoteOptionLockInteractionProps {
  optionId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
}

const VoteOptionLockInteraction: React.FC<VoteOptionLockInteractionProps> = ({
  optionId,
  connected = false,
  isLocking = false,
  onLock,
}) => {
  const [amount, setAmount] = useState(DEFAULT_BSV_AMOUNT);
  const [duration, setDuration] = useState(DEFAULT_LOCK_DURATION);
  const [showOptions, setShowOptions] = useState(false);
  const [internalLoading, setInternalLoading] = useState(false);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    
    // Don't allow negative numbers
    if (newValue < 0 || isNaN(newValue)) {
      setAmount(MIN_BSV_AMOUNT);
      return;
    }

    // Make sure minimum amount is met
    if (newValue < MIN_BSV_AMOUNT) {
      setAmount(MIN_BSV_AMOUNT);
      return;
    }

    setAmount(newValue);
  };

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    
    // Don't allow negative numbers or invalid values
    if (newValue < MIN_LOCK_DURATION || isNaN(newValue)) {
      setDuration(MIN_LOCK_DURATION);
      return;
    }

    setDuration(newValue);
  };

  const handleLock = async () => {
    if (!connected) {
      return;
    }
    
    try {
      setInternalLoading(true);
      await onLock(optionId, amount, duration);
      setShowOptions(false);
    } finally {
      setInternalLoading(false);
    }
  };

  const isCurrentlyLocking = isLocking || internalLoading;

  return (
    <div className="relative">
      {!showOptions ? (
        <button
          onClick={() => setShowOptions(true)}
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
            onClick={() => setShowOptions(false)}
            disabled={isCurrentlyLocking}
            className="inline-flex items-center justify-center w-8 h-8 text-xs font-medium rounded-full shadow-sm text-gray-200 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-600"
          >
            <FiX size={16} />
          </button>
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-[#2A2A40]/95 p-3 rounded-lg border border-gray-800/50 shadow-xl w-64 backdrop-blur-sm">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-white">Lock Bitcoin on Vote</h3>
                <button
                  onClick={() => setShowOptions(false)}
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
                  onClick={() => setShowOptions(false)}
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
            onClick={() => setShowOptions(false)}
          ></div>
        </>
      }
    </div>
  );
};

export default VoteOptionLockInteraction;