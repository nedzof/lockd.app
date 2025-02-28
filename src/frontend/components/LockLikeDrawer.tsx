import * as React from 'react';
import { Link } from 'react-router-dom';
import { SiBitcoinsv } from 'react-icons/si';
import { HODLTransaction, LockLike } from '../types';
import { formatBSV } from '../utils/formatBSV';

interface LockLikeDrawerProps {
  transaction: HODLTransaction;
}

const timeSinceLike = (locklike: LockLike) => {
  const now = new Date();
  const lockTime = new Date(locklike.created_at);
  const seconds = Math.floor((now.getTime() - lockTime.getTime()) / 1000);

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

export default function LockLikeDrawer({ transaction }: LockLikeDrawerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-gray-600 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 ml-2"
      >
        {transaction.locklikes.length}
      </button>

      {isOpen && (
        <div className="absolute top-0 right-0 mt-8 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg z-50">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Locks on this Post
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ×
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {transaction.locklikes
                .slice()
                .sort((a, b) => b.amount - a.amount)
                .map((locklike) => (
                  <div key={locklike.tx_id} className="mb-4 last:mb-0">
                    <div className="flex items-center">
                      <Link to={`/${locklike.handle_id}`} className="flex items-center">
                        <img
                          className="h-8 w-8 rounded-full"
                          src={`https://a.relayx.com/u/${locklike.handle_id}@relayx.io`}
                          alt={locklike.handle_id}
                        />
                      </Link>
                      <div className="ml-3 flex-1">
                        <div className="flex items-center">
                          <Link
                            to={`/${locklike.handle_id}`}
                            className="font-medium text-gray-900 dark:text-white hover:text-orange-500 dark:hover:text-orange-400"
                          >
                            {locklike.handle_id}
                          </Link>
                          <span className="mx-2 text-gray-500 dark:text-gray-400">locked</span>
                          <div className="flex items-center">
                            <span className="text-gray-900 dark:text-white">
                              {formatBSV(locklike.amount / 100000000)}
                            </span>
                            <SiBitcoinsv className="h-4 w-4 text-orange-500 mx-1" />
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {timeSinceLike(locklike)}
                        </div>
                      </div>
                      <Link
                        to={`https://whatsonchain.com/tx/${locklike.tx_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-orange-500 dark:text-gray-400 dark:hover:text-orange-400"
                      >
                        <span className="text-xs">View on chain</span>
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 