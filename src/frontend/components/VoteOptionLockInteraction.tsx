import React, { useState } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';

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
      <button
        onClick={() => setShowOptions(true)}
        disabled={!connected || isLocking}
        className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-full shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_0_10px_rgba(0,255,163,0.3)] transform hover:scale-105"
      >
        {isLocking ? (
          <FiLoader className="animate-spin mr-1" size={14} />
        ) : (
          <FiLock className="mr-1" size={14} />
        )}
        <span>Lock</span>
      </button>
      
      {showOptions && (
        <div className="absolute top-0 right-0 z-50 bg-[#2A2A40]/95 p-2 rounded-lg border border-gray-800/50 shadow-xl w-60 backdrop-blur-sm mt-10">
          <div className="flex flex-col">
            <div className="flex space-x-1 items-center text-xs text-gray-300">
              <span>Lock</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="0.00001"
                step="0.00001"
                className="w-20 bg-white/5 border border-gray-800/20 rounded-md py-1 px-1.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
              />
              <span>₿ for</span>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min="1"
                className="w-20 bg-white/5 border border-gray-800/20 rounded-md py-1 px-1.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
              />
              <span>blocks</span>
            </div>
            
            <div className="flex space-x-2 mt-2">
              <button
                onClick={handleLock}
                disabled={isLocking || amount <= 0 || duration <= 0}
                className="flex-1 py-1 text-xs font-medium rounded text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] disabled:opacity-50"
              >
                {isLocking ? <FiLoader className="animate-spin mx-auto" size={12} /> : "Confirm"}
              </button>
              <button
                onClick={() => setShowOptions(false)}
                className="flex-none p-1 text-gray-400 hover:text-white"
              >
                <FiX size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;