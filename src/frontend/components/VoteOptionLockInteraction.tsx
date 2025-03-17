import React, { useState, useRef } from 'react';
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
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleLock = () => {
    if (connected) {
      onLock(optionId, amount, duration);
      setShowOptions(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowOptions(!showOptions)}
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
        <div className="absolute left-0 bottom-full mb-2 z-50 bg-[#2A2A40]/95 py-1.5 px-2 rounded-lg border border-gray-800/50 shadow-xl whitespace-nowrap">
          <div className="flex items-center gap-2 h-7">
            <div className="flex items-center">
              <span className="text-xs text-gray-300 mr-1">Lock</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="0.00001"
                step="0.00001"
                className="w-20 bg-white/5 border border-gray-800/20 rounded-md py-0.5 px-1.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
              />
              <span className="text-xs text-gray-300 ml-1 mr-1">₿ for</span>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min="1"
                className="w-20 bg-white/5 border border-gray-800/20 rounded-md py-0.5 px-1.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
              />
              <span className="text-xs text-gray-300 ml-1 mr-2">blocks</span>
            </div>
            <button
              onClick={handleLock}
              disabled={!connected || isLocking || amount <= 0 || duration <= 0}
              className="h-6 px-2 rounded-md bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] text-gray-900 text-xs font-medium"
            >
              {isLocking ? <FiLoader className="animate-spin" size={10} /> : "✓"}
            </button>
            <button
              onClick={() => setShowOptions(false)}
              className="h-6 w-6 rounded-md bg-gray-700/50 text-gray-300 text-xs flex items-center justify-center"
            >
              <FiX size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;