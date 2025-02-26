import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart, FiMaximize2, FiX, FiBarChart2, FiExternalLink } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import type { Post, LockLike } from '../types';
import { toast } from 'react-hot-toast';
import LockLikeInteraction from './LockLikeInteraction';
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

interface LockLike {
  id: string;
  txid: string;
  author_address?: string;
  amount: number;
  lock_duration: number;
  unlock_height?: number;
  created_at: string;
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
  lock_likes: LockLike[];
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
  userId?: string;
}

// Use environment variable for API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
  const imageRefs = useRef<{ [key: string]: HTMLImageElement }>({});
  const wallet = useYoursWallet();

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      
      if (timeFilter) queryParams.append('timeFilter', timeFilter);
      if (rankingFilter) {
        // Map rankingFilter values to valid backend values
        const validRankingFilter = rankingFilter === 'top1' ? 'top' : rankingFilter;
        queryParams.append('rankingFilter', validRankingFilter);
      }
      if (personalFilter) queryParams.append('personalFilter', personalFilter);
      if (blockFilter) queryParams.append('blockFilter', blockFilter);
      if (selectedTags && selectedTags.length > 0) queryParams.append('selectedTags', JSON.stringify(selectedTags));
      if (userId) queryParams.append('userId', userId);

      console.log('Fetching posts with params:', queryParams.toString());
      const response = await fetch(`${API_URL}/api/posts?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Process posts and their images
      const processedPosts = await Promise.all(data.posts.map(async (post: ExtendedPost) => {
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
        const totalLocked = post.lock_likes?.reduce((sum, lock) => sum + (lock.amount || 0), 0) || 0;

        return {
          ...post,
          imageUrl,
          totalLocked
        };
      }));

      setSubmissions(processedPosts);
      
      // Update stats
      if (data.stats) {
        onStatsUpdate(data.stats);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch posts');
      setIsLoading(false);
    }
  }, [timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, userId, onStatsUpdate]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Cleanup image URLs when component unmounts
  useEffect(() => {
    return () => {
      submissions.forEach(post => {
        if (post.imageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(post.imageUrl);
        }
      });
    };
  }, [submissions]);

  const handleLockLike = async (post: ExtendedPost, amount: number, duration: number) => {
    if (!wallet.connected) {
      toast.error('Please connect your wallet first');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/lock-likes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: post.id,
          author_address: wallet.bsvAddress,
          amount,
          lock_duration: duration
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create lock like');
      }

      toast.success('Lock like created successfully!');
      fetchPosts(); // Refresh posts to show updated lock amount
    } catch (error) {
      console.error('Error creating lock like:', error);
      toast.error('Failed to create lock like');
    }
  };

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
      const response = await fetch(`${API_URL}/api/vote-options/${optionId}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
                      {post.author_address?.slice(0, 8)}...{post.author_address?.slice(-8)}
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
                <div className="flex justify-end mb-4">
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
                          className="relative bg-[#111218] rounded-lg p-3 transition-all duration-200 hover:bg-[#15161F]"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-white font-light">{option.content}</span>
                            <span className="text-sm text-[#00ffa3]">{formatBSV(option.lock_amount || 0)} BSV</span>
                          </div>
                          
                          {/* Progress bar */}
                          <div className="w-full h-1 bg-[#2A2C3A] rounded-full mt-2 overflow-hidden">
                            <div 
                              className="h-full bg-[#00ffa3]" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          
                          {/* Lock BSV button */}
                          <button
                            onClick={() => handleVoteOptionLock(option.id, 1, 1)}
                            className="mt-2 text-xs text-[#00ffa3] border border-[#00ffa3] rounded-md px-3 py-1 transition-all hover:bg-[#00ffa320] flex items-center"
                          >
                            <FiLock className="mr-1 w-3 h-3" /> Lock BSV
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

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

export default PostGrid;