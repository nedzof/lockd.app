import * as React from 'react';
import { useState } from 'react';
import { FiBell, FiStar, FiUnlock, FiTrash2, FiPlus, FiUser, FiInfo, FiCheck } from 'react-icons/fi';
import { useWallet } from '../providers/WalletProvider';
import { TagPreferences } from './TagPreferences';

export const NotificationSettings: React.FC = () => {
  const { bsvAddress } = useWallet();
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestone, setNewMilestone] = useState('');
  const [savedAnimation, setSavedAnimation] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleSave = (id: string) => {
    setSavedAnimation(id);
    setTimeout(() => setSavedAnimation(null), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-xl font-medium text-white/90 mb-8">Settings</h1>
      
      {bsvAddress ? (
        <div className="space-y-6">
          <TagPreferences 
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
          />
          
          {/* Main Settings Section */}
          <div className="bg-[#1E1F2E] rounded-lg border border-white/5">
            {/* Platform Notifications */}
            <div className="divide-y divide-white/5">
              <div className="p-5">
                <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center">
                  <FiStar className="mr-2 w-4 h-4 opacity-50" /> Platform Notifications
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-3">
                      <div>
                        <div className="text-white/80 text-sm font-medium">Viral Posts</div>
                        <div className="text-xs text-white/50">Get notified when a post becomes viral</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" onChange={() => handleSave('viral')} />
                      <div className="w-9 h-5 bg-white/5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white/10"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-3">
                      <div>
                        <div className="text-white/80 text-sm font-medium">Unlocks</div>
                        <div className="text-xs text-white/50">Get notified when your locked BSV becomes available</div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" onChange={() => handleSave('unlocks')} />
                      <div className="w-9 h-5 bg-white/5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white/10"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Milestone Notifications */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-white/70 flex items-center">
                    <FiStar className="mr-2 w-4 h-4 opacity-50" /> Milestone Notifications
                  </h3>
                  <button 
                    onClick={() => setShowAddMilestone(true)}
                    className="text-xs text-white/50 hover:text-white/70 transition-colors flex items-center"
                  >
                    <FiPlus className="mr-1 w-3 h-3" />
                    Add
                  </button>
                </div>

                {showAddMilestone && (
                  <div className="mb-4 bg-white/5 p-3 rounded-md">
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        value={newMilestone}
                        onChange={(e) => setNewMilestone(e.target.value)}
                        placeholder="Enter BSV amount"
                        className="flex-1 bg-transparent border border-white/10 rounded-md px-3 py-1.5 text-sm text-white/80 placeholder-white/30 focus:border-white/20 focus:outline-none transition-colors"
                      />
                      <button 
                        onClick={() => setShowAddMilestone(false)}
                        className="px-3 py-1.5 text-xs bg-white/10 text-white/80 rounded-md hover:bg-white/20"
                      >
                        Add
                      </button>
                      <button 
                        onClick={() => setShowAddMilestone(false)}
                        className="px-3 py-1.5 text-xs text-white/50 hover:text-white/70"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {[1, 5, 10].map((amount) => (
                    <div key={amount} className="flex items-center justify-between py-2">
                      <div>
                        <div className="text-white/80 text-sm font-medium">{amount} BSV</div>
                        <div className="text-xs text-white/50">Get notified when a post reaches {amount} BSV</div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" onChange={() => handleSave(`milestone-${amount}`)} />
                          <div className="w-9 h-5 bg-white/5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/80 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-white/10"></div>
                        </label>
                        <button className="text-white/30 hover:text-white/50 transition-colors">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Creator Notifications */}
              <div className="p-5">
                <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center">
                  <FiUser className="mr-2 w-4 h-4 opacity-50" /> Creator Notifications
                </h3>
                <div className="bg-white/5 rounded-md p-4">
                  <div className="text-white/50 text-sm flex items-center justify-center">
                    <FiInfo className="mr-2 w-4 h-4" /> No creators followed yet
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="p-5">
                <h3 className="text-sm font-medium text-white/70 mb-4 flex items-center">
                  <FiInfo className="mr-2 w-4 h-4 opacity-50" /> How it works
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="text-white/50">• Viral post notifications are triggered when a post gains significant traction</li>
                  <li className="text-white/50">• Unlock notifications remind you when your locked BSV becomes available</li>
                  <li className="text-white/50">• Creator notifications alert you when specific creators post new content</li>
                  <li className="text-white/50">• Milestone notifications trigger when posts reach specific BSV thresholds</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#1E1F2E] border border-white/5 rounded-lg p-5">
          <p className="text-white/50">Please connect your wallet to manage your settings.</p>
        </div>
      )}
    </div>
  );
}; 