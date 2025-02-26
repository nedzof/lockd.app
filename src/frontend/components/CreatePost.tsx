import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import { useTags } from '../hooks/useTags';
import { FiX, FiPlus, FiCheck, FiRefreshCw } from 'react-icons/fi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

interface CreatePostProps {
  onPostCreated?: () => void;
}

const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isVotePost, setIsVotePost] = useState(false);
  const [voteOptions, setVoteOptions] = useState<string[]>(['', '']);
  const { wallet, connect, isConnected } = useWallet();
  const { 
    tags, 
    currentEventTags, 
    isLoading, 
    error, 
    isGeneratingTags,
    fetchTags, 
    generateTags 
  } = useTags();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast.error('Please enter some content');
      return;
    }
    
    if (!isConnected || !wallet) {
      toast.error('Please connect your wallet first');
      connect();
      return;
    }

    // For vote posts, validate that we have at least 2 options
    if (isVotePost) {
      const validOptions = voteOptions.filter(option => option.trim().length > 0);
      if (validOptions.length < 2) {
        toast.error('Please provide at least 2 vote options');
        return;
      }
    }
    
    setIsSubmitting(true);
    
    try {
      const postData = {
        content,
        author_address: wallet.address,
        tags: selectedTags,
        is_vote: isVotePost,
        vote_options: isVotePost ? voteOptions.filter(opt => opt.trim().length > 0) : undefined
      };
      
      const response = await fetch(`${API_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create post');
      }
      
      toast.success('Post created successfully!');
      setContent('');
      setSelectedTags([]);
      setIsVotePost(false);
      setVoteOptions(['', '']);
      
      if (onPostCreated) {
        onPostCreated();
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleAddNewTag = () => {
    if (newTag.trim() && !selectedTags.includes(newTag.trim())) {
      setSelectedTags([...selectedTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddNewTag();
    }
  };

  const handleAddVoteOption = () => {
    setVoteOptions([...voteOptions, '']);
  };

  const handleRemoveVoteOption = (index: number) => {
    if (voteOptions.length <= 2) {
      toast.error('A vote post needs at least 2 options');
      return;
    }
    const newOptions = [...voteOptions];
    newOptions.splice(index, 1);
    setVoteOptions(newOptions);
  };

  const handleVoteOptionChange = (index: number, value: string) => {
    const newOptions = [...voteOptions];
    newOptions[index] = value;
    setVoteOptions(newOptions);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
      <form onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-3 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-white resize-none"
          placeholder="What's on your mind?"
          rows={3}
        />
        
        <div className="flex items-center mt-2 mb-3">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isVotePost}
              onChange={() => setIsVotePost(!isVotePost)}
              className="form-checkbox h-4 w-4 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Create a vote post</span>
          </label>
        </div>
        
        {isVotePost && (
          <div className="mb-4 space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vote Options:</div>
            {voteOptions.map((option, index) => (
              <div key={index} className="flex items-center">
                <input
                  type="text"
                  value={option}
                  onChange={(e) => handleVoteOptionChange(index, e.target.value)}
                  className="flex-grow p-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-white text-sm"
                  placeholder={`Option ${index + 1}`}
                />
                {voteOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveVoteOption(index)}
                    className="ml-2 p-1 text-red-500 hover:text-red-700"
                  >
                    <FiX size={18} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddVoteOption}
              className="flex items-center text-sm text-blue-500 hover:text-blue-700"
            >
              <FiPlus size={16} className="mr-1" /> Add Option
            </button>
          </div>
        )}
        
        <div className="mt-3">
          <div className="flex justify-between items-center mb-1">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Tags:</div>
            <button
              type="button"
              onClick={() => generateTags()}
              disabled={isGeneratingTags}
              className="flex items-center text-xs text-blue-500 hover:text-blue-700"
            >
              <FiRefreshCw size={14} className={`mr-1 ${isGeneratingTags ? 'animate-spin' : ''}`} /> 
              {isGeneratingTags ? 'Generating...' : 'Generate Current Event Tags'}
            </button>
          </div>
          
          {isLoading ? (
            <div>Loading tags...</div>
          ) : error ? (
            <div className="text-red-500">Error loading tags: {error.message}</div>
          ) : (
            <>
              {/* Current Event Tags Section */}
              {currentEventTags.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Current Events:
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {currentEventTags.map((tag) => (
                      <button
                        key={tag.id || tag.name}
                        type="button"
                        onClick={() => handleTagClick(tag.name)}
                        className={`px-2 py-1 text-xs rounded-full ${
                          selectedTags.includes(tag.name)
                            ? 'bg-green-500 text-white'
                            : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        }`}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Regular Tags Section */}
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Popular Tags:
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagClick(tag)}
                    className={`px-2 py-1 text-xs rounded-full ${
                      selectedTags.includes(tag)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </>
          )}
          
          <div className="flex mt-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-grow p-2 text-sm border dark:border-gray-700 rounded-l-lg dark:bg-gray-700 dark:text-white"
              placeholder="Add a new tag"
            />
            <button
              type="button"
              onClick={handleAddNewTag}
              className="px-3 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600"
            >
              <FiCheck size={16} />
            </button>
          </div>
        </div>
        
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className={`px-4 py-2 rounded-lg ${
              isSubmitting || !content.trim()
                ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isSubmitting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreatePost;