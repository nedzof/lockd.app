import { API_URL } from "../config";
import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import { useTags } from '../hooks/useTags';
import { FiX, FiPlus, FiCheck, FiRefreshCw, FiImage, FiFile, FiPlusCircle, FiTrash2, FiBarChart2, FiLink, FiHash, FiClock, FiCalendar } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { isWalletConnected, ensureWalletConnection, getBsvAddress, getWalletStatus } from '../utils/walletConnectionHelpers';


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
  const [isScheduled, setIsScheduled] = useState(false);
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleTimezone, setScheduleTimezone] = useState(() => {
    // Get user's local timezone
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

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
        walletReady: wallet?.isReady
      });
      
      if (!isConnected && wallet?.isReady) {
        console.log('Wallet is ready but not connected, attempting connection...');
        try {
          await connect();
          console.log('Initial wallet connection completed');
          
          // Verify we have an address after connection
          const bsvAddress = await getBsvAddress(wallet);
          if (!bsvAddress) {
            console.log('No wallet address after initial connection, waiting briefly and checking again...');
            
            // Wait a moment and check if address is available
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const addressAfterDelay = await getBsvAddress(wallet);
            console.log('Checking wallet address after delay:', {
              hasBsvAddress: !!addressAfterDelay,
              bsvAddress: addressAfterDelay
            });
            
            // If still no address, try connecting again
            if (!addressAfterDelay && wallet?.isReady) {
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
    
    // Close other option panels when an image is uploaded
    setShowTagInput(false);
    setIsVotePost(false);
    setShowScheduleOptions(false);
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
    setError('');
    setIsSubmitting(true);

    try {
      // Check if wallet is connected
      const isConnected = await isWalletConnected();
      if (!isConnected) {
        console.log('Wallet not connected, attempting to connect...');
        if (wallet) {
          const connectionResult = await ensureWalletConnection(wallet, connect);
          if (!connectionResult.success) {
            setError('Please connect your wallet to create a post');
            setIsSubmitting(false);
            return;
          }
        } else {
          setError('Wallet not available. Please make sure you have a compatible wallet installed.');
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

      // Add debugging for vote post parameters
      console.log('Creating post with content length:', content.length, 'and image:', image ? 'yes' : 'no');
      console.log('Vote post parameters:');
      console.log('- isVotePost:', isVotePost);
      console.log('- vote_options:', vote_options);
      console.log('- filtered vote_options:', vote_options.filter(option => option.trim() !== ''));
      
      // Validate vote options if this is a vote post
      const filteredVoteOptions = vote_options.filter(option => option.trim() !== '');
      
      // Determine if this should be a vote post based on the toggle and valid options
      let shouldBeVotePost = isVotePost || filteredVoteOptions.length >= 2;
      
      // No need for confirmation dialog - automatically treat as vote post if there are options
      if (filteredVoteOptions.length >= 2 && !isVotePost) {
        console.log('Auto-enabling vote post mode because valid options exist');
        // Update the UI state to match
        setIsVotePost(true);
      }
      
      if (shouldBeVotePost && filteredVoteOptions.length < 2) {
        console.warn('Vote post requested but fewer than 2 valid options provided');
        setError('Vote posts require at least 2 valid options');
        setIsSubmitting(false);
        return;
      }
      
      console.log('Final vote post decision:', shouldBeVotePost);
      console.log('Final filtered vote options:', filteredVoteOptions);
      
      try {
        // Create the post
        const newPost = await createPost(
          walletInstance,
          content,
          image || undefined, // Pass undefined instead of null
          image ? image.type : undefined,
          shouldBeVotePost, // Use the validated flag
          shouldBeVotePost ? filteredVoteOptions : [], // Only pass options if it's a vote post
          isScheduled && scheduleDate && scheduleTime ? {
            scheduledAt: new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString(),
            timezone: scheduleTimezone
          } : undefined,
          selected_tags // Pass the selected tags to the createPost function
        );
        
        console.log('Post created successfully:', newPost);
        
        // Reset form and state
        setContent('');
        setImage(null);
        setImagePreview('');
        setvote_options(['', '']);
        setIsVotePost(false);
        setselected_tags([]);
        setIsScheduled(false);
        setShowScheduleOptions(false);
        
        // Notify success
        toast.success(isScheduled ? 'Post scheduled successfully!' : 'Post created successfully!', {
          style: {
            background: '#1A1B23',
            color: '#34d399',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '0.375rem'
          }
        });
        
        // Close the modal
        onClose();
        
        // Call the onPostCreated callback if provided
        if (onPostCreated) {
          onPostCreated();
        }
      } catch (error: any) {
        console.error('Error creating post:', error);
        setError(error.message || 'Failed to create post');
      }
    } catch (error: any) {
      console.error('Error in form submission:', error);
      setError(error.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle schedule options
  const toggleScheduleOptions = () => {
    // If we're opening the schedule options
    if (!showScheduleOptions) {
      // Set default date and time values
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Format date as YYYY-MM-DD
      const formattedDate = tomorrow.toISOString().split('T')[0];
      setScheduleDate(formattedDate);
      
      // Format time as HH:MM
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setScheduleTime(`${hours}:${minutes}`);
      
      // Set default timezone if not already set
      if (!scheduleTimezone) {
        setScheduleTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      }
      
      setIsScheduled(true);
      // Close other option panels
      setShowTagInput(false);
      setIsVotePost(false);
    }
    
    setShowScheduleOptions(!showScheduleOptions);
  };

  const toggleTagInput = () => {
    // If we're opening the tag input
    if (!showTagInput) {
      // Close other option panels
      setShowScheduleOptions(false);
      setIsVotePost(false);
    }
    
    setShowTagInput(!showTagInput);
  };

  const toggleVotePost = () => {
    // If we're opening the vote options
    if (!isVotePost) {
      // Close other option panels
      setShowScheduleOptions(false);
      setShowTagInput(false);
      
      // Initialize with two empty options if none exist
      if (vote_options.length === 0 || (vote_options.length === 2 && vote_options.every(opt => opt === ''))) {
        setvote_options(['', '']);
      }
    }
    
    setIsVotePost(!isVotePost);
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
      const newOptions = [...vote_options, ''];
      setvote_options(newOptions);
      checkAndEnableVotePost(newOptions);
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
    
    // Check if we need to auto-enable vote post mode after the option change
    const validOptions = newOptions.filter(opt => opt.trim() !== '');
    console.log('Checking if vote post should be enabled:', validOptions.length >= 2);
    checkAndEnableVotePost(newOptions);
  };

  // Function to adjust textarea height based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set the height to match the content (with a minimum height)
      textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`;
    }
  }, []);

  // Adjust height when content changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [content, adjustTextareaHeight]);

  useEffect(() => {
    // Focus the textarea when the modal opens
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
        adjustTextareaHeight(); // Also adjust height when focused
      }, 100);
    }
  }, [isOpen, adjustTextareaHeight]);

  // Add a function to automatically check for valid vote options and enable vote post mode if needed
  const checkAndEnableVotePost = (options: string[]) => {
    const validOptions = options.filter(opt => opt.trim() !== '');
    if (validOptions.length >= 2 && !isVotePost) {
      console.log('Auto-enabling vote post mode because valid options exist', validOptions);
      setIsVotePost(true);
    }
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
                  
                  if (wallet) {
                    await ensureWalletConnection(wallet, connect);
                    
                    // Check if we have an address
                    const bsvAddress = await getBsvAddress(wallet);
                    if (isConnected && bsvAddress) {
                      toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                    } else {
                      // If connect() succeeded but we still don't have an address, try again after a delay
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      
                      const addressAfterDelay = await getBsvAddress(wallet);
                      if (!addressAfterDelay) {
                        await ensureWalletConnection(wallet, connect);
                        
                        const finalAddress = await getBsvAddress(wallet);
                        if (finalAddress) {
                          toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                        } else {
                          toast.error('Connected but failed to get wallet address. Please try again.', { id: 'wallet-connect' });
                        }
                      } else {
                        toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                      }
                    }
                  } else {
                    toast.error('Wallet not available. Please install a compatible wallet.', { id: 'wallet-connect' });
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
            <div className={`relative ${
              imagePreview || showTagInput || isVotePost || showScheduleOptions
                ? 'ring-2 ring-[#00ffa3] rounded-xl overflow-hidden'
                : ''
            }`}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                className={`w-full p-5 pb-16 bg-[#13141B] ${
                  imagePreview || showTagInput || isVotePost || showScheduleOptions
                    ? 'border-0'
                    : 'border border-gray-800/60 rounded-xl'
                } text-gray-200 focus:outline-none min-h-[120px] transition-all duration-300 resize-none overflow-hidden`}
                onInput={adjustTextareaHeight}
                rows={1}
              />
              
              {/* Bottom toolbar with additional options - positioned at the bottom of the textarea */}
              <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-3 bg-[#13141B] border-t ${
                imagePreview || showTagInput || isVotePost || showScheduleOptions
                  ? 'border-t-gray-800/40'
                  : 'border-t-gray-800/40 rounded-b-xl'
              }`}>
                <div className="flex items-center">
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
                      className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 focus:outline-none cursor-pointer ${
                        imagePreview 
                          ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                          : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                      }`}
                      title="Upload image"
                    >
                      <FiImage size={18} />
                    </label>
                  </div>
                  
                  {/* Vertical separator */}
                  <div className="h-5 w-px bg-gray-700/50 mx-2"></div>
                  
                  {/* Vote post toggle */}
                  <button
                    type="button"
                    onClick={toggleVotePost}
                    className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                      isVotePost 
                        ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                        : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                    }`}
                    title={isVotePost ? "Switch to regular post" : "Create a vote post"}
                  >
                    <FiBarChart2 size={18} />
                  </button>
                  
                  {/* Vertical separator */}
                  <div className="h-5 w-px bg-gray-700/50 mx-2"></div>
                  
                  {/* Tag button */}
                  <button
                    type="button"
                    onClick={toggleTagInput}
                    className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                      showTagInput
                        ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                        : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                    }`}
                    title="Add tags to your post"
                  >
                    <FiHash size={18} />
                  </button>
                  
                  {/* Vertical separator */}
                  <div className="h-5 w-px bg-gray-700/50 mx-2"></div>
                  
                  {/* Schedule button */}
                  <button
                    type="button"
                    onClick={toggleScheduleOptions}
                    className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                      showScheduleOptions
                        ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                        : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                    }`}
                    title={isScheduled ? "Cancel scheduling" : "Schedule for later"}
                  >
                    <FiClock size={18} />
                  </button>
                </div>
                
                <div className="text-xs text-gray-400">
                  {content.length} characters
                </div>
              </div>
            </div>
          </div>
          
          {/* Schedule options - only shown when isScheduled is true */}
          {showScheduleOptions && (
            <div className="mt-2 p-3 bg-[#13141B] border border-gray-800/60 rounded-lg transition-all duration-300 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <FiClock className="mr-1.5 text-[#00ffa3]" size={14} />
                  <span className="text-xs font-medium text-white">Schedule Post</span>
                </div>
                <button
                  type="button"
                  onClick={toggleScheduleOptions}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <FiX size={12} />
                </button>
              </div>
              
              <div className="flex items-center space-x-3 mt-2">
                <div className="flex-1">
                  <label htmlFor="schedule-date" className="block text-xs text-gray-400 mb-1 ml-1">Date</label>
                  <div className="relative group">
                    <input
                      id="schedule-date"
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 hover:border-gray-700 cursor-pointer appearance-none"
                    />
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 pointer-events-none">
                      <FiCalendar className="text-[#00ffa3] group-hover:scale-110 transition-transform duration-300" size={12} />
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <label htmlFor="schedule-time" className="block text-xs text-gray-400 mb-1 ml-1">Time</label>
                  <div className="relative group">
                    <input
                      id="schedule-time"
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300 hover:border-gray-700 cursor-pointer appearance-none"
                    />
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pr-2 pointer-events-none">
                      <FiClock className="text-[#00ffa3] group-hover:scale-110 transition-transform duration-300" size={12} />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-3 text-xs text-[#00ffa3]/80 flex items-center bg-[#00ffa3]/5 p-2 rounded-md">
                <FiCheck className="mr-1.5 flex-shrink-0" size={10} /> 
                <span>Will publish automatically in your local timezone. Scheduled posts won't appear until their scheduled time.</span>
              </div>
            </div>
          )}
          
          {/* Image preview overlay - shown regardless of which panel is active */}
          {imagePreview && (showScheduleOptions || showTagInput || isVotePost) && (
            <div className="mt-2 mb-3 relative rounded-lg overflow-hidden shadow-lg border border-gray-800/60 bg-[#13141B]/80">
              <img 
                src={imagePreview} 
                alt="Upload preview" 
                className="max-h-40 w-auto mx-auto rounded-lg"
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
          
          {/* Larger image preview when no other panels are active */}
          {imagePreview && !showScheduleOptions && !showTagInput && !isVotePost && (
            <div className="mt-2 relative rounded-lg overflow-hidden shadow-lg border border-gray-800/60 bg-[#13141B]/80">
              <img 
                src={imagePreview} 
                alt="Upload preview" 
                className="max-h-60 w-auto mx-auto rounded-lg"
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
          
          {/* Compact tag input area - only shown when showTagInput is true */}
          {showTagInput && (
            <div className="mt-2 p-3 bg-[#13141B]/80 border border-gray-800/60 rounded-lg transition-all duration-300 animate-fadeIn">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-medium text-white flex items-center">
                  <FiHash className="mr-1 text-[#00ffa3]" size={14} />
                  Add Tags
                </h3>
                
                {/* Close button */}
                <button
                  type="button"
                  onClick={toggleTagInput}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <FiX size={12} />
                </button>
              </div>
              
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
            <div className="mt-2 p-3 bg-[#13141B]/80 border border-gray-800/60 rounded-lg transition-all duration-300 animate-fadeIn">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-white flex items-center">
                  <FiBarChart2 className="mr-1 text-[#00ffa3]" size={14} />
                  Vote Options
                </h3>
                
                {/* Close button */}
                <button
                  type="button"
                  onClick={toggleVotePost}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <FiX size={12} />
                </button>
              </div>
              
              {vote_options.map((option, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handlevote_optionChange(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    className="flex-grow px-3 py-2 bg-[#13141B] border border-gray-800/60 rounded-lg text-gray-200 focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-colors duration-300"
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
                  className="flex items-center px-3 py-2 text-xs text-[#00ffa3] hover:text-[#00ffa3]/80 hover:bg-[#00ffa3]/10 rounded-md transition-colors duration-300 focus:outline-none"
                >
                  <FiPlus size={14} className="mr-1" /> Add Option
                </button>
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex justify-end mt-6">
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