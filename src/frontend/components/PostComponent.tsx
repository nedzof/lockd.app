import { API_URL } from "../../config";
import * as React from 'react';
import { AiOutlineBlock } from 'react-icons/ai';
import { HODLTransaction } from '../types';
import PostContent from './PostContent';
import { formatBSV } from '../utils/formatBSV';

interface PostProps {
  transaction: HODLTransaction;
  posttx_id?: string;
}


const timeSincePost = (transaction: HODLTransaction) => {
  const now = new Date();
  const postTime = new Date(transaction.created_at);
  const seconds = Math.floor((now.getTime() - postTime.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
};

export default function PostComponent({ transaction, posttx_id }: PostProps) {
  const [totalLockedAmount, setTotalLockedAmount] = React.useState(0);

  // Determine if this is a vote post with actual vote options
  const isVotePostWithOptions = React.useMemo(() => {
    return (transaction.is_vote || transaction.content_type === 'vote') && 
           transaction.vote_options && 
           transaction.vote_options.length > 0;
  }, [transaction]);

  React.useEffect(() => {
    console.log('PostComponent rendered with tx_id:', transaction.tx_id);
    console.log('Transaction type:', transaction.content_type);
    console.log('Transaction is_vote:', transaction.is_vote);
    console.log('Transaction has vote options:', transaction.vote_options?.length > 0);
    console.log('Is vote post with options:', isVotePostWithOptions);
    console.log('Total locked amount:', totalLockedAmount);
  }, [transaction, totalLockedAmount, isVotePostWithOptions]);

  const handleTotalLockedAmountChange = (amount: number) => {
    setTotalLockedAmount(amount);
  };

  return (
    <div className="bg-white dark:bg-black rounded-sm flex flex-col relative">
      <div className="p-4">
        {/* Top section with title and BSV locked amount */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className="text-base font-medium text-gray-900 dark:text-white">
              {/* For vote posts with options, show "Vote Post" as title */}
              {isVotePostWithOptions 
                ? 'Vote Post' 
                : transaction.content}
            </div>
            <span className="mx-2 text-gray-500 dark:text-gray-400">·</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {timeSincePost(transaction)}
            </span>
          </div>
          
          {/* Only show locked amount for vote posts with options */}
          {isVotePostWithOptions && totalLockedAmount > 0 && (
            <div className="text-base font-medium text-green-500">
              {formatBSV(totalLockedAmount)} BSV locked
            </div>
          )}
          
          <a
            href={`https://whatsonchain.com/tx/${transaction.tx_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-gray-500 hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
          >
            <AiOutlineBlock className="h-5 w-5" />
          </a>
        </div>

        <div className="mt-4">
          <PostContent 
            transaction={transaction} 
            onTotalLockedAmountChange={handleTotalLockedAmountChange}
          />
        </div>
      </div>
    </div>
  );
}