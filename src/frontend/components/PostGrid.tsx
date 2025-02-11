import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart, FiMaximize2, FiX, FiBarChart2 } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import type { MemeSubmission, LockLike } from '../types';

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

interface VoteOption {
  id: string;
  txid: string;
  question_txid: string;
  content: string;
  author_address: string;
  created_at: string;
  lock_amount: number;
  lock_duration: number;
  tags: string[];
}

interface MemeSubmissionGridProps {
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
}

const API_URL = 'http://localhost:3001';

const MemeSubmissionGrid: React.FC<MemeSubmissionGridProps> = ({ 
  onStatsUpdate,
  timeFilter,
  rankingFilter,
  personalFilter,
  blockFilter,
  selectedTags,
  userId
}) => {
  const [submissions, setSubmissions] = useState<MemeSubmission[]>([]);
  const [votes, setVotes] = useState<VoteQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [showLockInput, setShowLockInput] = useState<string | null>(null);
  const [lockAmount, setLockAmount] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState<string | null>(null);
  const [lockingSubmissionId, setLockingSubmissionId] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const imageRefs = useRef<{ [key: string]: HTMLImageElement }>({});

  const formatImageUrl = async (imageData: string | undefined) => {
    if (!imageData) return null;
    
    // Debug logging
    console.log('Processing image data:', {
      length: imageData.length,
      startsWith: imageData.substring(0, 50),
      type: imageData.startsWith('data:image/') ? 'data-url' : 
            imageData.startsWith('http') ? 'url' :
            imageData.startsWith('/') && !imageData.startsWith('/9j/') ? 'path' : 
            imageData.startsWith('/9j/') ? 'raw-jpeg' : 'unknown',
      containsInvalidChars: /[^A-Za-z0-9+/=]/.test(imageData.split(',')[1] || imageData)
    });

    // If it's a URL or path (but not a raw JPEG), return as is
    if ((imageData.startsWith('http') || imageData.startsWith('/')) && !imageData.startsWith('/9j/')) {
      return imageData;
    }

    try {
      // Create image element
      const img = new Image();
      img.crossOrigin = 'anonymous';

      // Create canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // Clean base64 data
      let base64Data = imageData;
      if (imageData.startsWith('data:image/')) {
        const [header, base64] = imageData.split(',');
        if (!base64) {
          console.error('No base64 data found in data URL');
          return null;
        }
        base64Data = base64;
      }

      // Clean the base64 data
      base64Data = base64Data
        .replace(/[\r\n\t\f\v ]+/g, '') // Remove all whitespace
        .replace(/[^A-Za-z0-9+/=]/g, '') // Remove invalid characters
        .replace(/=+$/, ''); // Remove trailing equals

      // Re-add proper padding
      const padding = base64Data.length % 4;
      if (padding > 0) {
        base64Data += '='.repeat(4 - padding);
      }

      // Verify the cleaned base64 data
      try {
        const decoded = atob(base64Data);
        if (decoded.length === 0) {
          console.error('Decoded base64 data is empty');
          return null;
        }
      } catch (e) {
        console.error('Invalid base64 data:', e);
        return null;
      }

      // Wait for image to load
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageData.startsWith('data:image/') ? imageData : `data:image/jpeg;base64,${base64Data}`;
      });

      // Calculate dimensions
      let width = img.width;
      let height = img.height;

      // Resize if needed (max 800px)
      const maxSize = 800;
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      // Set canvas size
      canvas.width = width;
      canvas.height = height;

      // Draw with black background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to base64
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (error) {
      console.error('Error formatting image URL:', error);
      return null;
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

  const handleLockCoins = async (postId: string, amount: number) => {
    if (!amount || amount <= 0) return;

    setLockingSubmissionId(postId);
    try {
      const response = await fetch(`${API_URL}/api/lockLikes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId,
          amount,
          handle: 'anon', // Using anonymous user for now
          lockPeriod: 30, // 30 days default lock period
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock coins');
      }

      // Show confetti animation
      setShowConfetti(postId);
      setTimeout(() => setShowConfetti(null), 3000);

      // Reset lock input
      setShowLockInput(null);
      setLockAmount('');

      // Refresh submissions to show updated lock amount
      fetchSubmissions();
    } catch (error) {
      console.error('Error locking coins:', error);
    } finally {
      setLockingSubmissionId(null);
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
        // Format image URL properly if it's base64 data
        const imageUrl = await formatImageUrl(post.metadata?.imageData) || 
                        await formatImageUrl(post.content) || 
                        `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('No image available')}`;

        // Debug the final URL
        console.log('Final image URL:', {
          id: post.id,
          urlLength: imageUrl.length,
          urlStart: imageUrl.substring(0, 50),
          isDataUrl: imageUrl.startsWith('data:image/'),
          isPlaceholder: imageUrl.includes('placehold.co'),
          source: imageUrl === await formatImageUrl(post.metadata?.imageData) ? 'metadata' : 
                 imageUrl === await formatImageUrl(post.content) ? 'content' : 'placeholder'
        });

        const submission: MemeSubmission = {
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
          block_height: post.block_height
        };

        return submission;
      }));

      // Apply ranking filters
      submissionsWithStats.sort((a: MemeSubmission, b: MemeSubmission) => {
        // First sort by total locked amount
        const amountDiff = b.totalLocked - a.totalLocked;
        if (amountDiff !== 0) return amountDiff;
        
        // If amounts are equal, sort by most recent
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      // Apply limit based on filter
      let filteredSubmissions = submissionsWithStats;
      if (rankingFilter) {
        if (rankingFilter === 'top1') {
          filteredSubmissions = submissionsWithStats.slice(0, 1);
        } else if (rankingFilter === 'top3') {
          filteredSubmissions = submissionsWithStats.slice(0, 3);
        } else if (rankingFilter === 'top10') {
          filteredSubmissions = submissionsWithStats.slice(0, 10);
        }
      }

      setSubmissions(filteredSubmissions);

      // Update stats
      const total = filteredSubmissions.reduce((sum: number, sub: MemeSubmission) => sum + (sub.totalLocked || 0), 0);
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
          userId: userId || 'anon'
        })}`);
        const postsData = await postsResponse.json();
        console.log('Fetched posts:', postsData);

        // Fetch votes
        const votesResponse = await fetch(`${API_URL}/api/votes`);
        const votesData = await votesResponse.json();
        console.log('Fetched votes:', votesData);

        setSubmissions(postsData);
        setVotes(votesData);

        // Debug combined data
        const allContent = [
          ...postsData.map((post: MemeSubmission) => ({ type: 'post' as const, data: post })),
          ...votesData.map((vote: VoteQuestion) => ({ type: 'vote' as const, data: vote }))
        ];
        console.log('Combined content:', allContent);

      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to fetch data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [timeFilter, rankingFilter, personalFilter, blockFilter, selectedTags, userId]);

  const renderContent = (submission: MemeSubmission) => {
    // If it's an image post
    if (submission.format?.startsWith('image/')) {
      return (
        <>
          <div className="relative w-full">
            <img
              ref={(el) => el && handleImageLoad(submission.id, el)}
              src={submission.fileUrl}
              alt={submission.description || 'Post image'}
              className="w-full object-contain bg-[#1A1B23] cursor-pointer rounded-t-xl"
              onClick={() => handleImageClick(submission.fileUrl)}
              onError={(e) => {
                console.error('Image load error for submission:', {
                  id: submission.id,
                  format: submission.format,
                  urlLength: submission.fileUrl.length,
                  urlStart: submission.fileUrl.substring(0, 50)
                });
                const img = e.target as HTMLImageElement;
                img.src = `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent('Failed to load image')}`;
              }}
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 bg-black/50">
              <FiMaximize2 className="w-8 h-8 text-white" />
            </div>
          </div>
          {submission.content && (
            <div className="px-4 py-3 text-gray-200/90 border-y border-gray-800/30 bg-[#1A1B23]/50">
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{submission.content}</p>
            </div>
          )}
        </>
      );
    }
    
    // If it's text only (no image)
    if (submission.content) {
      return (
        <div className="w-full px-4 py-6 bg-gradient-to-br from-[#2A2A40]/20 to-[#1A1B23]/20">
          <p className="text-gray-200/90 text-base leading-relaxed whitespace-pre-wrap break-words">{submission.content}</p>
        </div>
      );
    }

    // If no content at all
    return null;
  };

  const renderVoteQuestion = (vote: VoteQuestion) => {
    return (
      <div key={vote.id} className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-medium text-white">{vote.content}</h3>
            <p className="text-sm text-gray-400">
              by {vote.author_address.substring(0, 8)}...
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <FiBarChart2 className="w-5 h-5 text-[#00ffa3]" />
            <span className="text-sm text-gray-400">Vote</span>
          </div>
        </div>

        <div className="space-y-3">
          {vote.vote_options.map((option) => (
            <div key={option.id} className="bg-[#1A1B23] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white">{option.content}</span>
                <div className="text-sm text-gray-400">
                  <span>{formatBSV(option.lock_amount)} BSV</span>
                  <span className="mx-2">•</span>
                  <span>{option.lock_duration} blocks</span>
                </div>
              </div>
              <button
                onClick={() => handleLockCoins(option.id, option.lock_amount)}
                disabled={lockingSubmissionId === option.id}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-[#00ffa3]/10 to-[#00ff9d]/10 text-[#00ffa3] rounded-lg font-medium hover:from-[#00ffa3]/20 hover:to-[#00ff9d]/20 transition-all duration-300 disabled:opacity-50"
              >
                {lockingSubmissionId === option.id ? (
                  <FiLoader className="animate-spin w-4 h-4" />
                ) : (
                  <>
                    <FiHeart className="w-4 h-4" />
                    <span>Vote ({formatBSV(option.lock_amount)} BSV)</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <span>{new Date(vote.created_at).toLocaleDateString()}</span>
          {vote.tags.map((tag) => (
            <span key={tag} className="px-2 py-1 bg-[#1A1B23] rounded-full">
              #{tag}
            </span>
          ))}
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
          <div className="grid grid-cols-1 gap-6 justify-items-center" style={{ maxWidth: '800px' }}>
            {/* Debug output */}
            <div className="text-white">
              Number of posts: {submissions.length}
              <br />
              Number of votes: {votes.length}
            </div>
            {/* Combine and sort posts and votes */}
            {[
              ...submissions.map(submission => ({ type: 'post' as const, data: submission })),
              ...votes.map(vote => ({ type: 'vote' as const, data: vote }))
            ]
            .sort((a, b) => {
              return new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            })
            .map((item) => (
              <div key={item.data.id} className="w-full">
                {item.type === 'post' ? (
                  <div className="group relative overflow-hidden rounded-xl backdrop-blur-sm border border-gray-800/10 hover:border-[#00ffa3]/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,163,0.05)] bg-[#1A1B23]/30 w-full max-w-md flex flex-col">
                    {renderContent(item.data)}
                  </div>
                ) : (
                  renderVoteQuestion(item.data)
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Image Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setExpandedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 text-white hover:text-[#00ffa3] transition-colors"
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

export { MemeSubmissionGrid as default };