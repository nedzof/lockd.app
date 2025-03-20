import { API_URL } from "../config";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../providers/WalletProvider';
import toast from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';
import { calculate_active_locked_amount } from '../utils/lockStatus';
import VoteOptionLockInteraction from './VoteOptionLockInteraction';

// Define needed types locally if they're not properly exported
interface VoteOption {
  id: string;
  tx_id: string;
  content: string;
  author_address?: string;
  created_at: string;
  lock_amount: number;
  lock_duration: number;
  unlock_height?: number;
  tags: string[];
  total_locked?: number;
  lock_likes?: Array<{
    amount: number;
    author_address?: string;
    unlock_height?: number | null;
  }>;
}

interface Transaction {
  tx_id: string;
  content: string;
  vote_options?: VoteOption[];
  [key: string]: any;
}

interface VoteOptionsDisplayProps {
  transaction: Transaction;
  onTotalLockedAmountChange?: (amount: number) => void;
}

// Add at appropriate location outside component
async function getCurrentBlockHeight(): Promise<number | null> {
  try {
    // Use the WhatsOnChain block headers endpoint as suggested
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/block/headers');
    if (!response.ok) {
      console.error('Failed to fetch current block height from WhatsOnChain');
      return null;
    }
    
    const data = await response.json();
    
    // The first item in the array is the latest block
    if (Array.isArray(data) && data.length > 0 && data[0].height) {
      console.log('Current block height from WhatsOnChain:', data[0].height);
      return data[0].height;
    } else {
      console.error('Unexpected response format from WhatsOnChain:', data);
      return null;
    }
  } catch (error) {
    console.error('Error fetching block height from WhatsOnChain:', error);
    return null;
  }
}

