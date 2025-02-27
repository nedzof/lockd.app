import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { FiTrendingUp, FiClock, FiHeart, FiStar } from 'react-icons/fi';
import PostGrid from '../components/PostGrid';
import { BSVStats } from '../components/charts/BSVStats';
import CreatePostButton from '../components/CreatePostButton';
import TagFilter from '../components/TagFilter';
import ThresholdSettings from '../components/ThresholdSettings';

interface HomeProps {
  connected: boolean;
  bsvAddress?: string | null;
}

export default function Home({ connected, bsvAddress }: HomeProps) {
  const location = useLocation();
  const isPosts = location.pathname === '/posts' || location.pathname === '/';
  const isStats = location.pathname === '/stats';
  const [timeFilter, setTimeFilter] = useState('');
  const [rankingFilter, setRankingFilter] = useState('top-1');
  const [personalFilter, setPersonalFilter] = useState('');
  const [blockFilter, setBlockFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleTimeFilter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (timeFilter === filter) {
      setTimeFilter('');
    } else {
      // Otherwise, set the new filter and clear other filter types
      setTimeFilter(filter);
      setBlockFilter(''); // Clear block filter when time filter is set
    }
  };

  const handleBlockFilter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (blockFilter === filter) {
      setBlockFilter('');
    } else {
      // Otherwise, set the new filter and clear other filter types
      setBlockFilter(filter);
      setTimeFilter(''); // Clear time filter when block filter is set
    }
  };

  const handleRankingFilter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (rankingFilter === filter) {
      setRankingFilter('');
    } else {
      // Otherwise, set the new filter
      setRankingFilter(filter);
    }
  };

  const handlePersonalFilter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (personalFilter === filter) {
      setPersonalFilter('');
    } else {
      // Otherwise, set the new filter
      setPersonalFilter(filter);
    }
  };

  const handleStatsUpdate = useCallback((stats: { totalLocked: number; participantCount: number; roundNumber: number }) => {
    console.log('Stats updated:', stats);
  }, []);

  const handleRefreshPosts = useCallback(() => {
    // Implement post refresh logic here
    console.log('Refreshing posts...');
  }, []);

  // Memoize the userId to prevent unnecessary re-renders
  const memoizedUserId = useMemo(() => {
    return connected && bsvAddress ? bsvAddress : 'anon';
  }, [connected, bsvAddress]);

  const renderContent = () => {
    if (isStats) {
      return <BSVStats />;
    }

    // Memoize the entire PostGrid component to prevent unnecessary re-renders
    const memoizedPostGrid = useMemo(() => {
      console.log('Creating memoized PostGrid instance');
      return (
        <PostGrid 
          onStatsUpdate={handleStatsUpdate}
          timeFilter={timeFilter}
          rankingFilter={rankingFilter}
          personalFilter={personalFilter}
          blockFilter={blockFilter}
          selectedTags={selectedTags}
          userId={memoizedUserId}
        />
      );
    }, [timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, memoizedUserId, handleStatsUpdate]);

    return (
      <div className="relative min-h-screen pb-20">
        {/* Filter bar */}
        <div className="mb-8 space-y-4">
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

              {/* Block Filters */}
              <div className="flex items-center space-x-1">
                {[
                  { id: 'last-block', label: 'Last Block' },
                  { id: 'last-5-blocks', label: 'Last 5 Blocks' },
                  { id: 'last-10-blocks', label: 'Last 10 Blocks' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => handleBlockFilter(id)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      blockFilter === id
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

              {/* Ranking Filters */}
              <div className="flex items-center space-x-1">
                {[
                  { id: 'top-1', label: 'Top 1' },
                  { id: 'top-3', label: 'Top 3' },
                  { id: 'top-10', label: 'Top 10' }
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
                  { id: 'mylocks', label: 'My Posts' },
                  { id: 'locked', label: 'Locked Posts' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => handlePersonalFilter(id)}
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
              
              {/* Divider */}
              <div className="h-4 w-px bg-gray-800/30 mx-4" />
              
              {/* Threshold Settings */}
              {connected && (
                <ThresholdSettings connected={connected} />
              )}
            </div>
          </div>

          {/* Tag Filter */}
          <TagFilter
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            userId={bsvAddress || undefined}
          />
        </div>

        {memoizedPostGrid}

        {/* Create Post Button - Fixed at bottom center */}
        {connected && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-20">
            <CreatePostButton 
              onPostCreated={handleRefreshPosts}
              className="group relative px-6 py-3 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 transform hover:scale-105"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      {renderContent()}
    </div>
  );
} 