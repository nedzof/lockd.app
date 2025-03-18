import * as React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSearch, FiX } from 'react-icons/fi';
import { API_URL } from '../config';
import { toast } from 'react-hot-toast';

// Transaction ID regex pattern (hexadecimal, typically 64 characters)
const TX_ID_REGEX = /^[0-9a-fA-F]{64}$/;

const SearchBar: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Detect if the search term is likely a transaction ID
  useEffect(() => {
    if (TX_ID_REGEX.test(searchTerm.trim())) {
      setSearchType('tx');
    } else {
      setSearchType('all');
    }
  }, [searchTerm]);
  
  const handleSearch = useCallback((e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!searchTerm.trim()) {
      return;
    }
    
    // If we're on the home page, use query params to filter the existing PostGrid
    const searchParams = new URLSearchParams();
    searchParams.set('q', searchTerm.trim());
    searchParams.set('type', searchType);
    
    // Navigate to home with search query params
    navigate(`/?${searchParams.toString()}`);
    
    // Close search after submitting
    setIsExpanded(false);
  }, [searchTerm, searchType, navigate]);
  
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
          className="flex items-center bg-[#13141B] border border-gray-700/30 rounded-md overflow-hidden transition-all duration-300 w-44 md:w-56"
        >
          <input
            id="search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or enter TX ID..."
            className="w-full bg-transparent text-gray-200 text-xs px-2 py-1.5 focus:outline-none"
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
            className="p-1 text-[#00ffa3] hover:bg-[#00ffa3]/10 focus:outline-none rounded-r-md"
            aria-label="Search"
            title={TX_ID_REGEX.test(searchTerm.trim()) ? "Search for transaction ID" : "Search posts"}
          >
            <FiSearch size={12} />
          </button>
        </form>
      ) : (
        <button
          onClick={toggleExpand}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-md bg-white/5 border border-gray-700/30 hover:border-gray-600 text-gray-300 transition-all duration-200"
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