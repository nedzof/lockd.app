import React, { useState, useRef, useEffect } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';
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
  const formRef = useRef<HTMLDivElement>(null);

  // Handle clicking outside to close the form
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    }

    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptions]);

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
    <div className="relative inline-block">
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
        <div ref={formRef} className="absolute right-0 bottom-full mb-2 z-50 bg-[#1A1B23] rounded-lg border border-gray-800/60 shadow-xl shadow-black/30 w-64 animate-fadeIn">
          <div className="relative">
            {/* Top gradient border */}
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d]"></div>
            
            {/* Header */}
            <div className="p-3 flex justify-between items-center border-b border-gray-800/40">
              <div className="flex items-center space-x-2">
                <div className="p-1 bg-[#00ffa3]/10 rounded-md">
                  <SiBitcoinsv className="text-[#00ffa3] w-3.5 h-3.5" />
                </div>
                <h3 className="text-sm font-medium text-white">Lock BSV on Vote</h3>
              </div>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-[#00ffa3] transition-colors"
              >
                <FiX size={16} />
              </button>
            </div>
            
            {/* Form Body */}
            <div className="p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Amount (BSV)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min="0.00001"
                  step="0.00001"
                  className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-3 py-1.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Duration (blocks)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min="1"
                  className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-3 py-1.5 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors"
                />
                <div className="text-xs text-gray-400 mt-1">≈ {Math.round(duration / 144)} days</div>
              </div>
            </div>
            
            {/* Footer with Actions */}
            <div className="p-3 border-t border-gray-800/40 bg-[#13141B]/30">
              <div className="flex space-x-2">
                <button
                  onClick={handleLock}
                  disabled={!connected || isLocking || amount <= 0 || duration <= 0}
                  className="flex-1 group relative px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-md transition-all duration-300"></div>
                  <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-md opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                  <div className="relative flex items-center justify-center space-x-1 text-black">
                    {isLocking ? (
                      <>
                        <FiLoader className="animate-spin w-3 h-3" /> 
                        <span>Locking...</span>
                      </>
                    ) : (
                      <span>Confirm</span>
                    )}
                  </div>
                </button>
                
                <button
                  onClick={handleCancel}
                  className="flex-1 px-3 py-1.5 border border-gray-800/40 text-xs font-medium rounded-md shadow-sm text-gray-300 bg-[#13141B]/50 hover:bg-[#13141B] focus:outline-none transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteOptionLockInteraction;