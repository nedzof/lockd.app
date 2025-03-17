import React, { useState, useRef, useEffect } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Handle outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dialogRef.current && buttonRef.current && 
          !dialogRef.current.contains(event.target as Node) && 
          !buttonRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLock = () => {
    if (connected) {
      onLock(optionId, amount, duration);
      setShowOptions(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      {!showOptions ? (
        <button
          ref={buttonRef}
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
      ) : (
        <div 
          ref={dialogRef}
          className="inline-flex items-center bg-[#2A2A40]/95 rounded-full border border-gray-800/50 shadow-md h-8 overflow-hidden animate-expandLeft"
        >
          <div className="px-3 flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <label className="text-xs text-gray-300 whitespace-nowrap">Lock</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                min="0.00001"
                step="0.00001"
                className="w-16 bg-white/10 border border-gray-800/30 rounded-sm py-0.5 px-1 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
              />
              <span className="text-xs text-gray-300">₿ for</span>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min="1"
                className="w-16 bg-white/10 border border-gray-800/30 rounded-sm py-0.5 px-1 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
              />
              <span className="text-xs text-gray-300">blocks</span>
            </div>
            <div className="flex space-x-1">
              <button
                onClick={handleLock}
                disabled={!connected || isLocking || amount <= 0 || duration <= 0}
                className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium rounded-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] disabled:opacity-50"
              >
                {isLocking ? <FiLoader className="animate-spin" size={10} /> : "OK"}
              </button>
              <button
                onClick={() => setShowOptions(false)}
                className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full text-gray-400 hover:text-white bg-gray-800/30 hover:bg-gray-700"
              >
                <FiX size={10} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;