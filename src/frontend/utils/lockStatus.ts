/**
 * Utility functions for determining lock status and calculating locked amounts
 */

/**
 * Checks if a locked amount is still locked based on block heights
 * 
 * @param unlock_height The block height at which the locked amount becomes unlockable
 * @param current_height The current block height
 * @returns true if the amount is still locked, false if it's unlockable
 */
export function is_still_locked(unlock_height: number | undefined | null, current_height: number | undefined | null): boolean {
  // Log the input values
  console.log('is_still_locked check:', { unlock_height, current_height });
  
  // If we're missing either height, consider it locked to be safe
  if (unlock_height === undefined || unlock_height === null) {
    console.log('unlock_height is undefined or null, considering locked');
    return true;
  }
  if (current_height === undefined || current_height === null) {
    console.log('current_height is undefined or null, considering locked');
    return true;
  }
  
  // If current block height has reached or exceeded unlock height, it's unlockable
  const isLocked = current_height < unlock_height;
  console.log(`current_height (${current_height}) < unlock_height (${unlock_height})? ${isLocked}`);
  return isLocked;
}

/**
 * Calculates the actual locked amount by filtering out amounts that are now unlockable
 * 
 * @param lock_likes Array of lock likes for a post
 * @param current_height The current block height
 * @returns The total amount that is still locked (excluding unlockable amounts)
 */
export function calculate_active_locked_amount(
  lock_likes: Array<{
    amount: number,
    unlock_height?: number | null
  }> | undefined | null, 
  current_height: number | null
): number {
  // Add detailed debug log
  console.log('calculate_active_locked_amount input:', {
    lock_likes: lock_likes ? JSON.stringify(lock_likes) : null,
    current_height,
    type: typeof lock_likes,
    isArray: Array.isArray(lock_likes)
  });

  // Handle null or undefined input
  if (!lock_likes) {
    console.log('Lock_likes is null or undefined, returning 0');
    return 0;
  }
  
  // Ensure it's an array
  if (!Array.isArray(lock_likes)) {
    console.warn('calculate_active_locked_amount received non-array input:', lock_likes);
    // NEW: Try to convert from object format if possible
    if (typeof lock_likes === 'object' && lock_likes !== null) {
      try {
        // Try to extract values if it's an object with numeric keys
        const values = Object.values(lock_likes) as Array<{
          amount: number,
          unlock_height?: number | null
        }>;
        if (values.length > 0) {
          console.log(`Converting lock_likes object to array with ${values.length} items`);
          return calculate_active_locked_amount(values, current_height);
        }
      } catch (e) {
        console.error('Failed to convert lock_likes object to array:', e);
      }
    }
    return 0;
  }
  
  // Handle empty array
  if (lock_likes.length === 0) {
    console.log('Lock_likes is an empty array, returning 0');
    return 0;
  }
  
  // Log each lock's data
  lock_likes.forEach((lock, index) => {
    console.log(`Lock ${index}:`, {
      amount: lock.amount,
      amountType: typeof lock.amount,
      unlock_height: lock.unlock_height,
      isStillLocked: is_still_locked(lock.unlock_height, current_height)
    });
  });
  
  // NEW: Check and fix invalid amount values in the array
  const fixedLocks = lock_likes.map(lock => {
    if (!lock) return { amount: 0, unlock_height: null };
    
    // Handle string amounts
    if (typeof lock.amount === 'string') {
      const parsedAmount = parseInt(lock.amount, 10);
      if (!isNaN(parsedAmount)) {
        console.log(`Converting string amount "${lock.amount}" to number: ${parsedAmount}`);
        return { ...lock, amount: parsedAmount };
      } else {
        return { ...lock, amount: 0 };
      }
    }
    
    // Handle missing or invalid amounts
    if (typeof lock.amount !== 'number' || isNaN(lock.amount)) {
      console.warn(`Invalid amount type or NaN: ${typeof lock.amount}, setting to 0`);
      return { ...lock, amount: 0 };
    }
    
    return lock;
  });
  
  // If we don't have current height, return total amount as a fallback
  if (current_height === null) {
    const total = fixedLocks.reduce((total, lock) => {
      return total + (typeof lock.amount === 'number' ? lock.amount : 0);
    }, 0);
    console.log(`No current height, returning total amount: ${total}`);
    return total;
  }
  
  const result = fixedLocks.reduce((total, lock) => {
    // Skip invalid locks
    if (!lock || typeof lock !== 'object') {
      console.warn('Skipping invalid lock in calculate_active_locked_amount:', lock);
      return total;
    }
    
    // If this individual lock is still locked, add its amount to the total
    if (is_still_locked(lock.unlock_height, current_height)) {
      // Ensure amount is a number
      const amount = typeof lock.amount === 'number' ? lock.amount : 0;
      console.log(`Adding locked amount ${amount} to total (currently ${total})`);
      return total + amount;
    }
    console.log(`Lock with amount ${lock.amount} is not still locked, not adding to total`);
    return total;
  }, 0);
  
  console.log(`Final active locked amount: ${result}`);
  return result;
}

