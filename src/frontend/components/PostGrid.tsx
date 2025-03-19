import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart, FiMaximize2, FiX, FiBarChart2, FiExternalLink, FiClock, FiTrendingUp, FiUser } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import type { Post } from '../types';
import { toast } from 'react-hot-toast';
import VoteOptionLockInteraction from './VoteOptionLockInteraction';
import PostLockInteraction from './PostLockInteraction';
import { useYoursWallet } from 'yours-wallet-provider';
import { API_URL } from '../config';
import LinkPreview from './LinkPreview';
import { calculate_active_locked_amount } from '../utils/lockStatus';
import { calculate_active_stats } from '../utils/stats';
import { enhanceSearch } from '../services/SearchService';

interface vote_option {
  id: string;
  tx_id: string;
  content: string;
  author_address?: string;
  created_at: string;
  lock_amount: number;
  lock_duration: number;
  unlock_height?: number;
  tags: string[];
}

interface ExtendedPost {
  id: string;
  tx_id: string;
  content: string;
  author_address?: string;
  media_type?: string;
  block_height?: number;
  raw_image_data?: string;
  unlock_height?: number;
  description?: string;
  created_at: string;
  tags: string[];
  metadata?: any;
  is_locked: boolean;
  lock_duration?: number;
  is_vote: boolean;
  vote_options: vote_option[];
  imageUrl?: string;
  totalLocked?: number;
  media_url?: string;
  base64Image?: string;
  lock_likes?: { amount: number; author_address?: string }[];
  isSearchResult?: boolean;
  _highlightContent?: boolean;
  _matchedFields?: string[];
  _score?: number;
  _searchInfo?: {
    score: number;
    matchedInFields: string[];
    query: string;
  };
  matchInfo?: {
    fields: string[];
    query: string;
    score: number;
  };
}

interface PostGridProps {
  onStatsUpdate: (stats: { totalLocked: number; participantCount: number; roundNumber: number }) => void;
  time_filter: string;
  ranking_filter: string;
  personal_filter: string;
  block_filter: string;
  selected_tags: string[];
  user_id: string;
  onTagSelect?: (tag: string) => void;
  searchTerm?: string;
  searchType?: string;
}

// Add debounce utility
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  return function(...args: any[]) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

