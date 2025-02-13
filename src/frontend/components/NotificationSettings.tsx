import * as React from 'react';
import { useState } from 'react';
import { FiBell, FiStar, FiUnlock, FiInfo } from 'react-icons/fi';
import { useWallet } from '../providers/WalletProvider';
import { TagPreferences } from './TagPreferences';

export const NotificationSettings: React.FC = () => {
  const { bsvAddress } = useWallet();
  const [savedAnimation, setSavedAnimation] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [milestoneEnabled, setMilestoneEnabled] = useState(false);
  const [milestoneThreshold, setMilestoneThreshold] = useState(1);

  const handleSave = (id: string) => {
    setSavedAnimation(id);
    setTimeout(() => setSavedAnimation(null), 2000);
  };

  const handleMilestoneChange = (value: string) => {
    setMilestoneThreshold(Number(value));
    setMilestoneEnabled(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>
      
      {bsvAddress ? (
        <div className="space-y-8">
          <TagPreferences 
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />
          
          {/* Platform Notifications */}
          <div className="space-y-6">
            <div className="relative">
              <h3 className="text-[#00ffa3] text-sm font-medium mb-4 flex items-center">
                <FiStar className="mr-2" /> Platform Notifications
              </h3>
              <div className="space-y-3">
                <div className="group p-4 rounded-lg border border-gray-800/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-[#00ffa3] bg-opacity-5 rounded-lg">
                        <FiStar className="text-[#00ffa3] w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-white font-medium">Viral Posts</div>
                        <div className="text-sm text-gray-400">Get notified when a post becomes viral</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" onChange={() => handleSave('viral')} />
                      <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ffa3]"></div>
                    </label>
                  </div>
                </div>

                <div className="group p-4 rounded-lg border border-gray-800/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-[#ff00ff] bg-opacity-5 rounded-lg">
                        <FiUnlock className="text-[#ff00ff] w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-white font-medium">Unlocks</div>
                        <div className="text-sm text-gray-400">Get notified when your locked BSV becomes available</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" onChange={() => handleSave('unlocks')} />
                      <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ff00ff]"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Milestone Notifications */}
            <div className="relative">
              <h3 className="text-[#00ffff] text-sm font-medium mb-4 flex items-center">
                <FiStar className="mr-2" /> Milestone Notifications
              </h3>
              <div className="group p-4 rounded-lg border border-gray-800/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-[#00ffff] bg-opacity-5 rounded-lg">
                      <FiStar className="text-[#00ffff] w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-white font-medium">BSV Milestone</div>
                      <div className="text-sm text-gray-400">Get notified when a post reaches {milestoneThreshold} BSV</div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={milestoneEnabled}
                      onChange={(e) => setMilestoneEnabled(e.target.checked)} 
                    />
                    <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ffff]"></div>
                  </label>
                </div>
                <div className={`transition-opacity duration-200 ${milestoneEnabled ? 'opacity-100' : 'opacity-50'}`}>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={milestoneThreshold}
                    onChange={(e) => handleMilestoneChange(e.target.value)}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-800"
                    style={{
                      background: `linear-gradient(to right, #00ffff ${milestoneThreshold}%, #1f2937 ${milestoneThreshold}%)`,
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-2">
                    <span>1 BSV</span>
                    <span>{milestoneThreshold} BSV</span>
                    <span>100 BSV</span>
                  </div>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="mt-8 border-t border-gray-800/10 pt-8">
              <h3 className="text-white text-sm font-medium mb-4 flex items-center">
                <FiInfo className="mr-2 text-[#00ffa3]" /> How it works
              </h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start space-x-2 text-gray-400">
                  <div className="p-1 bg-[#00ffa3] bg-opacity-5 rounded-full mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ffa3]"></div>
                  </div>
                  <span>Viral post notifications are triggered when a post gains significant traction</span>
                </li>
                <li className="flex items-start space-x-2 text-gray-400">
                  <div className="p-1 bg-[#ff00ff] bg-opacity-5 rounded-full mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#ff00ff]"></div>
                  </div>
                  <span>Unlock notifications remind you when your locked BSV becomes available</span>
                </li>
                <li className="flex items-start space-x-2 text-gray-400">
                  <div className="p-1 bg-[#00ffff] bg-opacity-5 rounded-full mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"></div>
                  </div>
                  <span>Milestone notifications trigger when posts reach your set BSV threshold</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="border border-gray-800/10 rounded-lg p-6">
          <p className="text-gray-400">Please connect your wallet to manage your settings.</p>
        </div>
      )}
    </div>
  );
}; 