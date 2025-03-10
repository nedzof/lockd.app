import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiLoader, FiPlus } from 'react-icons/fi';
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
    return (
      prev.time_filter !== currentFilters.time_filter ||
      prev.ranking_filter !== currentFilters.ranking_filter ||
      prev.personal_filter !== currentFilters.personal_filter ||
      prev.block_filter !== currentFilters.block_filter ||
      prev.user_id !== currentFilters.user_id ||
      JSON.stringify(prev.selected_tags) !== JSON.stringify(currentFilters.selected_tags)
    );
  }, [currentFilters]);

  const fetchPosts = useCallback(async (reset = true, retryCount = 0) => {
    if (!isMounted.current) return;

    if (reset) {
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
      
      if (time_filter) queryParams.append('time_filter', time_filter);
      if (ranking_filter) queryParams.append('ranking_filter', ranking_filter);
      if (personal_filter) queryParams.append('personal_filter', personal_filter);
      if (block_filter) queryParams.append('block_filter', block_filter);
      if (selected_tags.length > 0) {
        selected_tags.forEach(tag => queryParams.append('tags', tag));
      }
      if (user_id) queryParams.append('user_id', user_id);
      
      const response = await fetch(`${API_URL}/api/posts?${queryParams.toString()}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // Handle specific error cases
        if (response.status === 503) {
          // Server temporarily unavailable, retry after delay
          if (retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return fetchPosts(reset, retryCount + 1);
          }
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

      setSubmissions(prev => reset ? newPosts : [...prev, ...newPosts]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      
      if (onStatsUpdate && data.stats) {
        onStatsUpdate(data.stats);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch posts';
      setError(errorMessage);
      
      // Log error for debugging
      console.error('Error fetching posts:', {
        error: err,
        params: {
          time_filter,
          ranking_filter,
          personal_filter,
          block_filter,
          selected_tags,
          user_id,
          nextCursor,
          reset
        }
      });
    } finally {
      setLoading(false);
      setIsFetchingMore(false);
      prevFilters.current = { ...currentFilters };
    }
  }, [currentFilters, nextCursor, onStatsUpdate, createImageUrl, cleanupImageUrls]);

  // Effect to handle initial mount and filter changes
  useEffect(() => {
    isMounted.current = true;
    
    if (haveFiltersChanged()) {
      fetchPosts(true);
    }
    
    return () => {
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {post.tags.map(tag => (
                      <span key={tag} className="bg-white/5 text-gray-300 text-xs px-2.5 py-1 rounded-md">
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