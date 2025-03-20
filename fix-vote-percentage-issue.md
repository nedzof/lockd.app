# Fix for 0% Vote Option Percentages

Our testing has identified several issues that may be causing vote options to display as 0% in the UI.

## Key Findings

1. **Calculation Logic is Correct:** The basic percentage calculation logic is correct: `Math.round((optionLockedAmount / totalLocked) * 100)`

2. **Key Issues Identified:**
   - `lock_amount` property on vote options is 0, but actual locks are in `lock_likes` array
   - Only active locks (current_block_height < unlock_height) should be counted
   - There may be type conversion issues between string and number amounts
   - UI may not be refreshing properly after new locks are added

## Fixes to Implement

### 1. In the PostGrid component:

Update the `calculatePercentage` function to properly handle different input types:

```typescript
function calculatePercentage(amount: number, total: number): number {
  if (!total) return 0;
  
  // Ensure we're dealing with numbers
  const safeAmount = typeof amount === 'number' ? amount : parseInt(String(amount), 10) || 0;
  const safeTotal = typeof total === 'number' ? total : parseInt(String(total), 10) || 0;
  
  // Calculate percentage and round to nearest integer
  return Math.round((safeAmount / safeTotal) * 100);
}
```

### 2. In the VoteOptionsDisplay component:

Update the percentage calculation in the `vote_options.map()` function:

```typescript
// Calculate percentage based on active locked amount
const activeOptionLocked = option.lock_likes 
  ? calculate_active_locked_amount(option.lock_likes, current_block_height)
  : (option.total_locked || 0);

// Ensure we're dealing with numbers
const safeOptionLocked = typeof activeOptionLocked === 'number' 
  ? activeOptionLocked 
  : parseInt(String(activeOptionLocked), 10) || 0;

const safeTotalLocked = typeof totalLockedAmount === 'number'
  ? totalLockedAmount
  : parseInt(String(totalLockedAmount), 10) || 0;

const percentage = safeTotalLocked > 0 
  ? Math.round((safeOptionLocked / safeTotalLocked) * 100) 
  : 0;
```

### 3. Ensure Active Locks Calculation:

Make sure that we're properly calculating active locks by checking `unlock_height` against current block height:

```typescript
// Calculate total active locked amount for all vote options
const totalLocked = post.vote_options.reduce((sum, option) => {
  // Calculate active locked amount for this option
  let optionLockedAmount = option.lock_amount || 0;
  
  if (option.lock_likes && Array.isArray(option.lock_likes)) {
    // Type assertion for TypeScript
    const typedLockLikes = option.lock_likes as Array<{
      amount: number;
      unlock_height?: number | null;
    }>;
    
    // Use calculate_active_locked_amount to determine actual locked amount
    optionLockedAmount = calculate_active_locked_amount(typedLockLikes, currentBlockHeight);
  }
  
  return sum + optionLockedAmount;
}, 0);
```

### 4. Add Force Refresh Mechanism:

In the `handleLock` function, ensure UI gets refreshed at multiple points:

```typescript
// Immediately after adding a lock
setvote_options(updatedOptions);

// Notify parent of total amount change
if (onTotalLockedAmountChange) {
  onTotalLockedAmountChange(newTotalLocked);
}

// Force multiple refreshes with delays
setTimeout(() => {
  console.log('[LOCK DIAGNOSTICS] Force UI update after delay');
  setvote_options([...updatedOptions]);
  if (onTotalLockedAmountChange) {
    onTotalLockedAmountChange(newTotalLocked);
  }
}, 500);

// Then fetch fresh data from server
try {
  console.log('[LOCK DIAGNOSTICS] Fetching updated lock data from server');
  await refreshVoteOptions();
} catch (refreshError) {
  console.error('[LOCK DIAGNOSTICS] Error refreshing vote options after lock:', refreshError);
}

// Final refresh
setTimeout(() => {
  refreshVoteOptions().catch(e => console.error('Final refresh error:', e));
}, 1500);
```

## Testing

Once these changes are implemented, you can test by:

1. Opening a post with vote options
2. Making sure the browser developer console is open
3. Looking for logs labeled `[VOTE DEBUG]` and `[LOCK DIAGNOSTICS]`
4. Locking some BSV to a vote option
5. Verifying that the percentages update correctly
6. Checking that the locked amount appears immediately in the UI

These fixes should ensure that vote options display the correct percentages based on active locks even when the `lock_amount` property is 0. 