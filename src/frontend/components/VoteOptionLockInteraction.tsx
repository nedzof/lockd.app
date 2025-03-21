import React, { useState } from 'react';
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
    <div className="relative">
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
      ) :
        <>
          <button
            onClick={handleCancel}
            disabled={isLocking}
            className="inline-flex items-center justify-center w-8 h-8 text-xs font-medium rounded-full shadow-sm text-gray-200 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-600"
          >
            <FiX size={16} />
          </button>
          
          {/* Modal backdrop */}
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out"
            onClick={handleCancel}
          ></div>
          
          {/* Modal container with overflow handling - centered with flex */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="my-auto bg-[#1A1B23] rounded-xl overflow-hidden border border-gray-800/40 shadow-xl shadow-black/30 w-full max-w-sm max-h-[90vh] overflow-y-auto">
              {/* Modal header with gradient border */}
              <div className="relative">
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d]"></div>
                <div className="p-4 flex justify-between items-center border-b border-gray-800/40">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-[#00ffa3]/10 rounded-md">
                      <SiBitcoinsv className="text-[#00ffa3] w-4 h-4" />
                    </div>
                    <h3 className="text-base font-semibold text-white">Lock BSV on Vote</h3>
                  </div>
                  <button
                    onClick={handleCancel}
                    className="text-gray-400 hover:text-[#00ffa3] transition-colors duration-300"
                  >
                    <FiX size={18} />
                  </button>
                </div>
              </div>
              
              {/* Modal body */}
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Amount (BSV)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      min="0.00001"
                      step="0.00001"
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Duration (blocks)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    min="1"
                    className="w-full bg-[#13141B] border border-gray-800/60 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                  />
                  <div className="text-sm text-gray-400 mt-1.5">≈ {Math.round(duration / 144)} days</div>
                </div>
              </div>
              
              {/* Modal footer */}
              <div className="p-4 border-t border-gray-800/40 bg-[#13141B]/30">
                <div className="flex space-x-3">
                  <button
                    onClick={handleLock}
                    disabled={!connected || isLocking || amount <= 0 || duration <= 0}
                    className="flex-1 group relative px-4 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-lg transition-all duration-300"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
                    <div className="relative flex items-center justify-center space-x-1 text-black">
                      {isLocking ? (
                        <>
                          <FiLoader className="animate-spin w-4 h-4" /> 
                          <span>Locking...</span>
                        </>
                      ) : (
                        <span>Confirm</span>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-lg"></div>
                  </button>
                  
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-4 py-2 border border-gray-800/40 text-sm font-medium rounded-lg shadow-sm text-gray-300 bg-[#13141B]/50 hover:bg-[#13141B] focus:outline-none transition-colors duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      }
    </div>
  );
};

export default VoteOptionLockInteraction;