// Helper function to format date in a simplified way
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds}s`;
  } else if (diffInSeconds < 3600) {
    return `${Math.floor(diffInSeconds / 60)}m`;
  } else if (diffInSeconds < 86400) {
    return `${Math.floor(diffInSeconds / 3600)}h`;
  } else if (diffInSeconds < 604800) {
    return `${Math.floor(diffInSeconds / 86400)}d`;
  } else {
    return `${date.toLocaleDateString()}`;
  }
}

// Helper function to calculate percentage of locked amount
function calculatePercentage(amount: number, total: number): number {
  if (!total) return 0;
  return Math.round((amount / total) * 100);
}

// Add a function to extract URLs from content
const extractFirstUrl = (text: string): string | null => {
  if (!text) return null;
  
  // URL regex pattern that matches common URL formats
  const urlRegex = /(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/gi;
  
  const matches = text.match(urlRegex);
  if (!matches || matches.length === 0) return null;
  
  // Ensure the URL has a protocol
  let url = matches[0];
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  
  return url;
};

// Function to highlight search term in text
const highlightSearchTerm = (text: string, searchTerm: string): React.ReactNode => {
  if (!searchTerm || !text) return text;
  
  // Escape special regex characters in the search term
  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Create regex for the search term (case insensitive)
  const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
  
  // Split text by search term
  const parts = text.split(regex);
  
  // Map parts to JSX elements, highlighting matches
  return parts.map((part, i) => {
    if (part.toLowerCase() === searchTerm.toLowerCase()) {
      return <span key={i} className="bg-[#00ffa3]/30 text-white font-semibold px-0.5 rounded">{part}</span>;
    }
    return part;
  });
};

const PostGrid: React.FC<PostGridProps> = ({
  onStatsUpdate,
  time_filter,
  ranking_filter,
  personal_filter,
  block_filter,
  selected_tags,
  user_id,
  onTagSelect,
  searchTerm,
  searchType = 'all'
}) => {
  const [submissions, setSubmissions] = useState<ExtendedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isLocking, setIsLocking] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const imageRefs = useRef<{ [key: string]: HTMLImageElement }>({});
  const imageUrlMap = useRef<Map<string, string>>(new Map());
  const wallet = useYoursWallet();
  // Keep track of post IDs we've already seen to prevent duplicates
  const seenpost_ids = useRef<Set<string>>(new Set());
  // Add a ref to track if initial fetch has been made
  const initialFetchMade = useRef<boolean>(false);
  // Add a ref to track if component is mounted
  const isMounted = useRef<boolean>(false);
  // Add a ref to track if a fetch is in progress
  const isFetchInProgress = useRef<boolean>(false);
  // Add a ref to store previous filter values for comparison
  const prevFilters = useRef({
    time_filter: '',
    ranking_filter: '',
    personal_filter: '',
    block_filter: '',
    selected_tags: [] as string[],
    user_id: '',
    searchTerm: '',
    searchType: ''
  });
  // Add a ref for the intersection observer loader element
  const loaderRef = useRef<HTMLDivElement>(null);

  // Add current block height state
  const [current_block_height, set_current_block_height] = useState<number | null>(null);

  // Memoize current filters to avoid unnecessary re-renders
  const currentFilters = useMemo(() => ({
    time_filter,
    ranking_filter,
    personal_filter,
    block_filter,
    selected_tags,
    user_id,
    searchTerm,
    searchType
  }), [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id, searchTerm, searchType]);

  // Function to check if filters have changed
  const haveFiltersChanged = useCallback(() => {
    // Deep comparison for arrays
    const areTagsEqual = () => {
      if (prevFilters.current.selected_tags.length !== selected_tags.length) {
        return false;
      }
      
      const prevTagsSet = new Set(prevFilters.current.selected_tags);
      return selected_tags.every(tag => prevTagsSet.has(tag));
    };
    
    // Compare each filter value
    return (
      prevFilters.current.time_filter !== time_filter ||
      prevFilters.current.ranking_filter !== ranking_filter ||
      prevFilters.current.personal_filter !== personal_filter ||
      prevFilters.current.block_filter !== block_filter ||
      prevFilters.current.user_id !== user_id ||
      prevFilters.current.searchTerm !== searchTerm ||
      prevFilters.current.searchType !== searchType ||
      !areTagsEqual()
    );
  }, [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id, searchTerm, searchType]);

  // Add a ref to track last search term
  const lastSearchTerm = useRef<string>('');

  const fetchPosts = useCallback(async (reset = true) => {
    if (!isMounted.current) {
      console.warn('Fetch posts called when component is not mounted');
      return;
    }
    
    if (isFetchInProgress.current) {
      console.warn('Fetch already in progress, skipping');
      return;
    }
    
    // Set the fetch in progress flag
    isFetchInProgress.current = true;
    
    try {
      // If this is a reset (new query), reset the pagination and state
      if (reset) {
        setLoading(true);
        setNextCursor(null);
        setSubmissions([]);
        seenpost_ids.current = new Set();
      } else {
        setIsFetchingMore(true);
      }
      
      // If we're doing a search, use the enhanced search service
      if (searchTerm) {
        console.log(`SEARCH: Using enhanced search with query: "${searchTerm}", type: ${searchType || 'all'}`);
        
        try {
          // Use the enhanced search service
          const searchResults = await enhanceSearch(searchTerm, searchType);
          
          if (searchResults && searchResults.length > 0) {
            console.log(`Found ${searchResults.length} results with enhanced search`);
            
            // Process search results
            const processedPosts = searchResults.map((post: any) => {
              // Remove any score information from the post
              if (post.content && typeof post.content === 'string') {
                post.content = post.content.replace(/\s*\(Score:\s*\d+%\)\s*$/g, '');
              }
              
              // Add search match information
              if (post._searchInfo) {
                console.log(`Post ${post.id} matched search in fields:`, post._matchedFields);
                
                // Create a special field to indicate this is a search result
                post.isSearchResult = true;
                post.matchInfo = {
                  fields: post._matchedFields || [],
                  query: post._searchInfo.query || searchTerm,
                  score: post._score || 0
                };
                
                // Highlight search term in content if it matched there
                if (post.content && post._matchedFields?.includes('content')) {
                  // Add a marker for later highlighting
                  post._highlightContent = true;
                }
              }
              
              // Process image data if available - ensures images appear in search results
              let imageUrl = post.imageUrl || post.media_url || null;
              
              // Convert raw_image_data to URL if available
              if (post.raw_image_data && !imageUrl) {
                // Check if we already have a blob URL for this image
                if (imageUrlMap.current.has(post.id)) {
                  imageUrl = imageUrlMap.current.get(post.id);
                } else {
                  try {
                    // Create a data URL from the base64 string
                    imageUrl = `data:${post.media_type || 'image/jpeg'};base64,${post.raw_image_data}`;
                    // Store in our map for future reference
                    imageUrlMap.current.set(post.id, imageUrl);
                  } catch (error) {
                    console.error(`Error processing image for search result ${post.id}:`, error);
                  }
                }
              }
              
              // Add any additional processing specific to search results
              return {
                ...post,
                imageUrl: imageUrl
              };
            });
            
            // Update submissions with the search results
            setSubmissions(processedPosts);
            
            // Keep track of the post IDs we've seen
            processedPosts.forEach((post: any) => {
              seenpost_ids.current.add(post.id);
            });
            
            // Update pagination state for search results
            setHasMore(false); // Search doesn't support pagination yet
            setNextCursor(null);
            
            // Finally, set loading to false
            setLoading(false);
            setIsFetchingMore(false);
            isFetchInProgress.current = false;
            
            return; // Exit early since we've handled the search
          } else {
            console.log('No results found with enhanced search');
            // If no results, still continue with the regular API approach as fallback
          }
        } catch (error) {
          console.error('Error with enhanced search:', error);
          // Continue with regular API approach as fallback
        }
      }
      
      // This is the original code for fetching posts, used if we're not searching
      // or if the enhanced search didn't return results

      // Build the query parameters
      const queryParams = new URLSearchParams();
      
      // Determine which endpoint to use based on whether we're searching
      let endpoint = `${API_URL}/api/posts`;
      
      // Add search parameters if provided
      if (searchTerm) {
        // Use the dedicated search endpoint when search parameters are present
        endpoint = `${API_URL}/api/posts/search`;
        queryParams.append('q', searchTerm);
        queryParams.append('type', searchType || 'all');
        console.log(`SEARCH: Using search endpoint with query: "${searchTerm}", type: ${searchType || 'all'}`);
      } else {
        // Only add these filters for the regular posts endpoint, not for search
        // Pagination
        if (nextCursor && !reset) {
          queryParams.append('cursor', nextCursor);
          console.log(`Adding cursor: ${nextCursor}`);
        }
        
        // Filters
        if (time_filter) {
          queryParams.append('time_filter', time_filter);
          console.log(`Adding time_filter: ${time_filter}`);
        }
        
        if (ranking_filter) {
          queryParams.append('ranking_filter', ranking_filter);
          console.log(`Adding ranking_filter: ${ranking_filter}`);
        }
        
        if (personal_filter) {
          queryParams.append('personal_filter', personal_filter);
          console.log(`Adding personal_filter: ${personal_filter}`);
        } else {
          // NEW: Check if we need to explicitly request lock data when no filter is applied
          // This is a diagnostic log to help understand why lock data might be missing
          console.log('No personal_filter applied - verify server includes complete lock_likes data');
        }
        
        if (block_filter) {
          queryParams.append('block_filter', block_filter);
          console.log(`Adding block_filter: ${block_filter}`);
        }
        
        // Add tags if selected
        if (selected_tags.length > 0) {
          selected_tags.forEach(tag => {
            queryParams.append('tags', tag);
          });
          console.log(`Adding tags: ${selected_tags.join(', ')}`);
        }
        
        // Add user_id if available
        if (user_id) {
          queryParams.append('user_id', user_id);
          console.log(`Adding user_id: ${user_id}`);
        }
      }
      
      console.log(`Fetching posts with endpoint: ${endpoint} and params: ${queryParams.toString()}`);
      
      // Add timeout and retry logic for fetch
      let retryCount = 0;
      const maxRetries = 2;
      let response;
      
      while (retryCount <= maxRetries) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          response = await fetch(`${endpoint}?${queryParams.toString()}`, {
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            break; // Success, exit the retry loop
          } else {
            console.warn(`Attempt ${retryCount + 1}/${maxRetries + 1} failed with status: ${response.status}`);
            retryCount++;
            
            if (retryCount <= maxRetries) {
              // Wait before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
            }
          }
        } catch (fetchError) {
          console.error(`Fetch attempt ${retryCount + 1}/${maxRetries + 1} failed:`, fetchError);
          retryCount++;
          
          if (retryCount <= maxRetries) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount - 1)));
          } else {
            // All retries failed
            setError('Failed to connect to the server. Please check your connection and try again.');
            setLoading(false);
            setIsFetchingMore(false);
            isFetchInProgress.current = false;
            throw fetchError;
          }
        }
      }
      
      if (!response || !response.ok) {
        const errorMessage = response ? `HTTP error! status: ${response.status}` : 'Failed to connect to the server';
        setError(errorMessage);
        setLoading(false);
        setIsFetchingMore(false);
        isFetchInProgress.current = false;
        throw new Error(errorMessage);
      }
      
      let data;
      try {
        data = await response.json();
        
        // Log the full API response to understand the data differences with/without filters
        console.log(`API response data with params: ${queryParams.toString()}`, {
          hasData: !!data,
          hasPosts: data && data.posts && Array.isArray(data.posts),
          postCount: data && data.posts ? data.posts.length : 0,
          filters: {
            hasRankingFilter: !!ranking_filter,
            rankingFilter: ranking_filter,
            hasTimeFilter: !!time_filter,
            timeFilter: time_filter,
            hasPersonalFilter: !!personal_filter,
            hasBlockFilter: !!block_filter
          },
          firstPostSample: data && data.posts && data.posts.length > 0 ? 
            {
              hasLockLikes: !!data.posts[0].lock_likes,
              lockLikesType: data.posts[0].lock_likes ? typeof data.posts[0].lock_likes : null,
              isArray: data.posts[0].lock_likes ? Array.isArray(data.posts[0].lock_likes) : null,
              firstLockLike: data.posts[0].lock_likes && Array.isArray(data.posts[0].lock_likes) && data.posts[0].lock_likes.length > 0 ?
                JSON.stringify(data.posts[0].lock_likes[0]) : null
            } : null
        });
        
        // ADDED: Analyze all posts in the response to check for lock data differences between filtered and unfiltered requests
        if (data && data.posts && Array.isArray(data.posts)) {
          console.log("========== DETAILED LOCK DATA ANALYSIS ==========");
          data.posts.forEach((post: any, index: number) => {
            // Find posts with lock_likes
            const hasLocks = post.lock_likes && Array.isArray(post.lock_likes) && post.lock_likes.length > 0;
            if (hasLocks) {
              console.log(`Post ${index} (${post.id}) has ${post.lock_likes.length} lock_likes:`);
              
              // Count how many locks have non-zero amounts
              const nonZeroLocks = post.lock_likes.filter((lock: any) => typeof lock.amount === 'number' && lock.amount > 0);
              console.log(`- ${nonZeroLocks.length} locks have non-zero amounts`);
              
              // Log the structure of the first few locks
              post.lock_likes.slice(0, 3).forEach((lock: any, lockIndex: number) => {
                console.log(`- Lock ${lockIndex}: amount=${lock.amount}, type=${typeof lock.amount}, unlockHeight=${lock.unlock_height}`);
              });
            } else {
              console.log(`Post ${index} (${post.id}) has no lock_likes or they're empty`);
            }
          });
          console.log("=================================================");
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        setError('Invalid response from server');
        setLoading(false);
        setIsFetchingMore(false);
        isFetchInProgress.current = false;
        throw parseError;
      }
      
      if (!data || !data.posts || !Array.isArray(data.posts)) {
        console.error('Invalid API response format:', data);
        setError('Invalid response format from server');
        setLoading(false);
        setIsFetchingMore(false);
        isFetchInProgress.current = false;
        throw new Error('Invalid API response format - posts array missing or malformed');
      }
      
      // Process posts to add image URLs and other derived data
      const processedPosts = data.posts.map((post: any) => {
        // NEW: Additional check for lock_likes integrity
        if (!post.lock_likes) {
          console.warn(`Post ${post.id} missing lock_likes property completely`);
        } else if (!Array.isArray(post.lock_likes)) {
          console.warn(`Post ${post.id} has lock_likes but it's not an array:`, {
            type: typeof post.lock_likes,
            value: post.lock_likes
          });
        } else if (post.lock_likes.length > 0) {
          console.log(`Post ${post.id} has ${post.lock_likes.length} lock_likes but may not be showing correct amount`);
          // Deep inspect the lock_likes to find any structural issues
          const validAmounts = post.lock_likes.filter((lock: any) => 
            lock && typeof lock.amount === 'number' && !isNaN(lock.amount) && lock.amount > 0);
          
          if (validAmounts.length > 0) {
            console.log(`Post ${post.id} has ${validAmounts.length} valid non-zero amounts that should be displayed`);
          } else {
            console.log(`Post ${post.id} has no valid amounts - all zeros or invalid`);
          }
        }
        
        // Debug lock_likes data structure - more detailed version
        console.log(`Processing post ${post.id} - Lock likes:`, {
          hasLockLikes: !!post.lock_likes,
          isArray: post.lock_likes ? Array.isArray(post.lock_likes) : false,
          count: post.lock_likes ? (Array.isArray(post.lock_likes) ? post.lock_likes.length : 'not an array') : 0,
          sample: post.lock_likes ? (Array.isArray(post.lock_likes) && post.lock_likes.length > 0 ? 
            JSON.stringify(post.lock_likes[0]) : 'empty or not an array') : null,
          fullData: post.lock_likes ? JSON.stringify(post.lock_likes) : null,
          rawData: post.lock_likes
        });
        
        // Process image data if available
        if (post.raw_image_data) {
          try {
            // Check if we already have a blob URL for this image
            if (imageUrlMap.current.has(post.id)) {
              post.imageUrl = imageUrlMap.current.get(post.id);
            } else {
              // Create a direct data URL from the base64 string
              if (typeof post.raw_image_data === 'string') {
                // Create a data URL directly from the base64 string
                post.imageUrl = `data:${post.media_type || 'image/jpeg'};base64,${post.raw_image_data}`;
                
                // Store the URL in our map for future reference
                imageUrlMap.current.set(post.id, post.imageUrl);
              } else {
                console.warn(`Unexpected raw_image_data type for post ${post.id}:`, typeof post.raw_image_data);
              }
            }
          } catch (error) {
            console.error(`Error processing image for post ${post.id}:`, error);
          }
        } else if (post.media_url) {
          post.imageUrl = post.media_url;
          console.log(`Using media_url for post ${post.id}: ${post.media_url}`);
          // Store the URL in our map for future reference
          imageUrlMap.current.set(post.id, post.media_url);
        }
        
        // Ensure lock_likes is always a properly formatted array
        if (!post.lock_likes) {
          console.log(`Post ${post.id} has no lock_likes, initializing empty array`);
          post.lock_likes = [];
        } else if (!Array.isArray(post.lock_likes)) {
          console.warn(`Post ${post.id} has lock_likes but it's not an array:`, post.lock_likes);
          // Try to convert to array if it's an object with numeric keys
          if (typeof post.lock_likes === 'object' && post.lock_likes !== null) {
            try {
              const values = Object.values(post.lock_likes);
              if (values.length > 0) {
                console.log(`Converting object to array with ${values.length} items`);
                post.lock_likes = values;
              } else {
                post.lock_likes = [];
              }
            } catch (e) {
              console.error(`Failed to convert lock_likes object to array:`, e);
              post.lock_likes = [];
            }
          } else {
            post.lock_likes = [];
          }
        }
        
        // Fix the data structure to ensure each lock includes a proper amount value
        if (Array.isArray(post.lock_likes)) {
          post.lock_likes.forEach((lock: any, index: number) => {
            // Check if this lock has a proper amount property
            if (lock) {
              console.log(`Examining lock ${index} for post ${post.id}:`, {
                hasAmount: 'amount' in lock,
                amountType: typeof lock.amount,
                amountValue: lock.amount,
                fullLock: JSON.stringify(lock)
              });
              
              // Handle amounts coming in as strings from the server
              if (typeof lock.amount === 'string') {
                const parsedAmount = parseInt(lock.amount, 10);
                if (!isNaN(parsedAmount)) {
                  console.log(`Converting string amount "${lock.amount}" to number ${parsedAmount}`);
                  lock.amount = parsedAmount;
                } else {
                  console.warn(`Invalid amount string: "${lock.amount}", setting to 0`);
                  lock.amount = 0;
                }
              } else if (typeof lock.amount !== 'number') {
                // If it's not a string or number, set to 0
                console.warn(`Invalid amount type: ${typeof lock.amount}, setting to 0`);
                lock.amount = 0;
              }
              
              // Verify lock amount is a number and not NaN after conversion
              if (isNaN(lock.amount)) {
                console.warn(`Amount is NaN after processing, setting to 0`);
                lock.amount = 0;
              }
            }
          });
        }
        
        // Ensure each lock_like has the required properties
        post.lock_likes = post.lock_likes.map((lock: any) => {
          // If amount is missing or not a number, try to parse it or set to 0
          if (typeof lock.amount !== 'number') {
            console.warn(`Lock ${lock.id} has non-number amount: ${lock.amount} (type: ${typeof lock.amount})`);
            
            // If it's a string, try to parse it
            if (typeof lock.amount === 'string') {
              try {
                const parsedAmount = parseInt(lock.amount, 10);
                if (!isNaN(parsedAmount)) {
                  console.log(`Successfully parsed string amount "${lock.amount}" to number: ${parsedAmount}`);
                  lock.amount = parsedAmount;
                } else {
                  console.warn(`Failed to parse string amount "${lock.amount}" to number`);
                  lock.amount = 0;
                }
              } catch (e) {
                console.error(`Error parsing amount "${lock.amount}":`, e);
                lock.amount = 0;
              }
            } else {
              lock.amount = 0;
            }
          }
          return lock;
        });
        
        // Calculate total locked amount for the post
        let totalLocked = 0;
        
        // Sum up lock_likes amounts if available
        if (post.lock_likes && Array.isArray(post.lock_likes)) {
          totalLocked += post.lock_likes.reduce((sum: number, lock: any) => sum + (lock.amount || 0), 0);
        }
        
        // For vote posts, also include the lock amounts from vote options
        if (post.is_vote && post.vote_options && Array.isArray(post.vote_options)) {
          totalLocked += post.vote_options.reduce((sum: number, option: any) => sum + (option.lock_amount || 0), 0);
        }
        
        // Assign the calculated total locked amount
        post.totalLocked = totalLocked;
        
        // For vote posts, fetch vote options if they're not already included
        if (post.is_vote && (!post.vote_options || post.vote_options.length === 0)) {
          setTimeout(() => fetchvote_optionsForPost(post), 0);
        }
        
        return post;
      });
      
      // Now that we have successfully fetched new posts, we can clear the seen post IDs if resetting
      if (reset) {
        seenpost_ids.current = new Set();
        setError(null); // Only clear error state after successful fetch
      }
      
      // Filter out duplicates using the seen post IDs
      const uniqueNewPosts = processedPosts.filter((post: any) => {
        if (seenpost_ids.current.has(post.id)) {
          return false;
        }
        seenpost_ids.current.add(post.id);
        return true;
      });
      
      console.log(`Received ${uniqueNewPosts.length} unique posts`);
      
      // Only update state if we have posts to show
      if (uniqueNewPosts.length > 0 || reset) {
        // Update submissions state
        if (reset) {
          // Clean up old blob URLs before replacing posts
          cleanupBlobUrls(submissions);
          setSubmissions([...uniqueNewPosts]); // Create a new array to ensure state update
        } else {
          setSubmissions(prevSubmissions => [...prevSubmissions, ...uniqueNewPosts]);
        }
      }
      
      // Update pagination state
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      
      // Call onStatsUpdate if provided
      if (onStatsUpdate && data.stats) {
        onStatsUpdate(data.stats);
      }
    } catch (err) {
      // Add more detailed error logging
      if (err instanceof Error) {
        console.error('Error fetching posts:', err.message);
      }
      
      // Check for network errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError('Failed to fetch posts. Please try again later.');
      }

      // Don't clear existing posts on error
      // This ensures posts don't disappear when there's an error
    } finally {
      if (reset) {
        setLoading(false);
      } else {
        setIsFetchingMore(false);
      }
      
      // Update previous filters after fetch completes
      prevFilters.current = { 
        time_filter,
        ranking_filter,
        personal_filter,
        block_filter,
        selected_tags: [...selected_tags],
        user_id,
        searchTerm: searchTerm || '',
        searchType: searchType || ''
      };
      
      // Reset the fetch in progress flag
      isFetchInProgress.current = false;
    }
  }, [currentFilters, nextCursor, onStatsUpdate, submissions]);

  // Effect to debounce search term changes and trigger search
  useEffect(() => {
    if (searchTerm !== lastSearchTerm.current) {
      console.log(`Search term changed from "${lastSearchTerm.current}" to "${searchTerm || ''}"`);
      
      // Set up a short debounce timer to prevent too many requests
      const timer = setTimeout(() => {
        // Update the last search term reference
        lastSearchTerm.current = searchTerm || '';
        
        // Only perform search if component is mounted
        if (isMounted.current) {
          console.log('Explicitly triggering fetch due to search term change');
          // Direct call to fetch posts
          fetchPosts(true);
        }
      }, 100); // Just 100ms delay for typing
      
      return () => clearTimeout(timer);
    }
  }, [searchTerm, fetchPosts]);

  // Create a debounced version of fetchPosts
  const debouncedFetchPosts = useMemo(() => 
    debounce((reset: boolean) => fetchPosts(reset), 300), 
    [fetchPosts]
  );

  const fetchvote_optionsForPost = useCallback(async (post: any) => {
    try {
      const response = await fetch(`${API_URL}/api/vote-options/${post.tx_id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch vote options: ${response.status}`);
      }
      
      const vote_options = await response.json();
      
      // Update the post with the vote options
      setSubmissions(prevSubmissions => 
        prevSubmissions.map(p => 
          p.id === post.id ? { ...p, vote_options: vote_options } : p
        )
      );
    } catch (error) {
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetchingMore || isFetchInProgress.current) {
      return;
    }
    
    // Important: We're setting reset=false here to append to existing posts
    fetchPosts(false);
  }, [hasMore, isFetchingMore, fetchPosts]);

  // Cleanup function for blob URLs
  const cleanupBlobUrls = useCallback((posts: ExtendedPost[]) => {
    posts.forEach(post => {
      if (post.imageUrl?.startsWith('blob:')) {
        console.log(`Revoking blob URL for post ${post.id}`);
        URL.revokeObjectURL(post.imageUrl);
        // Also remove from our map
        imageUrlMap.current.delete(post.id);
      }
    });
  }, []);

  // Add a debug effect to log when props change
  useEffect(() => {
    console.log('PostGrid props changed:', {
      time_filter,
      ranking_filter,
      personal_filter,
      block_filter,
      selected_tags: selected_tags.length > 0 ? selected_tags : 'none',
      user_id,
      searchTerm: searchTerm || 'none',
      searchType: searchType || 'all'
    });
  }, [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id, searchTerm, searchType]);

  // Effect to handle initial mount and filter changes
  useEffect(() => {
    // Set mounted flag
    isMounted.current = true;
    
    // Check if this is the first mount or if filters have changed
    const isFirstMount = !initialFetchMade.current;
    const filtersChanged = haveFiltersChanged();
    
    // Only fetch if it's the first mount or if filters have changed
    if (isFirstMount || filtersChanged) {
      initialFetchMade.current = true;
      console.log('Filters changed, triggering debounced fetch');
      console.log('Previous filters:', prevFilters.current);
      console.log('Current filters:', {
        time_filter,
        ranking_filter,
        personal_filter,
        block_filter,
        selected_tags,
        user_id,
        searchTerm,
        searchType
      });
      debouncedFetchPosts(true);
    } else {
      console.log('Filters did not change, skipping fetch');
    }
    
    // Cleanup function
    return () => {
      isMounted.current = false;
    };
  }, [debouncedFetchPosts, haveFiltersChanged, time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id, searchTerm, searchType]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      console.log('Component unmounting, cleaning up blob URLs');
      cleanupBlobUrls(submissions);
    };
  }, [submissions, cleanupBlobUrls]);

  // Empty effect to monitor state changes
  useEffect(() => {
  }, [nextCursor, hasMore, submissions.length, isFetchingMore]);

  // Set up intersection observer for infinite scrolling
  useEffect(() => {
    if (!loaderRef.current) return;

    // Check if ranking filter is active - disable infinite scrolling for top-N filters
    const isTopRankingActive = ranking_filter && ['top-1', 'top-3', 'top-10'].includes(ranking_filter);
    
    // If top ranking filter is active, don't set up the observer
    if (isTopRankingActive) {
      console.log('Top ranking filter active, disabling infinite scrolling');
      return;
    }

    const options = {
      root: null, // Use the viewport as the root
      rootMargin: '0px 0px 200px 0px', // Start loading when element is 200px from viewport
      threshold: 0.1 // Trigger when 10% of the element is visible
    };

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isFetchingMore && !isFetchInProgress.current) {
        console.log('Loader is visible, loading more posts');
        handleLoadMore();
      }
    }, options);

    observer.observe(loaderRef.current);

    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [hasMore, isFetchingMore, handleLoadMore, ranking_filter]);

  const handlevote_optionLock = async (optionId: string, amount: number, duration: number) => {
    // Check if wallet is connected
    if (!wallet) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      // Check balance - simplified approach
      toast.loading('Checking wallet balance...');
      
      setIsLocking(true);
      const response = await fetch(`${API_URL}/api/lock-likes/vote-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vote_option_id: optionId,
          amount,
          lock_duration: duration,
          author_address: user_id, // Use the user_id from props which should be the wallet address
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock BSV on vote option');
      }

      toast.success('Successfully locked BSV on vote option');
      fetchPosts(); // Refresh posts to show updated lock amounts
    } catch (error) {
      toast.error('Failed to lock BSV on vote option');
    } finally {
      setIsLocking(false);
    }
  };

  const handlePostLock = async (postId: string, amount: number, duration: number) => {
    // Simple direct logging function for this specific function
    const logLock = (msg: string, data?: any) => {
      const now = new Date().toISOString();
      const message = `[${now}] [PostGrid Lock] ${msg}`;
      console.log(message, data || '');
    };
    
    // Performance logging
    const startTime = performance.now();
    logLock(`Starting lock operation for post ${postId}`, {amount, duration});
    
    // Check if wallet is connected
    if (!wallet) {
      logLock('Wallet not connected, aborting');
      toast.error('Please connect your wallet first');
      return;
    }
    
    logLock('Wallet connected, proceeding');
    
    try {
      // Show loading toast, but don't wait for it
      const toastId = toast.loading('Checking wallet balance...');
      logLock('Checking wallet balance...');
      
      // Set locking state for UI feedback
      setIsLocking(true);
      logLock('Set isLocking to true');
      
      // Start API call timing
      const apiStartTime = performance.now();
      logLock('Starting API call to lock-likes');
      
      // Prepare request payload
      const requestPayload = {
        post_id: postId,
        amount,
        lock_duration: duration,
        author_address: user_id, // Use the user_id from props which should be the wallet address
      };
      
      logLock('API request payload', requestPayload);
      
      // Make API call
      const response = await fetch(`${API_URL}/api/lock-likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });
      
      const apiEndTime = performance.now();
      logLock(`API call completed in ${Math.round(apiEndTime - apiStartTime)}ms`);
      
      // Process response
      if (!response.ok) {
        const errorText = await response.text();
        logLock(`API error: ${response.status}`, errorText);
        throw new Error(`Failed to lock BSV on post: ${response.status} ${errorText}`);
      }
      
      const responseData = await response.json();
      logLock('API response data', responseData);
      
      // Dismiss loading toast and show success
      toast.dismiss(toastId);
      toast.success('Successfully locked BSV on post');
      
      // Refresh posts to show updated lock amounts
      logLock('Refreshing posts to show updated lock amounts');
      fetchPosts();
      
      // Log total operation time
      const endTime = performance.now();
      logLock(`Complete lock operation took ${Math.round(endTime - startTime)}ms`);
      
    } catch (error) {
      logLock('Error during lock operation', error);
      toast.error(error instanceof Error ? error.message : 'Failed to lock BSV on post');
    } finally {
      setIsLocking(false);
      logLock('Set isLocking back to false, operation complete');
    }
  };

  // Handle tag click
  const handleTagClick = useCallback((tag: string) => {
    if (onTagSelect) {
      onTagSelect(tag);
    }
  }, [onTagSelect]);

  // Fetch current block height on component mount
  useEffect(() => {
    const fetch_block_height = async () => {
      try {
        const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
        const data = await response.json();
        if (data.blocks) {
          set_current_block_height(data.blocks);
        }
      } catch (error) {
        console.error('Error fetching block height:', error);
        // Fallback to approximate BSV block height
        set_current_block_height(800000);
      }
    };

    fetch_block_height();

    // Refresh block height every 10 minutes
    const block_height_interval = setInterval(fetch_block_height, 10 * 60 * 1000);
    
    return () => {
      clearInterval(block_height_interval);
    };
  }, []);

  // Update effect to use the imported calculate_active_stats function
  useEffect(() => {
    if (submissions.length > 0) {
      const stats = calculate_active_stats(submissions, current_block_height);
      onStatsUpdate(stats);
    }
  }, [submissions, onStatsUpdate, current_block_height]);

  // Render the component
  return (
    <div className="w-full relative z-10">
      {/* Main post grid */}
      <div className="w-full">
        {/* Loading state */}
        {loading && submissions.length === 0 && (
          <div className="text-center py-10">
            <p className="text-lg">Loading posts...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-white p-6 rounded-lg mb-4 flex flex-col items-center">
            <div className="flex items-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="font-bold text-lg">Connection Error</p>
            </div>
            <p className="text-center mb-4">{error}</p>
            <button 
              onClick={() => {
                setError(null);
                fetchPosts(true);
              }}
              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-white rounded-lg transition-colors duration-200 flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && submissions.length === 0 && (
          <div className="bg-gray-700 p-8 rounded-lg text-center">
            <h3 className="text-xl font-bold mb-2">No posts found</h3>
            <p>Try changing your filters or tags</p>
          </div>
        )}

        {/* Posts grid */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {submissions.map((post) => (
              <div key={post.id} className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-xl border border-gray-800/10 shadow-lg hover:shadow-[#00ffa3]/5 transition-all duration-300">
                {/* Post header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-800/10 bg-gradient-to-r from-gray-800/20 to-transparent">
                  <div className="flex items-center">
                    <div className="flex flex-col">
                      <p className="text-gray-200 font-medium flex items-center">
                        {post.author_address ? 
                          <>
                            {post.isSearchResult && post.matchInfo?.fields.includes('author_address') ? (
                              <span className="bg-[#00ffa3]/30 text-[#00ffa3] px-2 py-0.5 rounded text-xs mr-1.5 font-bold">
                                {post.author_address.substring(0, 6)}...{post.author_address.substring(post.author_address.length - 4)}
                              </span>
                            ) : (
                              <span className="bg-[#00ffa3]/10 text-[#00ffa3] px-2 py-0.5 rounded text-xs mr-1.5">
                                {post.author_address.substring(0, 6)}...{post.author_address.substring(post.author_address.length - 4)}
                              </span>
                            )}
                          </> : 
                          <span className="text-gray-400">Anonymous</span>
                        }
                        <span className="flex items-center text-gray-400 text-xs ml-2">
                          <FiClock className="mr-1" size={12} />
                          {formatDate(post.created_at)}
                        </span>
                      </p>
                    </div>
                  </div>
                  
                  {/* WhatsonChain link */}
                  <a 
                    href={`https://whatsonchain.com/tx/${post.tx_id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={`text-gray-400 hover:text-[#00ffa3] transition-colors flex items-center text-xs ${
                      post.isSearchResult && post.matchInfo?.fields.includes('tx_id') ? 'bg-[#00ffa3]/30 text-[#00ffa3] px-2 py-1 rounded font-bold' : ''
                    }`}
                    title="View on WhatsonChain"
                  >
                    <span className="mr-1 hidden sm:inline">Transaction</span>
                    <FiExternalLink size={14} />
                  </a>
                </div>

                <div className="p-4">
                  {/* Post content - Moved before image for better visual hierarchy */}
                  {post.content && (
                    <div className="mb-4 whitespace-pre-wrap text-gray-100 leading-relaxed">
                      {post.isSearchResult && post._highlightContent ? (
                        <>
                          <p className="text-xl font-semibold mb-2 text-white">
                            {highlightSearchTerm(post.content.split('\n')[0], post.matchInfo?.query || searchTerm || '')}
                          </p>
                          {post.content.split('\n').slice(1).join('\n') && (
                            <p className="text-gray-200">
                              {highlightSearchTerm(post.content.split('\n').slice(1).join('\n'), post.matchInfo?.query || searchTerm || '')}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-semibold mb-2 text-white">{post.content.split('\n')[0]}</p>
                          {post.content.split('\n').slice(1).join('\n') && (
                            <p className="text-gray-200">{post.content.split('\n').slice(1).join('\n')}</p>
                          )}
                        </>
                      )}
                      
                      {/* Add link preview if URL is detected in content */}
                      {extractFirstUrl(post.content) && (
                        <div className="transition-all duration-300 opacity-100 mt-3">
                          <LinkPreview url={extractFirstUrl(post.content)!} />
                        </div>
                      )}
                      
                      {/* Show search match info for debugging */}
                      {post.isSearchResult && post.matchInfo && (
                        <div className="mt-2 text-xs bg-[#00ffa3]/10 text-[#00ffa3] p-1 rounded">
                          Matched in: {post.matchInfo.fields.join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Post image - Full width to align with right edge */}
                  {post.imageUrl && (
                    <div className="mb-4 w-full">
                      <div className="relative rounded-lg overflow-hidden bg-gradient-to-b from-gray-800/50 to-gray-900/70 p-1 shadow-inner">
                        <img 
                          src={post.imageUrl} 
                          alt={`Image for post ${post.id}`}
                          className="w-full h-auto object-contain max-h-[400px] rounded"
                          onError={(e) => {
                            // Try to reload the image once
                            const currentSrc = e.currentTarget.src;
                            if (!e.currentTarget.dataset.retried) {
                              e.currentTarget.dataset.retried = 'true';
                              // Add a cache-busting parameter
                              e.currentTarget.src = `${currentSrc}${currentSrc.includes('?') ? '&' : '?'}retry=${Date.now()}`;
                            } else {
                              // Hide the failed image element
                              e.currentTarget.style.display = 'none';
                              
                              // Show a fallback message
                              const fallbackEl = document.createElement('div');
                              fallbackEl.className = 'p-4 text-center text-gray-400';
                              fallbackEl.textContent = 'Image could not be loaded';
                              e.currentTarget.parentNode?.appendChild(fallbackEl);
                            }
                          }}
                          ref={(el) => {
                            if (el) {
                              imageRefs.current[post.id] = el;
                            }
                          }}
                          loading="lazy"
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Vote Options Section - Full width to align with right edge */}
                {post.is_vote && post.vote_options && post.vote_options.length > 0 && (
                  <div className="mt-4 p-4 pt-0 w-full">
                    {/* Calculate total locked amount for percentages */}
                    {(() => {
                      const totalLocked = post.vote_options.reduce((sum, option) => sum + option.lock_amount, 0);
                      
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                          {post.vote_options.map((option: vote_option) => {
                            const percentage = calculatePercentage(option.lock_amount, totalLocked);
                            // Determine color based on percentage
                            const getStatusColor = (pct: number) => {
                              if (pct >= 60) return "from-emerald-500 to-emerald-400";
                              if (pct >= 30) return "from-blue-500 to-cyan-400";
                              return "from-gray-500 to-gray-400";
                            };
                            
                            // Calculate days remaining for lock
                            const daysRemaining = option.unlock_height 
                              ? Math.max(0, Math.floor((option.unlock_height - (post.block_height || 0)) / 144)) 
                              : Math.floor(option.lock_duration / 144);
                            
                            // Determine lock status
                            const getLockStatus = () => {
                              if (!option.unlock_height) return "active";
                              if (daysRemaining <= 1) return "near-expiry";
                              if (daysRemaining <= 0) return "completed";
                              return "active";
                            };
                            
                            const lockStatus = getLockStatus();
                            
                            return (
                              <div key={option.id} className="bg-white/5 rounded-lg border border-gray-800/20 hover:border-[#00ffa3]/20 transition-all duration-300 overflow-hidden shadow-lg">
                                <div className="p-4">
                                  {/* Simplified layout with only essential elements */}
                                  <div className="flex items-center gap-4">
                                    {/* Circular progress indicator */}
                                    <div className="relative h-14 w-14 flex-shrink-0">
                                      <svg className="w-full h-full" viewBox="0 0 36 36">
                                        {/* Background circle */}
                                        <circle 
                                          cx="18" 
                                          cy="18" 
                                          r="16" 
                                          fill="none" 
                                          className="stroke-gray-700/30" 
                                          strokeWidth="2"
                                        />
                                        {/* Progress circle */}
                                        <circle 
                                          cx="18" 
                                          cy="18" 
                                          r="16" 
                                          fill="none" 
                                          className={`stroke-current text-[#00ffa3]`}
                                          strokeWidth="3"
                                          strokeDasharray={`${percentage}, 100`}
                                          strokeLinecap="round"
                                          transform="rotate(-90 18 18)"
                                        />
                                        {/* Percentage text */}
                                        <text 
                                          x="18" 
                                          y="18" 
                                          dominantBaseline="middle" 
                                          textAnchor="middle" 
                                          className="fill-white font-bold text-xs"
                                        >
                                          {percentage}%
                                        </text>
                                      </svg>
                                    </div>
                                    
                                    {/* Content area */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-base font-semibold text-white line-clamp-2 hover:line-clamp-none transition-all duration-300" title={option.content}>
                                        {post.isSearchResult && post.matchInfo?.fields.includes('vote_options.content') && option.content.toLowerCase().includes(post.matchInfo.query.toLowerCase())
                                          ? highlightSearchTerm(option.content, post.matchInfo.query)
                                          : option.content
                                        }
                                      </p>
                                    </div>
                                    
                                    {/* Lock button */}
                                    <div className="flex-shrink-0 ml-2">
                                      <VoteOptionLockInteraction 
                                        optionId={option.id} 
                                        onLock={handlevote_optionLock}
                                        isLocking={isLocking}
                                        connected={!!wallet}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
                
                {/* Post footer with BSV locked amount */}
                <div className="p-3 border-t border-gray-800/10 flex justify-between items-center bg-gradient-to-r from-transparent to-gray-800/20">
                  <div className="flex items-center space-x-2">
                    {post.is_vote && (
                      <span className="bg-purple-900/20 text-purple-400 text-xs px-2 py-0.5 rounded-full">
                        Vote
                      </span>
                    )}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex items-center space-x-1">
                        {post.tags.slice(0, 2).map(tag => (
                          <span 
                            key={tag} 
                            className={`${
                              post.isSearchResult && post.matchInfo?.fields.includes('tags') && 
                              (tag.toLowerCase() === post.matchInfo.query.toLowerCase() || 
                               tag.toLowerCase().includes(post.matchInfo.query.toLowerCase()))
                                ? 'bg-[#00ffa3]/30 text-white font-bold' 
                                : 'bg-white/5 text-gray-300'
                            } text-xs px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-white/10 transition-colors`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTagClick(tag);
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                        {post.tags.length > 2 && (
                          <span className="text-gray-400 text-xs">+{post.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {/* Lock button for simple posts */}
                    {!post.is_vote && (
                      <PostLockInteraction
                        postId={post.id}
                        onLock={handlePostLock}
                        isLocking={isLocking}
                        connected={!!wallet}
                      />
                    )}
                    
                    {/* Display locked BSV amount for all posts */}
                    <div className="text-[#00ffa3] font-medium flex items-center text-sm">
                      <FiLock className="mr-1" size={14} />
                      {(() => {
                        // Add debug logging for this specific post's lock data
                        const locksExist = !!post.lock_likes;
                        const isArray = locksExist && Array.isArray(post.lock_likes);
                        const locksCount = isArray && post.lock_likes ? post.lock_likes.length : 0;
                        console.log(`Rendering locks for post ${post.id}:`, {
                          locksExist,
                          isArray,
                          locksCount,
                          firstLock: locksCount > 0 && post.lock_likes ? JSON.stringify(post.lock_likes[0]) : null,
                          current_block_height,
                          rawData: post.lock_likes,
                          fullLockData: post.lock_likes ? JSON.stringify(post.lock_likes) : null
                        });
                        
                        // Calculate locked amount with better error handling
                        let lockedAmount = 0;
                        try {
                          lockedAmount = calculate_active_locked_amount(post.lock_likes || [], current_block_height);
                          console.log(`Calculated locked amount for post ${post.id}: ${lockedAmount}`);
                        } catch (error) {
                          console.error(`Error calculating locked amount for post ${post.id}:`, error);
                          // Fall back to manually calculating
                          if (isArray && post.lock_likes) {
                            lockedAmount = post.lock_likes.reduce((sum: number, lock: any) => {
                              console.log(`Lock amount type: ${typeof lock.amount}, value: ${lock.amount}`);
                              return sum + (typeof lock.amount === 'number' ? lock.amount : 0);
                            }, 0);
                            console.log(`Manually calculated locked amount for post ${post.id}: ${lockedAmount}`);
                          }
                        }
                        
                        return formatBSV(lockedAmount) + ' ₿';
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll loader */}
        {hasMore && submissions.length > 0 && !['top-1', 'top-3', 'top-10'].includes(ranking_filter) && (
          <div 
            ref={loaderRef} 
            className="py-4 flex justify-center"
          >
            {isFetchingMore && (
              <div className="flex items-center space-x-2">
                <FiLoader className="animate-spin text-[#00ffa3]" />
                <span className="text-gray-400">Loading more posts...</span>
              </div>
            )}
          </div>
        )}
        
        {/* Top posts indicator */}
        {['top-1', 'top-3', 'top-10'].includes(ranking_filter) && submissions.length > 0 && (
          <div className="mt-6 bg-[#00ffa3]/10 border border-[#00ffa3]/20 rounded-lg p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-[#00ffa3]">
              <FiBarChart2 className="text-[#00ffa3]" size={18} />
              <span className="font-medium">
                Showing {ranking_filter === 'top-1' ? 'the top post' : `top ${ranking_filter.split('-')[1]} posts`} by popularity
              </span>
            </div>
            <p className="text-gray-300 text-sm mt-1">
              Disable the "{ranking_filter === 'top-1' ? 'Top 1' : ranking_filter === 'top-3' ? 'Top 3' : 'Top 10'}" filter to see more posts
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Export the component wrapped with React.memo
export default React.memo(PostGrid, (prevProps, nextProps) => {
  // Custom comparison function to determine if the component should re-render
  // Return true if the props are equal (no re-render needed)
  return (
    prevProps.time_filter === nextProps.time_filter &&
    prevProps.ranking_filter === nextProps.ranking_filter &&
    prevProps.personal_filter === nextProps.personal_filter &&
    prevProps.block_filter === nextProps.block_filter &&
    prevProps.user_id === nextProps.user_id &&
    JSON.stringify(prevProps.selected_tags) === JSON.stringify(nextProps.selected_tags)
  );
});