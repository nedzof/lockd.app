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

  const handleSave = (id: string) => {
    setSavedAnimation(id);
    setTimeout(() => setSavedAnimation(null), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>
      
      {bsvAddress ? (
        <div className="space-y-8">
          <TagPreferences userId={bsvAddress} />
          
          {/* Header Section */}
          <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-[#00ffa3] bg-opacity-20 rounded-lg">
                  <FiBell className="text-[#00ffa3] w-6 h-6" />
                </div>
                <h2 className="text-white text-xl font-medium">Notification Settings</h2>
              </div>
              <div className="flex space-x-3">
                <button className="px-4 py-2 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] text-black text-sm rounded-lg font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 flex items-center">
                  <FiUser className="mr-2" />
                  Follow Creator
                </button>
                <button 
                  onClick={() => setShowAddMilestone(true)}
                  className="px-4 py-2 bg-gradient-to-r from-[#ff00ff] to-[#ff00cc] text-white text-sm rounded-lg font-medium hover:shadow-lg hover:from-[#ff00cc] hover:to-[#ff00ff] transition-all duration-300 flex items-center"
                >
                  <FiPlus className="mr-2" />
                  Add Milestone
                </button>
              </div>
            </div>

            {/* Add Milestone Input */}
            {showAddMilestone && (
              <div className="mb-6 bg-black bg-opacity-20 p-4 rounded-lg animate-fadeIn">
                <div className="flex items-center space-x-3">
                  <input
                    type="number"
                    value={newMilestone}
                    onChange={(e) => setNewMilestone(e.target.value)}
                    placeholder="Enter BSV amount"
                    className="flex-1 bg-[#1A1B23] border border-[#2A2A40] rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-[#00ffa3] focus:outline-none transition-colors"
                  />
                  <button 
                    onClick={() => setShowAddMilestone(false)}
                    className="px-4 py-2 bg-[#00ffa3] text-black rounded-lg hover:bg-[#00ff9d] transition-colors"
                  >
                    Add
                  </button>
                  <button 
                    onClick={() => setShowAddMilestone(false)}
                    className="px-4 py-2 bg-[#2A2A40] text-gray-400 rounded-lg hover:bg-[#3A3A50] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Platform Notifications */}
            <div className="space-y-6">
              <div className="relative">
                <h3 className="text-[#00ffa3] text-sm font-medium mb-4 flex items-center">
                  <FiStar className="mr-2" /> Platform Notifications
                </h3>
                <div className="space-y-3">
                  <div className="group bg-gradient-to-r from-[#2A2A40] to-[#1A1B23] p-4 rounded-lg hover:shadow-lg transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-[#00ffa3] bg-opacity-10 rounded-lg group-hover:bg-opacity-20 transition-all">
                          <FiStar className="text-[#00ffa3] w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-white font-medium">Viral Posts</div>
                          <div className="text-sm text-gray-400">Get notified when a post becomes viral</div>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" onChange={() => handleSave('viral')} />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#00ffa3] peer-checked:to-[#00ff9d]"></div>
                        {savedAnimation === 'viral' && (
                          <FiCheck className="absolute -right-6 text-[#00ffa3] animate-fadeIn" />
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="group bg-gradient-to-r from-[#2A2A40] to-[#1A1B23] p-4 rounded-lg hover:shadow-lg transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-[#ff00ff] bg-opacity-10 rounded-lg group-hover:bg-opacity-20 transition-all">
                          <FiUnlock className="text-[#ff00ff] w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-white font-medium">Unlocks</div>
                          <div className="text-sm text-gray-400">Get notified when your locked BSV becomes available</div>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" onChange={() => handleSave('unlocks')} />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#ff00ff] peer-checked:to-[#ff00cc]"></div>
                        {savedAnimation === 'unlocks' && (
                          <FiCheck className="absolute -right-6 text-[#ff00ff] animate-fadeIn" />
                        )}
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
                <div className="space-y-3">
                  {[1, 5, 10].map((amount) => (
                    <div key={amount} className="group bg-gradient-to-r from-[#2A2A40] to-[#1A1B23] p-4 rounded-lg hover:shadow-lg transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-[#00ffff] bg-opacity-10 rounded-lg group-hover:bg-opacity-20 transition-all">
                            <FiStar className="text-[#00ffff] w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-white font-medium">{amount} BSV Milestone</div>
                            <div className="text-sm text-gray-400">Get notified when a post reaches {amount} BSV</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" onChange={() => handleSave(`milestone-${amount}`)} />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#00ffff] peer-checked:to-[#00ccff]"></div>
                            {savedAnimation === `milestone-${amount}` && (
                              <FiCheck className="absolute -right-6 text-[#00ffff] animate-fadeIn" />
                            )}
                          </label>
                          <button className="text-gray-500 hover:text-gray-300 transition-colors">
                            <FiTrash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Creator Notifications */}
              <div className="relative">
                <h3 className="text-[#ffa500] text-sm font-medium mb-4 flex items-center">
                  <FiUser className="mr-2" /> Creator Notifications
                </h3>
                <div className="bg-gradient-to-r from-[#2A2A40] to-[#1A1B23] p-4 rounded-lg">
                  <div className="text-gray-400 text-sm flex items-center justify-center py-6">
                    <FiInfo className="mr-2" /> No creators followed yet
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-lg p-6 mt-8">
                <h3 className="text-white text-sm font-medium mb-4 flex items-center">
                  <FiInfo className="mr-2 text-[#00ffa3]" /> How it works
                </h3>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start space-x-2 text-gray-400">
                    <div className="p-1 bg-[#00ffa3] bg-opacity-10 rounded-full mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00ffa3]"></div>
                    </div>
                    <span>Viral post notifications are triggered when a post gains significant traction</span>
                  </li>
                  <li className="flex items-start space-x-2 text-gray-400">
                    <div className="p-1 bg-[#ff00ff] bg-opacity-10 rounded-full mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#ff00ff]"></div>
                    </div>
                    <span>Unlock notifications remind you when your locked BSV becomes available</span>
                  </li>
                  <li className="flex items-start space-x-2 text-gray-400">
                    <div className="p-1 bg-[#00ffff] bg-opacity-10 rounded-full mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00ffff]"></div>
                    </div>
                    <span>Creator notifications alert you when specific creators post new content</span>
                  </li>
                  <li className="flex items-start space-x-2 text-gray-400">
                    <div className="p-1 bg-[#ffa500] bg-opacity-10 rounded-full mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#ffa500]"></div>
                    </div>
                    <span>Milestone notifications trigger when posts reach specific BSV thresholds</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-6">
          <p className="text-gray-400">Please connect your wallet to manage your settings.</p>
        </div>
      )}
    </div>
  );
}; 