import * as React from 'react';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiLoader, FiTag, FiBarChart2, FiClock, FiHash, FiLink } from 'react-icons/fi';
import { API_URL } from '../config';
import PostGrid from '../components/PostGrid';
import { toast } from 'react-hot-toast';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function Search() {
  const query = useQuery();
  const navigate = useNavigate();
  const searchTerm = query.get('q') || '';
  const searchType = query.get('type') || 'all';
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  
  // Stats state for PostGrid
  const [stats, setStats] = useState({
    totalLocked: 0,
    participantCount: 0,
    roundNumber: 0
  });
  
  // Search filters
  const [selectedFilter, setSelectedFilter] = useState(searchType);
  
  const filters = [
    { id: 'all', label: 'All', icon: <FiSearch /> },
    { id: 'content', label: 'Content', icon: <FiSearch /> },
    { id: 'tags', label: 'Tags', icon: <FiTag /> },
    { id: 'votes', label: 'Vote Options', icon: <FiBarChart2 /> },
    { id: 'blocks', label: 'Block #', icon: <FiHash /> },
    { id: 'tx', label: 'Transaction ID', icon: <FiLink /> }
  ];
  
  // Function to handle filter change
  const handleFilterChange = (filterId: string) => {
    setSelectedFilter(filterId);
    
    // Update URL with the new filter
    const params = new URLSearchParams(query.toString());
    params.set('type', filterId);
    navigate(`/search?${params.toString()}`);
  };
  
  // Handle stats update
  const handleStatsUpdate = (newStats: { totalLocked: number; participantCount: number; roundNumber: number }) => {
    setStats(newStats);
  };
  
  // Function to handle tag selection from search results
  const handleTagSelect = (tag: string) => {
    // Navigate to search with the selected tag
    navigate(`/search?q=${encodeURIComponent(tag)}&type=tags`);
  };
  
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
      <header className="mb-6">
        {searchTerm ? (
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center">
            <FiSearch className="mr-2 text-[#00ffa3]" />
            Search results for "{searchTerm}"
          </h1>
        ) : (
          <h1 className="text-2xl font-bold text-white mb-2">Search</h1>
        )}
        
        {/* Search filters */}
        <div className="flex flex-wrap gap-2 mt-4">
          {filters.map(filter => (
            <button
              key={filter.id}
              onClick={() => handleFilterChange(filter.id)}
              className={`flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-300 ${
                selectedFilter === filter.id
                  ? 'bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              {filter.icon && <span className="mr-1.5">{filter.icon}</span>}
              {filter.label}
            </button>
          ))}
        </div>
      </header>
      
      {!searchTerm ? (
        <div className="text-center py-12 text-gray-300">
          Enter a search term to find posts
        </div>
      ) : (
        <PostGrid 
          onStatsUpdate={handleStatsUpdate}
          time_filter=""
          ranking_filter=""
          personal_filter=""
          block_filter=""
          selected_tags={[]}
          user_id="anon"
          onTagSelect={handleTagSelect}
          searchTerm={searchTerm}
          searchType={selectedFilter}
        />
      )}
    </div>
  );
} 