import React, { useState, useRef, useEffect } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';

interface PostLockInteractionProps {
  postId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock: (postId: string, amount: number, duration: number) => Promise<void>;
}

const PostLockInteraction: React.FC<PostLockInteractionProps> = ({
  postId,
  connected = false,
  isLocking = false,
  onLock,
}) => {
  const [amount, setAmount] = useState(0.00001);
  const [duration, setDuration] = useState(1000);
  const [showOptions, setShowOptions] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (showOptions && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Calculate position to center the dropdown under the button
      const left = Math.max(10, rect.left - (240 - rect.width) / 2); // 240px is dropdown width
      
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 5, // Add 5px gap
        left: left + window.scrollX
      });
    }
  }, [showOptions]);

  const handleLock = () => {
    if (connected) {
      onLock(postId, amount, duration);
      setShowOptions(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showOptions && 
          buttonRef.current && 
          !buttonRef.current.contains(event.target as Node) &&
          !(event.target as Element).closest('.lock-dropdown')) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptions]);

  return (
    <div className="relative">
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
      ) :
        <>
          <button
            ref={buttonRef}
            onClick={() => setShowOptions(false)}
            disabled={isLocking}
            className="inline-flex items-center justify-center w-8 h-8 text-xs font-medium rounded-full shadow-sm text-gray-200 bg-gray-700/50 hover:bg-gray-700/70 border border-gray-700/30 focus:outline-none focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-600"
          >
            <FiX size={16} />
          </button>
          <div 
            className="fixed z-[100] bg-[#2A2A40] p-4 rounded-lg border border-gray-800/20 shadow-xl w-60 backdrop-blur-sm lock-dropdown"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Amount (₿)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min="0.00001"
                    step="0.00001"
                    className="w-full bg-white/5 border border-gray-800/20 rounded-lg py-2 px-3 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">Duration (days)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  min="1"
                  className="w-full bg-white/5 border border-gray-800/20 rounded-lg py-2 px-3 text-sm text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                />
              </div>
              <div className="flex space-x-2 mt-4">
                <button
                  onClick={handleLock}
                  disabled={!connected || isLocking || amount <= 0 || duration <= 0}
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
          </div>
        </>
      }
    </div>
  );
};

export default PostLockInteraction; 