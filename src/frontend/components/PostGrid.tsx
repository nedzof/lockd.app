import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart, FiMaximize2, FiX, FiBarChart2, FiExternalLink } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import type { Post } from '../types';
import { toast } from 'react-hot-toast';
import VoteOptionLockInteraction from './VoteOptionLockInteraction';
import { useYoursWallet } from 'yours-wallet-provider';

interface VoteOption {
  id: string;
  txid: string;
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
  txid: string;
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
  vote_options: VoteOption[];
  imageUrl?: string;
  totalLocked?: number;
  media_url?: string;
}

interface PostGridProps {
  onStatsUpdate: (stats: { totalLocked: number; participantCount: number; roundNumber: number }) => void;
  timeFilter: string;
  rankingFilter: string;
  personalFilter: string;
  blockFilter: string;
  selectedTags: string[];
  userId: string;
}

// Use environment variable for API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const PostGrid: React.FC<PostGridProps> = ({
  onStatsUpdate,
  timeFilter,
  rankingFilter,
  personalFilter,
  blockFilter,
  selectedTags,
  userId
}) => {
  const [submissions, setSubmissions] = useState<ExtendedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const seenPostIds = useRef<Set<string>>(new Set());
  // Add a ref to track if initial fetch has been made
  const initialFetchMade = useRef<boolean>(false);
  // Add a ref to track if component is mounted
  const isMounted = useRef<boolean>(false);
  // Add a ref to store previous filter values for comparison
  const prevFilters = useRef({
    timeFilter: '',
    rankingFilter: '',
    personalFilter: '',
    blockFilter: '',
    selectedTags: [] as string[],
    userId: ''
  });

  // Memoize the filter values for comparison
  const currentFilters = useMemo(() => ({
    timeFilter,
    rankingFilter,
    personalFilter,
    blockFilter,
    selectedTags,
    userId
  }), [timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, userId]);

  // Function to check if filters have changed
  const haveFiltersChanged = useCallback(() => {
    const prev = prevFilters.current;
    return (
      prev.timeFilter !== currentFilters.timeFilter ||
      prev.rankingFilter !== currentFilters.rankingFilter ||
      prev.personalFilter !== currentFilters.personalFilter ||
      prev.blockFilter !== currentFilters.blockFilter ||
      prev.userId !== currentFilters.userId ||
      JSON.stringify(prev.selectedTags) !== JSON.stringify(currentFilters.selectedTags)
    );
  }, [currentFilters]);

  const fetchPosts = useCallback(async (reset = true) => {
    if (!isMounted.current) {
      console.log('VALIDATION: Component not mounted, skipping fetch');
      return;
    }

    if (reset) {
      setIsLoading(true);
      setError(null);
      setNextCursor(null); // Reset cursor when fetching from the beginning
      // Clear the set of seen post IDs when resetting
      seenPostIds.current = new Set();
      console.log('VALIDATION: Resetting cursor and fetching initial posts');
    } else {
      setIsFetchingMore(true);
      console.log('VALIDATION: Fetching more posts with cursor:', nextCursor);
    }
    
    try {
      const queryParams = new URLSearchParams();
      
      if (timeFilter) queryParams.append('timeFilter', timeFilter);
      if (rankingFilter) {
        // Map rankingFilter values to valid backend values
        let validRankingFilter;
        switch (rankingFilter) {
          case 'top1':
            validRankingFilter = 'top-1';
            break;
          case 'top3':
            validRankingFilter = 'top-3';
            break;
          case 'top10':
            validRankingFilter = 'top-10';
            break;
          default:
            validRankingFilter = rankingFilter;
        }
        queryParams.append('rankingFilter', validRankingFilter);
      }
      if (personalFilter) queryParams.append('personalFilter', personalFilter);
      if (blockFilter) queryParams.append('blockFilter', blockFilter);
      if (selectedTags && selectedTags.length > 0) queryParams.append('selectedTags', JSON.stringify(selectedTags));
      if (userId) queryParams.append('userId', userId);
      
      // Add pagination parameters
      queryParams.append('limit', '10'); // Fetch 10 posts at a time
      if (!reset && nextCursor) {
        queryParams.append('cursor', nextCursor);
        console.log('VALIDATION: Adding cursor to request:', nextCursor);
      }

      console.log('VALIDATION: Fetching posts with params:', queryParams.toString());
      console.log('VALIDATION: API URL:', `${API_URL}/api/posts?${queryParams.toString()}`);
      
      const response = await fetch(`${API_URL}/api/posts?${queryParams.toString()}`);
      console.log('VALIDATION: Response status:', response.status);
      
      if (!response.ok) {
        console.error('VALIDATION: API Error:', response.status, response.statusText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('VALIDATION: API response full data:', data);
      
      console.log('VALIDATION: API response:', {
        postsCount: data.posts.length,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
        postIds: data.posts.map((post: any) => post.id)
      });
      
      // Process posts to ensure they have the vote_options property
      const processedPosts = data.posts.map((post: any) => {
        // For vote posts, ensure vote_options is populated
        if ((post.is_vote || post.content_type === 'vote') && (!post.vote_options || post.vote_options.length === 0)) {
          // Fetch vote options for this post
          fetchVoteOptionsForPost(post);
        }
        return post;
      });
      
      // Filter out any posts we've already seen to prevent duplicates
      const uniqueNewPosts = processedPosts.filter((post: ExtendedPost) => !seenPostIds.current.has(post.id));
      
      // Add new post IDs to the seen set
      uniqueNewPosts.forEach((post: ExtendedPost) => {
        seenPostIds.current.add(post.id);
      });
      
      console.log('VALIDATION: Filtered for unique posts:', {
        originalCount: processedPosts.length,
        uniqueCount: uniqueNewPosts.length,
        duplicatesRemoved: processedPosts.length - uniqueNewPosts.length
      });
      
      // Process posts and their images
      const processedPostsImages = await Promise.all(uniqueNewPosts.map(async (post: ExtendedPost) => {
        let imageUrl = null;
        
        // First check for media_url
        if (post.media_url) {
          imageUrl = post.media_url;
        } 
        // Then check for raw_image_data
        else if (post.raw_image_data) {
          try {
            // Debug: Check the format of raw_image_data
            console.log('Raw image data format check:', {
              postId: post.id,
              dataLength: post.raw_image_data.length,
              firstChars: typeof post.raw_image_data === 'string' ? post.raw_image_data.substring(0, 30) : 'Not a string',
              type: typeof post.raw_image_data
            });
            
            // Convert raw_image_data to string if it's not already a string
            const rawImageDataStr = typeof post.raw_image_data === 'string' 
              ? post.raw_image_data 
              : JSON.stringify(post.raw_image_data);
            
            // Create a data URL directly
            const mediaType = post.media_type || 'image/jpeg';
            imageUrl = `data:${mediaType};base64,${rawImageDataStr}`;
            
            // Log the created URL
            console.log('Created image URL:', {
              postId: post.id,
              urlLength: imageUrl.length,
              urlStart: imageUrl.substring(0, 50)
            });
          } catch (e) {
            console.error('Failed to process raw image data for post:', post.id, e);
          }
        }

        // Calculate total locked amount
        const totalLocked = post.is_vote 
          ? post.vote_options?.reduce((sum, option) => sum + (option.lock_amount || 0), 0) || 0
          : 0;

        return {
          ...post,
          imageUrl,
          totalLocked
        };
      }));
      
      // VALIDATION: Log the processed posts before updating state
      console.log('VALIDATION: Processed posts before state update:', {
        count: processedPostsImages.length,
        postIds: processedPostsImages.map(post => post.id)
      });
      
      // VALIDATION: Log the current state before updating
      console.log('VALIDATION: Current submissions before update:', {
        count: submissions.length,
        postIds: submissions.map(post => post.id)
      });
      
      // Update submissions state
      if (reset) {
        setSubmissions(processedPostsImages);
        console.log('VALIDATION: Reset submissions with new posts');
      } else {
        // Simply append the new unique posts to the existing ones
        setSubmissions(prev => [...prev, ...processedPostsImages]);
        console.log('VALIDATION: Added new unique posts to submissions');
      }
      
      // Update stats
      if (data.stats) {
        onStatsUpdate(data.stats);
      }

      // Update pagination state
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      
      console.log('Updated submissions:', {
        count: processedPostsImages.length,
        totalCount: reset ? processedPostsImages.length : submissions.length + processedPostsImages.length,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore
      });
    } catch (err) {
      console.error('Error fetching posts:', err);
      
      // Add more detailed error logging
      if (err instanceof Error) {
        console.error('Error details:', {
          message: err.message,
          name: err.name,
          stack: err.stack
        });
      }
      
      // Check for network errors
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError('Failed to fetch posts. Please try again later.');
      }
    } finally {
      if (reset) {
        setIsLoading(false);
      } else {
        setIsFetchingMore(false);
      }
      
      // Update previous filters after fetch completes
      prevFilters.current = { ...currentFilters };
    }
  }, [currentFilters, nextCursor, onStatsUpdate]);

  const fetchVoteOptionsForPost = async (post: any) => {
    try {
      console.log(`[Frontend] Fetching vote options for post: ${post.txid}`);
      const response = await fetch(`${API_URL}/api/votes/${post.txid}/options`);
      
      if (!response.ok) {
        console.log(`[Frontend] Failed to fetch vote options for post: ${post.txid}, status: ${response.status}`);
        
        // Handle specific HTTP error codes
        if (response.status === 404) {
          console.log(`[Frontend] Vote options not found for post: ${post.txid}`);
          return;
        } else if (response.status >= 500) {
          console.log(`[Frontend] Server error when fetching vote options for post: ${post.txid}`);
          return;
        }
        
        return;
      }
      
      const voteOptions = await response.json();
      console.log(`[Frontend] Vote options for post ${post.txid}:`, voteOptions);
      
      // Update the post with vote options
      setSubmissions(prevPosts => 
        prevPosts.map(p => 
          p.txid === post.txid 
            ? { ...p, vote_options: voteOptions } 
            : p
        )
      );
    } catch (error) {
      console.error(`Error fetching vote options for post ${post.txid}:`, error);
    }
  };

  const loadMore = useCallback(() => {
    console.log('Load more button clicked');
    console.log('Current pagination state:', {
      nextCursor,
      hasMore,
      isFetchingMore,
      currentPostCount: submissions.length,
      seenPostIds: seenPostIds.current.size
    });
    
    if (!hasMore || isFetchingMore) {
      console.log('Cannot load more: hasMore =', hasMore, 'isFetchingMore =', isFetchingMore);
      return;
    }
    
    // Important: We're setting reset=false here to append to existing posts
    fetchPosts(false);
  }, [hasMore, isFetchingMore, nextCursor, fetchPosts]);

  // Effect to handle initial mount and filter changes
  useEffect(() => {
    // Set mounted flag
    isMounted.current = true;
    
    // Check if this is the first mount or if filters have changed
    const isFirstMount = !initialFetchMade.current;
    const filtersChanged = haveFiltersChanged();
    
    console.log('PostGrid effect triggered:', { 
      isFirstMount, 
      filtersChanged,
      currentFilters
    });
    
    // Only fetch if it's the first mount or filters have changed
    if (isFirstMount || filtersChanged) {
      console.log('Fetching posts due to mount or filter change');
      initialFetchMade.current = true;
      fetchPosts(true);
    } else {
      console.log('Skipping fetch - no filter changes detected');
    }
    
    // Cleanup function
    return () => {
      console.log('PostGrid component unmounting');
      isMounted.current = false;
    };
  }, [fetchPosts, haveFiltersChanged, currentFilters]);

  useEffect(() => {
    console.log('Pagination state updated:', {
      nextCursor,
      hasMore,
      submissionsCount: submissions.length,
      isFetchingMore
    });
  }, [nextCursor, hasMore, submissions.length, isFetchingMore]);

  useEffect(() => {
    return () => {
      submissions.forEach(post => {
        if (post.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(post.imageUrl);
        }
      });
    };
  }, [submissions]);

  const handleVoteOptionLock = async (optionId: string, amount: number, duration: number) => {
    if (!wallet.connected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (wallet.balance < amount) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      setIsLocking(true);
      const response = await fetch(`${API_URL}/api/lock-likes/vote-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vote_option_id: optionId,
          amount,
          duration,
          author_address: wallet.address,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock BSV on vote option');
      }

      toast.success('Successfully locked BSV on vote option');
      fetchPosts(); // Refresh posts to show updated lock amounts
    } catch (error) {
      console.error('Error locking BSV on vote option:', error);
      toast.error('Failed to lock BSV on vote option');
    } finally {
      setIsLocking(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#00ffa3]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center space-y-4 min-h-[400px]">
        <p className="text-red-500">{error}</p>
        <button 
          onClick={fetchPosts}
          className="px-4 py-2 text-[#00ffa3] border border-[#00ffa3] rounded-lg hover:bg-[#00ffa3] hover:text-black transition-all duration-300"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4">
      {/* Debug info */}
      <div className="bg-gray-800 text-white p-2 mb-4 rounded text-xs" style={{ display: 'block' }}>
        <p>Debug Info:</p>
        <p>Posts Count: {submissions.length}</p>
        <p>Loading: {isLoading ? 'true' : 'false'}</p>
        <p>Error: {error ? error : 'none'}</p>
        <p>Has More: {hasMore ? 'true' : 'false'}</p>
        <p>Next Cursor: {nextCursor || 'null'}</p>
        <p>Filters: {JSON.stringify({timeFilter, rankingFilter, personalFilter, blockFilter})}</p>
        <p>Selected Tags: {selectedTags.join(', ') || 'none'}</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-[#00ffa3]"></div>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center space-y-4 min-h-[400px]">
        <p className="text-red-500">{error}</p>
        <button
          onClick={fetchPosts}
          className="px-4 py-2 text-[#00ffa3] border border-[#00ffa3] rounded-lg hover:bg-[#00ffa3] hover:text-black transition-all duration-300"
        >
          Try Again
        </button>
      </div>
      )}

      {!isLoading && !error && (
        <div className="grid grid-cols-1 gap-6 p-6">
          {submissions.map((post) => (
            <div key={post.id} className="bg-[#1A1B23] rounded-xl shadow-lg overflow-hidden max-w-2xl mx-auto w-full transition-all duration-200 hover:shadow-xl hover:bg-[#1E1F29]">
              {/* Image Container - Only show if image exists */}
              {post.imageUrl && (
                <div className="w-full">
                  <div className="relative bg-black w-full">
                    <img
                      src={post.imageUrl}
                      alt={post.description || 'Post image'}
                      className="w-full object-cover"
                      onClick={() => setExpandedImage(post.imageUrl!)}
                      ref={(el) => {
                        if (el) imageRefs.current[post.id] = el;
                      }}
                      onLoad={() => {
                        console.log(`Image loaded for post ${post.id}`);
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="p-6 w-full">
                <div className="flex flex-col space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400 font-mono">
                      {/* Author address removed */}
                    </span>
                    <a
                      href={`https://whatsonchain.com/tx/${post.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 flex items-center hover:text-[#00ffa3] transition-colors"
                    >
                      <FiExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                
                <p className="text-white mb-4 font-light">{post.content}</p>
                
                {/* Total Locked Display */}
                <div className="flex justify-end items-center mb-4">
                  <span className="text-sm font-medium text-[#00ffa3]">
                    {formatBSV(post.totalLocked || 0)} BSV locked
                  </span>
                </div>

                {/* Vote Options - Only show if post is a vote */}
                {post.is_vote && post.vote_options.length > 0 && (
                  <div className="space-y-3 mt-4">
                    {post.vote_options.map((option) => {
                      const totalLocked = post.vote_options.reduce((sum, opt) => sum + (opt.lock_amount || 0), 0);
                      const percentage = totalLocked > 0 ? ((option.lock_amount || 0) / totalLocked) * 100 : 0;
                      
                      return (
                        <div 
                          key={option.id} 
                          className="relative border-b border-gray-700/20 p-3 mb-2 transition-all duration-200 overflow-hidden"
                        >
                          {/* Background progress bar */}
                          <div 
                            className="absolute inset-0 bg-[#00ffa3]/10 z-0" 
                            style={{ width: `${percentage}%` }}
                          />
                          
                          <div className="flex items-center justify-between relative z-10">
                            <span className="text-white font-light flex-grow">{option.content}</span>
                            
                            {/* Lock BSV button */}
                            <button
                              onClick={() => handleVoteOptionLock(option.id, 1, 1)}
                              disabled={!wallet.connected}
                              className={`text-xs border rounded-md px-3 py-1 transition-all flex items-center ${
                                wallet.connected 
                                  ? 'text-[#00ffa3] border-[#00ffa3] hover:bg-[#00ffa320]' 
                                  : 'text-gray-500 border-gray-500 cursor-not-allowed'
                              }`}
                            >
                              <FiLock className="mr-1 w-3 h-3" /> Lock BSV
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Load more button */}
          {hasMore && (
            <button 
              onClick={loadMore}
              className="w-full mt-6 px-4 py-2 text-[#00ffa3] border border-[#00ffa3] rounded-lg hover:bg-[#00ffa3] hover:text-black transition-all duration-300 flex items-center justify-center"
            >
              {isFetchingMore ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-[#00ffa3]"></div>
              ) : (
                'Load More Posts'
              )}
            </button>
          )}

          {/* Image Modal */}
          {expandedImage && (
            <div
              className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 backdrop-blur-sm"
              onClick={() => setExpandedImage(null)}
            >
              <button 
                className="absolute top-4 right-4 text-white p-2 rounded-full bg-black bg-opacity-50 hover:bg-opacity-70 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedImage(null);
                }}
              >
                <FiX className="w-5 h-5" />
              </button>
              <img
                src={expandedImage}
                alt="Expanded view"
                className="max-w-[90vw] max-h-[90vh] object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Export the component wrapped with React.memo
export default React.memo(PostGrid, (prevProps, nextProps) => {
  // Custom comparison function to determine if the component should re-render
  // Return true if the props are equal (no re-render needed)
  return (
    prevProps.timeFilter === nextProps.timeFilter &&
    prevProps.rankingFilter === nextProps.rankingFilter &&
    prevProps.personalFilter === nextProps.personalFilter &&
    prevProps.blockFilter === nextProps.blockFilter &&
    prevProps.userId === nextProps.userId &&
    JSON.stringify(prevProps.selectedTags) === JSON.stringify(nextProps.selectedTags)
  );
});