/**
 * Calculates the total amount that has been unlocked for a post
 * 
 * @param lock_likes Array of lock likes for a post
 * @param current_height The current block height
 * @returns The total amount that is now unlockable
 */
export function calculate_unlocked_amount(
  lock_likes: Array<{
    amount: number,
    unlock_height?: number | null
  }> | undefined | null, 
  current_height: number | null
): number {
  // Handle null or undefined input
  if (!lock_likes) return 0;
  
  // Ensure it's an array
  if (!Array.isArray(lock_likes)) {
    console.warn('calculate_unlocked_amount received non-array input:', lock_likes);
    return 0;
  }
  
  // Handle empty array
  if (lock_likes.length === 0) return 0;
  
  // If we don't have current height, return 0 as we can't determine what's unlocked
  if (current_height === null) return 0;
  
  return lock_likes.reduce((total, lock) => {
    // Skip invalid locks
    if (!lock || typeof lock !== 'object') {
      console.warn('Skipping invalid lock in calculate_unlocked_amount:', lock);
      return total;
    }
    
    // If this individual lock is unlockable, add its amount to the total
    if (!is_still_locked(lock.unlock_height, current_height)) {
      // Ensure amount is a number
      const amount = typeof lock.amount === 'number' ? lock.amount : 0;
      return total + amount;
    }
    return total;
  }, 0);
}

/**
 * Gets a human-readable status message for locks
 * 
 * @param unlock_height The block height at which the locked amount becomes unlockable
 * @param current_height The current block height
 * @returns A string indicating the unlock status
 */
export function get_unlock_status(unlock_height: number | undefined | null, current_height: number | undefined | null): string {
  if (unlock_height === undefined || unlock_height === null) {
    return 'Lock details unavailable';
  }
  
  if (current_height === undefined || current_height === null) {
    return 'Loading status...';
  }
  
  if (current_height >= unlock_height) {
    return 'Unlockable now';
  }
  
  // Calculate estimated time until unlock
  const AVERAGE_BLOCK_TIME = 10 * 60; // 10 minutes in seconds
  const blocks_remaining = unlock_height - current_height;
  const seconds_remaining = blocks_remaining * AVERAGE_BLOCK_TIME;
  
  // Format the time
  if (seconds_remaining < 60) {
    return 'Unlockable in less than a minute';
  }
  
  if (seconds_remaining < 3600) {
    const minutes = Math.floor(seconds_remaining / 60);
    return `Unlockable in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  if (seconds_remaining < 86400) {
    const hours = Math.floor(seconds_remaining / 3600);
    return `Unlockable in ${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  const days = Math.floor(seconds_remaining / 86400);
  return `Unlockable in ${days} day${days !== 1 ? 's' : ''}`;
} 