import React, { useState } from 'react';
import { FiLock, FiInfo, FiBell } from 'react-icons/fi';

interface ThresholdSettingsProps {
  connected: boolean;
  walletAddress?: string;
}

const ThresholdSettings: React.FC<ThresholdSettingsProps> = ({ connected }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [milestoneThreshold, setMilestoneThreshold] = useState(() => {
    // Check if user has a preference stored in localStorage
    const savedThreshold = localStorage.getItem('milestoneThreshold');
    return savedThreshold ? Number(savedThreshold) : 1;
  });
  // Add notificationsEnabled state but default to false
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  // Add a dummy loading state for the toggle
  const [isSubscribing, setIsSubscribing] = useState(false);

  const handleThresholdChange = (value: string) => {
    const numValue = Number(value);
    setMilestoneThreshold(numValue);
    localStorage.setItem('milestoneThreshold', value);
  };

  // Dummy toggle function that doesn't actually subscribe
  const toggleNotifications = () => {
    // Since notifications are disabled, just show an informative message
    alert('Notifications are currently disabled in this version.');
    
    // For UI feedback only
    setIsSubscribing(true);
    setTimeout(() => {
      setIsSubscribing(false);
    }, 1000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white transition-colors"
      >
        <FiLock className="w-3 h-3" />
        <span>Threshold: {milestoneThreshold} BSV</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999]" onClick={() => setIsOpen(false)}>
          {/* Full-screen backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-60"></div>
          
          {/* Modal content */}
          <div 
            className="relative bg-[#2A2A40] rounded-lg shadow-2xl w-80 max-w-md z-[10000] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-lg font-medium text-white">BSV Threshold</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                &times;
              </button>
            </div>
            
            {/* Content */}
            <div className="p-5">
              <div className="mb-5">
                <input
                  type="range"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={milestoneThreshold}
                  onChange={(e) => handleThresholdChange(e.target.value)}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-800"
                  style={{
                    background: `linear-gradient(to right, #00E6CC ${milestoneThreshold}%, #1f2937 ${milestoneThreshold}%)`,
                  }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>0.1 BSV</span>
                  <span>{milestoneThreshold} BSV</span>
                  <span>100 BSV</span>
                </div>
              </div>
              
              <div className="flex items-start space-x-2 mb-6">
                <FiInfo className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#00E6CC]" />
                <span className="text-xs text-gray-400">
                  Set your BSV threshold for post visibility and notifications
                </span>
              </div>

              {/* Notification toggle - disabled by default */}
              <div 
                className={`flex items-center justify-between ${!connected ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center space-x-2">
                  <FiBell className={`w-4 h-4 ${notificationsEnabled ? 'text-[#00E6CC]' : 'text-gray-400'}`} />
                  <span className="text-xs text-gray-400">Enable Notifications</span>
                </div>
                
                <div 
                  onClick={toggleNotifications}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none ${
                    !connected ? 'cursor-not-allowed' : 'cursor-pointer'
                  } ${notificationsEnabled ? 'bg-[#00E6CC]' : 'bg-gray-600'}`}
                >
                  <span
                    className={`${
                      notificationsEnabled ? 'translate-x-5' : 'translate-x-1'
                    } inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ease-in-out`}
                  />
                </div>
              </div>
              
              {isSubscribing && (
                <p className="text-xs text-gray-400 mt-2 animate-pulse">
                  Processing...
                </p>
              )}
              
              {!connected && (
                <p className="text-xs text-gray-500 mt-2">
                  Connect wallet to enable notifications
                </p>
              )}
              
              {/* Information text about notifications being disabled */}
              <p className="text-xs text-red-400 mt-2">
                Notifications are currently disabled
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThresholdSettings;
