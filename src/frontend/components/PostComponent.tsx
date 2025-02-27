import * as React from 'react';
import { AiOutlineBlock } from 'react-icons/ai';
import { HODLTransaction } from '../types';
import PostContent from './PostContent';
import { formatBSV } from '../utils/formatBSV';

interface PostProps {
  transaction: HODLTransaction;
  postTxid?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

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

export default function PostComponent({ transaction, postTxid }: PostProps) {
  const [totalLockedAmount, setTotalLockedAmount] = React.useState(0);

  React.useEffect(() => {
    console.log('PostComponent rendered with txid:', transaction.txid);
    console.log('Transaction type:', transaction.content_type);
    console.log('Full transaction object:', transaction);
    console.log('Total locked amount:', totalLockedAmount);
    
    // Log the DOM structure after render
    setTimeout(() => {
      const postElement = document.querySelector('.bg-white.dark\\:bg-black');
      if (postElement) {
        console.log('Post element structure:', postElement.outerHTML);
        console.log('Post element computed style:', window.getComputedStyle(postElement));
      }
      
      const titleElement = document.querySelector('.text-base.font-medium.text-gray-900.dark\\:text-white');
      if (titleElement) {
        console.log('Title element:', titleElement.outerHTML);
        console.log('Title element computed style:', window.getComputedStyle(titleElement));
      }
      
      const lockedAmountElement = document.querySelector('.text-base.font-medium.text-green-500');
      if (lockedAmountElement) {
        console.log('Locked amount element:', lockedAmountElement.outerHTML);
        console.log('Locked amount element computed style:', window.getComputedStyle(lockedAmountElement));
      }
    }, 1000);
  }, [transaction, totalLockedAmount]);

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
              {transaction.content_type === 'vote' ? 'Test vote post' : transaction.content}
            </div>
            <span className="mx-2 text-gray-500 dark:text-gray-400">·</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {timeSincePost(transaction)}
            </span>
          </div>
          
          {transaction.content_type === 'vote' && totalLockedAmount > 0 && (
            <div className="text-base font-medium text-green-500">
              {formatBSV(totalLockedAmount)} BSV locked
            </div>
          )}
          
          <a
            href={`https://whatsonchain.com/tx/${transaction.txid}`}
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