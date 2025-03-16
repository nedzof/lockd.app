import React, { useState } from 'react';
import { FiLock, FiLoader, FiPlus, FiX } from 'react-icons/fi';

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
          className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium rounded-full shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocking ? (
            <FiLoader className="animate-spin" size={14} />
          ) : (
            <FiLock size={14} />
          )}
        </button>
      ) : (
        <>
          <button
            onClick={() => setShowOptions(false)}
            disabled={isLocking}
            className="inline-flex items-center justify-center w-7 h-7 text-xs font-medium rounded-full shadow-sm text-gray-200 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiX size={14} />
          </button>
          <div className="absolute top-full right-0 mt-2 z-20 bg-[#2A2A40] p-3 rounded-lg border border-gray-800/20 shadow-xl w-56">
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Amount (BSV)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min="0.00001"
                    step="0.00001"
                    className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1 px-2 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
                  />
                </div>
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
              <button
                onClick={handleLock}
                disabled={!connected || isLocking}
                className="w-full inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50"
              >
                {isLocking ? "Locking..." : "Lock"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;