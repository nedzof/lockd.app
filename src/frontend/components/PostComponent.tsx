import * as React from 'react';
import { Link } from 'react-router-dom';
import { AiOutlineBlock } from 'react-icons/ai';
import { HODLTransaction, LockLike } from '../types';
import LockLikeInteraction from './LockLikeInteraction';
import LockLikeDrawer from './LockLikeDrawer';
import PostContent from './PostContent';

interface PostProps {
  transaction: HODLTransaction;
  postLockLike: (
    txid: string,
    amount: number,
    nLockTime: number,
    handle: string,
    postTxid?: string,
    replyTxid?: string
  ) => Promise<LockLike>;
  postTxid?: string;
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

export default function PostComponent({ transaction, postLockLike, postTxid }: PostProps) {
  const avatar = `https://a.relayx.com/u/${transaction.handle_id}@relayx.io`;

  return (
    <div className="bg-white dark:bg-black rounded-sm flex flex-col relative">
      <div className="p-4">
        <div className="flex items-center">
          <Link to={`/${transaction.handle_id}`} className="flex-shrink-0">
            <img
              className="h-10 w-10 rounded-full"
              src={avatar}
              alt={transaction.handle_id}
            />
          </Link>
          <div className="ml-3 flex-1">
            <div className="flex items-center">
              <Link
                to={`/${transaction.handle_id}`}
                className="text-base font-medium text-gray-900 dark:text-white hover:text-orange-500 dark:hover:text-orange-400"
              >
                {transaction.handle_id}
              </Link>
              <span className="mx-2 text-gray-500 dark:text-gray-400">·</span>
              <Link
                to={`/${transaction.handle_id}/post/${transaction.txid}`}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400"
              >
                {timeSincePost(transaction)}
              </Link>
            </div>
          </div>
          <a
            href={`https://whatsonchain.com/tx/${transaction.txid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
          >
            <AiOutlineBlock className="h-5 w-5" />
          </a>
        </div>

        <div className="mt-4">
          <PostContent transaction={transaction} />
        </div>

        <div className="mt-4 flex items-center space-x-4">
          <div className="flex items-center">
            <LockLikeInteraction
              postTxid={transaction.txid}
              postLockLike={postLockLike}
            />
            <LockLikeDrawer transaction={transaction} />
          </div>
        </div>
      </div>
    </div>
  );
} 