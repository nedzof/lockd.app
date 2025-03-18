import * as React from 'react';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiTrendingUp, FiClock, FiHeart, FiStar, FiUser, FiLock, FiChevronDown, FiFilter, FiX, FiLink, FiCalendar } from 'react-icons/fi';
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
  const navigate = useNavigate();
  const isPosts = location.pathname === '/posts' || location.pathname === '/';
  const isStats = location.pathname === '/stats';
  const [period_filter, setPeriod_filter] = useState('');
  const [ranking_filter, setranking_filter] = useState('top-1');
  const [personal_filter, setpersonal_filter] = useState('');
  const [selected_tags, setselected_tags] = useState<string[]>([]);
  const [tx_filter, setTx_filter] = useState('');
  
  // Add refs for dropdown menus
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const rankingDropdownRef = useRef<HTMLDivElement>(null);
  const txDropdownRef = useRef<HTMLDivElement>(null);
  
  // Add state for dropdown visibility
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [rankingDropdownOpen, setRankingDropdownOpen] = useState(false);
  const [txDropdownOpen, setTxDropdownOpen] = useState(false);
  
  // Add combined time period options
  const timePeriodOptions = [
    { id: '1d', label: '24 Hours', type: 'time' },
    { id: '7d', label: '7 Days', type: 'time' },
    { id: '30d', label: '30 Days', type: 'time' },
    { id: 'last-block', label: 'Latest Block', type: 'block' },
    { id: 'last-10-blocks', label: 'Last 10 Blocks', type: 'block' },
    { id: 'last-50-blocks', label: 'Last 50 Blocks', type: 'block' }
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
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(event.target as Node)) {
        setPeriodDropdownOpen(false);
      }
      if (rankingDropdownRef.current && !rankingDropdownRef.current.contains(event.target as Node)) {
        setRankingDropdownOpen(false);
      }
      if (txDropdownRef.current && !txDropdownRef.current.contains(event.target as Node)) {
        setTxDropdownOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handlePeriodFilter = (filter: string) => {
    // If the same filter is clicked again, clear it
    if (period_filter === filter) {
      setPeriod_filter('');
    } else {
      // Set the new filter
      setPeriod_filter(filter);
    }
    
    // Close dropdown
    setPeriodDropdownOpen(false);
    
    // Log the filter change
    console.log(`Set period filter to: ${filter || 'none'}`);
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
    setPeriod_filter('');
    setranking_filter('top-1');
    setpersonal_filter('');
    setselected_tags([]);
    setTx_filter('');
    
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

  // Get the current period filter label
  const getCurrentPeriodFilterLabel = () => {
    const option = timePeriodOptions.find(option => option.id === period_filter);
    return option ? option.label : 'Time Period';
  };
  
  // Get the period filter type (time or block)
  const getPeriodFilterType = () => {
    const option = timePeriodOptions.find(option => option.id === period_filter);
    return option ? option.type : null;
  };
  
  // Get the current ranking filter label
  const getCurrentRankingFilterLabel = () => {
    const option = rankingOptions.find(option => option.id === ranking_filter);
    return option ? option.label : 'Ranking';
  };

  // Function to handle transaction ID filter
  const handleTxFilter = (txId: string) => {
    // If there's an input but not a full search
    if (txId && txId !== tx_filter) {
      setTx_filter(txId);
      // Navigate to search page with transaction ID type search
      navigate(`/search?q=${encodeURIComponent(txId)}&type=tx`);
    } else {
      setTx_filter('');
    }
    
    // Close dropdown
    setTxDropdownOpen(false);
  };

  // Function to clear all filters
  const clearAllFilters = () => {
    setPeriod_filter('');
    setranking_filter('');
    setpersonal_filter('');
    setselected_tags([]);
    setTx_filter('');
  };

  // Check if any filter is active
  const isAnyFilterActive = period_filter || ranking_filter || personal_filter || selected_tags.length > 0 || tx_filter;

  // Determine time_filter and block_filter values for PostGrid based on period_filter
  const getFiltersForPostGrid = () => {
    const periodType = getPeriodFilterType();
    
    if (!period_filter) {
      return { time_filter: '', block_filter: '' };
    }
    
    if (periodType === 'time') {
      return { time_filter: period_filter, block_filter: '' };
    } else {
      return { time_filter: '', block_filter: period_filter };
    }
  };

  // Memoize the user_id to prevent unnecessary re-renders
  const memoizeduser_id = useMemo(() => {
    return connected && bsvAddress ? bsvAddress : 'anon';
  }, [connected, bsvAddress]);

  // Get time and block filter values for PostGrid
  const { time_filter, block_filter } = getFiltersForPostGrid();

  // Debug current filter state
  useEffect(() => {
    console.log('Current filter state:', {
      period_filter,
      time_filter,
      block_filter,
      ranking_filter,
      personal_filter,
      selected_tags,
      tx_filter,
      user_id: memoizeduser_id
    });
  }, [period_filter, ranking_filter, personal_filter, selected_tags, tx_filter, memoizeduser_id, time_filter, block_filter]);

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
              
              {/* Time Period Filter Dropdown */}
              <div ref={periodDropdownRef} className="relative">
                <button
                  onClick={() => {
                    setPeriodDropdownOpen(!periodDropdownOpen);
                    setRankingDropdownOpen(false);
                    setTxDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-all duration-200 w-32 ${
                    period_filter ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20' : 'bg-white/5 text-gray-300 border border-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FiCalendar size={12} />
                    <span className="truncate">{getCurrentPeriodFilterLabel()}</span>
                  </div>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${periodDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {periodDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-40 rounded-md bg-[#1A1B23] border border-gray-800 shadow-lg py-1">
                    {period_filter && (
                      <button
                        onClick={() => handlePeriodFilter('')}
                        className="flex w-full items-center px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
                      >
                        <FiX size={12} className="mr-1.5" />
                        Clear Period Filter
                      </button>
                    )}
                    
                    {/* Time-based options */}
                    <div className="px-3 py-1 text-xs text-gray-500">Time-based</div>
                    {timePeriodOptions.filter(option => option.type === 'time').map(option => (
                      <button
                        key={option.id}
                        onClick={() => handlePeriodFilter(option.id)}
                        className={`flex items-center w-full px-3 py-1.5 text-xs ${
                          period_filter === option.id ? 'text-[#00ffa3] bg-[#00ffa3]/5' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <FiClock size={10} className="mr-1.5" />
                        {option.label}
                      </button>
                    ))}
                    
                    {/* Block-based options */}
                    <div className="px-3 py-1 text-xs text-gray-500 mt-1">Block-based</div>
                    {timePeriodOptions.filter(option => option.type === 'block').map(option => (
                      <button
                        key={option.id}
                        onClick={() => handlePeriodFilter(option.id)}
                        className={`flex items-center w-full px-3 py-1.5 text-xs ${
                          period_filter === option.id ? 'text-[#00ffa3] bg-[#00ffa3]/5' : 'text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        <FiTrendingUp size={10} className="mr-1.5" />
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
                    setPeriodDropdownOpen(false);
                    setTxDropdownOpen(false);
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

              {/* Add Transaction ID Filter Dropdown */}
              <div ref={txDropdownRef} className="relative">
                <button
                  onClick={() => {
                    setTxDropdownOpen(!txDropdownOpen);
                    setPeriodDropdownOpen(false);
                    setRankingDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs rounded-md transition-all duration-200 w-32 ${
                    tx_filter ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20' : 'bg-white/5 text-gray-300 border border-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <FiLink size={12} />
                    <span className="truncate">{tx_filter ? 'Transaction ID' : 'TX ID'}</span>
                  </div>
                  <FiChevronDown size={12} className={`transition-transform duration-200 ${txDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {txDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-64 rounded-md bg-[#1A1B23] border border-gray-800 shadow-lg py-2 px-3">
                    {tx_filter && (
                      <button
                        onClick={() => handleTxFilter('')}
                        className="flex w-full items-center mb-2 px-2 py-1 text-xs text-gray-300 hover:bg-white/5 rounded"
                      >
                        <FiX size={12} className="mr-1.5" />
                        Clear Transaction ID
                      </button>
                    )}
                    <div className="flex flex-col">
                      <label className="text-xs text-gray-400 mb-1">Enter Transaction ID</label>
                      <div className="flex">
                        <input 
                          type="text" 
                          placeholder="Transaction ID..." 
                          value={tx_filter}
                          onChange={(e) => setTx_filter(e.target.value)}
                          className="flex-grow bg-[#13141B] border border-gray-700/50 text-gray-200 text-xs px-2 py-1.5 rounded-l-md focus:outline-none focus:border-[#00ffa3]/30"
                        />
                        <button
                          onClick={() => handleTxFilter(tx_filter)}
                          className="bg-[#00ffa3]/10 text-[#00ffa3] px-2 py-1.5 rounded-r-md text-xs"
                        >
                          Search
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Search for posts by blockchain transaction ID</p>
                    </div>
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