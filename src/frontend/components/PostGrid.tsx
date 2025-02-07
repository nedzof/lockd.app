import React, { useState, useEffect, useRef } from 'react';
import { FiLock, FiZap } from 'react-icons/fi';
import supabase from '../utils/supabaseClient';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import { MemeSubmission, Post, LockLike } from '../types';
import { useWallet } from '../providers/WalletProvider';

const TIME_PERIODS = [
  { id: '1d', label: 'Last 24h' },
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' }
] as const;

const TOP_FILTERS = [
  { id: 'top1', label: 'Top Post' },
  { id: 'top3', label: 'Top 3' },
  { id: 'top10', label: 'Top 10' },
  { id: 'following', label: 'Following' },
  { id: 'my_lockings', label: 'My Lockings' },
  { id: 'locked_to_me', label: 'Locked to Me' }
] as const;

type TopFilterId = typeof TOP_FILTERS[number]['id'];

interface MemeSubmissionGridProps {
  onStatsUpdate: (stats: { totalLocked: number; participantCount: number; roundNumber: number }) => void;
}

const MemeSubmissionGrid: React.FC<MemeSubmissionGridProps> = ({ onStatsUpdate }) => {
  const [submissions, setSubmissions] = useState<MemeSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [showLockInput, setShowLockInput] = useState<string | null>(null);
  const [lockAmount, setLockAmount] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState<string | null>(null);
  const [lockingSubmissionId, setLockingSubmissionId] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [selectedTopFilter, setSelectedTopFilter] = useState<TopFilterId | null>(null);
  const [followedCreators, setFollowedCreators] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
  const { connected, bsvAddress } = useWallet();

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
      const { data, error } = await supabase
        .from('LockLike')
        .insert([
          {
            post_id: postId,
            handle: 'anon', // Using anonymous user for now
            amount: Math.floor(amount * 100000000), // Convert BSV to satoshis
            lock_period: 30, // 30 days default lock period
          }
        ]);

      if (error) throw error;

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

  const filterSubmissions = (posts: MemeSubmission[]): MemeSubmission[] => {
    // First apply time period filter
    const now = new Date();
    let filteredPosts = posts;
    
    if (selectedPeriod) {
      filteredPosts = posts.filter(post => {
        const postDate = new Date(post.createdAt);
        const hoursDiff = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60);
        
        switch (selectedPeriod) {
          case '1d':
            return hoursDiff <= 24;
          case '7d':
            return hoursDiff <= 168;
          case '30d':
            return hoursDiff <= 720;
          default:
            return true;
        }
      });
    }

    // Apply following filter if selected
    if (selectedTopFilter === 'following' && connected) {
      filteredPosts = filteredPosts.filter(post => 
        followedCreators.has(post.creator)
      );
      return filteredPosts;
    }

    // Apply my lockings filter
    if (selectedTopFilter === 'my_lockings' && connected && bsvAddress) {
      filteredPosts = filteredPosts.filter(post => 
        post.locklikes?.some(lock => lock.handle === bsvAddress)
      );
      return filteredPosts;
    }

    // Apply locked to me filter
    if (selectedTopFilter === 'locked_to_me' && connected && bsvAddress) {
      filteredPosts = filteredPosts.filter(post => 
        post.creator === bsvAddress
      );
      return filteredPosts;
    }

    // Then apply top filter if selected
    if (selectedTopFilter) {
      const sortedByLocks = [...filteredPosts].sort((a, b) => b.totalLocked - a.totalLocked);
      
      switch (selectedTopFilter) {
        case 'top1':
          return sortedByLocks.slice(0, 1);
        case 'top3':
          return sortedByLocks.slice(0, 3);
        case 'top10':
          return sortedByLocks.slice(0, 10);
        default:
          return sortedByLocks;
      }
    }

    // If no top filter selected, return all posts sorted by locks
    return [...filteredPosts].sort((a, b) => b.totalLocked - a.totalLocked);
  };

  const fetchSubmissions = async () => {
    setIsLoading(true);
    try {
      const { data: posts, error } = await supabase
        .from('Post')
        .select(`
          *,
          creator:Bitcoiner(*),
          locklikes:LockLike(*)
        `)
        .order('created_at', { ascending: false })
        .limit(9);

      if (error) throw error;

      const submissionsWithStats = posts.map((post: Post) => {
        const totalLockLiked = post.locklikes.reduce((sum: number, locklike: LockLike) => sum + locklike.amount, 0);
        const totalAmountandLockLiked = post.amount + totalLockLiked;

        return {
          id: post.txid,
          creator: post.creator.handle,
          title: `Post by ${post.creator.handle}`,
          description: post.content,
          prompt: '',
          style: 'viral',
          duration: 30,
          format: 'video/mp4',
          fileUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content)}`,
          thumbnailUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content)}`,
          txId: post.txid,
          locks: totalAmountandLockLiked,
          status: 'minted' as const,
          tags: ['meme', 'viral'],
          createdAt: new Date(post.created_at),
          updatedAt: new Date(post.created_at),
          totalLocked: totalAmountandLockLiked,
          threshold: 1000000000, // 10 BSV threshold
          isTop10Percent: totalAmountandLockLiked > 1000000000,
          isTop3: totalAmountandLockLiked > 2000000000,
          locklikes: post.locklikes
        };
      });

      setSubmissions(filterSubmissions(submissionsWithStats));

      // Update stats
      const total = submissionsWithStats.reduce((sum, sub) => sum + (sub.totalLocked || 0), 0);
      onStatsUpdate({
        totalLocked: total,
        participantCount: submissionsWithStats.length,
        roundNumber: 1
      });
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [onStatsUpdate]);

  return (
    <div className="min-h-screen text-white">
      {/* Top Navigation Bar */}
      <div className="border-b border-gray-800 mb-4">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-4 overflow-x-auto py-2">
            {/* Time Filters */}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedPeriod('1d');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedPeriod === '1d' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Last 24h
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedPeriod('7d');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedPeriod === '7d' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Last 7d
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedPeriod('30d');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedPeriod === '30d' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Last 30d
            </a>

            <div className="h-4 w-px bg-gray-800"></div>

            {/* Top Filters */}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedTopFilter('top1');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedTopFilter === 'top1' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Top Post
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedTopFilter('top3');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedTopFilter === 'top3' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Top 3
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedTopFilter('top10');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedTopFilter === 'top10' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Top 10
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedTopFilter('following');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedTopFilter === 'following' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Following
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedTopFilter('my_lockings');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedTopFilter === 'my_lockings' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              My Lockings
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSelectedTopFilter('locked_to_me');
              }}
              className={`whitespace-nowrap px-2 py-1 text-sm ${
                selectedTopFilter === 'locked_to_me' ? 'text-[#00ffa3]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Locked to Me
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {submissions.map((submission) => (
            <div
              key={submission.id}
              className="bg-[#2A2A40] rounded-lg overflow-hidden relative group aspect-square"
            >
              <div className="relative h-3/4">
                {submission.fileUrl.includes('placehold.co') ? (
                  <div className="w-full h-full flex items-center justify-center bg-[#1A1B23] p-4 text-center">
                    <p className="text-[#00ffa3] text-lg">{submission.description}</p>
                  </div>
                ) : (
                  <video
                    ref={(el) => el && (videoRefs.current[submission.id] = el)}
                    src={submission.fileUrl}
                    className="w-full h-full object-cover cursor-pointer"
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

              <div className="p-3 h-1/4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <FiLock className="text-[#00ffa3] w-4 h-4" />
                    <span className="text-[#00ffa3] font-bold text-sm">{formatBSV(submission.totalLocked / 100000000)}</span>
                  </div>
                  <div className="text-sm text-gray-400">
                    by {submission.creator}
                  </div>
                </div>

                <div className="relative h-1 bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div
                    className={`absolute left-0 top-0 h-full transition-all duration-500 ${getProgressColor(
                      submission.totalLocked,
                      submission.threshold
                    )}`}
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
                      className="flex-1 bg-[#1A1B23] border border-gray-700 rounded px-2 py-1 text-white text-sm"
                      placeholder="Amount in BSV"
                    />
                    <button
                      onClick={() => handleLockCoins(submission.id, parseFloat(lockAmount))}
                      disabled={lockingSubmissionId === submission.id || !lockAmount}
                      className="bg-[#00ffa3] text-black px-3 py-1 rounded font-bold hover:bg-[#00ff9d] transition-colors disabled:opacity-50 text-sm"
                    >
                      {lockingSubmissionId === submission.id ? (
                        <FiZap className="animate-spin w-4 h-4" />
                      ) : (
                        'Lock'
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowLockInput(submission.id)}
                    className="w-full bg-[#1A1B23] text-[#00ffa3] px-3 py-1 rounded font-bold hover:bg-[#2A2A40] transition-colors text-sm"
                  >
                    Lock BSV
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemeSubmissionGrid; 