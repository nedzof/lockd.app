import React, { useState } from 'react';
import { FiLock, FiLoader, FiX, FiCheck } from 'react-icons/fi';
import { SiBitcoinsv } from 'react-icons/si';

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

  const handleCancel = () => {
    setShowOptions(false);
  };

  return (
    <div className="inline-flex items-center gap-2">
      {!showOptions ? (
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
      ) : (
        <>
          <div className="inline-flex items-center gap-2 bg-[#1A1B23] rounded-lg border border-gray-800/60 px-2 py-1">
            <div className="flex flex-col">
              <div className="inline-flex items-center gap-1">
                <SiBitcoinsv className="text-[#00ffa3] w-3 h-3" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min="0.00001"
                  step="0.00001"
                  className="w-16 bg-[#13141B] border border-gray-800/60 rounded-md px-1 py-0.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
                  placeholder="Amount"
                />
              </div>
              <div className="inline-flex items-center gap-1 mt-1">
                <FiLock className="text-[#00ffa3] w-3 h-3" />
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min="1"
                  className="w-16 bg-[#13141B] border border-gray-800/60 rounded-md px-1 py-0.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
                  placeholder="Blocks"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={handleLock}
                disabled={!connected || isLocking || amount <= 0 || duration <= 0}
                className="p-1 rounded-md bg-[#00ffa3]/10 hover:bg-[#00ffa3]/20 text-[#00ffa3] disabled:opacity-50 disabled:cursor-not-allowed"
                title="Confirm"
              >
                {isLocking ? <FiLoader className="animate-spin w-3 h-3" /> : <FiCheck className="w-3 h-3" />}
              </button>
              <button
                onClick={handleCancel}
                className="p-1 rounded-md bg-gray-800/30 hover:bg-gray-800/50 text-gray-400"
                title="Cancel"
              >
                <FiX className="w-3 h-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;