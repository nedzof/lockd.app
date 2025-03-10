import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiLoader, FiPlus, FiExternalLink, FiLock, FiClock } from 'react-icons/fi';
import type { ExtendedPost, PostStats } from '../types/post';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3003';

interface PostGridProps {
  onStatsUpdate?: (stats: PostStats) => void;
  time_filter?: string;
  ranking_filter?: string;
  personal_filter?: string;
  block_filter?: string;
  selected_tags: string[];
  user_id?: string;
}

const PostGrid: React.FC<PostGridProps> = ({
  onStatsUpdate,
  time_filter,
  ranking_filter,
  personal_filter,
  block_filter,
  selected_tags,
  user_id
}) => {
  const [submissions, setSubmissions] = useState<ExtendedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const isMounted = useRef<boolean>(false);
  const isInitialMount = useRef<boolean>(true);
  const imageUrlMap = useRef<Map<string, string>>(new Map());
  const seenpost_ids = useRef<Set<string>>(new Set());
  const prevFilters = useRef({
    time_filter: '' as string | undefined,
    ranking_filter: '' as string | undefined,
    personal_filter: '' as string | undefined,
    block_filter: '' as string | undefined,
    selected_tags: [] as string[],
    user_id: '' as string | undefined
  });

  // Cleanup function for image URLs
  const cleanupImageUrls = useCallback(() => {
    imageUrlMap.current.forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    imageUrlMap.current.clear();
  }, []);

  // Create image URL from raw data
  const createImageUrl = useCallback((post: ExtendedPost) => {
    if (!post.raw_image_data || imageUrlMap.current.has(post.id)) {
      return post;
    }

    try {
      const blob = new Blob(
        [Buffer.from(post.raw_image_data, 'base64')],
        { type: post.media_type || 'image/jpeg' }
      );
      const imageUrl = URL.createObjectURL(blob);
      imageUrlMap.current.set(post.id, imageUrl);
      return { ...post, imageUrl };
    } catch (error) {
      console.error('Error creating image URL:', error);
      return post;
    }
  }, []);

  // Memoize the filter values for comparison
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
    const prev = prevFilters.current;
    const hasChanged = (
      prev.time_filter !== currentFilters.time_filter ||
      prev.ranking_filter !== currentFilters.ranking_filter ||
      prev.personal_filter !== currentFilters.personal_filter ||
      prev.block_filter !== currentFilters.block_filter ||
      prev.user_id !== currentFilters.user_id ||
      JSON.stringify(prev.selected_tags) !== JSON.stringify(currentFilters.selected_tags)
    );
    
    if (hasChanged) {
      console.log('Filters changed from:', prev, 'to:', currentFilters);
    }
    
    return hasChanged;
  }, [currentFilters]);

  const fetchPosts = useCallback(async (reset = true, retryCount = 0) => {
    if (!isMounted.current) {
      console.log('Component not mounted, skipping fetch');
      return;
    }

    if (reset) {
      console.log('Resetting posts state');
      setLoading(true);
      setError(null);
      setNextCursor(null);
      seenpost_ids.current.clear();
      cleanupImageUrls();
    } else {
      setIsFetchingMore(true);
    }
    
    try {
      const queryParams = new URLSearchParams();
      if (nextCursor && !reset) queryParams.append('cursor', nextCursor);
      queryParams.append('limit', '10');
      
      // Always send tags parameter, even if empty
      queryParams.append('selected_tags', JSON.stringify(selected_tags || []));
      
      if (time_filter) queryParams.append('time_filter', time_filter);
      if (ranking_filter) queryParams.append('ranking_filter', ranking_filter);
      if (personal_filter) queryParams.append('personal_filter', personal_filter);
      if (block_filter) queryParams.append('block_filter', block_filter);
      if (user_id) queryParams.append('user_id', user_id);
      
      const url = `${API_URL}/api/posts?${queryParams.toString()}`;
      console.log('Fetching posts from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error response:', errorData);
        
        if (response.status === 503 && retryCount < 3) {
          console.log(`Retrying fetch (attempt ${retryCount + 1})`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return fetchPosts(reset, retryCount + 1);
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.posts || !Array.isArray(data.posts)) {
        throw new Error('Invalid API response format');
      }

      // Process posts and filter duplicates
      const newPosts = data.posts
        .filter((post: ExtendedPost) => !seenpost_ids.current.has(post.id))
        .map((post: ExtendedPost) => {
          seenpost_ids.current.add(post.id);
          return createImageUrl(post);
        });

      if (isMounted.current) {
        setSubmissions(prev => {
          const updated = reset ? newPosts : [...prev, ...newPosts];
          return updated;
        });
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
        
        if (onStatsUpdate && data.stats) {
          onStatsUpdate(data.stats);
        }
      }
    } catch (err) {
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch posts';
        console.error('Fetch error:', err);
        setError(errorMessage);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setIsFetchingMore(false);
        prevFilters.current = { ...currentFilters };
      }
    }
  }, [currentFilters, nextCursor, onStatsUpdate, createImageUrl, cleanupImageUrls, selected_tags, time_filter, ranking_filter, personal_filter, block_filter, user_id]);

  // Effect to handle initial mount and filter changes
  useEffect(() => {
    if (!isMounted.current) {
      console.log('Initial mount');
      isMounted.current = true;
      fetchPosts(true);
      return;
    }

    if (isInitialMount.current) {
      console.log('Skipping first filter update');
      isInitialMount.current = false;
      return;
    }

    if (haveFiltersChanged()) {
      console.log('Filters changed, fetching new posts');
      fetchPosts(true);
    }

    return () => {
      console.log('Component unmounting');
      isMounted.current = false;
      cleanupImageUrls();
    };
  }, [fetchPosts, haveFiltersChanged, cleanupImageUrls]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || isFetchingMore) return;
    fetchPosts(false);
  }, [hasMore, isFetchingMore, fetchPosts]);

  // Render the component
  return (
    <div className="w-full">
      {/* Loading state */}
      {loading && submissions.length === 0 && (
        <div className="flex items-center justify-center py-10">
          <FiLoader className="w-6 h-6 animate-spin text-[#00ffa3]" />
          <span className="ml-2 text-gray-200">Loading posts...</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg mb-4">
          <p className="font-medium">Error loading posts:</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && submissions.length === 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm p-8 rounded-lg text-center">
          <h3 className="text-xl font-bold mb-2 text-gray-200">No posts found</h3>
          <p className="text-gray-400">Try changing your filters or tags</p>
        </div>
      )}

      {/* Posts grid */}
      {submissions.length > 0 && (
        <div className="grid grid-cols-1 gap-6">
          {submissions.map((post) => (
            <div key={post.id} className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-xl border border-gray-800/10 shadow-lg hover:shadow-[#00ffa3]/5 transition-all duration-300">
              {/* Header with metadata */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800/10">
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-200 font-medium">
                      {post.author_address ? 
                        `${post.author_address.substring(0, 3)}...${post.author_address.substring(post.author_address.length - 3)}` : 
                        "Anonymous"}
                    </span>
                    <a 
                      href={`https://whatsonchain.com/address/${post.author_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00ffa3] hover:text-[#00ff9d] transition-colors"
                    >
                      <FiExternalLink size={14} />
                    </a>
                  </div>
                  <div className="flex items-center text-gray-400 text-xs mt-1">
                    <FiClock className="mr-1" size={12} />
                    {new Date(post.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                {/* Lock amount if present */}
                {post.metadata && 'lock' in post.metadata && 
                 typeof post.metadata.lock === 'object' && 
                 post.metadata.lock !== null &&
                 'amount' in post.metadata.lock &&
                 typeof post.metadata.lock.amount === 'number' &&
                 post.metadata.lock.amount > 0 && (
                  <div className="flex items-center bg-[#00ffa3]/10 px-3 py-1.5 rounded-full">
                    <FiLock className="text-[#00ffa3] mr-1.5" size={14} />
                    <span className="text-[#00ffa3] font-medium text-sm">
                      {post.metadata.lock.amount.toLocaleString()} sats
                    </span>
                  </div>
                )}
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
                        alt="Post content"
                        loading="lazy"
                        className="w-full h-auto object-contain max-h-[500px]"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {post.tags.map(tag => (
                      <span 
                        key={tag} 
                        className="bg-[#00ffa3]/5 text-[#00ffa3] text-xs px-2.5 py-1 rounded-full border border-[#00ffa3]/10 hover:bg-[#00ffa3]/10 transition-colors"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
  );
};

export default PostGrid;