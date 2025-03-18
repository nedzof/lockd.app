import * as React from 'react';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FiSearch, FiLoader } from 'react-icons/fi';
import { API_URL } from '../config';
import PostGrid from '../components/PostGrid';
import { toast } from 'react-hot-toast';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function Search() {
  const query = useQuery();
  const searchTerm = query.get('q') || '';
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  
  // Stats state for PostGrid
  const [stats, setStats] = useState({
    totalLocked: 0,
    participantCount: 0,
    roundNumber: 0
  });
  
  useEffect(() => {
    async function performSearch() {
      if (!searchTerm) {
        setResults([]);
        setHasSearched(false);
        return;
      }
      
      setIsSearching(true);
      setHasSearched(true);
      
      try {
        // Build search query parameters
        const params = new URLSearchParams({
          q: searchTerm,
          limit: '50',
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
    }
    
    performSearch();
  }, [searchTerm]);
  
  // Handle stats update
  const handleStatsUpdate = (newStats: { totalLocked: number; participantCount: number; roundNumber: number }) => {
    setStats(newStats);
  };
  
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6">
      <header className="mb-8">
        {searchTerm ? (
          <h1 className="text-2xl font-bold text-white mb-2 flex items-center">
            <FiSearch className="mr-2 text-[#00ffa3]" />
            Search results for "{searchTerm}"
          </h1>
        ) : (
          <h1 className="text-2xl font-bold text-white mb-2">Search</h1>
        )}
        
        {hasSearched && !isSearching && (
          <p className="text-gray-300">
            {results.length} {results.length === 1 ? 'result' : 'results'} found
          </p>
        )}
      </header>
      
      {isSearching ? (
        <div className="flex justify-center items-center py-12">
          <FiLoader className="text-[#00ffa3] animate-spin" size={32} />
          <span className="ml-3 text-gray-300">Searching posts...</span>
        </div>
      ) : results.length > 0 ? (
        <PostGrid 
          onStatsUpdate={handleStatsUpdate}
          time_filter=""
          ranking_filter="top"
          personal_filter=""
          block_filter=""
          selected_tags={[]}
          user_id=""
        />
      ) : hasSearched ? (
        <div className="bg-[#13141B] border border-gray-800/60 rounded-xl p-8 text-center">
          <p className="text-gray-300 mb-4">No posts found matching "{searchTerm}"</p>
          <p className="text-gray-400 text-sm">Try a different search term or browse recent posts.</p>
        </div>
      ) : (
        <div className="bg-[#13141B] border border-gray-800/60 rounded-xl p-8 text-center">
          <p className="text-gray-300 mb-4">Enter a search term to find posts</p>
          <p className="text-gray-400 text-sm">Search by content, username, or tags</p>
        </div>
      )}
    </div>
  );
} 