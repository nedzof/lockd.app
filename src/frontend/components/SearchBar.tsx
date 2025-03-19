import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiSearch, FiX } from 'react-icons/fi';
import { API_URL } from '../config';
import { toast } from 'react-hot-toast';

// Transaction ID regex pattern (hexadecimal, typically 64 characters)
const TX_ID_REGEX = /^[0-9a-fA-F]{64}$/;

// Debounce function for search
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const SearchBar: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Create debounced value for search term - 300ms delay
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  // Detect if the search term is likely a transaction ID
  useEffect(() => {
    if (TX_ID_REGEX.test(searchTerm.trim())) {
      setSearchType('tx');
    } else {
      setSearchType('all');
    }
  }, [searchTerm]);
  
  // Effect to handle real-time search as user types
  useEffect(() => {
    // Only perform search if there's a debounced term and it's at least 2 characters
    if (debouncedSearchTerm && debouncedSearchTerm.trim().length >= 2) {
      performSearch();
    } else if (debouncedSearchTerm === '') {
      // If search term is cleared, clear the search params
      clearSearch();
    }
  }, [debouncedSearchTerm]);

  // Function to perform the search
  const performSearch = useCallback(() => {
    if (!searchTerm.trim()) {
      return;
    }
    
    // Special handling for transaction IDs
    if (TX_ID_REGEX.test(searchTerm.trim())) {
      try {
        // First attempt to redirect to transaction details on the server
        toast.loading('Looking up transaction...', { id: 'txLookup' });
        
        fetch(`${API_URL}/api/posts/tx/${searchTerm.trim()}`)
          .then(response => {
            if (response.ok) {
              return response.json();
            } else {
              throw new Error('Transaction not found in our database');
            }
          })
          .then(data => {
            toast.dismiss('txLookup');
            if (data && data.post) {
              // If we found the post, navigate to it
              toast.success('Transaction found!');
              // TODO: Navigate to post detail view when implemented
              console.log('Found post:', data.post);
              
              // For now, fallback to WhatsonChain
              window.open(`https://whatsonchain.com/tx/${searchTerm.trim()}`, '_blank');
              toast.success('Opening transaction details in a new tab');
            } else {
              // If we didn't find a post, redirect to WhatsonChain
              window.open(`https://whatsonchain.com/tx/${searchTerm.trim()}`, '_blank');
              toast.success('Opening transaction details in a new tab');
            }
          })
          .catch(error => {
            toast.dismiss('txLookup');
            console.error('Error looking up transaction:', error);
            // Fallback to WhatsonChain
            window.open(`https://whatsonchain.com/tx/${searchTerm.trim()}`, '_blank');
            toast.success('Opening transaction details in a new tab');
          });
      } catch (error) {
        console.error('Error processing transaction ID:', error);
        // Fallback to WhatsonChain
        window.open(`https://whatsonchain.com/tx/${searchTerm.trim()}`, '_blank');
        toast.success('Opening transaction details in a new tab');
      }
      
      setIsExpanded(false);
      return;
    }
    
    // For regular searches, use the search API endpoint directly
    try {
      // Clear any existing search params from the URL
      const currentParams = new URLSearchParams(location.search);
      
      // Update search params
      currentParams.set('q', searchTerm.trim());
      currentParams.set('type', searchType);
      
      // Navigate to the search URL - this will trigger the search in PostGrid
      navigate(`/?${currentParams.toString()}`, { replace: true });
    } catch (error) {
      console.error('Error performing search:', error);
    }
  }, [searchTerm, searchType, navigate, location.search]);

  // Function to clear search
  const clearSearch = useCallback(() => {
    const currentParams = new URLSearchParams(location.search);
    currentParams.delete('q');
    currentParams.delete('type');
    navigate(`/?${currentParams.toString()}`, { replace: true });
  }, [navigate, location.search]);
  
  // Handle form submission - now only used for explicit submission (Enter key)
  const handleSearch = useCallback((e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    performSearch();
  }, [performSearch]);
  
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

  // Add click outside handler to close the expanded search
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && isExpanded) {
        setIsExpanded(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);
  
  return (
    <div ref={containerRef} className="relative z-30 min-w-[44px] md:min-w-[56px]">
      {isExpanded ? (
        <form 
          onSubmit={handleSearch}
          className="flex items-center bg-[#13141B] border border-gray-700/30 rounded-md overflow-hidden transition-all duration-300 w-44 md:w-56 shadow-xl absolute right-0 top-0"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            id="search-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search as you type..."
            className="w-full bg-transparent text-gray-200 text-xs px-2 py-1.5 focus:outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                clearSearch();
              }}
              className="p-1 text-gray-400 hover:text-white focus:outline-none"
              aria-label="Clear search"
            >
              <FiX size={12} />
            </button>
          )}
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
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md bg-white/5 border border-gray-700/30 hover:border-gray-600 text-gray-300 transition-all duration-200"
          aria-label="Open search"
          title="Search"
        >
          <FiSearch size={12} />
          <span className="hidden sm:inline-block">Search</span>
        </button>
      )}
    </div>
  );
};

export default SearchBar; 