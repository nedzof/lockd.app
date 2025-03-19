import * as React from 'react';
import { useState, useEffect } from 'react';
import { FiLock, FiUnlock, FiInfo } from 'react-icons/fi';
import { formatBSV } from '../utils/formatBSV';
import { calculate_active_locked_amount, calculate_unlocked_amount, get_unlock_status, is_still_locked } from '../utils/lockStatus';
import { toast } from 'react-hot-toast';
import { API_URL } from '../config';

export function PostDetail({ post_id }: { post_id: string }) {
  // Add existing state
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Add new state for current block height
  const [current_block_height, set_current_block_height] = useState<number | null>(null);
  const [show_unlock_tooltip, set_show_unlock_tooltip] = useState(false);

  // Fetch post data and current block height on component mount
  useEffect(() => {
    const fetch_post = async () => {
      try {
        const response = await fetch(`${API_URL}/api/posts/${post_id}`);
        const data = await response.json();
        setPost(data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching post:', error);
        toast.error('Failed to load post details.');
        setLoading(false);
      }
    };

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

    fetch_post();
    fetch_block_height();

    // Refresh block height every 10 minutes
    const block_height_interval = setInterval(fetch_block_height, 10 * 60 * 1000);
    
    return () => {
      clearInterval(block_height_interval);
    };
  }, [post_id]);

  // Calculate the actively locked and unlocked amounts
  const active_locked_amount = React.useMemo(() => {
    if (!post?.lock_likes) return 0;
    return calculate_active_locked_amount(post.lock_likes, current_block_height);
  }, [post, current_block_height]);
  
  const unlocked_amount = React.useMemo(() => {
    if (!post?.lock_likes) return 0;
    return calculate_unlocked_amount(post.lock_likes, current_block_height);
  }, [post, current_block_height]);

  // The rest of your component rendering...
  
  return (
    <div className="relative bg-[#2A2A40]/20 backdrop-blur-sm rounded-xl border border-gray-800/10 shadow-lg p-6">
      {/* Your existing post detail rendering... */}
      
      {/* Add detailed lock information */}
      {post && (
        <div className="mt-6 border-t border-gray-800/20 pt-4">
          <h3 className="text-lg font-medium text-white mb-3">Lock Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Currently locked amount */}
            <div className="bg-gray-800/20 rounded-lg p-3">
              <div className="flex items-center text-[#00ffa3] mb-2">
                <FiLock className="mr-2" size={16} />
                <span className="font-medium">Currently Locked</span>
              </div>
              <div className="text-lg font-medium text-white">
                {formatBSV(active_locked_amount)} ₿
              </div>
              <div className="text-sm text-gray-400 mt-1">
                {post.lock_likes?.length || 0} locks in total
              </div>
            </div>
            
            {/* Unlocked amount */}
            <div className="bg-gray-800/20 rounded-lg p-3">
              <div className="flex items-center text-amber-400 mb-2">
                <FiUnlock className="mr-2" size={16} />
                <span className="font-medium">Unlockable Amount</span>
                <div className="relative ml-2">
                  <FiInfo 
                    className="text-gray-400 cursor-pointer hover:text-white transition-colors" 
                    size={14} 
                    onMouseEnter={() => set_show_unlock_tooltip(true)}
                    onMouseLeave={() => set_show_unlock_tooltip(false)}
                  />
                  {show_unlock_tooltip && (
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-64 p-2 bg-gray-900 text-xs text-white rounded shadow-lg z-10">
                      This amount is unlockable in yours wallet. The unlock feature must be triggered manually in the wallet.
                    </div>
                  )}
                </div>
              </div>
              <div className="text-lg font-medium text-white">
                {formatBSV(unlocked_amount)} ₿
              </div>
              {post.unlock_height && (
                <div className="text-sm text-gray-400 mt-1">
                  {get_unlock_status(post.unlock_height, current_block_height)}
                </div>
              )}
            </div>
          </div>
          
          {/* Lock history details */}
          {post.lock_likes && post.lock_likes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Lock History</h4>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm text-left text-gray-400">
                  <thead className="text-xs text-gray-300 uppercase bg-gray-800/30">
                    <tr>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Unlock Height</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {post.lock_likes.map((lock: any, index: number) => (
                      <tr key={index} className="border-b border-gray-800/20">
                        <td className="px-3 py-2">{formatBSV(lock.amount)} ₿</td>
                        <td className="px-3 py-2">{lock.unlock_height || 'Unknown'}</td>
                        <td className={`px-3 py-2 ${!is_still_locked(lock.unlock_height, current_block_height) ? 'text-amber-400' : 'text-[#00ffa3]'}`}>
                          {get_unlock_status(lock.unlock_height, current_block_height)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Loading state */}
      {loading && (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00ffa3]"></div>
        </div>
      )}
    </div>
  );
} 