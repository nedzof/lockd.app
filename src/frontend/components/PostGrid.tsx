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
  postId: string;
  post_txid: string;
  content: string;
  author_address: string;
  created_at: string;
  lock_amount: number;
  lock_duration: number;
  unlock_height: number;
  current_height: number;
  lock_percentage: number;
  tags: string[];
}

interface VoteQuestion {
  id: string;
  txid: string;
  content: string;
  author_address: string;
  created_at: string;
  options: any;
  tags: string[];
  vote_options: VoteOption[];
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

interface ApiPost {
  id: string;
  txid: string;
  content: string;
  author_address: string;
  media_type: string | null;
  block_height: number;
  amount: number | null;
  unlock_height: number | null;
  description: string | null;
  created_at: string;
  tags: string[];
  metadata: any;
  is_locked: boolean;
  lock_duration: number | null;
  raw_image_data: string | null;
  image_format: string | null;
  is_vote?: boolean;
  vote_options?: VoteOption[];
}

// Extend Post type to include vote-related properties
type ExtendedPost = Post & {
  is_vote?: boolean;
  vote_options?: VoteOption[];
};

// Use environment variable for API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface GradientColors {
  from: string;
  to: string;
  shadow: string;
}

const VOTE_OPTION_COLORS: GradientColors[] = [
  { from: '#00ffa3', to: '#00ff9d', shadow: '#00ffa3' },
  { from: '#3CDFCE', to: '#00ffa3', shadow: '#3CDFCE' },
  { from: '#45B7D1', to: '#3CDFCE', shadow: '#45B7D1' }
];

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
  const [votes, setVotes] = useState<VoteQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState<string | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const imageRefs = useRef<{ [key: string]: HTMLImageElement }>({});
  const wallet = useYoursWallet();

  const formatImageUrl = async (imageData: any): Promise<string | null> => {
    try {
      // Log the structure of the image data
      console.log('Processing image data:', {
        type: typeof imageData,
        isArray: Array.isArray(imageData),
        length: imageData ? Object.keys(imageData).length : 0,
        firstBytes: imageData ? Object.values(imageData).slice(0, 4) : []
      });

      // Handle different data formats
      if (!imageData) return null;

      // Convert array-like object to Uint8Array
      if (typeof imageData === 'object' && !Array.isArray(imageData) && Object.keys(imageData).length > 0) {
        // Check if it looks like a JPEG (starts with FF D8 FF)
        const firstBytes = Object.values(imageData).slice(0, 3);
        if (firstBytes[0] === 255 && firstBytes[1] === 216 && firstBytes[2] === 255) {
          // Convert object to Uint8Array
          const byteArray = new Uint8Array(Object.values(imageData));
          const base64 = btoa(String.fromCharCode.apply(null, byteArray));
          return `data:image/jpeg;base64,${base64}`;
        }
      }

      // If it's a media URL, use it directly
      if (imageData.media_url) {
        return imageData.media_url;
      }

      // If it has raw_image_data, process it
      if (imageData.raw_image_data) {
        const rawData = imageData.raw_image_data;

        // If it's already a string (base64/URL), use it
        if (typeof rawData === 'string') {
          if (rawData.startsWith('data:') || rawData.startsWith('http')) {
            return rawData;
          }
          // Add appropriate data URL prefix based on format
          if (rawData.startsWith('/9j/')) {
            return `data:image/jpeg;base64,${rawData}`;
          }
          if (rawData.startsWith('iVBOR')) {
            return `data:image/png;base64,${rawData}`;
          }
          if (rawData.startsWith('R0lGOD')) {
            return `data:image/gif;base64,${rawData}`;
          }
          if (rawData.startsWith('UklGR')) {
            return `data:image/webp;base64,${rawData}`;
          }
          // Assume JPEG if no specific format detected
          return `data:image/jpeg;base64,${rawData}`;
        }

        // If it's a Buffer/Uint8Array
        if (rawData instanceof Uint8Array) {
          const base64 = btoa(String.fromCharCode.apply(null, rawData));
          return `data:image/jpeg;base64,${base64}`;
        }

        // If it's an object with buffer/data property
        if (rawData?.buffer instanceof Uint8Array) {
          const base64 = btoa(String.fromCharCode.apply(null, rawData.buffer));
          return `data:image/jpeg;base64,${base64}`;
        }
        if (rawData?.data instanceof Uint8Array) {
          const base64 = btoa(String.fromCharCode.apply(null, rawData.data));
          return `data:image/jpeg;base64,${base64}`;
        }
      }

      // Fallback to placeholder
      console.warn('Unable to process image data:', imageData);
      return `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('Image not available')}`;
    } catch (error) {
      console.error('Error processing image:', error);
      return `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('Error loading image')}`;
    }
  };

  const handleVideoClick = (id: string) => {
    const video = videoRefs.current[id];
    if (video) {
      if (video.paused) {
        video.play();
        setActiveVideo(id);
      } else {
        video.pause();
        setActiveVideo(null);
      }
    }
  };

  const handleVideoMouseEnter = (video: HTMLVideoElement, id: string) => {
    if (!activeVideo) {
      video.play();
    }
  };

  const handleVideoMouseLeave = (video: HTMLVideoElement, id: string) => {
    if (activeVideo !== id) {
      video.pause();
      video.currentTime = 0;
    }
  };

  const handleImageClick = (url: string) => {
    setExpandedImage(url);
  };

  const handleImageLoad = (id: string, img: HTMLImageElement) => {
    imageRefs.current[id] = img;
  };

  const handleLockLike = async (txid: string, amount: number, nLockTime: number, handle: string, postTxid?: string, replyTxid?: string) => {
    try {
      const response = await fetch(`${API_URL}/api/lockLikes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: txid,
          handle,
          amount,
          nLockTime,
          postTxid,
          replyTxid
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save lock like');
      }

      // Show confetti animation
      setShowConfetti(txid);
      setTimeout(() => setShowConfetti(null), 3000);

      // Refresh submissions to show updated lock amount
      fetchSubmissions();

      return response.json();
    } catch (error) {
      console.error('Error locking:', error);
      throw error;
    }
  };

  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Build query parameters
      const params = new URLSearchParams({
        timeFilter,
        rankingFilter,
        personalFilter,
        blockFilter,
        selectedTags: JSON.stringify(selectedTags),
        tagFilterType: 'or',
        ...(userId && { userId })
      });

      // Fetch posts from API
      const response = await fetch(`${API_URL}/api/posts?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }

      const posts: ApiPost[] = await response.json();

      if (!posts || posts.length === 0) {
        console.log('No posts found');
        setSubmissions([]);
        setIsLoading(false);
        return;
      }

      // Process and enrich the posts
      const submissionsWithStats = await Promise.all(posts.map(async (post: ApiPost) => {
        let imageUrl: string = `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('No image available')}`;
        
        try {
          if (post.raw_image_data) {
            console.log('Processing post image:', {
              id: post.id,
              hasImageData: true,
              imageDataLength: post.raw_image_data.length,
              mediaType: post.media_type
            });
            
            const formattedUrl = await formatImageUrl(post.raw_image_data);
            if (formattedUrl) {
              console.log('Successfully formatted image URL:', {
                id: post.id,
                urlLength: formattedUrl.length,
                urlPreview: formattedUrl.substring(0, 50) + '...'
              });
              imageUrl = formattedUrl;
            } else {
              console.warn(`Failed to format image for post ${post.id}`);
              toast.error('Failed to load some images');
            }
          }
        } catch (error) {
          console.error('Error processing image:', error);
          toast.error('Error loading some images');
        }

        const submission: ExtendedPost = {
          id: post.id,
          creator: post.author_address || 'Anonymous',
          title: `Post by ${post.author_address || 'Anonymous'}`,
          description: post.description || post.content || '',
          prompt: '',
          style: 'viral',
          duration: 30,
          format: post.media_type || 'text/plain',
          fileUrl: imageUrl,
          thumbnailUrl: imageUrl,
          txId: post.txid,
          locks: post.amount || 0,
          status: 'minted' as const,
          tags: post.tags || [],
          createdAt: new Date(post.created_at),
          updatedAt: new Date(post.created_at),
          totalLocked: post.amount || 0,
          threshold: 1000000000, // 10 BSV threshold
          isTop10Percent: (post.amount || 0) > 1000000000,
          isTop3: (post.amount || 0) > 2000000000,
          locklikes: [],
          content: post.content || '',
          unlock_height: post.unlock_height,
          block_height: post.block_height,
          is_vote: post.is_vote || false,
          vote_options: post.vote_options || []
        };

        return submission;
      }));

      // Apply ranking filters
      const sortedSubmissions = useMemo(() => {
        if (!submissionsWithStats) return [];

        return [...submissionsWithStats].sort((a, b) => {
          // Ensure we have valid timestamps
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          
          // If both timestamps are 0 (invalid), sort by ID to maintain stable order
          if (timeA === 0 && timeB === 0) {
            return a.id.localeCompare(b.id);
          }
          
          // Sort by timestamp, fallback to ID if one timestamp is invalid
          return timeB - timeA || a.id.localeCompare(b.id);
        });
      }, [submissionsWithStats]);

      // Apply limit based on filter
      let filteredSubmissions = sortedSubmissions;
      if (rankingFilter) {
        if (rankingFilter === 'top1') {
          filteredSubmissions = sortedSubmissions.slice(0, 1);
        } else if (rankingFilter === 'top3') {
          filteredSubmissions = sortedSubmissions.slice(0, 3);
        } else if (rankingFilter === 'top10') {
          filteredSubmissions = sortedSubmissions.slice(0, 10);
        }
      }

      setSubmissions(filteredSubmissions);

      // Update stats
      const total = filteredSubmissions.reduce((sum: number, sub: ExtendedPost) => sum + (sub.totalLocked || 0), 0);
      onStatsUpdate({
        totalLocked: total,
        participantCount: filteredSubmissions.length,
        roundNumber: 1
      });
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
      setError(error instanceof Error ? error.message : 'Failed to load posts. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, userId, onStatsUpdate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch posts
      const postsResponse = await fetch(`${API_URL}/api/posts?${new URLSearchParams({
        timeFilter,
        rankingFilter,
        personalFilter,
        blockFilter,
        selectedTags: JSON.stringify(selectedTags),
        tagFilterType: 'or',
        userId: userId || 'anon'
      })}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!postsResponse.ok) {
        throw new Error(`HTTP error! status: ${postsResponse.status}`);
      }

      const postsData = await postsResponse.json();
      console.log('Fetched posts:', postsData);

      // Process posts into Post format
      const processedPosts = await Promise.all(postsData.map(async (post: ApiPost) => {
        let imageUrl: string = `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('No image available')}`;
        
        // Handle image data if present
        if (post.raw_image_data) {
          try {
            const imageFormat = post.image_format || 'jpeg';
            imageUrl = `data:image/${imageFormat};base64,${post.raw_image_data}`;
          } catch (error) {
            console.error('Error processing image data:', error);
          }
        }

        const submission: ExtendedPost = {
          id: post.id,
          txid: post.txid,
          content: post.content,
          authorAddress: post.author_address,
          fileUrl: imageUrl,
          format: post.image_format || 'jpeg',
          blockHeight: post.block_height,
          totalLocked: post.amount || 0,
          unlockHeight: post.unlock_height || 0,
          description: post.description || '',
          createdAt: new Date(post.created_at),
          tags: post.tags || [],
          metadata: post.metadata || {},
          isLocked: post.is_locked,
          lockDuration: post.lock_duration || 0,
          is_vote: post.is_vote || false,
          vote_options: post.vote_options || []
        };

        return submission;
      }));

      setSubmissions(processedPosts);
      setError(null);

      // Calculate stats
      const totalLocked = processedPosts.reduce((sum, post) => sum + (post.totalLocked || 0), 0);
      const uniqueParticipants = new Set(processedPosts.map(post => post.authorAddress)).size;
      onStatsUpdate({
        totalLocked,
        participantCount: uniqueParticipants,
        roundNumber: 1 // You might want to get this from somewhere else
      });

    } catch (error) {
      console.error('Error fetching posts:', error);
      setError('Failed to fetch posts. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch posts
        const postsResponse = await fetch(`${API_URL}/api/posts?${new URLSearchParams({
          timeFilter,
          rankingFilter,
          personalFilter,
          blockFilter,
          selectedTags: JSON.stringify(selectedTags),
          tagFilterType: 'or',
          userId: userId || 'anon'
        })}`, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        const postsData = await postsResponse.json();
        console.log('Fetched posts:', postsData);

        // Process posts into Post format
        const processedPosts = await Promise.all(postsData.map(async (post: ApiPost) => {
          let imageUrl: string = `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('No image available')}`;
          
          try {
            if (post.raw_image_data) {
              console.log('Processing post image:', {
                id: post.id,
                hasImageData: !!post.raw_image_data,
                imageDataLength: post.raw_image_data?.length,
                mediaType: post.media_type || 'unknown'
              });

              const formattedUrl = await formatImageUrl(post.raw_image_data);
              if (formattedUrl) {
                imageUrl = formattedUrl;
              }
            } else if (post.media_url) {
              imageUrl = post.media_url;
            }
          } catch (error) {
            console.error('Error processing image:', error);
          }

          return {
            id: post.id,
            txid: post.txid,
            author: post.author_address,
            imageUrl,
            description: post.description || '',
            content: post.content,
            timestamp: post.created_at,
            tags: post.tags || [],
            isLocked: post.is_locked,
            lockDuration: post.lock_duration,
            unlockHeight: post.unlock_height,
            blockHeight: post.block_height,
            amount: post.amount,
            isVote: post.is_vote,
            vote: post.vote,
            sequence: post.sequence,
            parentSequence: post.parent_sequence,
            postId: post.post_id,
            mediaType: post.media_type,
            mediaUrl: post.media_url
          };
        }));

        console.log('Processed posts:', processedPosts);
        setSubmissions(processedPosts);
        
        if (onStatsUpdate) {
          onStatsUpdate({
            totalPosts: processedPosts.length,
            lockedPosts: processedPosts.filter(post => post.isLocked).length,
            votePosts: processedPosts.filter(post => post.isVote).length
          });
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch posts');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, userId]);

  const renderWhatsOnChainLink = (txid: string) => (
    <a
      href={`https://whatsonchain.com/tx/${txid}`}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute top-3 right-3 p-2 rounded-full bg-[#1A1B23]/40 text-white/40 hover:text-[#00ffa3] hover:bg-[#1A1B23]/60 transition-all duration-500 backdrop-blur-sm z-10"
      title="View on WhatsOnChain"
    >
      <FiExternalLink className="w-4 h-4" />
    </a>
  );

  const renderContent = (submission: ExtendedPost) => {
    console.log('Rendering submission:', {
      id: submission.id,
      hasContent: !!submission.content,
      fileUrl: submission.fileUrl,
      format: submission.format,
      isPlaceholder: submission.fileUrl?.includes('placehold.co'),
      isVote: submission.is_vote,
      hasVoteOptions: !!submission.vote_options
    });

    return (
      <div className="w-full">
        {/* Image section */}
        {submission.fileUrl && !submission.fileUrl?.includes('placehold.co') && (
          <div className="relative w-full group/image">
            {/* Top right stats */}
            <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
              <span className="text-sm text-[#00ffa3]/60 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                {formatBSV(submission.totalLocked || 0)}
              </span>
              <a
                href={`https://whatsonchain.com/tx/${submission.txId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full bg-[#1A1B23]/40 text-white/40 hover:text-[#00ffa3] hover:bg-[#1A1B23]/60 transition-all duration-500 backdrop-blur-sm"
                title="View on WhatsOnChain"
              >
                <FiExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Image */}
            <img
              ref={(el) => el && handleImageLoad(submission.id, el)}
              src={submission.fileUrl}
              alt={submission.description || 'Post image'}
              className="w-full object-cover bg-[#1A1B23] cursor-pointer rounded-t-xl max-h-[400px]"
              onClick={() => handleImageClick(submission.fileUrl)}
              onLoad={() => console.log('Image loaded successfully:', submission.id)}
              onError={(e) => {
                console.error('Image load error:', {
                  id: submission.id,
                  src: submission.fileUrl
                });
                const img = e.target as HTMLImageElement;
                img.src = `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('Failed to load image')}`;
              }}
              loading="lazy"
            />
          </div>
        )}

        {/* Content and Vote Options section */}
        <div className="p-8 bg-gradient-to-b from-[#1A1B23] to-[#1A1B23]/95">
          {/* Text content */}
          {submission.content && (
            <p className="text-gray-200/90 text-lg leading-relaxed whitespace-pre-wrap break-words mb-6">{submission.content}</p>
          )}

          {/* Vote options */}
          {submission.is_vote && submission.vote_options && (
            <div className="space-y-4 mt-6">
              {submission.vote_options.map((option, index) => {
                const totalLocked = submission.vote_options?.reduce((sum, opt) => sum + opt.lock_amount, 0) || 0;
                const percentage = totalLocked > 0 ? (option.lock_amount / totalLocked) * 100 : 0;
                const gradientColors = VOTE_OPTION_COLORS[index % VOTE_OPTION_COLORS.length];

                return (
                  <div key={option.id} className="relative group/option">
                    {/* Progress bar background */}
                    <div className="absolute inset-0 bg-[#2A2A40]/10 rounded-lg" />
                    
                    {/* Progress bar */}
                    <div 
                      className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: `${percentage}%`,
                        background: `linear-gradient(90deg, ${gradientColors.from}08, ${gradientColors.to}08)`,
                        boxShadow: percentage > 0 ? `0 0 30px ${gradientColors.shadow}05` : 'none'
                      }}
                    />

                    {/* Hover effect */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover/option:opacity-100 transition-opacity duration-500 rounded-lg"
                      style={{
                        background: `linear-gradient(90deg, ${gradientColors.from}10, ${gradientColors.to}10)`
                      }}
                    />

                    {/* Content */}
                    <div className="relative p-4 flex items-center justify-between transition-all duration-300 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <span className="text-white/90 font-medium">{option.content}</span>
                        <span 
                          className="text-gray-400/70 transition-all duration-300 group-hover/option:text-white/80"
                          style={{ color: percentage > 0 ? `${gradientColors.from}dd` : undefined }}
                        >
                          {percentage.toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <LockLikeInteraction
                          postTxid={option.id}
                          replyTxid={undefined}
                          postLockLike={handleLockLike}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Footer with Lock BSV button */}
          <div className="flex items-center justify-end space-x-6 mt-6">
            {submission.unlock_height && submission.block_height && (
              <div className="text-sm text-white/40">
                {Math.max(0, submission.unlock_height - submission.block_height)} blocks left
              </div>
            )}
            {!submission.is_vote && (
              <LockLikeInteraction
                postTxid={submission.txId}
                postLockLike={handleLockLike}
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVoteQuestion = (vote: VoteQuestion) => {
    const totalLocked = vote.vote_options?.reduce((sum, option) => sum + (option.lock_amount || 0), 0) || 0;
    const optionsWithPercentages = vote.vote_options?.map(option => ({
      ...option,
      percentage: totalLocked > 0 ? (option.lock_amount / totalLocked) * 100 : 0
    })) || [];

    const deadline = new Date(vote.created_at);
    deadline.setDate(deadline.getDate() + 7);
    const timeLeft = Math.max(0, deadline.getTime() - new Date().getTime());
    const daysLeft = Math.ceil(timeLeft / (1000 * 60 * 60 * 24));

    return (
      <div className="group relative overflow-hidden rounded-xl backdrop-blur-sm border border-gray-800/20 hover:border-[#00ffa3]/20 transition-all duration-500 hover:shadow-[0_0_40px_rgba(0,255,163,0.03)] bg-[#1A1B23]/20 w-full max-w-md">
        {renderWhatsOnChainLink(vote.txid)}
        <div className="p-8 space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h3 className="text-xl font-medium text-white/90">{vote.content}</h3>
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-[#00ffa3]/80">{formatBSV(totalLocked)} BSV</span>
              <span className="text-gray-400/70">locked</span>
            </div>
          </div>

          {/* Vote options */}
          <div className="space-y-2 mt-4">
            {optionsWithPercentages.map((option, index) => {
              const gradientColors = VOTE_OPTION_COLORS[index % VOTE_OPTION_COLORS.length];
              const percentage = option.percentage || 0;

              return (
                <div
                  key={option.id}
                  className="group/option relative"
                >
                  {/* Progress bar */}
                  <div
                    className="absolute inset-0 rounded-lg transition-all duration-300"
                    style={{
                      background: `linear-gradient(90deg, ${gradientColors.from}15, ${gradientColors.to}15)`,
                      width: `${percentage}%`
                    }}
                  />

                  <div className="relative p-4 flex items-center justify-between transition-all duration-300 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <span className="text-white/90 font-medium">{option.content}</span>
                      <span 
                        className="text-gray-400/70 transition-all duration-300 group-hover/option:text-white/80"
                        style={{ color: percentage > 0 ? `${gradientColors.from}dd` : undefined }}
                      >
                        {percentage.toFixed(1)}%
                      </span>
                    </div>

                    <LockLikeInteraction
                      postTxid={option.id}
                      postLockLike={handleLockLike}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deadline at bottom */}
          <div className="text-sm text-gray-400/70 pt-4 border-t border-gray-800/20">
            {daysLeft > 0 ? `${daysLeft} days left` : 'Voting ended'}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <FiLoader className="w-8 h-8 text-[#00ffa3] animate-spin" />
          <p className="text-gray-400">Loading posts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <p className="text-red-500">{error}</p>
          <button 
            onClick={fetchSubmissions}
            className="px-4 py-2 text-[#00ffa3] border border-[#00ffa3] rounded-lg hover:bg-[#00ffa3] hover:text-black transition-all duration-300"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <button 
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] text-black rounded-lg font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 transform hover:scale-105"
          >
            <FiPlus className="w-5 h-5" />
            <span>Create Post</span>
          </button>
          <p className="text-sm text-gray-400">Be the first to create a post!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-center">
          <div className="grid grid-cols-1 gap-8 justify-items-center" style={{ maxWidth: '800px' }}>
            {submissions
              .sort((a, b) => {
                // Ensure we have valid timestamps
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                
                // If both timestamps are 0 (invalid), sort by ID to maintain stable order
                if (timeA === 0 && timeB === 0) {
                  return a.id.localeCompare(b.id);
                }
                
                // Sort by timestamp, fallback to ID if one timestamp is invalid
                return timeB - timeA || a.id.localeCompare(b.id);
              })
              .map((submission) => (
                <div key={`${submission.txId}-${submission.id}`} className="w-full">
                  <div className="group relative overflow-hidden rounded-xl backdrop-blur-sm border border-gray-800/20 hover:border-[#00ffa3]/20 transition-all duration-500 hover:shadow-[0_0_40px_rgba(0,255,163,0.03)] bg-[#1A1B23]/20 w-full max-w-md flex flex-col">
                    {renderContent(submission)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg"
          onClick={() => setExpandedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white/70 hover:text-[#00ffa3] transition-colors duration-300"
            onClick={() => setExpandedImage(null)}
          >
            <FiX className="w-8 h-8" />
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
  );
};

export { PostGrid as default };