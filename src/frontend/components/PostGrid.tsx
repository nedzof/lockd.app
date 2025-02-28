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

// Use environment variable for API URL or default to localhost:3003
const API_URL = 'http://localhost:3003';
console.log('VALIDATION: Using API URL:', API_URL);

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
      setLoading(true);
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
      
      // Add cursor if available
      if (nextCursor && !reset) {
        queryParams.append('cursor', nextCursor);
      }
      
      // Add limit
      queryParams.append('limit', '10');
      
      // Add filters
      if (timeFilter) queryParams.append('timeFilter', timeFilter);
      if (rankingFilter) queryParams.append('rankingFilter', rankingFilter);
      if (personalFilter) queryParams.append('personalFilter', personalFilter);
      if (blockFilter) queryParams.append('blockFilter', blockFilter);
      
      // Add tags if selected
      if (selectedTags.length > 0) {
        selectedTags.forEach(tag => {
          queryParams.append('tags', tag);
        });
      }
      
      // Add userId if available
      if (userId) {
        queryParams.append('userId', userId);
      }
      
      console.log('VALIDATION: Query parameters:', queryParams.toString());
      
      const response = await fetch(`${API_URL}/api/posts?${queryParams.toString()}`);
      console.log('VALIDATION: Response status:', response.status);
      
      if (!response.ok) {
        console.error('VALIDATION: API Error:', response.status, response.statusText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('VALIDATION: Raw API response:', JSON.stringify(data).substring(0, 200) + '...');
      console.log('VALIDATION: Posts array type:', Array.isArray(data.posts) ? 'Array' : typeof data.posts);
      console.log('VALIDATION: Posts array length:', data.posts ? data.posts.length : 'undefined');
      
      if (!data.posts || !Array.isArray(data.posts)) {
        console.error('VALIDATION: Invalid posts data structure:', data);
        throw new Error('Invalid API response format - posts array missing');
      }
      
      console.log('VALIDATION: API response full data:', data);
      
      console.log('VALIDATION: API response:', {
        postsCount: data.posts.length,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
        postIds: data.posts.map((post: any) => post.id)
      });
      
      // Log the content of the first post for debugging
      if (data.posts.length > 0) {
        console.log('VALIDATION: First post content:', {
          id: data.posts[0].id,
          content: data.posts[0].content,
          contentLength: data.posts[0].content ? data.posts[0].content.length : 0,
          isVote: data.posts[0].is_vote,
          hasVoteOptions: data.posts[0].vote_options && data.posts[0].vote_options.length > 0
        });
      }
      
      // Process posts to add image URLs and other derived data
      const processedPosts = data.posts.map((post: any) => {
        console.log('VALIDATION: Processing post:', post.id);
        
        // Process image data if available
        if (post.raw_image_data) {
          try {
            // Create a blob URL for the image data
            const blob = new Blob([Buffer.from(post.raw_image_data, 'base64')], { type: post.media_type || 'image/jpeg' });
            post.imageUrl = URL.createObjectURL(blob);
            console.log('VALIDATION: Created image URL for post:', post.id);
          } catch (error) {
            console.error('VALIDATION: Error creating image URL for post:', post.id, error);
          }
        } else if (post.media_url) {
          post.imageUrl = post.media_url;
          console.log('VALIDATION: Using media_url for post:', post.id);
        }
        
        // For vote posts, fetch vote options if they're not already included
        if (post.is_vote && (!post.vote_options || post.vote_options.length === 0)) {
          console.log('VALIDATION: Post is a vote, fetching vote options:', post.id);
          // We'll fetch vote options after setting state
          setTimeout(() => fetchVoteOptionsForPost(post), 0);
        }
        
        return post;
      });
      
      console.log('VALIDATION: Processed posts:', processedPosts.length);
      if (processedPosts.length > 0) {
        console.log('VALIDATION: First processed post:', {
          id: processedPosts[0].id,
          hasImageUrl: !!processedPosts[0].imageUrl,
          content: processedPosts[0].content?.substring(0, 30)
        });
      }
      
      // Filter out duplicates using the seen post IDs
      const uniqueNewPosts = processedPosts.filter((post: any) => {
        if (seenPostIds.current.has(post.id)) {
          console.log('VALIDATION: Filtering out duplicate post:', post.id);
          return false;
        }
        seenPostIds.current.add(post.id);
        return true;
      });
      
      // Update submissions state
      console.log('VALIDATION: Current submissions before update:', {
        count: submissions.length,
        ids: submissions.map(post => post.id)
      });
      
      if (reset) {
        console.log('VALIDATION: Reset submissions with new posts - count:', uniqueNewPosts.length);
        if (uniqueNewPosts.length > 0) {
          console.log('VALIDATION: First post ID:', uniqueNewPosts[0].id);
          console.log('VALIDATION: First post content:', uniqueNewPosts[0].content?.substring(0, 30));
        }
        setSubmissions([...uniqueNewPosts]); // Create a new array to ensure state update
      } else {
        console.log('VALIDATION: Added new unique posts to submissions');
        setSubmissions(prevSubmissions => [...prevSubmissions, ...uniqueNewPosts]);
      }
      
      // Debug check to ensure submissions state is updated correctly
      setTimeout(() => {
        console.log('VALIDATION: Submissions state after update:', {
          count: submissions.length,
          ids: submissions.map(post => post.id)
        });
      }, 100);
      
      // Update pagination state
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      
      // Call onStatsUpdate if provided
      if (onStatsUpdate && data.stats) {
        onStatsUpdate(data.stats);
      }
      
      console.log('Updated submissions:', {
        count: uniqueNewPosts.length,
        hasMore: data.hasMore,
        nextCursor: data.nextCursor
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
        setLoading(false);
      } else {
        setIsFetchingMore(false);
      }
      
      // Update previous filters after fetch completes
      prevFilters.current = { ...currentFilters };
    }
  }, [currentFilters, nextCursor, onStatsUpdate]);

  const fetchVoteOptionsForPost = useCallback(async (post: any) => {
    try {
      console.log(`Fetching vote options for post ${post.id} with txid ${post.txid}`);
      const response = await fetch(`${API_URL}/api/vote-options/${post.txid}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch vote options: ${response.status}`);
      }
      
      const voteOptions = await response.json();
      console.log(`Retrieved ${voteOptions.length} vote options for post ${post.id}`, voteOptions);
      
      // Update the post with the vote options
      setSubmissions(prevSubmissions => 
        prevSubmissions.map(p => 
          p.id === post.id ? { ...p, vote_options: voteOptions } : p
        )
      );
    } catch (error) {
      console.error(`Error fetching vote options for post ${post.id}:`, error);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
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
  }, [fetchPosts, haveFiltersChanged, currentFilters, fetchVoteOptionsForPost]);

  // Add a separate effect to force an initial fetch when the component mounts
  useEffect(() => {
    console.log('VALIDATION: Initial mount effect - forcing fetch');
    fetchPosts(true);
    // This effect should only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          lock_duration: duration,
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

  // Render the component
  return (
    <div className="w-full">
      {/* Debug info */}
      <div className="bg-gray-800 p-4 mb-4 rounded-lg text-sm">
        <h3 className="font-bold">Debug info:</h3>
        <p>Posts Count: {submissions.length}</p>
        <p>Loading: {loading.toString()}</p>
        <p>Error: {error || 'none'}</p>
        <p>Has More: {hasMore.toString()}</p>
        <p>Next Cursor: {nextCursor || 'none'}</p>
        <p>Filters: {JSON.stringify(currentFilters)}</p>
        <p>Selected Tags: {selectedTags.length > 0 ? selectedTags.join(', ') : 'none'}</p>
        <p>First Post ID: {submissions.length > 0 ? submissions[0].id : 'none'}</p>
        
        {/* Post details */}
        {submissions.length > 0 && (
          <div className="mt-2 border-t border-gray-700 pt-2">
            <p className="font-bold">First Post Details:</p>
            <pre className="bg-gray-900 p-2 rounded mt-1 overflow-auto text-xs" style={{ maxHeight: '200px' }}>
              {JSON.stringify(submissions[0], null, 2)}
            </pre>
          </div>
        )}
      </div>

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
          <div className="bg-red-500 text-white p-4 rounded-lg mb-4">
            <p className="font-bold">Error loading posts:</p>
            <p>{error}</p>
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
          <div className="grid grid-cols-1 gap-6">
            {submissions.map((post) => (
              <div key={post.id} className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-xl border border-gray-800/10 shadow-lg hover:shadow-[#00ffa3]/5 transition-all duration-300">
                <div className="flex items-center p-4 border-b border-gray-800/10">
                  <div className="w-10 h-10 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-full flex items-center justify-center text-gray-900 font-bold">
                    {post.author_address ? post.author_address.substring(0, 2).toUpperCase() : "?"}
                  </div>
                  <div className="ml-3">
                    <p className="text-gray-200 font-medium">
                      {post.author_address ? 
                        `${post.author_address.substring(0, 6)}...${post.author_address.substring(post.author_address.length - 4)}` : 
                        "Anonymous"}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {new Date(post.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="p-4">
                  {/* Post content */}
                  {post.content && (
                    <div className="mb-4 whitespace-pre-wrap text-gray-100 leading-relaxed">
                      {post.content}
                    </div>
                  )}
                  
                  {/* Post image */}
                  {post.imageUrl && (
                    <div className="mb-4">
                      <div className="relative rounded-lg overflow-hidden bg-gray-900/30">
                        <img 
                          src={post.imageUrl} 
                          alt="Post image" 
                          className="w-full h-auto object-contain max-h-[500px]"
                          onError={(e) => {
                            console.error('Image failed to load:', post.imageUrl);
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Tags Section */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {post.tags.map(tag => (
                        <span key={tag} className="bg-white/5 text-gray-300 text-xs px-2.5 py-1 rounded-md">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Vote Options Section */}
                {post.is_vote && post.vote_options && post.vote_options.length > 0 && (
                  <div className="mt-2 p-4 pt-0">
                    <h3 className="font-bold text-lg mb-3 text-gray-200 flex items-center">
                      <FiBarChart2 className="mr-2" /> Vote Options
                    </h3>
                    <div className="space-y-3">
                      {post.vote_options.map((option: VoteOption) => (
                        <div key={option.id} className="bg-white/5 p-4 rounded-lg border border-gray-800/20 hover:border-[#00ffa3]/20 transition-colors">
                          <p className="font-medium text-white">{option.content}</p>
                          <div className="mt-2 flex items-center justify-between text-sm text-gray-400">
                            <span className="flex items-center">
                              <FiLock className="mr-1" /> {formatBSV(option.lock_amount)} BSV
                            </span>
                            <span className="flex items-center">
                              <FiZap className="mr-1" /> {option.lock_duration} days
                            </span>
                          </div>
                          <div className="mt-3">
                            <VoteOptionLockInteraction 
                              optionId={option.id} 
                              onLock={handleVoteOptionLock}
                              isLocking={isLocking}
                              connected={wallet.connected}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load more button */}
        {hasMore && submissions.length > 0 && (
          <div className="mt-6 text-center">
            <button
              onClick={handleLoadMore}
              disabled={isFetchingMore}
              className="px-6 py-3 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 transform hover:scale-105 text-gray-900 flex items-center mx-auto disabled:opacity-50"
            >
              {isFetchingMore ? (
                <>
                  <FiLoader className="animate-spin mr-2" />
                  Loading...
                </>
              ) : (
                <>
                  <FiPlus className="mr-2" />
                  Load More Posts
                </>
              )}
            </button>
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
    prevProps.timeFilter === nextProps.timeFilter &&
    prevProps.rankingFilter === nextProps.rankingFilter &&
    prevProps.personalFilter === nextProps.personalFilter &&
    prevProps.blockFilter === nextProps.blockFilter &&
    prevProps.userId === nextProps.userId &&
    JSON.stringify(prevProps.selectedTags) === JSON.stringify(nextProps.selectedTags)
  );
});