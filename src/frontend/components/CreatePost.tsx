import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import { useTags } from '../hooks/useTags';
import { FiX, FiPlus, FiCheck, FiRefreshCw, FiImage, FiFile, FiPlusCircle, FiTrash2, FiVote, FiBarChart2, FiLink } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { isWalletConnected, ensureWalletConnection, getWalletStatus } from '../utils/walletConnectionHelpers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

interface CreatePostProps {
  onPostCreated?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated, isOpen, onClose }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isVotePost, setIsVotePost] = useState(false);
  const [voteOptions, setVoteOptions] = useState<string[]>(['', '']);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [error, setError] = useState('');
  const { wallet, connect, isConnected } = useWallet();
  const { 
    tags, 
    currentEventTags, 
    isLoading, 
    error: tagsError, 
    isGeneratingTags,
    fetchTags, 
    generateTags 
  } = useTags();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    // Focus the textarea when the modal opens
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    // Handle clicking outside to close the modal
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Handle escape key to close the modal
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    const attemptWalletConnection = async () => {
      console.log('Component mounted, checking wallet connection:', {
        isConnected,
        hasWallet: !!wallet,
        hasBsvAddress: !!wallet?.bsvAddress,
        walletReady: wallet?.isReady
      });
      
      if (!isConnected && wallet?.isReady) {
        console.log('Wallet is ready but not connected, attempting connection...');
        try {
          await connect();
          console.log('Initial wallet connection completed');
          
          // Verify we have an address after connection
          if (!wallet?.bsvAddress) {
            console.log('No wallet address after initial connection, waiting briefly and checking again...');
            
            // Wait a moment and check if address is available
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            console.log('Checking wallet address after delay:', {
              hasBsvAddress: !!wallet?.bsvAddress,
              bsvAddress: wallet?.bsvAddress
            });
            
            // If still no address, try connecting again
            if (!wallet?.bsvAddress && wallet?.isReady) {
              console.log('Still no address, attempting second connection...');
              await connect();
              console.log('Second connection attempt completed');
            }
          }
        } catch (error) {
          console.error('Error during initial wallet connection:', error);
          // Don't show error toast here as it might be confusing to users
          // who haven't explicitly tried to connect yet
        }
      }
    };
    
    attemptWalletConnection();
  }, [isConnected, wallet, connect]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file', {
        style: {
          background: '#1A1B23',
          color: '#f87171',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: '0.375rem'
        }
      });
      return;
    }
    
    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB', {
        style: {
          background: '#1A1B23',
          color: '#f87171',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: '0.375rem'
        }
      });
      return;
    }
    
    setImage(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  const handleRemoveImage = () => {
    setImage(null);
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // Check if wallet is connected
      const isConnected = await isWalletConnected();
      if (!isConnected) {
        console.log('Wallet not connected, attempting to connect...');
        try {
          await ensureWalletConnection(wallet, connect);
          console.log('Wallet connected successfully');
          
          // Verify we have an address after connection
          if (!wallet?.bsvAddress) {
            console.log('No wallet address after initial connection, waiting briefly and checking again...');
            
            // Wait a moment and check if address is available
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            console.log('Checking wallet address after delay:', {
              hasBsvAddress: !!wallet?.bsvAddress,
              bsvAddress: wallet?.bsvAddress
            });
            
            // If still no address, try connecting again
            if (!wallet?.bsvAddress && wallet?.isReady) {
              console.log('Still no address, attempting second connection...');
              await connect();
              console.log('Second connection attempt completed');
            }
          }
        } catch (walletError) {
          console.error('Failed to connect wallet:', walletError);
          setError('Please connect your wallet to create a post. Click the wallet button in the top right corner.');
          setIsSubmitting(false);
          return;
        }
      }

      // Get wallet status for debugging
      const walletStatus = await getWalletStatus();
      console.log('Wallet status before post creation:', walletStatus);

      if (!content.trim() && !image) {
        setError('Please enter some content or select an image');
        setIsSubmitting(false);
        return;
      }

      // Get the wallet instance
      const walletInstance = window.yours || wallet;
      if (!walletInstance) {
        console.error('Wallet not available');
        setError('Wallet not available. Please make sure you have the Yours wallet extension installed and connected.');
        setIsSubmitting(false);
        return;
      }

      console.log('Creating post with content length:', content.length, 'and image:', image ? 'yes' : 'no');
      
      try {
        // Create the post
        const newPost = await createPost(
          walletInstance,
          content,
          image, // Pass the File object directly
          image ? image.type : undefined
        );
        
        console.log('Post created successfully:', newPost);
        
        // Reset form and state
        setContent('');
        setImage(null);
        setImagePreview('');
        
        // Notify success
        toast.success('Post created successfully!', {
          style: {
            background: '#1A1B23',
            color: '#34d399',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '0.375rem'
          }
        });
        
        // Refresh posts
        if (onPostCreated) {
          onPostCreated(newPost);
        }
      } catch (postError: any) {
        console.error('Error creating post:', postError);
        const errorMessage = postError.message || 'Unknown error occurred while creating post';
        
        // Provide more user-friendly error messages based on common errors
        if (errorMessage.includes('wallet') || errorMessage.includes('address')) {
          setError('Wallet connection issue. Please make sure your wallet is connected and try again.');
        } else if (errorMessage.includes('image')) {
          setError('There was a problem with your image. Please try a different image or post without an image.');
        } else {
          setError(`Failed to create post: ${errorMessage}`);
        }
      }
    } catch (error: any) {
      console.error('Unexpected error in handleSubmit:', error);
      setError(`An unexpected error occurred: ${error.message || 'Unknown error'}`);
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
      toast.error('A vote post needs at least 2 options', {
        style: {
          background: '#1A1B23',
          color: '#f87171',
          border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: '0.375rem'
        }
      });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="bg-gray-800 rounded-xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative border border-gray-700"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Create a Post</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        {!isConnected && (
          <div className="bg-gray-700 p-4 rounded-lg mb-4">
            <p className="text-yellow-400 mb-2">Wallet not connected</p>
            <button
              onClick={async () => {
                try {
                  toast.loading('Connecting wallet...', { id: 'wallet-connect' });
                  await ensureWalletConnection(wallet, connect);
                  if (isConnected && wallet?.bsvAddress) {
                    toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                  } else {
                    // If connect() succeeded but we still don't have an address, try again after a delay
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    if (!wallet?.bsvAddress) {
                      await ensureWalletConnection(wallet, connect);
                      if (wallet?.bsvAddress) {
                        toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                      } else {
                        toast.error('Connected but failed to get wallet address. Please try again.', { id: 'wallet-connect' });
                      }
                    } else {
                      toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                    }
                  }
                } catch (error) {
                  console.error('Error connecting wallet:', error);
                  toast.error('Failed to connect wallet. Please check your wallet extension.', { id: 'wallet-connect' });
                }
              }}
              className="px-4 py-2 bg-[#00ffa3] hover:bg-opacity-80 text-black font-medium rounded-lg transition-colors flex items-center justify-center mx-auto"
            >
              <FiLink className="mr-2" /> Connect Wallet
            </button>
            <p className="text-gray-400 text-sm mt-2 text-center">
              You need to connect your wallet to create posts
            </p>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-4 border border-gray-600 rounded-xl bg-gray-900 text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="What's on your mind?"
              rows={4}
            />
            
            {/* Image preview overlay */}
            {imagePreview && (
              <div className="mt-2 relative rounded-lg overflow-hidden">
                <img 
                  src={imagePreview} 
                  alt="Upload preview" 
                  className="max-h-60 w-auto mx-auto rounded-lg border border-gray-700"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            )}
            
            {/* Post controls toolbar */}
            <div className="flex items-center mt-2 space-x-2">
              {/* Image upload button */}
              <button
                type="button"
                onClick={handleClickUpload}
                className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-full transition-colors"
                title="Upload image"
              >
                <FiImage size={20} />
              </button>
              
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                accept="image/*"
              />
              
              {/* Vote post toggle */}
              <button
                type="button"
                onClick={() => setIsVotePost(!isVotePost)}
                className={`p-2 rounded-full transition-colors ${
                  isVotePost 
                    ? 'text-blue-400 bg-gray-700' 
                    : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'
                }`}
                title="Create a vote"
              >
                <FiBarChart2 size={20} />
              </button>
            </div>
          </div>
          
          {/* Vote options section */}
          {isVotePost && (
            <div className="bg-gray-900 p-4 rounded-xl border border-gray-700 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-medium">Vote Options</h3>
              </div>
              
              {voteOptions.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleVoteOptionChange(index, e.target.value)}
                    className="flex-grow p-2 border border-gray-600 rounded-lg bg-gray-800 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={`Option ${index + 1}`}
                  />
                  {voteOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVoteOption(index)}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <FiX size={18} />
                    </button>
                  )}
                </div>
              ))}
              
              <button
                type="button"
                onClick={handleAddVoteOption}
                className="flex items-center text-sm text-blue-400 hover:text-blue-300 mt-2"
              >
                <FiPlusCircle size={16} className="mr-1" /> Add Option
              </button>
            </div>
          )}
          
          {/* Tags section */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-300">Tags</label>
              <button
                type="button"
                onClick={() => generateTags()}
                disabled={isGeneratingTags || !content.trim()}
                className={`text-xs flex items-center ${
                  isGeneratingTags || !content.trim()
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-green-500 hover:text-green-400'
                }`}
              >
                <FiRefreshCw className={`mr-1 ${isGeneratingTags ? 'animate-spin' : ''}`} />
                Auto-tag with AI
              </button>
            </div>
            
            {/* Selected tags display */}
            {selectedTags.length > 0 && (
              <div className="mb-2">
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagClick(tag)}
                      className="px-2 py-1 text-xs rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                    >
                      {tag} <FiX size={12} className="inline ml-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Tag input */}
            <div className="flex items-center">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a new tag"
                className="flex-grow px-3 py-2 bg-gray-800 border border-gray-700 rounded-l-md text-gray-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddNewTag}
                className="px-3 py-2 bg-green-600 text-white rounded-r-md hover:bg-green-700 focus:outline-none"
              >
                <FiCheck />
              </button>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex justify-end mt-4">
            <button
              type="button"
              className="px-4 py-2 mr-2 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded-md hover:bg-gray-700 focus:outline-none"
              onClick={() => onClose()}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Posting...' : 'Post'}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-2 rounded-md bg-gray-800 border border-red-500 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreatePost;