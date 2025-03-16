import React, { useState } from 'react';
import { FiLock, FiLoader } from 'react-icons/fi';

interface vote_optionLockInteractionProps {
  optionId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
}

const vote_optionLockInteraction: React.FC<vote_optionLockInteractionProps> = ({
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
    <div className="w-full">
      {!showOptions ? (
        <button
          onClick={() => setShowOptions(true)}
          disabled={!connected || isLocking}
          className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00ffa3] transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocking ? (
            <>
              <FiLoader className="animate-spin mr-2" /> Locking...
            </>
          ) : (
            <>
              <FiLock className="mr-2" /> Lock BSV
            </>
          )}
        </button>
      ) : (
        <div className="bg-[#2A2A40]/30 p-3 rounded-lg border border-gray-800/20 mt-2">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-300 mb-1">Amount (BSV)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min="0.00001"
              step="0.00001"
              className="w-full bg-white/5 border border-gray-800/20 rounded-md py-2 px-3 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-300 mb-1">Duration (days)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min="1"
              className="w-full bg-white/5 border border-gray-800/20 rounded-md py-2 px-3 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleLock}
              disabled={!connected || isLocking}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50"
            >
              {isLocking ? (
                <>
                  <FiLoader className="animate-spin mr-2" /> Locking...
                </>
              ) : (
                "Confirm"
              )}
            </button>
            <button
              onClick={() => setShowOptions(false)}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-800/20 text-sm font-medium rounded-md shadow-sm text-gray-300 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default vote_optionLockInteraction;