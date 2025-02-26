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
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const VoteOptionsDisplay: React.FC<VoteOptionsDisplayProps> = ({ transaction }) => {
  const [voteOptions, setVoteOptions] = useState<VoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLocking, setIsLocking] = useState<Record<string, boolean>>({});
  const { address, connected, balance, refreshBalance } = useWallet();

  useEffect(() => {
    const fetchVoteOptions = async () => {
      try {
        const response = await fetch(`${API_URL}/api/votes/${transaction.txid}/options`);
        if (!response.ok) {
          throw new Error('Failed to fetch vote options');
        }
        const data = await response.json();
        setVoteOptions(data);
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
    return <div className="mt-4 p-4 text-gray-300">Loading vote options...</div>;
  }

  if (voteOptions.length === 0) {
    return null;
  }

  // Calculate total locked amount across all options
  const totalLockedAmount = voteOptions.reduce((sum, option) => sum + (option.total_locked || 0), 0);

  return (
    <div className="mt-4 space-y-4">
      {/* Display total locked amount */}
      <div className="text-right text-sm font-medium text-gray-400">
        {formatBSV(totalLockedAmount)} BSV locked
      </div>
      
      <div className="space-y-4">
        {voteOptions.map((option) => (
          <div key={option.id} className="border-b border-gray-700/20 p-3 mb-2">
            <div className="flex justify-between items-center mb-2">
              <div className="font-medium text-white">{option.content}</div>
              <div className="text-sm text-right">{formatBSV(option.total_locked || 0)} BSV</div>
            </div>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-2.5 mb-3">
              <div 
                className="bg-[#00E6CC] h-2.5 rounded-full" 
                style={{ width: option.total_locked > 0 ? '100%' : '0%' }}
              ></div>
            </div>
            
            {connected && (
              <div className="flex items-center justify-end mt-2">
                <button
                  onClick={() => handleLock(option.id, 0.00001)}
                  disabled={isLocking[option.id]}
                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  {isLocking[option.id] ? 'Locking...' : 'Lock BSV'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VoteOptionsDisplay;
