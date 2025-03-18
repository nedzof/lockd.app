import * as React from 'react';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiSearch, FiLoader, FiTag, FiBarChart2, FiClock, FiHash } from 'react-icons/fi';
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
    { id: 'blocks', label: 'Block #', icon: <FiHash /> }
  ];
  
  // Function to handle filter change
  const handleFilterChange = (filterId: string) => {
    setSelectedFilter(filterId);
    
    // Update URL with the new filter
    const params = new URLSearchParams(query.toString());
    params.set('type', filterId);
    navigate(`/search?${params.toString()}`);
    
    // Perform search with the new filter
    performSearch(searchTerm, filterId);
  };
  
  // Function to perform search
  const performSearch = async (term: string, type = 'all') => {
    if (!term) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    
    setIsSearching(true);
    setHasSearched(true);
    
    try {
      // Build search query parameters
      const params = new URLSearchParams({
        q: term,
        limit: '50',
        type: type
      });
      
      // Fetch search results from API
      const response = await fetch(`${API_URL}/api/posts/search?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch search results');
      }
      
      const data = await response.json();
      setResults(data.posts || []);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Error searching posts. Please try again.', {
        style: {
          background: '#1A1B23',
          color: '#f87171',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: '0.375rem'
        }
      });
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };
  
  useEffect(() => {
    performSearch(searchTerm, selectedFilter);
  }, [searchTerm, selectedFilter]);
  
  // Handle stats update
  const handleStatsUpdate = (newStats: { totalLocked: number; participantCount: number; roundNumber: number }) => {
    setStats(newStats);
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
        
        {hasSearched && !isSearching && (
          <p className="text-gray-300 mb-4">
            {results.length} {results.length === 1 ? 'result' : 'results'} found
          </p>
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
      
      {isSearching ? (
        <div className="flex justify-center items-center py-12">
          <FiLoader className="text-[#00ffa3] animate-spin" size={32} />
          <span className="ml-3 text-gray-300">Searching posts...</span>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-6">
          {/* Custom post display for search results */}
          {results.map(post => (
            <div key={post.id} className="bg-[#13141B] border border-gray-800/60 rounded-xl p-5 hover:border-gray-700/60 transition-all duration-300">
              {/* Post author */}
              <div className="flex items-center mb-3">
                <img 
                  src={post.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.display_name || post.author_address || 'User')}&background=random`} 
                  alt={post.display_name || post.author_address || 'User'} 
                  className="w-10 h-10 rounded-full mr-3"
                />
                <div>
                  <p className="text-white font-medium">
                    {post.display_name || post.author_address?.substring(0, 8) || 'Anonymous'}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {new Date(post.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              {/* Post content */}
              <div className="mb-4">
                <p className="text-gray-200 whitespace-pre-wrap">{post.content}</p>
              </div>
              
              {/* Post image if available */}
              {post.raw_image_data && (
                <div className="mb-4 rounded-lg overflow-hidden max-h-64">
                  <img 
                    src={`data:${post.media_type || 'image/jpeg'};base64,${post.raw_image_data}`} 
                    alt="Post image" 
                    className="w-full object-cover"
                  />
                </div>
              )}
              
              {/* Tags */}
              {post.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.map((tag: string, index: number) => (
                    <span 
                      key={index}
                      className="bg-gray-800/50 text-gray-300 px-2 py-1 rounded-md text-xs flex items-center"
                    >
                      <FiTag className="mr-1 text-[#00ffa3]" size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              
              {/* Vote options */}
              {post.is_vote && post.vote_options?.length > 0 && (
                <div className="mt-3 mb-1">
                  <p className="text-gray-300 text-sm font-medium mb-2 flex items-center">
                    <FiBarChart2 className="mr-1.5 text-[#00ffa3]" size={14} />
                    Vote Options
                  </p>
                  <div className="space-y-2">
                    {post.vote_options.map((option: any, index: number) => (
                      <div 
                        key={index}
                        className="bg-gray-800/30 px-3 py-2 rounded-md text-gray-300 text-sm"
                      >
                        {option.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Lock count and block info */}
              <div className="flex justify-between items-center mt-4 text-xs text-gray-400">
                <div className="flex items-center">
                  <FiClock className="mr-1" />
                  <span>{new Date(post.created_at).toLocaleTimeString()}</span>
                </div>
                
                {post.block_height && (
                  <div className="flex items-center">
                    <FiHash className="mr-1" />
                    <span>Block #{post.block_height}</span>
                  </div>
                )}
                
                {post.lock_count && (
                  <div className="flex items-center">
                    <span className="text-[#00ffa3]">{post.lock_count} locks</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : hasSearched ? (
        <div className="bg-[#13141B] border border-gray-800/60 rounded-xl p-8 text-center">
          <p className="text-gray-300 mb-4">No posts found matching "{searchTerm}"</p>
          <p className="text-gray-400 text-sm">Try a different search term or browse recent posts.</p>
        </div>
      ) : (
        <div className="bg-[#13141B] border border-gray-800/60 rounded-xl p-8 text-center">
          <p className="text-gray-300 mb-4">Enter a search term to find posts</p>
          <p className="text-gray-400 text-sm">Search by content, tags, vote options, or block numbers</p>
        </div>
      )}
    </div>
  );
} 