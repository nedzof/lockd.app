import { useState, useEffect, useCallback } from 'react';
import { enhanceSearch, clearSearchCache, clearSearchCacheForQuery } from './SearchService';
import { useLocation, useNavigate } from 'react-router-dom';

// Create a singleton state that persists between component renders
// This is the key to ensuring components stay in sync
let globalSearchTerm = '';
let globalSearchType = 'all';
let globalSearchResults: any[] = [];
let globalSearchListeners: Function[] = [];

// Function to notify all listeners of state changes
const notifyListeners = () => {
  globalSearchListeners.forEach(listener => listener());
};

/**
 * Custom hook for managing search state across components
 * This ensures real-time updates as the user types
 */
export function useSearchState() {
  const [searchTerm, setLocalSearchTerm] = useState(globalSearchTerm);
  const [searchType, setLocalSearchType] = useState(globalSearchType);
  const [searchResults, setLocalSearchResults] = useState(globalSearchResults);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const location = useLocation();
  const navigate = useNavigate();
  
  // Update global state and notify listeners
  const setSearchTerm = useCallback((term: string) => {
    globalSearchTerm = term;
    setLocalSearchTerm(term);
    notifyListeners();
    
    // Update URL immediately for real-time feedback
    if (term.trim().length >= 2) {
      const params = new URLSearchParams(location.search);
      params.set('q', term.trim());
      params.set('type', globalSearchType);
      
      // Use replaceState to avoid cluttering history
      window.history.replaceState(null, '', `/?${params.toString()}`);
    } else if (term.trim() === '') {
      // Clear search params
      const params = new URLSearchParams(location.search);
      params.delete('q');
      params.delete('type');
      window.history.replaceState(null, '', `/?${params.toString()}`);
    }
  }, [location.search]);
  
  const setSearchType = useCallback((type: string) => {
    globalSearchType = type;
    setLocalSearchType(type);
    notifyListeners();
  }, []);
  
  const setSearchResults = useCallback((results: any[]) => {
    globalSearchResults = results;
    setLocalSearchResults(results);
    notifyListeners();
  }, []);
  
  // Perform search with the current term
  const performSearch = useCallback(async (filters: Record<string, any> = {}, forceRefresh = true) => {
    if (!globalSearchTerm || globalSearchTerm.trim().length < 2) {
      setSearchResults([]);
      return [];
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Clear cache for the current search term
      clearSearchCacheForQuery(globalSearchTerm.trim());
      
      console.log(`Performing search with term: "${globalSearchTerm}", type: ${globalSearchType}`);
      const results = await enhanceSearch(
        globalSearchTerm.trim(),
        globalSearchType,
        filters,
        forceRefresh
      );
      
      // Update results in global state
      setSearchResults(results);
      setIsLoading(false);
      return results;
    } catch (error) {
      console.error('Error in search:', error);
      setError(error instanceof Error ? error.message : 'An error occurred during search');
      setIsLoading(false);
      return [];
    }
  }, [setSearchResults]);
  
  // Clear search state
  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setSearchResults([]);
    clearSearchCache();
    
    // Update URL
    const params = new URLSearchParams(location.search);
    params.delete('q');
    params.delete('type');
    navigate(`/?${params.toString()}`, { replace: true });
  }, [location.search, navigate, setSearchTerm, setSearchResults]);
  
  // Register this component as a listener for global state changes
  useEffect(() => {
    const listener = () => {
      // Only update local state if it's different from global state
      if (globalSearchTerm !== searchTerm) {
        setLocalSearchTerm(globalSearchTerm);
      }
      if (globalSearchType !== searchType) {
        setLocalSearchType(globalSearchType);
      }
      if (globalSearchResults !== searchResults) {
        setLocalSearchResults(globalSearchResults);
      }
    };
    
    globalSearchListeners.push(listener);
    
    // Set initial state from URL params
    const params = new URLSearchParams(location.search);
    const queryParam = params.get('q');
    const typeParam = params.get('type');
    
    if (queryParam && queryParam !== globalSearchTerm) {
      globalSearchTerm = queryParam;
      setLocalSearchTerm(queryParam);
    }
    
    if (typeParam && typeParam !== globalSearchType) {
      globalSearchType = typeParam;
      setLocalSearchType(typeParam);
    }
    
    return () => {
      // Remove listener on unmount
      globalSearchListeners = globalSearchListeners.filter(l => l !== listener);
    };
  }, [searchTerm, searchType, searchResults, location.search]);
  
  return {
    searchTerm,
    setSearchTerm,
    searchType,
    setSearchType,
    searchResults,
    setSearchResults,
    performSearch,
    clearSearch,
    isLoading,
    error
  };
} 