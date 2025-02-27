import React, { useState, useEffect } from 'react';
import { HODLTransaction } from '../types';
import { useWallet } from '../providers/WalletProvider';
import toast from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';

// Define the VoteOption type
interface VoteOption {
  id: string;
  txid: string;
  content: string;
  lock_amount: number;
  total_locked: number;
  created_at: string;
}

interface VoteOptionsDisplayProps {
  transaction: HODLTransaction;
  onTotalLockedAmountChange?: (amount: number) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const VoteOptionsDisplay: React.FC<VoteOptionsDisplayProps> = ({ 
  transaction, 
  onTotalLockedAmountChange 
}) => {
  const [voteOptions, setVoteOptions] = useState<VoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLocking, setIsLocking] = useState<Record<string, boolean>>({});
  const { address, connected, balance, refreshBalance } = useWallet();

  console.log('VoteOptionsDisplay rendering for txid:', transaction.txid);

  useEffect(() => {
    console.log('VoteOptionsDisplay useEffect running for txid:', transaction.txid);
    
    const fetchVoteOptions = async () => {
      try {
        console.log(`[Frontend] Fetching vote options for txid: ${transaction.txid}`);
        console.log(`[Frontend] API URL: ${API_URL}/api/votes/${transaction.txid}/options`);
        
        const response = await fetch(`${API_URL}/api/votes/${transaction.txid}/options`);
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
        
        setVoteOptions(data);
        
        // Calculate and notify parent of total locked amount
        const totalLocked = data.reduce((sum: number, option: VoteOption) => 
          sum + (option.total_locked || 0), 0);
        if (onTotalLockedAmountChange) {
          onTotalLockedAmountChange(totalLocked);
        }
      } catch (error) {
        console.error('Error fetching vote options:', error);
        toast.error('Failed to load vote options');
      } finally {
        setLoading(false);
      }
    };

    if (transaction.txid) {
      fetchVoteOptions();
    }
  }, [transaction.txid]);

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
      setVoteOptions(prev => 
        prev.map(opt => 
          opt.id === optionId 
            ? { ...opt, total_locked: (opt.total_locked || 0) + amount } 
            : opt
        )
      );
      
      // Calculate and notify parent of new total locked amount
      const newTotalLocked = voteOptions.reduce((sum, opt) => 
        sum + (opt.id === optionId ? (opt.total_locked || 0) + amount : (opt.total_locked || 0)), 0);
      if (onTotalLockedAmountChange) {
        onTotalLockedAmountChange(newTotalLocked);
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

  if (loading) {
    console.log('VoteOptionsDisplay is loading...');
    return <div className="mt-4 p-4 text-gray-300">Loading vote options...</div>;
  }

  if (voteOptions.length === 0) {
    console.log('No vote options found');
    return null;
  }

  // Calculate total locked amount across all options
  const totalLockedAmount = voteOptions.reduce((sum, option) => sum + (option.total_locked || 0), 0);
  console.log('VoteOptionsDisplay - Total locked amount:', totalLockedAmount);
  console.log('VoteOptionsDisplay - Component structure before render:', {
    voteOptions,
    loading,
    isLocking,
    totalLockedAmount
  });

  // Log the rendered structure after component mounts
  useEffect(() => {
    console.log('VoteOptionsDisplay - Component mounted');
    setTimeout(() => {
      const voteOptionsElement = document.querySelector('.mt-4.space-y-4');
      if (voteOptionsElement) {
        console.log('VoteOptionsDisplay element structure:', voteOptionsElement.outerHTML);
      }
      
      const optionElements = document.querySelectorAll('.relative.border-b');
      if (optionElements.length > 0) {
        console.log('VoteOptionsDisplay option elements count:', optionElements.length);
        console.log('First option element:', optionElements[0].outerHTML);
      }
    }, 1000);
  }, [voteOptions]);

  return (
    <div className="mt-4 space-y-4">
      {/* Display the vote question/content */}
      <div className="text-lg font-semibold text-white mb-4">
        {transaction.content || (transaction.metadata?.voteQuestion) || 'Vote Post'}
      </div>
      
      <div className="space-y-4">
        {voteOptions.map((option) => {
          console.log('Rendering option:', option.content, 'with locked amount:', option.total_locked);
          // Calculate percentage for this option
          const totalLockedForAll = voteOptions.reduce((sum, opt) => sum + (opt.total_locked || 0), 0);
          const percentage = totalLockedForAll > 0 ? ((option.total_locked || 0) / totalLockedForAll) * 100 : 0;
          
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

export default VoteOptionsDisplay;
