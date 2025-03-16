import { API_URL } from "../../config";
import React, { useState, useEffect, useCallback } from 'react';
import { HODLTransaction, vote_option } from '../types';
import { useWallet } from '../providers/WalletProvider';
import toast from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';

interface vote_optionsDisplayProps {
  transaction: HODLTransaction;
  onTotalLockedAmountChange?: (amount: number) => void;
}


const vote_optionsDisplay: React.FC<vote_optionsDisplayProps> = ({ 
  transaction, 
  onTotalLockedAmountChange 
}) => {
  const [vote_options, setvote_options] = useState<vote_option[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLocking, setIsLocking] = useState<Record<string, boolean>>({});
  const { address, connected, balance, refreshBalance } = useWallet();

  console.log('vote_optionsDisplay rendering for tx_id:', transaction.tx_id);

  // Calculate and notify parent of total locked amount
  const updateTotalLocked = useCallback((options: vote_option[]) => {
    const totalLocked = options.reduce((sum: number, option: vote_option) => 
      sum + (option.total_locked || 0), 0);
    
    console.log('Calculated total locked amount:', totalLocked);
    
    if (onTotalLockedAmountChange) {
      onTotalLockedAmountChange(totalLocked);
    }
  }, [onTotalLockedAmountChange]);

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
        const processedOptions = data.map((option: vote_option) => ({
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
    }
  }, [transaction.tx_id, transaction.vote_options, updateTotalLocked]);

  const handleLock = async (optionId: string, amount: number) => {
    console.log('Lock button clicked for option:', optionId, 'amount:', amount);
    
    if (!connected) {
      toast.error('Please connect your wallet first');
      return;
    }

    if (amount <= 0) {
      toast.error('Please enter a valid amount to lock');
      return;
    }

    if (amount > (balance || 0)) {
      toast.error('Insufficient balance');
      return;
    }

    setIsLocking(prev => ({ ...prev, [optionId]: true }));

    try {
      console.log('Sending lock request to API for option:', optionId);
      const response = await fetch(`${API_URL}/api/lock-likes/vote-options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vote_option_id: optionId,
          author_address: address,
          amount,
          lock_duration: 1000, // Default lock duration
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock BSV on vote option');
      }

      toast.success(`Successfully locked ${amount} BSV`);
      
      // Update the vote option's locked amount locally
      const updatedOptions = vote_options.map(opt => 
        opt.id === optionId 
          ? { ...opt, total_locked: (opt.total_locked || 0) + amount } 
          : opt
      );
      
      setvote_options(updatedOptions);
      updateTotalLocked(updatedOptions);
      
      // Refresh wallet balance
      refreshBalance();
    } catch (error) {
      console.error('Error locking BSV on vote option:', error);
      toast.error('Failed to lock BSV on vote option');
    } finally {
      setIsLocking(prev => ({ ...prev, [optionId]: false }));
    }
  };

  if (loading) {
    console.log('vote_optionsDisplay is loading...');
    return <div className="mt-4 p-4 text-gray-300">Loading vote options...</div>;
  }

  if (!vote_options || vote_options.length === 0) {
    console.log('No vote options found');
    return null;
  }

  // Calculate total locked amount across all options
  const totalLockedAmount = vote_options.reduce((sum, option) => sum + (option.total_locked || 0), 0);
  console.log('vote_optionsDisplay - Total locked amount:', totalLockedAmount);

  return (
    <div className="mt-4 space-y-4">
      {/* Display the vote question/content */}
      <div className="text-lg font-semibold text-white mb-4">
        {transaction.content || (transaction.metadata?.voteQuestion) || 'Vote Post'}
      </div>
      
      <div className="space-y-4">
        {vote_options.map((option) => {
          console.log('Rendering option:', option.content, 'with locked amount:', option.total_locked);
          // Calculate percentage for this option
          const percentage = totalLockedAmount > 0 ? ((option.total_locked || 0) / totalLockedAmount) * 100 : 0;
          
          return (
            <div key={option.id} className="relative border-b border-gray-700/20 p-3 mb-2 overflow-hidden">
              {/* Background progress bar */}
              <div 
                className="absolute inset-0 bg-[#00E6CC]/10 z-0" 
                style={{ width: `${percentage}%` }}
              />
              
              <div className="flex items-center justify-between relative z-10">
                <div className="font-medium text-white flex-grow">{option.content}</div>
                
                {connected && (
                  <button
                    onClick={() => handleLock(option.id, 0.00001)}
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

export default vote_optionsDisplay;
