import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import { MemeSubmission, Post, LockLike } from '../types';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [showLockInput, setShowLockInput] = useState<string | null>(null);
  const [lockAmount, setLockAmount] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState<string | null>(null);
  const [lockingSubmissionId, setLockingSubmissionId] = useState<string | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});

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
      let submissionsWithStats = posts.map((post: ApiPost) => {
        const submission: MemeSubmission = {
          id: post.id,
          creator: post.author_address || 'Anonymous',
          title: `Post by ${post.author_address || 'Anonymous'}`,
          description: post.description || post.content || '',
          prompt: '',
          style: 'viral',
          duration: 30,
          format: post.media_type || 'text/plain',
          fileUrl: post.media_type ? `https://testnet.ordinals.sv/content/${post.txid}` : `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content || '')}`,
          thumbnailUrl: post.media_type ? `https://testnet.ordinals.sv/content/${post.txid}` : `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content || '')}`,
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
          locklikes: []
        };

        return submission;
      });

      // Apply ranking filters
      submissionsWithStats.sort((a: MemeSubmission, b: MemeSubmission) => {
        // First sort by total locked amount
        const amountDiff = b.totalLocked - a.totalLocked;
        if (amountDiff !== 0) return amountDiff;
        
        // If amounts are equal, sort by most recent
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      // Apply limit based on filter
      if (rankingFilter) {
        if (rankingFilter === 'top1') {
          submissionsWithStats = submissionsWithStats.slice(0, 1);
        } else if (rankingFilter === 'top3') {
          submissionsWithStats = submissionsWithStats.slice(0, 3);
        } else if (rankingFilter === 'top10') {
          submissionsWithStats = submissionsWithStats.slice(0, 10);
        }
      }

      setSubmissions(submissionsWithStats);

      // Update stats
      const total = submissionsWithStats.reduce((sum: number, sub: MemeSubmission) => sum + (sub.totalLocked || 0), 0);
      onStatsUpdate({
        totalLocked: total,
        participantCount: submissionsWithStats.length,
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
    fetchSubmissions();
  }, [fetchSubmissions]);

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
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="group relative overflow-hidden rounded-xl backdrop-blur-sm border border-gray-800/10 hover:border-[#00ffa3]/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(0,255,163,0.05)] bg-[#1A1B23]/30 w-full max-w-md"
              >
                <div className="relative aspect-square">
                  {submission.fileUrl.includes('placehold.co') ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2A2A40]/20 to-[#1A1B23]/20 p-6 text-center">
                      <p className="text-gray-300/90 text-lg font-medium">{submission.description}</p>
                    </div>
                  ) : (
                    <video
                      ref={(el) => el && (videoRefs.current[submission.id] = el)}
                      src={submission.fileUrl}
                      className="w-full h-full object-cover cursor-pointer rounded-t-xl"
                      onClick={() => handleVideoClick(submission.id)}
                      onMouseEnter={(e) => handleVideoMouseEnter(e.target as HTMLVideoElement, submission.id)}
                      onMouseLeave={(e) => handleVideoMouseLeave(e.target as HTMLVideoElement, submission.id)}
                      loop
                      muted
                      playsInline
                    />
                  )}
                  {showConfetti === submission.id && (
                    <div className="absolute inset-0 pointer-events-none">
                      {/* Add your confetti animation here */}
                    </div>
                  )}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#1A1B23]/95 via-[#1A1B23]/70 to-transparent backdrop-blur-[1px]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-[#00ffa3] bg-opacity-5 rounded-lg group-hover:bg-opacity-10 transition-all duration-300">
                        <FiLock className="text-[#00ffa3] text-opacity-80 w-4 h-4" />
                      </div>
                      <span className="text-[#00ffa3] text-opacity-80 font-medium group-hover:text-opacity-95 transition-opacity duration-300">{formatBSV(submission.totalLocked / 100000000)}</span>
                    </div>
                    <div className="text-sm text-gray-300/80 group-hover:text-gray-200/90 transition-colors duration-300">
                      by {submission.creator}
                    </div>
                  </div>

                  <div className="relative h-1 bg-[#2A2A40]/30 rounded-full overflow-hidden mb-3">
                    <div
                      className="absolute left-0 top-0 h-full transition-all duration-500 bg-gradient-to-r from-[#00ffa3]/70 to-[#00ff9d]/70"
                      style={{
                        width: `${Math.min(
                          ((submission.totalLocked || 0) / (submission.threshold || 1000000000)) * 100,
                          100
                        )}%`,
                      }}
                    />
                  </div>

                  {showLockInput === submission.id ? (
                    <div className="flex space-x-2">
                      <input
                        type="number"
                        value={lockAmount}
                        onChange={(e) => setLockAmount(e.target.value)}
                        className="flex-1 bg-[#2A2A40]/30 border border-gray-700/20 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-400/70 focus:border-[#00ffa3]/30 focus:outline-none transition-colors"
                        placeholder="Amount in BSV"
                      />
                      <button
                        onClick={() => handleLockCoins(submission.id, parseFloat(lockAmount))}
                        disabled={lockingSubmissionId === submission.id || !lockAmount}
                        className="flex items-center space-x-1 px-4 py-1.5 bg-gradient-to-r from-[#00ffa3]/80 to-[#00ff9d]/80 text-black rounded-lg font-medium hover:shadow-lg hover:from-[#00ff9d]/90 hover:to-[#00ffa3]/90 transition-all duration-300 disabled:opacity-50"
                      >
                        {lockingSubmissionId === submission.id ? (
                          <FiLoader className="animate-spin w-4 h-4" />
                        ) : (
                          <>
                            <FiHeart className="w-4 h-4" />
                            <span>Lock</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowLockInput(submission.id)}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-1.5 border border-[#00ffa3]/30 text-[#00ffa3]/85 rounded-lg font-medium hover:bg-[#00ffa3]/10 hover:border-[#00ffa3]/40 hover:text-[#00ffa3]/95 transition-all duration-300"
                    >
                      <FiHeart className="w-4 h-4" />
                      <span>Lock BSV</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemeSubmissionGrid;