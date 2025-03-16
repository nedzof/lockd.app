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
        <div className="absolute right-0 mt-2 w-64 bg-[#2A2A40] rounded-lg shadow-lg p-4 z-50 border border-gray-800/30">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-white">BSV Threshold</h3>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              &times;
            </button>
          </div>
          
          <div className="mb-4">
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
          
          <div className="text-xs text-gray-400 flex items-start space-x-2 mb-4">
            <FiInfo className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#00E6CC]" />
            <span>Set your BSV threshold for post visibility and notifications</span>
          </div>
          
          {/* Notification toggle - disabled by default */}
          <div className="flex items-center justify-between opacity-50 cursor-not-allowed">
            <div className="flex items-center space-x-2">
              <FiBell className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400">Enable Notifications</span>
            </div>
            
            <div 
              className="relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none bg-gray-600"
            >
              <span
                className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-300 ease-in-out translate-x-1"
              />
            </div>
          </div>
          
          {/* Information text about notifications being disabled */}
          <p className="text-xs text-gray-500 mt-2">
            Notifications are currently disabled
          </p>
        </div>
      )}
    </div>
  );
};

export default ThresholdSettings;
