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
          className="flex items-center bg-[#13141B] border border-gray-800/60 rounded-full overflow-hidden transition-all duration-300 w-48 md:w-64"
        >
          <input
            id="search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search posts..."
            className="w-full bg-transparent text-gray-200 text-sm px-3 py-2 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="p-2 text-gray-400 hover:text-white focus:outline-none"
            aria-label="Close search"
          >
            <FiX size={16} />
          </button>
          <button
            type="submit"
            className="p-2 text-[#00ffa3] hover:bg-[#00ffa3]/10 focus:outline-none rounded-r-full"
            aria-label="Search"
          >
            <FiSearch size={16} />
          </button>
        </form>
      ) : (
        <button
          onClick={toggleExpand}
          className="p-2 rounded-full text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10 focus:outline-none transition-all duration-300"
          aria-label="Open search"
        >
          <FiSearch size={18} />
        </button>
      )}
    </div>
  );
};

export default SearchBar; 