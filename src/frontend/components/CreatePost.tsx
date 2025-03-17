import { API_URL } from "../config";
import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import { useTags } from '../hooks/useTags';
import { FiX, FiPlus, FiCheck, FiRefreshCw, FiImage, FiFile, FiPlusCircle, FiTrash2, FiBarChart2, FiLink, FiHash } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { isWalletConnected, ensureWalletConnection, getWalletStatus } from '../utils/walletConnectionHelpers';


interface CreatePostProps {
  onPostCreated?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const CreatePost: React.FC<CreatePostProps> = ({ onPostCreated, isOpen, onClose }) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selected_tags, setselected_tags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isVotePost, setIsVotePost] = useState(false);
  const [vote_options, setvote_options] = useState<string[]>(['', '']);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [error, setError] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
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
  const tagInputRef = useRef<HTMLInputElement>(null);

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
    
    // Define supported image formats
    const supportedFormats = [
      'image/jpeg', 
      'image/jpg', 
      'image/png', 
      'image/gif', 
      'image/bmp', 
      'image/svg+xml', 
      'image/webp', 
      'image/tiff'
    ];
    
    // Check file type
    if (!supportedFormats.includes(file.type)) {
      toast.error(`Unsupported image format. Please upload one of: JPEG, PNG, GIF, BMP, SVG, WEBP, or TIFF`, {
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
          image ? image.type : undefined,
          isVotePost,
          isVotePost ? vote_options.filter(option => option.trim() !== '') : []
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

  const handleAddTag = () => {
    if (newTag.trim() && !selected_tags.includes(newTag.trim())) {
      setselected_tags([...selected_tags, newTag.trim()]);
      setNewTag('');
      if (tagInputRef.current) {
        tagInputRef.current.focus();
      }
    }
  };

  const handleRemoveTag = (index: number) => {
    const newTags = [...selected_tags];
    newTags.splice(index, 1);
    setselected_tags(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleAddvote_option = () => {
    if (vote_options.length < 10) { // Limit to 10 options
      setvote_options([...vote_options, '']);
    }
  };

  const handleRemovevote_option = (index: number) => {
    if (vote_options.length <= 2) {
      return; // Maintain at least 2 options
    }
    const newOptions = [...vote_options];
    newOptions.splice(index, 1);
    setvote_options(newOptions);
  };

  const handlevote_optionChange = (index: number, value: string) => {
    const newOptions = [...vote_options];
    newOptions[index] = value;
    setvote_options(newOptions);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm transition-opacity duration-300">
      <div 
        ref={modalRef}
        className="bg-[#1A1B23] rounded-lg shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative border border-gray-800/40 backdrop-blur-xl transition-all duration-300 drop-shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Create a Post</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[#00ffa3] transition-colors duration-300 p-1.5 rounded-full hover:bg-gray-800/50"
          >
            <FiX size={24} />
          </button>
        </div>

        {!isConnected && (
          <div className="bg-[#13141B]/80 border border-gray-800/40 p-5 rounded-lg mb-6">
            <p className="text-yellow-400 mb-2 font-medium">Wallet not connected</p>
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
              className="group relative px-4 py-2 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 flex items-center justify-center mx-auto"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-lg transition-all duration-300"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
              <div className="relative flex items-center space-x-1 text-black">
                <FiLink className="mr-2 group-hover:rotate-12 transition-transform duration-300" /> 
                <span>Connect Wallet</span>
              </div>
              <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-lg"></div>
            </button>
            <p className="text-gray-400 text-sm mt-3 text-center">
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
              placeholder="What's on your mind?"
              className="w-full p-5 pb-12 bg-[#13141B] border border-gray-800/60 rounded-xl text-gray-200 focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 min-h-[120px] transition-all duration-300"
            />
            
            {/* Integrated controls inside the text area */}
            <div className="absolute bottom-3 left-3 flex items-center space-x-3">
              {/* Image upload button */}
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/bmp,image/svg+xml,image/webp,image/tiff"
                  onChange={handleImageUpload}
                  className="sr-only"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="flex items-center justify-center p-2 text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10 rounded-full transition-all duration-300 focus:outline-none cursor-pointer"
                  title="Upload image (JPEG, PNG, GIF, BMP, SVG, WEBP, TIFF)"
                >
                  <FiImage size={20} />
                </label>
              </div>
              
              {/* Subtle divider */}
              <div className="h-6 w-px bg-gray-700/50"></div>
              
              {/* Vote post toggle */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => setIsVotePost(!isVotePost)}
                  className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                    isVotePost 
                      ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                      : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                  }`}
                  title={isVotePost ? "Switch to regular post" : "Create a vote post"}
                >
                  <FiBarChart2 size={20} />
                </button>
              </div>
              
              {/* Subtle divider */}
              <div className="h-6 w-px bg-gray-700/50"></div>
              
              {/* Tag button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    // Toggle tag input visibility
                    setShowTagInput(!showTagInput);
                    
                    // If opening the tag input, focus it after a brief delay to allow rendering
                    if (!showTagInput) {
                      setTimeout(() => {
                        tagInputRef.current?.focus();
                      }, 100);
                      
                      // Show a hint toast when opening the tag input if no tags exist
                      if (selected_tags.length === 0) {
                        toast.success('Add tags to categorize your post', { 
                          duration: 3000,
                          style: {
                            background: '#1A1B23',
                            color: '#00ffa3',
                            border: '1px solid rgba(0, 255, 163, 0.3)',
                            borderRadius: '0.375rem'
                          }
                        });
                      }
                    }
                    
                    // Extract hashtags from content when opening tag input
                    if (!showTagInput) {
                      const hashtags = content.match(/#(\w+)/g);
                      if (hashtags && hashtags.length > 0) {
                        // Add unique hashtags to selected_tags
                        const newTags = hashtags.map(tag => tag.substring(1)).filter(tag => !selected_tags.includes(tag));
                        if (newTags.length > 0) {
                          setselected_tags([...selected_tags, ...newTags]);
                          toast.success(`Added ${newTags.length} tag${newTags.length > 1 ? 's' : ''} from your text`);
                        }
                      }
                    }
                  }}
                  className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                    showTagInput || selected_tags.length > 0
                      ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                      : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                  }`}
                  title="Add tags to your post"
                >
                  <FiHash size={20} />
                </button>
              </div>
            </div>
            
            {/* Character counter */}
            <div className="absolute bottom-3 right-3 text-xs text-gray-400">
              {content.length} characters
            </div>
            
            {/* Image preview overlay */}
            {imagePreview && (
              <div className="mt-4 relative rounded-lg overflow-hidden shadow-lg">
                <img 
                  src={imagePreview} 
                  alt="Upload preview" 
                  className="max-h-60 w-auto mx-auto rounded-lg border border-gray-700/70"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 bg-red-500/80 backdrop-blur-sm text-white p-1.5 rounded-full hover:bg-red-600 transition-colors duration-300"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            )}
          </div>
          
          {/* Compact tag input area - only shown when showTagInput is true */}
          {showTagInput && (
            <div className="mt-2 p-3 bg-[#13141B]/80 border border-gray-800/60 rounded-lg transition-all duration-300">
              <div className="flex flex-col space-y-3">
                {/* Tag input */}
                <div className="flex items-center">
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a tag and press Enter"
                    className="flex-grow px-3 py-2 bg-[#13141B] border border-gray-800/60 rounded-l-md text-gray-200 focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-colors duration-300"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="px-3 py-2 bg-[#00ffa3] text-black rounded-r-md hover:bg-[#00ffa3]/80 focus:outline-none transition-colors duration-300"
                  >
                    <FiPlus />
                  </button>
                </div>
                
                {/* Selected tags display */}
                {selected_tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected_tags.map((tag, index) => (
                      <div
                        key={index}
                        className="flex items-center bg-[#1A1B23] border border-gray-800/60 rounded-md px-2 py-1 transition-colors duration-300 hover:border-gray-700"
                      >
                        <span className="text-sm text-gray-300 mr-1.5">{tag}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(index)}
                          className="text-gray-400 hover:text-red-400 transition-colors duration-300 focus:outline-none"
                        >
                          <FiX size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Vote options section - only shown when isVotePost is true */}
          {isVotePost && (
            <div className="mt-4 space-y-3 p-4 bg-[#13141B]/60 border border-gray-800/40 rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">Vote Options</h3>
                
                {/* Pill-shaped toggle for vote post option */}
                <div className="flex items-center">
                  <div 
                    className="relative inline-flex h-6 w-16 items-center rounded-full transition-colors duration-300 bg-[#00ffa3] cursor-pointer px-1"
                    onClick={() => setIsVotePost(!isVotePost)}
                  >
                    <span className="text-xs text-black font-medium ml-1">Vote</span>
                    <span
                      className="absolute right-1 inline-block h-4 w-4 transform rounded-full bg-white shadow-md"
                    />
                  </div>
                </div>
              </div>
              
              {vote_options.map((option, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handlevote_optionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className="flex-grow px-4 py-2 bg-[#13141B] border border-gray-800/60 rounded-lg text-gray-200 focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-colors duration-300"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovevote_option(index)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors duration-300 focus:outline-none"
                    disabled={vote_options.length <= 2}
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="pl-4">
                <button
                  type="button"
                  onClick={handleAddvote_option}
                  className="flex items-center px-3 py-2 text-sm text-[#00ffa3] hover:text-[#00ffa3]/80 hover:bg-[#00ffa3]/10 rounded-md transition-colors duration-300 focus:outline-none"
                >
                  <FiPlus size={16} className="mr-1" /> Add Option
                </button>
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-800/80 text-gray-300 rounded-lg border border-gray-700/40 hover:bg-gray-700 hover:border-gray-600/60 focus:outline-none transition-all duration-300 min-w-[100px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className={`px-5 py-2.5 rounded-lg transition-all duration-300 min-w-[100px] ${
                (isSubmitting || !content.trim()) 
                  ? 'bg-[#00ffa3]/50 text-gray-800 cursor-not-allowed' 
                  : 'bg-[#00ffa3] text-black hover:bg-[#00ffa3]/80 hover:shadow-[0_0_20px_rgba(0,255,163,0.3)]'
              }`}
            >
              {isSubmitting ? 'Posting...' : 'Post'}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-3 rounded-md bg-red-900/20 backdrop-blur-sm border border-red-500/50 text-red-400 text-sm">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreatePost;