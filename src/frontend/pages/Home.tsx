import * as React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FiTrendingUp, FiClock, FiHeart, FiStar, FiUser, FiLock } from 'react-icons/fi';
import PostGrid from '../components/PostGrid';
import { BSVStats } from '../components/charts/BSVStats';
import CreatePostButton from '../components/CreatePostButton';
import TagFilter from '../components/TagFilter';
import ThresholdSettings from '../components/ThresholdSettings';
import SearchBar from '../components/SearchBar';

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
      // Set the new filter and clear block filter
      settime_filter(filter);
      setblock_filter(''); // Clear block filter when time filter is set
    }
    
    // Log the filter change
    console.log(`Set time filter to: ${filter || 'none'}, cleared block filter`);
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
    // Reset all filters
    settime_filter('');
    setblock_filter('');
    setranking_filter('top-1');
    setpersonal_filter('');
    setselected_tags([]);
    
    console.log('Refreshing posts with reset filters...');
  }, []);

  // Handle tag selection from a post
  const handleTagSelectFromPost = useCallback((tag: string) => {
    // If the tag is already selected, do nothing
    if (selected_tags.includes(tag)) {
      return;
    }
    
    // Otherwise, add the tag to the selected tags
    setselected_tags([...selected_tags, tag]);
    
    console.log(`Added tag from post: ${tag}`);
  }, [selected_tags]);

  // Memoize the user_id to prevent unnecessary re-renders
  const memoizeduser_id = useMemo(() => {
    return connected && bsvAddress ? bsvAddress : 'anon';
  }, [connected, bsvAddress]);

  // Debug current filter state
  useEffect(() => {
    console.log('Current filter state:', {
      time_filter,
      block_filter,
      ranking_filter,
      personal_filter,
      selected_tags,
      user_id: memoizeduser_id
    });
  }, [time_filter, block_filter, ranking_filter, personal_filter, selected_tags, memoizeduser_id]);

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
          onTagSelect={handleTagSelectFromPost}
        />
      );
    }, [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, memoizeduser_id, handleStatsUpdate, handleTagSelectFromPost]);

    return (
      <div className="relative min-h-screen pb-20">
        {/* Filter bar - more compact version */}
        <div className="mb-4">
          <div className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg shadow-inner shadow-black/10 border border-white/5">
            <div className="flex flex-wrap items-center px-3 py-2 gap-2">
              {/* Group 1: Time & Block Filters + Search */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Time Filters */}
                <div className="flex items-center space-x-0.5">
                  {[
                    { id: '1d', label: '24H' },
                    { id: '7d', label: '7D' },
                    { id: '30d', label: '30D' }
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => handletime_filter(id)}
                      className={`px-2 py-1 text-xs rounded-md transition-colors duration-200 ${
                        time_filter === id
                          ? 'bg-white/10 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                      title={`Show posts from the last ${label === '24H' ? 'day' : label === '7D' ? '7 days' : '30 days'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Small vertical divider */}
                <div className="h-4 w-px bg-gray-800/30" />

                {/* Block Filters */}
                <div className="flex items-center space-x-0.5">
                  {[
                    { id: 'last-block', label: 'Last Block' },
                    { id: 'last-5-blocks', label: 'Last 5 Blocks' },
                    { id: 'last-10-blocks', label: 'Last 10 Blocks' }
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => handleblock_filter(id)}
                      className={`px-2 py-1 text-xs rounded-md transition-colors duration-200 ${
                        block_filter === id
                          ? 'bg-white/10 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                      title={`Show posts from ${label.toLowerCase()}`}
                    >
                      {id === 'last-block' ? 'Last Block' : 
                       id === 'last-5-blocks' ? 'Last 5' : 'Last 10'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Small vertical divider */}
              <div className="h-4 w-px bg-gray-800/30" />

              {/* Group 2: Search Bar */}
              <div>
                <SearchBar />
              </div>

              {/* Small vertical divider */}
              <div className="h-4 w-px bg-gray-800/30" />

              {/* Group 3: Ranking Filters */}
              <div className="flex items-center space-x-0.5">
                {[
                  { id: 'top-1', label: 'Top 1' },
                  { id: 'top-3', label: 'Top 3' },
                  { id: 'top-10', label: 'Top 10' }
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => handleranking_filter(id)}
                    className={`px-2 py-1 text-xs rounded-md transition-colors duration-200 relative ${
                      ranking_filter === id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Show ${label.toLowerCase()} posts by popularity`}
                  >
                    {label}
                    {ranking_filter === id && (
                      <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-[#00ffa3] opacity-75 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ffa3]"></span>
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Only show Personal Filters and Threshold Settings when connected */}
              {connected && (
                <>
                  {/* Small vertical divider */}
                  <div className="h-4 w-px bg-gray-800/30" />
                  
                  {/* Personal Filters */}
                  <div className="flex items-center space-x-0.5">
                    {[
                      { id: 'mylocks', label: 'My Posts', icon: 'user', title: 'Show posts you created' },
                      { id: 'locked', label: 'My Locks', icon: 'lock', title: 'Show posts where you locked BSV' }
                    ].map(({ id, label, icon, title }) => (
                      <button
                        key={id}
                        onClick={() => handlepersonal_filter(id)}
                        className={`px-2 py-1 text-xs rounded-md transition-colors duration-200 relative ${
                          personal_filter === id
                            ? 'bg-white/10 text-white'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                        title={title}
                      >
                        {icon === 'user' ? (
                          <span className="inline-flex items-center">
                            <FiUser className="mr-1" size={10} />
                            {label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center">
                            <FiLock className="mr-1" size={10} />
                            {label}
                          </span>
                        )}
                        {personal_filter === id && (
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-[#00ffa3] opacity-75 animate-ping"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ffa3]"></span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  
                  {/* Small vertical divider */}
                  <div className="h-4 w-px bg-gray-800/30" />
                  
                  {/* Threshold Settings */}
                  <ThresholdSettings connected={connected} walletAddress={bsvAddress || undefined} />
                </>
              )}
            </div>
          </div>

          {/* Tag Filter - with reduced margin */}
          <div className="mt-2">
            <TagFilter
              selected_tags={selected_tags}
              onTagSelect={setselected_tags}
            />
          </div>
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