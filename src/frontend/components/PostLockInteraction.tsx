import React, { useState, useEffect } from 'react';
import { FiLock, FiLoader, FiX } from 'react-icons/fi';

// Simple direct logging to ensure logs are captured
function directLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [PostLock Debug] ${message}`;
  
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// Create a performance logging utility
const logPerformance = (step: string, startTime?: number) => {
  const now = performance.now();
  const elapsed = startTime ? `${Math.round(now - startTime)}ms` : 'start';
  const message = `[PostLock Performance] ${step}: ${elapsed}`;
  
  // Log to console directly to ensure it appears
  console.log(message);
  directLog(message);
  
  return now;
};

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
  const [buttonClickCount, setButtonClickCount] = useState(0);

  // Debug component lifecycle
  useEffect(() => {
    directLog(`PostLockInteraction mounted for post ${postId}`);
    directLog(`Initial state: connected=${connected}, isLocking=${isLocking}`);
    
    return () => {
      directLog(`PostLockInteraction unmounting for post ${postId}`);
    };
  }, [postId, connected, isLocking]);

  // Log state changes
  useEffect(() => {
    directLog(`showOptions changed: ${showOptions}`);
  }, [showOptions]);

  useEffect(() => {
    directLog(`isLocking changed: ${isLocking}`);
  }, [isLocking]);

  const handleShowOptions = () => {
    // Direct log first to ensure we see it
    directLog('🔵 LOCK BUTTON CLICKED 🔵');
    directLog('Current state:', { 
      postId,
      connected,
      isLocking,
      showOptions,
      buttonClickCount: buttonClickCount + 1 
    });
    
    // Performance logging
    const startTime = logPerformance('Lock button clicked');
    
    // Increase click count for debugging
    setButtonClickCount(prev => prev + 1);
    
    // Set options visibility
    setShowOptions(true);
    
    logPerformance('Showing options completed', startTime);
  };

  const handleLock = async () => {
    try {
      // Direct log first to ensure we see it
      directLog('🔵 CONFIRM LOCK BUTTON CLICKED 🔵');
      directLog('Lock confirmation state:', { 
        postId, 
        amount, 
        duration,
        connected,
        isLocking
      });
      
      const startTime = logPerformance('Confirm lock button clicked');
      
      if (!connected) {
        directLog('Not connected, cannot lock');
        return;
      }
      
      if (isLocking) {
        directLog('Already locking, ignoring duplicate click');
        return;
      }
      
      directLog(`Starting lock process for post ${postId}`);
      directLog(`Lock parameters: amount=${amount}, duration=${duration}`);
      
      // Call the onLock handler from props
      const lockStartTime = logPerformance('Starting onLock handler');
      
      try {
        await onLock(postId, amount, duration);
        logPerformance('onLock handler completed successfully', lockStartTime);
        directLog('Lock successful, hiding options');
      } catch (error) {
        logPerformance('onLock handler failed', lockStartTime);
        directLog('Error during lock:', error);
        throw error; // Rethrow to be caught by outer catch
      }
      
      setShowOptions(false);
      logPerformance('Entire lock process completed', startTime);
    } catch (error) {
      directLog('❌ Error in handleLock:', error);
      console.error('Failed to lock:', error);
    }
  };

  const handleCancel = () => {
    directLog('Cancel button clicked, hiding options');
    setShowOptions(false);
  };

  return (
    <div className="relative">
      {!showOptions ? (
        <button
          onClick={handleShowOptions}
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
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-[#2A2A40]/95 p-3 rounded-lg border border-gray-800/50 shadow-xl w-64 backdrop-blur-sm">
            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-semibold text-white">Lock Bitcoin</h3>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-white"
                >
                  <FiX size={16} />
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Amount (₿)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      directLog(`Amount changed: ${e.target.value}`);
                      setAmount(Number(e.target.value))
                    }}
                    min="0.00001"
                    step="0.00001"
                    className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1.5 px-2 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Duration (blocks)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => {
                    directLog(`Duration changed: ${e.target.value}`);
                    setDuration(Number(e.target.value))
                  }}
                  min="1"
                  className="w-full bg-white/5 border border-gray-800/20 rounded-md py-1.5 px-2 text-xs text-white focus:ring-[#00ffa3]/50 focus:border-[#00ffa3]/50 transition-colors duration-300"
                />
                <div className="text-xs text-gray-400 mt-1">≈ {Math.round(duration / 144)} days</div>
              </div>
              <div className="flex space-x-2 pt-2">
                <button
                  onClick={handleLock}
                  disabled={!connected || isLocking || amount <= 0 || duration <= 0}
                  className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-gray-900 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] hover:from-[#00ff9d] hover:to-[#00ffa3] focus:outline-none focus:ring-1 focus:ring-[#00ffa3] transition-all duration-300 disabled:opacity-50"
                >
                  {isLocking ? (
                    <>
                      <FiLoader className="animate-spin mr-1" size={12} /> Locking...
                    </>
                  ) : (
                    "Confirm"
                  )}
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-gray-800/20 text-xs font-medium rounded-md shadow-sm text-gray-300 bg-white/5 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          {/* Add overlay to prevent clicking through */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={handleCancel}
          ></div>
        </>
      }
    </div>
  );
};

export default PostLockInteraction; 