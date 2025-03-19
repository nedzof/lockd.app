import { API_URL } from "../config";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '../providers/WalletProvider';
import toast from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';
import { calculate_active_locked_amount } from '../utils/lockStatus';

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

const VoteOptionsDisplay: React.FC<VoteOptionsDisplayProps> = ({ 
  transaction, 
  onTotalLockedAmountChange 
}) => {
  const [vote_options, setvote_options] = useState<VoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLocking, setIsLocking] = useState<Record<string, boolean>>({});
  const { isConnected, bsvAddress, balance, refreshBalance } = useWallet();

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
        const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
        const data = await response.json();
        if (data.blocks) {
          set_current_block_height(data.blocks);
        }
      } catch (error) {
        console.error('Error fetching block height:', error);
        // Fallback to approximate BSV block height
        set_current_block_height(800000);
      }
    };

    fetch_block_height();

    // Refresh block height every 10 minutes
    const block_height_interval = setInterval(fetch_block_height, 10 * 60 * 1000);
    
    return () => {
      clearInterval(block_height_interval);
    };
  }, []);

  const handleLock = async (optionId: string, amount: number) => {
    console.log('Lock button clicked for option:', optionId, 'amount:', amount);
    
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
      console.log('Converted amount to satoshis:', amountInSatoshis);
      
      console.log('Sending lock request to API for option:', optionId);
      const response = await fetch(`${API_URL}/api/lock-likes/vote-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vote_option_id: optionId,
          author_address: bsvAddress,
          amount: amountInSatoshis, // Use the satoshi amount here
          lock_duration: 1000, // Default lock duration
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock BSV on vote option');
      }

      toast.success(`Successfully locked ${amount} BSV`);
      
      // Fetch the latest data from the server for the updated option
      console.log('Fetching updated lock data for option:', optionId);
      const updatedOptionResponse = await fetch(`${API_URL}/api/votes/option/${optionId}/total-locked`);
      
      if (updatedOptionResponse.ok) {
        const updatedOptionData = await updatedOptionResponse.json();
        console.log('Updated option data:', updatedOptionData);
        
        // Update the vote option's locked amount with fresh data from the server
        const updatedOptions = vote_options.map(opt => 
          opt.id === optionId 
            ? { ...opt, total_locked: updatedOptionData.total_locked } 
            : opt
        );
        
        setvote_options(updatedOptions);
        updateTotalLocked(updatedOptions);
        
        // Refresh all vote options to ensure consistency
        await refreshVoteOptions();
      } else {
        console.error('Failed to fetch updated lock data, using local estimate instead');
        // Fall back to local estimate if server request fails
        const updatedOptions = vote_options.map(opt => 
          opt.id === optionId 
            ? { ...opt, total_locked: (opt.total_locked || 0) + amount } 
            : opt
        );
        
        setvote_options(updatedOptions);
        updateTotalLocked(updatedOptions);
      }
      
      // Refresh wallet balance
      refreshBalance();
    } catch (error) {
      console.error('Error locking BSV on vote option:', error);
      toast.error('Failed to lock BSV on vote option');
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
          
          const percentage = totalLockedAmount > 0 
            ? Math.round((activeOptionLocked / totalLockedAmount) * 100) 
            : 0;
          
          console.log(`Option ${option.id} (${option.content}): ${activeOptionLocked} satoshis (${percentage.toFixed(2)}%)`);
          
          return (
            <div key={option.id} className="relative border-b border-gray-700/20 p-3 mb-2 overflow-hidden">
              {/* Background progress bar */}
              <div 
                className="absolute inset-0 bg-[#00E6CC]/10 z-0" 
                style={{ width: `${percentage}%` }}
              />
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex-grow">
                  <div className="font-medium text-white">{option.content}</div>
                  {activeOptionLocked > 0 && (
                    <div className="text-xs text-gray-400 mt-1">
                      {formatBSV(activeOptionLocked / 100000000)} BSV ({percentage.toFixed(1)}%)
                    </div>
                  )}
                </div>
                
                {isConnected && (
                  <button
                    onClick={() => handleLock(option.id, 0.001)}
                    disabled={isLocking[option.id]}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    {isLocking[option.id] ? 'Locking...' : 'Lock BSV'}
                  </button>
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
