import * as React from 'react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiTrendingUp, FiClock, FiHeart, FiStar, FiPlus } from 'react-icons/fi';
import PostGrid from '../components/PostGrid';
import { BSVStats } from '../components/charts/BSVStats';
import { NotificationSettings } from '../components/NotificationSettings';

interface HomeProps {
  connected: boolean;
  bsvAddress?: string | null;
}

export default function Home({ connected, bsvAddress }: HomeProps) {
  const location = useLocation();
  const isPosts = location.pathname === '/posts' || location.pathname === '/';
  const isStats = location.pathname === '/stats';
  const isSettings = location.pathname === '/settings';
  const [timeFilter, setTimeFilter] = useState('');
  const [rankingFilter, setRankingFilter] = useState('top1');
  const [personalFilter, setPersonalFilter] = useState('');

  const handleTimeFilter = (filter: string) => {
    setTimeFilter(timeFilter === filter ? '' : filter);
  };

  const handleRankingFilter = (filter: string) => {
    setRankingFilter(rankingFilter === filter ? '' : filter);
  };

  const handleStatsUpdate = (stats: { totalLocked: number; participantCount: number; roundNumber: number }) => {
    console.log('Stats updated:', stats);
  };

  const renderContent = () => {
    if (isStats) {
      return <BSVStats />;
    }
    
    if (isSettings) {
      return <NotificationSettings />;
    }

    return (
      <div className="relative min-h-screen pb-20">
        {/* Filter bar */}
        <div className="mb-8">
          <div className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg">
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/10">
              {/* Time Filters */}
              <div className="flex items-center space-x-1">
                {['1d', '7d', '30d'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => handleTimeFilter(filter)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      timeFilter === filter
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {filter.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-4 w-px bg-gray-800/30 mx-4" />

              {/* Ranking Filters */}
              <div className="flex items-center space-x-1">
                {[
                  { id: 'top1', label: 'Top 1' },
                  { id: 'top3', label: 'Top 3' },
                  { id: 'top10', label: 'Top 10' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => handleRankingFilter(id)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      rankingFilter === id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="h-4 w-px bg-gray-800/30 mx-4" />

              {/* Personal Filters */}
              <div className="flex items-center space-x-1">
                {[
                  { id: 'mylocks', label: 'My Lockings' },
                  { id: 'locked', label: 'Locked Posts' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setPersonalFilter(personalFilter === id ? '' : id)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      personalFilter === id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        <PostGrid 
          onStatsUpdate={handleStatsUpdate}
          timeFilter={timeFilter}
          rankingFilter={rankingFilter}
          personalFilter={personalFilter}
          userId={connected && bsvAddress ? bsvAddress : 'anon'}
        />

        {/* Create Post Button - Fixed at bottom center */}
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-10">
          <button 
            className="group relative px-6 py-3 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 transform hover:scale-105"
          >
            <div className="relative flex items-center space-x-2 text-black">
              <FiPlus className="w-5 h-5" />
              <span>Create Post</span>
            </div>
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-xl transition-all duration-300"></div>
            <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {renderContent()}
    </div>
  );
} 