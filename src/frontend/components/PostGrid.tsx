import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart, FiMaximize2, FiX, FiBarChart2, FiExternalLink } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import type { Post, LockLike } from '../types';
import { toast } from 'react-hot-toast';
import LockLikeInteraction from './LockLikeInteraction';
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
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
  const imageRefs = useRef<{ [key: string]: HTMLImageElement }>({});
  const wallet = useYoursWallet();

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      
      if (timeFilter) queryParams.append('timeFilter', timeFilter);
      if (rankingFilter) queryParams.append('rankingFilter', rankingFilter);
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
        if (post.raw_image_data) {
          try {
            const blob = new Blob([Buffer.from(post.raw_image_data, 'base64')], { 
              type: post.media_type || 'image/jpeg' 
            });
            imageUrl = URL.createObjectURL(blob);
          } catch (e) {
            console.warn('Failed to process image for post:', post.id, e);
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
      const response = await fetch(`${API_URL}/api/lockLikes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: post.id,
          amount,
          duration,
          authorAddress: wallet.bsvAddress
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {submissions.map((post) => (
        <div key={post.id} className="bg-[#1A1B23] rounded-xl shadow-lg overflow-hidden">
          {/* Image */}
          {post.imageUrl && (
            <div className="relative aspect-video bg-black">
              <img
                src={post.imageUrl}
                alt={post.description || 'Post image'}
                className="w-full h-full object-contain"
                onClick={() => setExpandedImage(post.imageUrl!)}
              />
            </div>
          )}

          {/* Content */}
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-400">
                {post.author_address?.slice(0, 8)}...{post.author_address?.slice(-8)}
              </span>
              <span className="text-sm text-[#00ffa3]">
                {formatBSV(post.totalLocked || 0)} BSV
              </span>
            </div>

            <p className="text-white mb-4">{post.content}</p>

            {/* Tags */}
            {post.tags?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-[#2A2B33] text-gray-300 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Lock Like Button */}
            <LockLikeInteraction
              post={post}
              onLockLike={(amount, duration) => handleLockLike(post, amount, duration)}
              wallet={wallet}
            />
          </div>
        </div>
      ))}

      {/* Image Modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50"
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Expanded view"
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
        </div>
      )}
    </div>
  );
};

export default PostGrid;