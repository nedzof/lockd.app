import * as React from 'react';
import { useState } from 'react';
import { FiSend } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { toast } from 'react-hot-toast';

interface CreatePostProps {
  connected: boolean;
  bsvAddress: string | null;
}

export const CreatePost: React.FC<CreatePostProps> = ({ connected, bsvAddress }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!connected || !bsvAddress || !content.trim()) return;
    
    setIsSubmitting(true);
    try {
      const post = await createPost(content, bsvAddress);
      toast.success('Post created successfully!');
      setContent('');
    } catch (error) {
      console.error('Failed to create post:', error);
      toast.error('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!connected) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] p-6 rounded-lg shadow-lg mb-6">
      <div className="space-y-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full h-24 px-4 py-2 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !content.trim()}
            className="group relative px-6 py-2 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl transition-all duration-300"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
            <div className="relative flex items-center space-x-2 text-black">
              <span>{isSubmitting ? 'Posting...' : 'Post'}</span>
              <FiSend className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" />
            </div>
            <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
          </button>
        </div>
      </div>
    </div>
  );
}; 