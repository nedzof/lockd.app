import React, { useState } from 'react';
import { SiBitcoinsv } from 'react-icons/si';
import { FiX } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { createPortal } from 'react-dom';

interface VoteOptionLockInteractionProps {
  optionId: string;
  optionContent: string;
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
  connected: boolean;
  balance?: number;
}

const DEFAULT_LOCK_AMOUNT = 0.01;
const DEFAULT_LOCK_DURATION = 1000;

const VoteOptionLockInteraction: React.FC<VoteOptionLockInteractionProps> = ({
  optionId,
  optionContent,
  onLock,
  connected,
  balance
}) => {
  const [showInput, setShowInput] = useState(false);
  const [amount, setAmount] = useState(DEFAULT_LOCK_AMOUNT.toString());
  const [duration, setDuration] = useState(DEFAULT_LOCK_DURATION.toString());
  const [isLocking, setIsLocking] = useState(false);

  const handleLock = async () => {
    if (!connected) {
      return;
    }

    const amountValue = parseFloat(amount);
    const durationValue = parseInt(duration);

    if (isNaN(amountValue) || amountValue <= 0) {
      return;
    }

    if (isNaN(durationValue) || durationValue <= 0) {
      return;
    }

    if (balance !== undefined && amountValue > balance) {
      return;
    }

    setIsLocking(true);
    try {
      await onLock(optionId, amountValue, durationValue);
      setShowInput(false);
    } finally {
      setIsLocking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLock();
    }
  };

  return (
    <>
      <button
        onClick={() => setShowInput(true)}
        className="inline-flex items-center px-2 py-1 text-xs text-[#00ffa3] rounded hover:text-[#00E6CC] transition-colors"
        disabled={!connected}
      >
        <SiBitcoinsv className="mr-1" />
        Lock BSV
      </button>

      {showInput && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#1A1B23] rounded-xl p-6 max-w-md w-full mx-4 relative">
            <button
              onClick={() => setShowInput(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <FiX size={24} />
            </button>

            <h2 className="text-xl font-bold text-white mb-4">Lock BSV on Vote Option</h2>
            <p className="text-gray-300 mb-4">"{optionContent}"</p>

            <div className="space-y-4">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-1">
                  Amount (BSV)
                </label>
                <input
                  id="amount"
                  type="number"
                  min="0.00000001"
                  step="0.00000001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 bg-[#2A2B33] border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#00ffa3] focus:border-transparent"
                />
                {balance !== undefined && (
                  <div className="mt-1 text-xs text-gray-400">
                    Balance: {formatBSV(balance)} BSV
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-gray-300 mb-1">
                  Lock Duration (blocks)
                </label>
                <input
                  id="duration"
                  type="number"
                  min="1"
                  step="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full px-3 py-2 bg-[#2A2B33] border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#00ffa3] focus:border-transparent"
                />
                <div className="mt-1 text-xs text-gray-400">
                  Approximately {Math.round(parseInt(duration) / 144)} days
                </div>
              </div>

              <button
                onClick={handleLock}
                disabled={isLocking || !connected}
                className={`w-full py-2 px-4 rounded-md text-white font-medium flex items-center justify-center ${
                  isLocking
                    ? 'bg-gray-700 cursor-not-allowed'
                    : 'bg-[#00ffa3] hover:bg-[#00E6CC] text-[#1A1B23]'
                }`}
              >
                {isLocking ? 'Locking...' : 'Lock BSV'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default VoteOptionLockInteraction;
