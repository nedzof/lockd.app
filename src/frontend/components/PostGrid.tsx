import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart, FiMaximize2, FiX, FiBarChart2, FiExternalLink, FiClock } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import type { Post } from '../types';
import { toast } from 'react-hot-toast';
import VoteOptionLockInteraction from './VoteOptionLockInteraction';
import PostLockInteraction from './PostLockInteraction';
import { useYoursWallet } from 'yours-wallet-provider';
import { API_URL } from '../config';

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

const PostGrid: React.FC<PostGridProps> = ({
  onStatsUpdate,
  time_filter,
  ranking_filter,
  personal_filter,
  block_filter,
  selected_tags,
  user_id,
  onTagSelect
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
    user_id: ''
  });
  // Add a ref for the intersection observer loader element
  const loaderRef = useRef<HTMLDivElement>(null);

  // Memoize current filters to avoid unnecessary re-renders
  const currentFilters = useMemo(() => ({
    time_filter,
    ranking_filter,
    personal_filter,
    block_filter,
    selected_tags,
    user_id
  }), [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id]);

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
      !areTagsEqual()
    );
  }, [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id]);

  const fetchPosts = useCallback(async (reset = true) => {
    if (!isMounted.current) {
      return;
    }

    // Prevent concurrent fetches
    if (isFetchInProgress.current) {
      console.log('Fetch already in progress, skipping this request');
      return;
    }

    isFetchInProgress.current = true;

    // Don't set loading state immediately to prevent UI flicker
    // Only set loading state if we don't have any posts yet
    if (reset && submissions.length === 0) {
      setLoading(true);
    }
    
    // Don't clear error state immediately
    if (reset) {
      setNextCursor(null); // Reset cursor when fetching from the beginning
      // We'll clear the seen post IDs only after successful fetch
    } else {
      setIsFetchingMore(true);
    }
    
    try {
      const queryParams = new URLSearchParams();
      
      // Add cursor if available
      if (nextCursor && !reset) {
        queryParams.append('cursor', nextCursor);
      }
      
      // Add limit
      queryParams.append('limit', '10');
      
      // Add filters - log each filter as it's added
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
      
      console.log(`Fetching posts with params: ${queryParams.toString()}`);
      
      // Add timeout and retry logic for fetch
      let retryCount = 0;
      const maxRetries = 2;
      let response;
      
      while (retryCount <= maxRetries) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          response = await fetch(`${API_URL}/api/posts?${queryParams.toString()}`, {
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
      prevFilters.current = { ...currentFilters };
      
      // Reset the fetch in progress flag
      isFetchInProgress.current = false;
    }
  }, [currentFilters, nextCursor, onStatsUpdate, submissions]);

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
        user_id
      });
      debouncedFetchPosts(true);
    } else {
      console.log('Filters did not change, skipping fetch');
    }
    
    // Cleanup function
    return () => {
      isMounted.current = false;
    };
  }, [debouncedFetchPosts, haveFiltersChanged, time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id]);

  // Add a debug effect to log when props change
  useEffect(() => {
    console.log('PostGrid props changed:', {
      time_filter,
      ranking_filter,
      personal_filter,
      block_filter,
      selected_tags: selected_tags.length > 0 ? selected_tags : 'none',
      user_id
    });
  }, [time_filter, ranking_filter, personal_filter, block_filter, selected_tags, user_id]);

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
  }, [hasMore, isFetchingMore, handleLoadMore]);

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
    // Check if wallet is connected
    if (!wallet) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      toast.loading('Checking wallet balance...');
      
      setIsLocking(true);
      const response = await fetch(`${API_URL}/api/lock-likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: postId,
          amount,
          lock_duration: duration,
          author_address: user_id, // Use the user_id from props which should be the wallet address
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock BSV on post');
      }

      toast.success('Successfully locked BSV on post');
      fetchPosts(); // Refresh posts to show updated lock amounts
    } catch (error) {
      toast.error('Failed to lock BSV on post');
    } finally {
      setIsLocking(false);
    }
  };

  // Handle tag click
  const handleTagClick = useCallback((tag: string) => {
    if (onTagSelect) {
      onTagSelect(tag);
    }
  }, [onTagSelect]);

  // Render the component
  return (
    <div className="w-full">
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
                            <span className="bg-[#00ffa3]/10 text-[#00ffa3] px-2 py-0.5 rounded text-xs mr-1.5">
                              {post.author_address.substring(0, 6)}...{post.author_address.substring(post.author_address.length - 4)}
                            </span>
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
                    className="text-gray-400 hover:text-[#00ffa3] transition-colors flex items-center text-xs"
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
                      <p className="text-xl font-semibold mb-2 text-white">{post.content.split('\n')[0]}</p>
                      {post.content.split('\n').slice(1).join('\n') && (
                        <p className="text-gray-200">{post.content.split('\n').slice(1).join('\n')}</p>
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
                                        {option.content}
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
                            className="bg-white/5 text-gray-300 text-xs px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-white/10 transition-colors"
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
                      {formatBSV(post.totalLocked || 0)} ₿
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll loader */}
        {hasMore && submissions.length > 0 && (
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