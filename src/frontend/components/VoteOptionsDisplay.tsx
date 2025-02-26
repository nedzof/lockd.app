import React, { useState, useEffect } from 'react';
import { HODLTransaction } from '../types';
import { useWallet } from '../providers/WalletProvider';
import toast from 'react-hot-toast';
import { formatBSV } from '../utils/formatBSV';
import VoteOptionLockInteraction from './VoteOptionLockInteraction';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

const VoteOptionsDisplay: React.FC<VoteOptionsDisplayProps> = ({ transaction }) => {
  const [voteOptions, setVoteOptions] = useState<VoteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lockAmounts, setLockAmounts] = useState<Record<string, number>>({});
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

  const handleLockAmountChange = (optionId: string, amount: number) => {
    setLockAmounts(prev => ({
      ...prev,
      [optionId]: amount
    }));
  };

  const handleLockSubmit = async (option: VoteOption) => {
    if (!connected) {
      toast.error('Please connect your wallet first');
      return;
    }

    const amount = lockAmounts[option.id] || 0;
    if (amount <= 0) {
      toast.error('Please enter a valid amount to lock');
      return;
    }

    if (amount > (balance || 0)) {
      toast.error('Insufficient balance');
      return;
    }

    setIsLocking(prev => ({ ...prev, [option.id]: true }));

    try {
      const response = await fetch(`${API_URL}/api/lock-likes/voteOption`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vote_option_id: option.id,
          author_address: address,
          amount,
          lock_duration: 1000, // Default lock duration
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to lock BSV on vote option');
      }

      toast.success(`Successfully locked ${amount} BSV on "${option.content}"`);
      
      // Update the vote option's locked amount locally
      setVoteOptions(prev => 
        prev.map(opt => 
          opt.id === option.id 
            ? { ...opt, lock_amount: opt.lock_amount + amount, total_locked: (opt.total_locked || 0) + amount } 
            : opt
        )
      );

      // Clear the input
      setLockAmounts(prev => ({ ...prev, [option.id]: 0 }));
      
      // Refresh wallet balance
      refreshBalance();
    } catch (error) {
      console.error('Error locking BSV on vote option:', error);
      toast.error('Failed to lock BSV on vote option');
    } finally {
      setIsLocking(prev => ({ ...prev, [option.id]: false }));
    }
  };

  // Calculate total locked amount across all options
  const totalLockedAmount = voteOptions.reduce((sum, option) => sum + (option.total_locked || 0), 0);

  if (loading) {
    return <div className="mt-4 p-4 text-gray-300">Loading vote options...</div>;
  }

  if (voteOptions.length === 0) {
    return <div className="mt-4 p-4 text-gray-300">No vote options available for this post.</div>;
  }

  return (
    <div className="mt-4 space-y-4">
      <h3 className="text-lg font-semibold mb-3">Vote Options</h3>
      <div className="space-y-4">
        {voteOptions.map((option) => {
          // Calculate percentage of total locked amount
          const percentage = totalLockedAmount > 0 
            ? Math.round((option.total_locked || 0) / totalLockedAmount * 100) 
            : 0;
          
          return (
            <div key={option.id} className="border border-gray-800/30 p-3 rounded-md">
              <div className="flex justify-between items-center mb-2">
                <div className="font-medium text-white">{option.content}</div>
                <div className="text-sm text-gray-400">{percentage}%</div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-gray-800 rounded-full h-2.5 mb-3">
                <div 
                  className="bg-[#00E6CC] h-2.5 rounded-full" 
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
              
              <div className="text-sm text-gray-400 mb-3">
                Locked: {formatBSV(option.total_locked || 0)} BSV
              </div>
              
              {connected && (
                <div className="flex items-center justify-between mt-2">
                  <VoteOptionLockInteraction
                    optionId={option.id}
                    optionContent={option.content}
                    onLock={async (optionId, amount, duration) => {
                      setIsLocking(prev => ({ ...prev, [optionId]: true }));
                      try {
                        const response = await fetch(`${API_URL}/api/lock-likes/voteOption`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            vote_option_id: optionId,
                            author_address: address,
                            amount,
                            lock_duration: duration,
                          }),
                        });

                        if (!response.ok) {
                          throw new Error('Failed to lock BSV on vote option');
                        }

                        toast.success(`Successfully locked ${amount} BSV on "${option.content}"`);
                        
                        // Update the vote option's locked amount locally
                        setVoteOptions(prev => 
                          prev.map(opt => 
                            opt.id === optionId 
                              ? { ...opt, lock_amount: opt.lock_amount + amount, total_locked: (opt.total_locked || 0) + amount } 
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
                    }}
                    connected={connected}
                    balance={balance}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {!connected && (
        <div className="mt-4 text-sm text-gray-400">
          Connect your wallet to lock BSV on vote options.
        </div>
      )}
    </div>
  );
};

export default VoteOptionsDisplay;
