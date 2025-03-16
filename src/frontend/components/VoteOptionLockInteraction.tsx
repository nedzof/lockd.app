import React, { useState } from 'react';
import { FiLock, FiLoader } from 'react-icons/fi';

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
  const [amount, setAmount] = useState(0.00001);
  const [duration, setDuration] = useState(1000);
  const [showOptions, setShowOptions] = useState(false);

  const handleLock = () => {
    if (connected) {
      onLock(optionId, amount, duration);
      setShowOptions(false);
    }
  };

  return (
    <div className="relative">
      {!showOptions ? (
        <button
          onClick={() => setShowOptions(true)}
          disabled={!connected || isLocking}
          className="w-full inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-md shadow-sm text-gray-200 bg-white/10 hover:bg-white/15 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocking ? (
            <FiLoader className="animate-spin" size={12} />
          ) : (
            <FiLock size={12} />
          )}
          <span className="ml-1">Lock</span>
        </button>
      ) : (
        <>
          <button
            onClick={() => setShowOptions(false)}
            disabled={isLocking}
            className="w-full inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-md shadow-sm text-gray-200 bg-white/10 hover:bg-white/15 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <div className="absolute top-full left-0 right-0 mt-2 z-10 bg-[#2A2A40] p-3 rounded-md border border-gray-800/20 shadow-lg">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Amount (BSV)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min="0.00001"
                  step="0.00001"
                  className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1 px-2 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Duration (days)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min="1"
                  className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1 px-2 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
                />
              </div>
            </div>
            <button
              onClick={handleLock}
              disabled={!connected || isLocking}
              className="w-full inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50"
            >
              {isLocking ? (
                <>
                  <FiLoader className="animate-spin mr-1.5" /> Locking...
                </>
              ) : (
                "Confirm"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;