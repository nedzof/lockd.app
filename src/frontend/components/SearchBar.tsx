import * as React from 'react';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiX } from 'react-icons/fi';
import { API_URL } from '../config';
import { toast } from 'react-hot-toast';

const SearchBar: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  
  const handleSearch = useCallback((e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!searchTerm.trim()) {
      return;
    }
    
    // Navigate to search results page with the search term as a query parameter
    navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
  }, [searchTerm, navigate]);
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      // Focus the input when expanding
      setTimeout(() => {
        document.getElementById('search-input')?.focus();
      }, 100);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsExpanded(false);
    }
  };
  
  return (
    <div className="relative">
      {isExpanded ? (
        <form 
          onSubmit={handleSearch}
          className="flex items-center bg-[#13141B] border border-gray-800/60 rounded-full overflow-hidden transition-all duration-300 w-36 md:w-48"
        >
          <input
            id="search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search posts..."
            className="w-full bg-transparent text-gray-200 text-xs px-3 py-1 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="p-1 text-gray-400 hover:text-white focus:outline-none"
            aria-label="Close search"
          >
            <FiX size={12} />
          </button>
          <button
            type="submit"
            className="p-1 text-[#00ffa3] hover:bg-[#00ffa3]/10 focus:outline-none rounded-r-full"
            aria-label="Search"
          >
            <FiSearch size={12} />
          </button>
        </form>
      ) : (
        <button
          onClick={toggleExpand}
          className="flex items-center space-x-1 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200"
          aria-label="Open search"
        >
          <FiSearch size={12} />
          <span>Search</span>
        </button>
      )}
    </div>
  );
};

export default SearchBar; 