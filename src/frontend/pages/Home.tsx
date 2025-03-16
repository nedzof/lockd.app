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
  const [time_filter, settime_filter] = useState('');
  const [ranking_filter, setranking_filter] = useState('top-1');
  const [personal_filter, setpersonal_filter] = useState('');
  const [block_filter, setblock_filter] = useState('');
  const [selected_tags, setselected_tags] = useState<string[]>([]);

  const handletime_filter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (time_filter === filter) {
      settime_filter('');
    } else {
      // Otherwise, set the new filter and clear other filter types
      settime_filter(filter);
      setblock_filter(''); // Clear block filter when time filter is set
    }
    console.log(`Set time filter to: ${filter || 'none'}`);
  };

  const handleblock_filter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (block_filter === filter) {
      setblock_filter('');
    } else {
      // Otherwise, set the new filter and clear other filter types
      setblock_filter(filter);
      settime_filter(''); // Clear time filter when block filter is set
    }
    console.log(`Set block filter to: ${filter || 'none'}`);
  };

  const handleranking_filter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (ranking_filter === filter) {
      setranking_filter('');
    } else {
      // Otherwise, set the new filter
      setranking_filter(filter);
    }
    console.log(`Set ranking filter to: ${filter || 'none'}`);
  };

  const handlepersonal_filter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (personal_filter === filter) {
      setpersonal_filter('');
    } else {
      // Otherwise, set the new filter
      setpersonal_filter(filter);
    }
    console.log(`Set personal filter to: ${filter || 'none'}`);
  };

  const handleStatsUpdate = useCallback((stats: { totalLocked: number; participantCount: number; roundNumber: number }) => {
    console.log('Stats updated:', stats);
  }, []);

  const handleRefreshPosts = useCallback(() => {
    // Implement post refresh logic here
    console.log('Refreshing posts...');
  }, []);

  // Memoize the user_id to prevent unnecessary re-renders
  const memoizeduser_id = useMemo(() => {
    return connected && bsvAddress ? bsvAddress : 'anon';
  }, [connected, bsvAddress]);

  const renderContent = () => {
    if (isStats) {
      return <BSVStats />;
    }

    // Memoize the entire PostGrid component to prevent unnecessary re-renders
    const memoizedPostGrid = useMemo(() => {
      return (
        <PostGrid 
          onStatsUpdate={handleStatsUpdate}
          time_filter={time_filter}
          ranking_filter={ranking_filter}
          personal_filter={personal_filter}
          block_filter={block_filter}
          selected_tags={selected_tags}
          user_id={memoizeduser_id}
        />
      );
    }, [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, memoizeduser_id, handleStatsUpdate]);

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
                    onClick={() => handletime_filter(filter)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      time_filter === filter
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Show posts from the last ${filter === '1d' ? 'day' : filter === '7d' ? '7 days' : '30 days'}`}
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
                    onClick={() => handleblock_filter(id)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      block_filter === id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Show posts from ${label.toLowerCase()}`}
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
                    onClick={() => handleranking_filter(id)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                      ranking_filter === id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Show ${label.toLowerCase()} posts by popularity`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Only show Personal Filters and Threshold Settings when connected */}
              {connected && (
                <>
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
                        onClick={() => handlepersonal_filter(id)}
                        className={`px-3 py-1 text-xs rounded-md transition-colors duration-200 ${
                          personal_filter === id
                            ? 'bg-white/10 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                        title={id === 'mylocks' ? 'Show only your posts' : 'Show only posts with locked BSV'}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  
                  {/* Divider */}
                  <div className="h-4 w-px bg-gray-800/30 mx-4" />
                  
                  {/* Threshold Settings */}
                  <ThresholdSettings connected={connected} />
                </>
              )}
            </div>
          </div>

          {/* Tag Filter */}
          <TagFilter
            selected_tags={selected_tags}
            onTagSelect={setselected_tags}
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