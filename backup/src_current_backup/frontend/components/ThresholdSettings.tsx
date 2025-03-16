import React, { useState, useEffect } from 'react';
import { FiLock, FiInfo } from 'react-icons/fi';

interface ThresholdSettingsProps {
  connected: boolean;
}

const ThresholdSettings: React.FC<ThresholdSettingsProps> = ({ connected }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [milestoneThreshold, setMilestoneThreshold] = useState(() => {
    // Check if user has a preference stored in localStorage
    const savedThreshold = localStorage.getItem('milestoneThreshold');
    return savedThreshold ? Number(savedThreshold) : 1;
  });

  const handleThresholdChange = (value: string) => {
    const numValue = Number(value);
    setMilestoneThreshold(numValue);
    localStorage.setItem('milestoneThreshold', value);
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
          
          <div className="text-xs text-gray-400 flex items-start space-x-2">
            <FiInfo className="w-3 h-3 mt-0.5 flex-shrink-0 text-[#00E6CC]" />
            <span>Set your BSV threshold for post visibility and notifications</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThresholdSettings;
