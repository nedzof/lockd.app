import React, { useState } from 'react';
import { TagPreferences } from '../components/TagPreferences';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';

const Settings: React.FC = () => {
  const { isConnected, bsvAddress } = useWallet();
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    // Check if user has preferences stored in localStorage
    const savedTags = localStorage.getItem('preferredTags');
    return savedTags ? JSON.parse(savedTags) : [];
  });
  const [darkMode, setDarkMode] = useState(() => {
    // Check if user has a preference stored in localStorage
    const savedPreference = localStorage.getItem('darkMode');
    return savedPreference ? JSON.parse(savedPreference) : false;
  });

  const handleTagsChange = (tags: string[]) => {
    setSelectedTags(tags);
    // Save to localStorage
    localStorage.setItem('preferredTags', JSON.stringify(tags));
    toast.success('Tag preferences saved');
  };

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', JSON.stringify(newMode));
    
    // Apply dark mode to document
    if (newMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    toast.success(`${newMode ? 'Dark' : 'Light'} mode enabled`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Display Mode */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Display Preferences</h2>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">Dark Mode</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={darkMode}
                  onChange={toggleDarkMode}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
          
          {/* Account Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Account Information</h2>
            
            {isConnected && bsvAddress ? (
              <div>
                <div className="mb-4">
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Wallet Address</span>
                  <span className="block mt-1 text-sm text-gray-500 dark:text-gray-400 break-all">
                    {bsvAddress}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">
                Connect your wallet to view account information.
              </p>
            )}
          </div>
        </div>
        
        {/* Right Column */}
        <div className="space-y-6">
          {/* Tag Preferences */}
          <TagPreferences 
            selectedTags={selectedTags} 
            onTagsChange={handleTagsChange} 
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;
