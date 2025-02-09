import * as React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FiLock, FiZap, FiLoader, FiPlus, FiHeart } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';
import { formatBSV } from '../utils/formatBSV';
import { getProgressColor } from '../utils/getProgressColor';
import { MemeSubmission, Post, LockLike } from '../types';

interface MemeSubmissionGridProps {
  onStatsUpdate: (stats: { totalLocked: number; participantCount: number; roundNumber: number }) => void;
  timeFilter: string;
  rankingFilter: string;
  personalFilter: string;
  userId?: string;
}

const MemeSubmissionGrid: React.FC<MemeSubmissionGridProps> = ({ 
  onStatsUpdate, 
  timeFilter = 'all',
  rankingFilter = 'top',
  personalFilter = '',
  userId = 'anon'
}) => {
  const [submissions, setSubmissions] = useState<MemeSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
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

  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Starting to fetch submissions with filters:', { timeFilter, rankingFilter, personalFilter });
      
      // Build the base query with proper joins
      let query = supabase
        .from('Post')
        .select(`
          id,
          content,
          author_address,
          created_at,
          is_locked,
          media_url,
          media_type,
          description,
          confirmed,
          Bitcoiner (
            handle,
            address
          ),
          LockLike (
            txid,
            amount,
            handle_id,
            locked_until,
            created_at,
            confirmed
          )
        `);

      // Apply time filter
      if (timeFilter) {
        const now = new Date();
        const timeFilters = {
          '1d': 1,
          '7d': 7,
          '30d': 30
        };
        const days = timeFilters[timeFilter as keyof typeof timeFilters];
        if (days) {
          const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          query = query.gte('created_at', startDate.toISOString());
          console.log('Applied time filter:', { days, startDate });
        }
      }

      // Apply personal filters with proper foreign key relationships
      if (personalFilter === 'mylocks') {
        // First get all LockLikes for the user
        const { data: userLocks } = await supabase
          .from('LockLike')
          .select('post_id')
          .eq('handle_id', userId);
        
        console.log('Found user locks:', userLocks);
        
        if (userLocks && userLocks.length > 0) {
          const postIds = userLocks.map(lock => lock.post_id);
          query = query.in('id', postIds);
          console.log('Filtering by user lock post IDs:', postIds);
        } else {
          console.log('No user locks found');
          setSubmissions([]);
          setIsLoading(false);
          return;
        }
      } else if (personalFilter === 'locked') {
        const currentTime = Math.floor(Date.now() / 1000);
        // First get all locked posts
        const { data: lockedPosts } = await supabase
          .from('LockLike')
          .select('post_id')
          .gte('locked_until', currentTime);
        
        console.log('Found locked posts:', lockedPosts);
        
        if (lockedPosts && lockedPosts.length > 0) {
          const postIds = lockedPosts.map(lock => lock.post_id);
          query = query.in('id', postIds);
          console.log('Filtering by locked post IDs:', postIds);
        } else {
          console.log('No locked posts found');
          setSubmissions([]);
          setIsLoading(false);
          return;
        }
      }

      // Get the posts
      console.log('Executing Supabase query...');
      let { data: posts, error } = await query
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase query error:', error);
        throw error;
      }

      console.log('Raw posts data from Supabase:', posts);

      if (!posts || posts.length === 0) {
        console.log('No posts found in database');
        setSubmissions([]);
        return;
      }

      // Process and enrich the posts
      let submissionsWithStats = posts.map((post: any) => {
        console.log('Processing post:', {
          id: post.id,
          content: post.content,
          bitcoiner: post.Bitcoiner,
          lockLikes: post.LockLike
        });

        // Calculate total amount from all lock likes
        const totalLocked = post.LockLike?.reduce((sum: number, locklike: any) => {
          console.log('Lock like amount:', {
            txid: locklike.txid,
            amount: locklike.amount,
            handle_id: locklike.handle_id
          });
          return sum + (locklike?.amount || 0);
        }, 0) || 0;

        console.log('Calculated total locked amount:', {
          postId: post.id,
          totalLocked,
          lockLikesCount: post.LockLike?.length || 0
        });

        const submission = {
          id: post.id,
          creator: post.Bitcoiner?.handle || 'Anonymous',
          title: `Post by ${post.Bitcoiner?.handle || 'Anonymous'}`,
          description: post.description || post.content || '',
          prompt: '',
          style: 'viral',
          duration: 30,
          format: post.media_type || 'text/plain',
          fileUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content || '')}`,
          thumbnailUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content || '')}`,
          txId: post.id,
          locks: totalLocked,
          status: 'minted' as const,
          tags: ['meme', 'viral'],
          createdAt: new Date(post.created_at),
          updatedAt: new Date(post.created_at),
          totalLocked: totalLocked,
          threshold: 1000000000, // 10 BSV threshold
          isTop10Percent: totalLocked > 1000000000,
          isTop3: totalLocked > 2000000000,
          locklikes: post.LockLike || []
        };

        console.log('Created submission object:', submission);
        return submission;
      });

      // Apply ranking filters only if a ranking filter is selected
      submissionsWithStats.sort((a, b) => {
        // First sort by total locked amount
        const amountDiff = b.totalLocked - a.totalLocked;
        if (amountDiff !== 0) return amountDiff;
        
        // If amounts are equal, sort by most recent
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      console.log('Sorted submissions:', submissionsWithStats.map(s => ({
        id: s.id,
        totalLocked: s.totalLocked,
        createdAt: s.createdAt
      })));

      // Apply limit based on filter
      if (rankingFilter) {
        if (rankingFilter === 'top1') {
          submissionsWithStats = submissionsWithStats.slice(0, 1);
        } else if (rankingFilter === 'top3') {
          submissionsWithStats = submissionsWithStats.slice(0, 3);
        } else if (rankingFilter === 'top10') {
          submissionsWithStats = submissionsWithStats.slice(0, 10);
        }
        console.log(`Applied ${rankingFilter} filter, remaining submissions:`, submissionsWithStats.length);
      }

      console.log('Final processed submissions:', submissionsWithStats);
      setSubmissions(submissionsWithStats);

      // Update stats
      const total = submissionsWithStats.reduce((sum, sub) => sum + (sub.totalLocked || 0), 0);
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
  }, [timeFilter, rankingFilter, personalFilter, userId, onStatsUpdate]);

  // Single useEffect for initialization and data fetching
  useEffect(() => {
    const initializeAndFetch = async () => {
      try {
        console.log('Checking Supabase connection...');
        
        // First verify we have a valid client
        if (!supabase) {
          console.error('Supabase client is not initialized');
          setError('Database client not initialized');
          return;
        }

        // Test the connection with a simple query
        const { data, error } = await supabase
          .from('Post')
          .select('count')
          .limit(1);

        if (error) {
          console.error('Failed to connect to Supabase:', error);
          setError('Database connection failed: ' + error.message);
          return;
        }

        console.log('Successfully connected to Supabase. Count query result:', data);
        setIsConnected(true);
        
        // Now that we're connected, fetch the submissions
        await fetchSubmissions();

        // Subscribe to real-time updates
        const postSubscription = supabase
          .channel('posts-channel')
          .on('postgres_changes', 
            { 
              event: '*', 
              schema: 'public', 
              table: 'Post' 
            }, 
            async (payload) => {
              console.log('Received real-time update:', payload);
              // Refresh submissions when a post is added or updated
              await fetchSubmissions();
            }
          )
          .subscribe();

        // Subscribe to lock likes updates
        const lockLikeSubscription = supabase
          .channel('locklikes-channel')
          .on('postgres_changes', 
            { 
              event: '*', 
              schema: 'public', 
              table: 'LockLike' 
            }, 
            async (payload) => {
              console.log('Received lock like update:', payload);
              // Refresh submissions when a lock like is added or updated
              await fetchSubmissions();
            }
          )
          .subscribe();

        // Cleanup subscriptions on unmount
        return () => {
          postSubscription.unsubscribe();
          lockLikeSubscription.unsubscribe();
        };
      } catch (error) {
        console.error('Error during initialization:', error);
        setError('Failed to initialize: ' + (error instanceof Error ? error.message : String(error)));
      }
    };

    initializeAndFetch();
  }, [fetchSubmissions]);

  if (!isConnected) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <FiLoader className="w-8 h-8 text-[#00ffa3] animate-spin" />
          <p className="text-gray-400">Connecting to database...</p>
        </div>
      </div>
    );
  }

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center" style={{ maxWidth: 'fit-content' }}>
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