/**
 * Utility functions for calculating statistics based on locked amounts
 */
import { calculate_active_locked_amount } from './lockStatus';

/**
 * Calculate statistics with active locked amounts only
 * 
 * @param posts Array of posts with lock_likes information
 * @param current_block_height Current block height
 * @returns Object with totalLocked, participantCount, and roundNumber
 */
export function calculate_active_stats(
  posts: Array<{
    author_address?: string;
    lock_likes?: Array<{
      amount: number;
      author_address?: string;
      unlock_height?: number | null;
    }>;
  }>, 
  current_block_height: number | null
) {
  // Calculate total active locked amount across all posts
  const total_locked = posts.reduce((sum, post) => {
    const active_locked = calculate_active_locked_amount(
      post.lock_likes, 
      current_block_height
    );
    return sum + active_locked;
  }, 0);
  
  // Get unique participants (counting both post authors and lockers)
  const unique_participants = new Set(
    posts.flatMap(post => [
      post.author_address,
      ...(post.lock_likes?.map(lock => lock.author_address) || [])
    ]).filter(Boolean)
  );
  
  return {
    totalLocked: total_locked,
    participantCount: unique_participants.size,
    roundNumber: 1 // Default round number
  };
} 