const VoteOptionsDisplay: React.FC<VoteOptionsDisplayProps> = ({ 
  transaction, 
  onTotalLockedAmountChange 
}) => {
  const [vote_options, setvote_options] = useState<VoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLocking, setIsLocking] = useState<Record<string, boolean>>({});
  const { isConnected, bsvAddress, balance, refreshBalance, wallet } = useWallet();

  // Add current block height state
  const [current_block_height, set_current_block_height] = useState<number | null>(null);

  console.log('vote_optionsDisplay rendering for tx_id:', transaction.tx_id);

  // Calculate and notify parent of total locked amount
  const updateTotalLocked = useCallback((options: VoteOption[]) => {
    const totalLocked = options.reduce((sum: number, option: VoteOption) => 
      sum + (option.total_locked || 0), 0);
    
    console.log('Calculated total locked amount:', totalLocked);
    
    if (onTotalLockedAmountChange) {
      onTotalLockedAmountChange(totalLocked);
    }
  }, [onTotalLockedAmountChange]);

  // Function to fetch all vote options
  const refreshVoteOptions = useCallback(async () => {
    console.log(`[Frontend] Refreshing all vote options for tx_id: ${transaction.tx_id}`);
    setRefreshing(true);
    try {
      const response = await fetch(`${API_URL}/api/votes/${transaction.tx_id}/options`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch vote options');
      }
      
      const data = await response.json();
      console.log('[Frontend] Refreshed vote options received:', JSON.stringify(data, null, 2));
      
      // Ensure each vote option has a total_locked property
      const processedOptions = data.map((option: any) => ({
        ...option,
        total_locked: option.total_locked || option.lock_amount || 0
      }));
      
      setvote_options(processedOptions);
      updateTotalLocked(processedOptions);
    } catch (error) {
      console.error('Error refreshing vote options:', error);
    } finally {
      setRefreshing(false);
    }
  }, [transaction.tx_id, updateTotalLocked]);

  useEffect(() => {
    console.log('vote_optionsDisplay useEffect running for tx_id:', transaction.tx_id);
    
    const fetchvote_options = async () => {
      try {
        // If we already have vote options in the transaction, use those
        if (transaction.vote_options && transaction.vote_options.length > 0) {
          console.log('[Frontend] Using vote options from transaction:', transaction.vote_options);
          
          // Ensure each vote option has a total_locked property
          const processedOptions = transaction.vote_options.map(option => ({
            ...option,
            total_locked: option.total_locked || option.lock_amount || 0
          }));
          
          setvote_options(processedOptions);
          updateTotalLocked(processedOptions);
          setLoading(false);
          return;
        }
        
        console.log(`[Frontend] Fetching vote options for tx_id: ${transaction.tx_id}`);
        console.log(`[Frontend] API URL: ${API_URL}/api/votes/${transaction.tx_id}/options`);
        
        const response = await fetch(`${API_URL}/api/votes/${transaction.tx_id}/options`);
        console.log(`[Frontend] Response status:`, response.status);
        
        if (!response.ok) {
          console.log(`[Frontend] Response not OK:`, response.statusText);
          throw new Error('Failed to fetch vote options');
        }
        
        const data = await response.json();
        console.log('[Frontend] Vote options received:', JSON.stringify(data, null, 2));
        
        if (data.length === 0) {
          console.log('[Frontend] No vote options found in response');
        }
        
        // Ensure each vote option has a total_locked property
        const processedOptions = data.map((option: any) => ({
          ...option,
          total_locked: option.total_locked || option.lock_amount || 0
        }));
        
        setvote_options(processedOptions);
        updateTotalLocked(processedOptions);
      } catch (error) {
        console.error('Error fetching vote options:', error);
        toast.error('Failed to load vote options');
      } finally {
        setLoading(false);
      }
    };

    if (transaction.tx_id) {
      fetchvote_options();
      
      // Set up auto-refresh every 30 seconds
      const intervalId = setInterval(() => {
        console.log('[Frontend] Auto-refreshing vote options');
        refreshVoteOptions();
      }, 30000); // 30 seconds
      
      // Clean up interval when component unmounts
      return () => {
        console.log('[Frontend] Clearing auto-refresh interval');
        clearInterval(intervalId);
      };
    }
  }, [transaction.tx_id, transaction.vote_options, updateTotalLocked, refreshVoteOptions]);

  // Fetch current block height on component mount
  useEffect(() => {
    const fetch_block_height = async () => {
      try {
        // Use the same WhatsOnChain block headers endpoint for consistency
        const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/block/headers');
        const data = await response.json();
        
        // Extract the height from the first block in the array
        if (Array.isArray(data) && data.length > 0 && data[0].height) {
          set_current_block_height(data[0].height);
          console.log('Current block height set from WhatsOnChain:', data[0].height);
        } else {
          console.error('Unexpected response format from WhatsOnChain:', data);
          // Fallback to approximate BSV block height
          set_current_block_height(888000);
        }
      } catch (error) {
        console.error('Error fetching block height:', error);
        // Fallback to approximate BSV block height
        set_current_block_height(888000);
      }
    };

    fetch_block_height();

    // Refresh block height every 10 minutes
    const block_height_interval = setInterval(fetch_block_height, 10 * 60 * 1000);
    
    return () => {
      clearInterval(block_height_interval);
    };
  }, []);

  const handleLock = async (optionId: string, amount: number, duration: number = 1000) => {
    console.log('[LOCK DIAGNOSTICS] Lock requested for option:', optionId);
    console.log('[LOCK DIAGNOSTICS] Lock amount:', amount, 'BSV');
    console.log('[LOCK DIAGNOSTICS] Lock duration:', duration, 'blocks');
    
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (amount <= 0) {
      toast.error('Please enter a valid amount to lock');
      return;
    }

    if (amount > balance.bsv) {
      toast.error('Insufficient balance');
      return;
    }

    setIsLocking(prev => ({ ...prev, [optionId]: true }));

    try {
      // Convert BSV amount to satoshis (1 BSV = 100,000,000 satoshis)
      const amountInSatoshis = Math.round(amount * 100000000);
      console.log('[LOCK DIAGNOSTICS] Converted amount to satoshis:', amountInSatoshis);
      
      // Show loading toast
      const toastId = toast.loading('Checking wallet balance...');
      
      // Get current block height for calculating unlock height
      const currentBlockHeight = current_block_height || await getCurrentBlockHeight();
      console.log('[LOCK DIAGNOSTICS] Current block height:', currentBlockHeight);
      
      if (!currentBlockHeight) {
        toast.dismiss(toastId);
        toast.error('Could not determine current block height');
        return;
      }
      
      // Calculate unlock height based on current height and duration
      const unlockHeight = currentBlockHeight + duration;
      console.log('[LOCK DIAGNOSTICS] Calculated unlock height:', unlockHeight, '(current:', currentBlockHeight, '+ duration:', duration, ')');
      
      // Check what methods are actually available on the wallet object
      console.log('[LOCK DIAGNOSTICS] Wallet object methods:', {
        exists: !!wallet,
        hasLock: !!(wallet && wallet.lock),
        hasLockBsv: !!(wallet && wallet.lockBsv),
        // List all available methods on the wallet
        methods: wallet ? Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)) : [],
        // List all available properties on the wallet
        properties: wallet ? Object.keys(wallet) : []
      });
      
      // Determine which lock method to use based on what's available
      const lockMethod = wallet && wallet.lock 
        ? 'lock'  // Use new method per docs
        : wallet && wallet.lockBsv 
          ? 'lockBsv'  // Fall back to old method
          : null;  // No lock method available
      
      if (!wallet || !lockMethod) {
        toast.dismiss(toastId);
        toast.error('Wallet locking capability not available');
        return;
      }
      
      // Get the wallet address (we should already have this from the wallet provider)
      console.log('[LOCK DIAGNOSTICS] BSV address:', bsvAddress);
      
      if (!bsvAddress) {
        toast.dismiss(toastId);
        toast.error('Could not get wallet address');
        return;
      }
      
      console.log('[LOCK DIAGNOSTICS] Using address for locking:', bsvAddress);
      
      // Update toast message
      toast.dismiss(toastId);
      const lockingToastId = toast.loading('Waiting for wallet confirmation...');
      
      // Create lock parameters using exact format from documentation
      const locks = [
        {
          address: bsvAddress,
          blockHeight: unlockHeight,
          sats: amountInSatoshis
        }
      ];
      
      console.log('[LOCK DIAGNOSTICS] Lock parameters:', JSON.stringify(locks, null, 2));
      console.log('[LOCK DIAGNOSTICS] Lock parameters types:', {
        address: typeof bsvAddress,
        blockHeight: typeof unlockHeight,
        sats: typeof amountInSatoshis
      });
      
      // Declare lockResponse outside the try block
      let lockResponse;
      
      try {
        // Use the appropriate lock method based on availability
        console.log(`[LOCK DIAGNOSTICS] Calling wallet.${lockMethod} with parameters...`);
        
        if (lockMethod === 'lock') {
          lockResponse = await wallet.lock(locks);
        } else {
          // Fall back to lockBsv
          lockResponse = await wallet.lockBsv(locks);
        }
        
        console.log('[LOCK DIAGNOSTICS] Lock transaction response:', lockResponse);
        
        if (!lockResponse || !lockResponse.txid) {
          console.error('[LOCK DIAGNOSTICS] Lock response missing txid:', lockResponse);
          toast.dismiss(lockingToastId);
          throw new Error('Failed to create lock transaction - missing txid in response');
        }
      } catch (lockError) {
        console.error(`[LOCK DIAGNOSTICS] Error in wallet.${lockMethod} call:`, lockError);
        
        // Try to extract detailed error information
        let errorDetails = '';
        if (lockError instanceof Error) {
          errorDetails = lockError.message;
          console.error('[LOCK DIAGNOSTICS] Error message:', lockError.message);
          console.error('[LOCK DIAGNOSTICS] Error stack:', lockError.stack);
        } else {
          errorDetails = String(lockError);
          console.error('[LOCK DIAGNOSTICS] Non-Error object thrown:', lockError);
        }
        
        toast.dismiss(lockingToastId);
        throw new Error(`Wallet lock error: ${errorDetails}`);
      }
      
      // Update toast message
      toast.dismiss(lockingToastId);
      const apiToastId = toast.loading('Processing lock...');
      
      // Call the API with the transaction ID
      console.log('Sending lock request to API for option:', optionId);
      const response = await fetch(`${API_URL}/api/lock-likes/vote-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vote_option_id: optionId,
          author_address: bsvAddress,
          amount: amountInSatoshis,
          lock_duration: duration,
          tx_id: lockResponse.txid
        }),
      });

      // Dismiss API toast
      toast.dismiss(apiToastId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LOCK DIAGNOSTICS] API error (${response.status}):`, errorText);
        throw new Error('Failed to lock BSV on vote option');
      }

      toast.success(`Successfully locked ${amount} BSV`);
      
      // Ensure we're calculating active locks correctly
      console.log('[LOCK DIAGNOSTICS] Lock transaction successful:', lockResponse || 'No response data');

      // Get the current block height for calculating active locks
      // Use the existing value from scope
      console.log(`[LOCK DIAGNOSTICS] Using current block height: ${currentBlockHeight}`);

      // Create a deep copy to avoid reference issues
      const updatedOptions = vote_options.map(opt => {
        if (opt.id === optionId) {
          console.log(`[LOCK DIAGNOSTICS] Updating option ${opt.id} (${opt.content})`);
          console.log(`[LOCK DIAGNOSTICS] - Current total_locked:`, opt.total_locked);
          console.log(`[LOCK DIAGNOSTICS] - Adding amount:`, amountInSatoshis);
          
          // Create new lock_likes array or add to existing
          const newLockLikes = [
            ...(opt.lock_likes || []),
            {
              amount: amountInSatoshis,
              author_address: bsvAddress,
              unlock_height: unlockHeight
            }
          ];
          
          console.log(`[LOCK DIAGNOSTICS] - New lock_likes:`, JSON.stringify(newLockLikes, null, 2));
          
          // Return updated option with new values
          return { 
            ...opt, 
            total_locked: (opt.total_locked || 0) + amountInSatoshis,
            lock_likes: newLockLikes
          }; 
        }
        return opt;
      });
      
      console.log(`[LOCK DIAGNOSTICS] Updated vote_options:`, JSON.stringify(updatedOptions, null, 2));
      
      // Calculate the new total locked amount directly using active locks
      const newTotalLocked = updatedOptions.reduce((total, opt) => {
        let optionTotal = 0;
        
        if (opt.lock_likes && Array.isArray(opt.lock_likes) && opt.lock_likes.length > 0) {
          // Calculate active locked amount for this option
          optionTotal = calculate_active_locked_amount(opt.lock_likes, currentBlockHeight);
        } else {
          // Fall back to total_locked or lock_amount
          optionTotal = opt.total_locked || opt.lock_amount || 0;
        }
        
        console.log(`[LOCK DIAGNOSTICS] Option ${opt.id} (${opt.content}) locked amount: ${optionTotal}`);
        return total + optionTotal;
      }, 0);
      
      console.log(`[LOCK DIAGNOSTICS] New total locked amount: ${newTotalLocked}`);
      console.log(`[LOCK DIAGNOSTICS] Setting new vote_options and total locked amount`);
      
      // Update state with the new options
      setvote_options(updatedOptions);
      
      // Notify parent of total amount change
      if (onTotalLockedAmountChange) {
        console.log(`[LOCK DIAGNOSTICS] Calling onTotalLockedAmountChange with: ${newTotalLocked}`);
        onTotalLockedAmountChange(newTotalLocked);
      }
      
      // Add a delay and force a second update to ensure UI refreshes
      setTimeout(() => {
        console.log('[LOCK DIAGNOSTICS] Force second UI update after delay');
        setvote_options([...updatedOptions]);
        
        // Force another update of the parent component
        if (onTotalLockedAmountChange) {
          onTotalLockedAmountChange(newTotalLocked);
        }
      }, 500);
      
      // Then fetch fresh data from server
      try {
        console.log('[LOCK DIAGNOSTICS] Fetching updated lock data from server');
        await refreshVoteOptions();
        console.log('[LOCK DIAGNOSTICS] Vote options refreshed from server');
      } catch (refreshError) {
        console.error('[LOCK DIAGNOSTICS] Error refreshing vote options after lock:', refreshError);
        // We already updated UI optimistically, so just log this error
      }
      
      // Force another refresh
      setTimeout(() => {
        console.log('[LOCK DIAGNOSTICS] Final UI refresh');
        refreshVoteOptions().catch(e => console.error('Final refresh error:', e));
        
        // Make sure to notify parent again
        updatedOptions.forEach(opt => {
          console.log(`[LOCK DIAGNOSTICS] Final update - Option ${opt.id} (${opt.content}) has ${opt.lock_likes?.length || 0} locks and total_locked ${opt.total_locked || 0}`);
        });
      }, 1500);
      
      // Refresh wallet balance
      refreshBalance();
    } catch (error: unknown) {
      console.error('Error locking BSV on vote option:', error);
      
      // Handle user cancellation vs actual errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('User cancelled') || errorMessage.includes('User rejected')) {
        toast.error('Transaction cancelled by user');
      } else {
        toast.error('Failed to lock BSV on vote option');
      }
    } finally {
      setIsLocking(prev => ({ ...prev, [optionId]: false }));
    }
  };

  // Calculate total locked amount across all options
  const totalLockedAmount = useMemo(() => {
    return vote_options.reduce((sum, option) => {
      // Use lock_likes array if available
      if (option.lock_likes) {
        return sum + calculate_active_locked_amount(option.lock_likes, current_block_height);
      }
      
      // Otherwise fall back to total_locked property
      const optionLocked = typeof option.total_locked === 'number' ? option.total_locked : 0;
      return sum + optionLocked;
    }, 0);
  }, [vote_options, current_block_height]);
  
  if (loading) {
    console.log('vote_optionsDisplay is loading...');
    return <div className="mt-4 p-4 text-gray-300">Loading vote options...</div>;
  }

  if (!vote_options || vote_options.length === 0) {
    console.log('No vote options found');
    return null;
  }

  console.log('vote_optionsDisplay - Total locked amount:', totalLockedAmount);

  return (
    <div className="mt-4 space-y-4">
      {/* Display the vote question/content */}
      <div className="text-lg font-semibold text-white mb-4">
        {transaction.content || (transaction.metadata?.voteQuestion) || 'Vote Post'}
      </div>
      
      {/* Add refreshing indicator */}
      {refreshing && (
        <div className="text-xs text-gray-400 animate-pulse mb-2">
          Refreshing stats...
        </div>
      )}
      
      {/* Show total locked amount */}
      {totalLockedAmount > 0 && (
        <div className="text-xs text-gray-400 mb-2">
          Total locked: {formatBSV(totalLockedAmount / 100000000)} BSV
        </div>
      )}
      
      <div className="space-y-4">
        {vote_options.map((option) => {
          console.log('Rendering option:', option.content, 'with locked amount:', option.total_locked);
          
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
          
          console.log(`[VOTE DEBUG] Option ${option.id} (${option.content}): ${safeOptionLocked} satoshis (${percentage}% of ${safeTotalLocked})`);
          
          return (
            <div key={option.id} className="relative border-b border-gray-700/20 p-3 mb-2 overflow-hidden">
              {/* Background progress bar - ensure it's visible when non-zero */}
              <div 
                className={`absolute inset-0 bg-[#00E6CC]/10 z-0 ${percentage > 0 ? 'transition-all duration-300' : ''}`}
                style={{ 
                  width: `${Math.max(percentage, percentage > 0 ? 5 : 0)}%`, 
                  minWidth: percentage > 0 ? '5%' : '0'
                }}
              />
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex-grow">
                  <div className="font-medium text-white">{option.content}</div>
                  {/* Always show the percentage, even if zero */}
                  <div className="text-xs text-gray-400 mt-1">
                    {formatBSV(safeOptionLocked / 100000000)} BSV 
                    <span className={safeOptionLocked > 0 ? 'text-[#00E6CC]' : 'text-gray-500'}>
                      {' '}({percentage.toFixed(1)}%)
                    </span>
                  </div>
                </div>
                
                {isConnected && (
                  <VoteOptionLockInteraction
                    optionId={option.id}
                    connected={isConnected}
                    isLocking={isLocking[option.id]}
                    onLock={handleLock}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VoteOptionsDisplay;
