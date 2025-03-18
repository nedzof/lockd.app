import * as React from 'react';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { FiTrendingUp, FiClock, FiHeart, FiStar, FiUser, FiLock, FiChevronDown, FiFilter, FiX } from 'react-icons/fi';
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
  
  // Add refs for dropdown menus
  const timeDropdownRef = useRef<HTMLDivElement>(null);
  const blockDropdownRef = useRef<HTMLDivElement>(null);
  const rankingDropdownRef = useRef<HTMLDivElement>(null);
  
  // Add state for dropdown visibility
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [blockDropdownOpen, setBlockDropdownOpen] = useState(false);
  const [rankingDropdownOpen, setRankingDropdownOpen] = useState(false);
  
  // Add predefined options for dropdowns
  const timeOptions = [
    { id: '1d', label: '24 Hours' },
    { id: '3d', label: '3 Days' },
    { id: '7d', label: '7 Days' },
    { id: '14d', label: '2 Weeks' },
    { id: '30d', label: '30 Days' },
    { id: '90d', label: '90 Days' }
  ];
  
  const blockOptions = [
    { id: 'last-block', label: 'Last Block' },
    { id: 'last-5-blocks', label: 'Last 5 Blocks' },
    { id: 'last-10-blocks', label: 'Last 10 Blocks' },
    { id: 'last-20-blocks', label: 'Last 20 Blocks' },
    { id: 'last-50-blocks', label: 'Last 50 Blocks' },
    { id: 'last-100-blocks', label: 'Last 100 Blocks' }
  ];
  
  const rankingOptions = [
    { id: 'top-1', label: 'Top 1' },
    { id: 'top-3', label: 'Top 3' },
    { id: 'top-5', label: 'Top 5' },
    { id: 'top-10', label: 'Top 10' },
    { id: 'top-25', label: 'Top 25' },
    { id: 'top-50', label: 'Top 50' }
  ];

  // Function to close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (timeDropdownRef.current && !timeDropdownRef.current.contains(event.target as Node)) {
        setTimeDropdownOpen(false);
      }
      if (blockDropdownRef.current && !blockDropdownRef.current.contains(event.target as Node)) {
        setBlockDropdownOpen(false);
      }
      if (rankingDropdownRef.current && !rankingDropdownRef.current.contains(event.target as Node)) {
        setRankingDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handletime_filter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (time_filter === filter) {
      settime_filter('');
    } else {
      // Set the new filter and clear block filter
      settime_filter(filter);
      setblock_filter(''); // Clear block filter when time filter is set
    }
    
    // Close dropdown
    setTimeDropdownOpen(false);
    
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
    
    // Close dropdown
    setBlockDropdownOpen(false);
    
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
    
    // Close dropdown
    setRankingDropdownOpen(false);
    
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

  // Get the current time filter label
  const getCurrentTimeFilterLabel = () => {
    const option = timeOptions.find(option => option.id === time_filter);
    return option ? option.label : 'Time';
  };
  
  // Get the current block filter label
  const getCurrentBlockFilterLabel = () => {
    const option = blockOptions.find(option => option.id === block_filter);
    return option ? option.label : 'Blocks';
  };
  
  // Get the current ranking filter label
  const getCurrentRankingFilterLabel = () => {
    const option = rankingOptions.find(option => option.id === ranking_filter);
    return option ? option.label : 'Ranking';
  };

  // Function to clear all filters
  const clearAllFilters = () => {
    settime_filter('');
    setblock_filter('');
    setranking_filter('');
    setpersonal_filter('');
    setselected_tags([]);
  };

  // Check if any filter is active
  const isAnyFilterActive = time_filter || block_filter || ranking_filter || personal_filter || selected_tags.length > 0;

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
        {/* Filter bar */}
        <div className="mb-6">
          <div className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg">
            <div className="flex items-center px-4 py-2 space-x-2">
              {/* Filter icon */}
              <div className="text-gray-400">
                <FiFilter size={16} />
              </div>
              
              {/* Time Filter Dropdown */}
              <div ref={timeDropdownRef} className="relative">
                <button
                  onClick={() => {
                    setTimeDropdownOpen(!timeDropdownOpen);
                    setBlockDropdownOpen(false);
                    setRankingDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-all duration-200 w-28 ${
                    time_filter ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20' : 'bg-white/5 text-gray-300 border border-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FiClock size={12} />
                    <span className="truncate">{getCurrentTimeFilterLabel()}</span>
                  </div>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${timeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {timeDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-36 rounded-md bg-[#1A1B23] border border-gray-800 shadow-lg py-1">
                    {time_filter && (
                      <button
                        onClick={() => handletime_filter('')}
                        className="flex w-full items-center px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
                      >
                        <FiX size={12} className="mr-1.5" />
                        Clear Time Filter
                      </button>
                    )}
                    {timeOptions.map(option => (
                      <button
                        key={option.id}
                        onClick={() => handletime_filter(option.id)}
                        className={`flex items-center w-full px-3 py-1.5 text-xs ${
                          time_filter === option.id ? 'text-[#00ffa3] bg-[#00ffa3]/5' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Block Filter Dropdown */}
              <div ref={blockDropdownRef} className="relative">
                <button
                  onClick={() => {
                    setBlockDropdownOpen(!blockDropdownOpen);
                    setTimeDropdownOpen(false);
                    setRankingDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-all duration-200 w-32 ${
                    block_filter ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20' : 'bg-white/5 text-gray-300 border border-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FiTrendingUp size={12} />
                    <span className="truncate">{getCurrentBlockFilterLabel()}</span>
                  </div>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${blockDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {blockDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-40 rounded-md bg-[#1A1B23] border border-gray-800 shadow-lg py-1">
                    {block_filter && (
                      <button
                        onClick={() => handleblock_filter('')}
                        className="flex w-full items-center px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
                      >
                        <FiX size={12} className="mr-1.5" />
                        Clear Block Filter
                      </button>
                    )}
                    {blockOptions.map(option => (
                      <button
                        key={option.id}
                        onClick={() => handleblock_filter(option.id)}
                        className={`flex items-center w-full px-3 py-1.5 text-xs ${
                          block_filter === option.id ? 'text-[#00ffa3] bg-[#00ffa3]/5' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Ranking Filter Dropdown */}
              <div ref={rankingDropdownRef} className="relative">
                <button
                  onClick={() => {
                    setRankingDropdownOpen(!rankingDropdownOpen);
                    setTimeDropdownOpen(false);
                    setBlockDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-all duration-200 w-28 ${
                    ranking_filter ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20' : 'bg-white/5 text-gray-300 border border-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FiStar size={12} />
                    <span className="truncate">{getCurrentRankingFilterLabel()}</span>
                  </div>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${rankingDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {rankingDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-32 rounded-md bg-[#1A1B23] border border-gray-800 shadow-lg py-1">
                    {ranking_filter && (
                      <button
                        onClick={() => handleranking_filter('')}
                        className="flex w-full items-center px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
                      >
                        <FiX size={12} className="mr-1.5" />
                        Clear Ranking
                      </button>
                    )}
                    {rankingOptions.map(option => (
                      <button
                        key={option.id}
                        onClick={() => handleranking_filter(option.id)}
                        className={`flex items-center w-full px-3 py-1.5 text-xs ${
                          ranking_filter === option.id ? 'text-[#00ffa3] bg-[#00ffa3]/5' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="flex-grow flex justify-end">
                <SearchBar />
              </div>
              
              {/* Only show Personal Filters and Threshold Settings when connected */}
              {connected && (
                <div className="flex items-center space-x-2">
                  {/* Personal Filters */}
                  <div className="flex items-center space-x-1">
                    {[
                      { id: 'mylocks', label: 'My Posts', icon: <FiUser size={12} />, title: 'Show posts you created' },
                      { id: 'locked', label: 'My Locks', icon: <FiLock size={12} />, title: 'Show posts where you locked BSV' }
                    ].map(({ id, label, icon, title }) => (
                      <button
                        key={id}
                        onClick={() => handlepersonal_filter(id)}
                        className={`flex items-center px-3 py-1.5 text-xs rounded-md transition-all duration-200 ${
                          personal_filter === id
                            ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                        title={title}
                      >
                        <span className="mr-1.5">{icon}</span>
                        <span className="whitespace-nowrap">{label}</span>
                      </button>
                    ))}
                  </div>
                  
                  {/* Threshold Settings */}
                  <ThresholdSettings connected={connected} walletAddress={bsvAddress || undefined} />
                </div>
              )}
              
              {/* Clear All Filters button (only shows when filters are active) */}
              {isAnyFilterActive && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs px-2 py-1 text-gray-400 hover:text-white rounded flex items-center"
                  title="Clear all filters"
                >
                  <FiX size={12} className="mr-1" />
                  <span>Clear</span>
                </button>
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