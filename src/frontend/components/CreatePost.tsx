import * as React from 'react';
import { useState } from 'react';
import { FiSend, FiX } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';

interface CreatePostProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

export const CreatePost: React.FC<CreatePostProps> = ({ isOpen, onClose, onPostCreated }) => {
  const { bsvAddress, wallet } = useWallet();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!wallet || !bsvAddress || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      await createPost(content, bsvAddress, wallet);
      setContent('');
      onPostCreated?.();
      onClose();
    } catch (error) {
      console.error('Failed to create post:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl shadow-xl w-full max-w-2xl mx-4 transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800/30">
          <h2 className="text-xl font-semibold text-white">Create Post</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full h-40 px-4 py-3 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none"
            disabled={isSubmitting}
          />
          
          {/* Character count */}
          <div className="flex justify-end">
            <span className="text-sm text-gray-400">
              {content.length} characters
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-4 p-6 border-t border-gray-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim()}
            className="group relative px-6 py-2 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl transition-all duration-300"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
            <div className="relative flex items-center space-x-2 text-black">
              <span>{isSubmitting ? 'Creating...' : 'Create Post'}</span>
              <FiSend className={`w-4 h-4 transition-all duration-300 ${isSubmitting ? 'animate-pulse' : 'group-hover:rotate-45'}`} />
            </div>
            <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
          </button>
        </div>
      </div>
    </div>
  );
}; 