import { API_URL } from "../config";
import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import { useTags } from '../hooks/useTags';
import { FiX, FiPlus, FiCheck, FiRefreshCw, FiImage, FiFile, FiPlusCircle, FiTrash2, FiBarChart2, FiLink, FiHash, FiClock, FiCalendar, FiLock } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { getBsvAddress, getWalletStatus } from '../utils/walletConnectionHelpers';
import LinkPreview from './LinkPreview';
import { YoursProviderType } from 'yours-wallet-provider';

// Define wallet state diagnostics logging utility
const logWalletState = (message: string, wallet: any, isConnected: boolean) => {
  console.log(`🔍 WALLET-DIAG [${message}]`, {
    timestamp: new Date().toISOString(),
    isConnected,
    walletExists: !!wallet,
    walletReady: wallet?.isReady || false,
    walletHasBsvProvider: !!wallet?.bsv,
    walletHasAddress: async () => {
      try {
        const address = await getBsvAddress(wallet);
        return !!address;
      } catch (e: any) {
        return `Error: ${e.message}`;
      }
    }
  });
};

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
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [error, setError] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const { wallet, connect, disconnect, isConnected, clearPendingTransactions } = useWallet();
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
  // Add state for link preview
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  // Add locking state
  const [isLocked, setIsLocked] = useState(false);
  const [showLockOptions, setShowLockOptions] = useState(false);
  const [lockAmount, setLockAmount] = useState(0.001); // Default 0.001 BSV
  const [lockDuration, setLockDuration] = useState(10); // Default 10 blocks
  // Add a new state to track which icon/feature is currently active
  const [activeFeature, setActiveFeature] = useState<'image' | 'vote' | 'tag' | 'schedule' | 'lock' | null>(null);
  // Add new state for transaction timeout tracking
  const [transactionStartTime, setTransactionStartTime] = useState<number | null>(null);
  const [transactionTimeoutRef, setTransactionTimeoutRef] = useState<NodeJS.Timeout | null>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [creation_state, set_creation_state] = useState<'idle' | 'connecting_wallet' | 'preparing_post' | 'submitting_post' | 'success' | 'error'>('idle');

  // Image handling functions
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/webp', 'image/tiff'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Unsupported image format');
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setImage(file);
    setShowImagePanel(true);
    setActiveFeature('image');

    // Close other panels
    setShowScheduleOptions(false);
    setShowTagInput(false);
    setIsVotePost(false);
    setShowLockOptions(false);
  };

  const handleClickUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImage(null);
    setImagePreview('');
    setShowImagePanel(false);
    setActiveFeature(null);
  };

  // Cleanup image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Compute if any panel is currently active
  const isPanelActive = showImagePanel || showTagInput || isVotePost || showScheduleOptions || showLockOptions;

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
        handleCloseModal();
      }
    };

    // Handle escape key to close the modal
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseModal();
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
  }, [isOpen]);

  // Simplified submission process using state machine
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    const start_time = Date.now();
    const log_with_time = (message: string) => {
      const elapsed = Date.now() - start_time;
      console.log(`⏱️ [${elapsed}ms] ${message}`);
    };

    log_with_time('🔄 [CreatePost] Starting submission process...');
    setIsSubmitting(true);
    setError('');
    setShowRetryButton(false);
    set_creation_state('connecting_wallet');
    
    try {
      // Step 1: Ensure wallet is connected
      log_with_time('🔄 [CreatePost] Step 1: Checking wallet connection');
      console.log('Wallet state:', { 
        isConnected, 
        walletExists: !!wallet,
        walletReady: wallet?.isReady || false,
        walletHasInscribe: typeof wallet?.inscribe === 'function',
        hasWalletProperties: wallet ? Object.keys(wallet).join(',') : 'none'
      });
      
      if (!isConnected) {
        try {
          log_with_time('🔄 [CreatePost] Attempting to connect wallet...');
          await connect();
          log_with_time('🔄 [CreatePost] Connect result:');
          console.log('New wallet state:', { 
            isConnected, 
            walletExists: !!wallet,
            walletReady: wallet?.isReady || false,
            walletHasInscribe: typeof wallet?.inscribe === 'function',
            hasWalletProperties: wallet ? Object.keys(wallet).join(',') : 'none'
          });
          
          if (!isConnected) {
            throw new Error('Failed to connect wallet');
          }
        } catch (error: any) {
          console.error('❌ [CreatePost] Connection error:', error);
          set_creation_state('error');
          throw new Error(`Connection error: ${error.message || 'Unknown error'}`);
        }
      }
      
      // Step 2: Prepare post creation options
      log_with_time('🔄 [CreatePost] Step 2: Preparing post options');
      set_creation_state('preparing_post');
      
      // Create post options
      const options = {
        isVotePost,
        voteOptions: isVotePost ? vote_options.filter(o => o.trim() !== '') : [],
        scheduledInfo: isScheduled && scheduleDate && scheduleTime ? {
          scheduledAt: new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString(),
          timezone: scheduleTimezone
        } : undefined,
        lockSettings: !isVotePost && isLocked ? {
          is_locked: true, 
          lock_amount: lockAmount * 100000000,
          lock_duration: lockDuration
        } : undefined
      };
      
      // Validate options
      if (options.isVotePost && options.voteOptions.length < 2) {
        throw new Error('A vote post requires at least 2 options');
      }
      
      // Step 3: Submit the post
      log_with_time('🔄 [CreatePost] Step 3: Submitting post, setting state to submitting_post');
      set_creation_state('submitting_post');
      
      // Direct call to createPost
      log_with_time('🔄 [CreatePost] Calling createPost...');
      const createdPost = await createPost(
        wallet,
        content,
        image || undefined,
        image ? image.type : undefined,
        options.isVotePost,
        options.voteOptions,
        options.scheduledInfo,
        selected_tags,
        options.lockSettings
      );
      
      log_with_time('✅ [CreatePost] Post created successfully, result:');
      console.log('Created post ID:', createdPost?.tx_id || 'unknown');
      
      // On success, reset form and close modal
      set_creation_state('success');
      resetForm();
      onClose();
      if (onPostCreated) onPostCreated();
      
    } catch (error: any) {
      log_with_time(`❌ [CreatePost] Error creating post: ${error.message || 'Unknown error'}`);
      console.error('Full error:', error);
      
      // Set error state
      set_creation_state('error');
      setError(error.message || 'Failed to create post');
      
      // Show retry button for certain error types
      if (
        error.message?.toLowerCase().includes('unauthorized') ||
        error.message?.includes('wallet') || 
        error.message?.includes('Wallet') || 
        error.message?.includes('timed out') ||
        error.message?.includes('transaction')
      ) {
        log_with_time('🔄 [CreatePost] Setting retry button for error: ' + error.message);
        setShowRetryButton(true);
      }
    } finally {
      log_with_time('🔄 [CreatePost] Submission process complete, resetting states');
      setIsSubmitting(false);
      setTransactionStartTime(null);
    }
  };

  // Very simple retry - just try again, with diagnostics
  const handleRetry = async () => {
    console.log('🟡 RETRY-DIAG: Retry requested');
    logWalletState('PRE-RETRY', wallet, isConnected);
    
    setError('');
    await handleSubmit(new Event('submit') as any);
  };

  // Simple cancel function
  const cancelSubmission = () => {
    setIsSubmitting(false);
    setError('Submission canceled');
  };

  // Toggle schedule options
  const toggleScheduleOptions = () => {
    if (showScheduleOptions) {
      setShowScheduleOptions(false);
      setIsScheduled(false);
      setActiveFeature(null);
    } else {
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
      
      // Close all other panels
      setShowTagInput(false);
      setIsVotePost(false);
      setShowImagePanel(false);
      setShowLockOptions(false);
      
      setIsScheduled(true);
      setShowScheduleOptions(true);
      setActiveFeature('schedule');
    }
  };

  // Toggle lock options
  const toggleLockOptions = () => {
    if (showLockOptions) {
      setShowLockOptions(false);
      setIsLocked(false);
      setActiveFeature(null);
    } else {
      // Close all other panels
      setShowScheduleOptions(false);
      setShowTagInput(false);
      setIsVotePost(false);
      setShowImagePanel(false);
      
      setIsLocked(true);
      setShowLockOptions(true);
      setActiveFeature('lock');
    }
  };

  // Toggle tag input
  const toggleTagInput = () => {
    if (showTagInput) {
      setShowTagInput(false);
      setActiveFeature(null);
    } else {
      // Close all other panels
      setShowScheduleOptions(false);
      setIsVotePost(false);
      setShowImagePanel(false);
      setShowLockOptions(false);
      
      setShowTagInput(true);
      setActiveFeature('tag');
    }
  };

  // Toggle vote post
  const toggleVotePost = () => {
    if (isVotePost) {
      setIsVotePost(false);
      setvote_options(['', '']);
      setActiveFeature(null);
    } else {
      // Close all other panels
      setShowScheduleOptions(false);
      setShowTagInput(false);
      setShowImagePanel(false);
      setShowLockOptions(false);
      
      // Initialize with two empty options if none exist
      if (vote_options.length === 0 || (vote_options.length === 2 && vote_options.every(opt => opt === ''))) {
        setvote_options(['', '']);
      }
      
      setIsVotePost(true);
      setActiveFeature('vote');
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

  // Add a function to extract URLs from content
  const extractFirstUrl = (text: string): string | null => {
    if (!text) return null;
    
    // URL regex pattern that matches common URL formats
    const urlRegex = /(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/gi;
    
    const matches = text.match(urlRegex);
    if (!matches || matches.length === 0) return null;
    
    // Ensure the URL has a protocol
    let url = matches[0];
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    return url;
  };

  // Update link detection when content changes
  useEffect(() => {
    const url = extractFirstUrl(content);
    setDetectedUrl(url);
  }, [content]);

  // Add effect to disable locking for vote posts
  useEffect(() => {
    // If switching to vote post mode, disable any active lock settings
    if (isVotePost && (isLocked || showLockOptions)) {
      setIsLocked(false);
      setShowLockOptions(false);
    }
  }, [isVotePost]);

  // Simple modal close
  const handleCloseModal = () => {
    setIsSubmitting(false);
    onClose();
  };

  // Reset form state
  const resetForm = () => {
    setContent('');
    setImage(null);
    setImagePreview('');
    setvote_options(['', '']);
    setIsVotePost(false);
    setselected_tags([]);
    setActiveFeature(null);
    setIsScheduled(false);
    setScheduleDate('');
    setScheduleTime('');
    setIsLocked(false);
    setLockAmount(0.001);
    setLockDuration(10);
    setError('');
    setShowRetryButton(false);
    set_creation_state('idle');
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
            onClick={handleCloseModal}
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
                  await connect();
                  toast.success('Wallet connected successfully!', { id: 'wallet-connect' });
                } catch (error) {
                  console.error('Error connecting wallet:', error);
                  toast.error('Failed to connect wallet. Please try again.', { id: 'wallet-connect' });
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
              
              {/* Bottom toolbar with additional options */}
              <div className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-3 bg-[#13141B] border-t ${
                imagePreview || showTagInput || isVotePost || showScheduleOptions
                  ? 'border-t-gray-800/40'
                  : 'border-t-gray-800/40 rounded-b-xl'
              }`}>
                <div className="flex items-center">
                  {/* Image upload or toggle button */}
                  <div className="relative">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/bmp,image/svg+xml,image/webp,image/tiff"
                      onChange={handleImageUpload}
                      className="sr-only"
                      id="image-upload"
                    />
                    {imagePreview ? (
                      <button
                        type="button"
                        onClick={handleClickUpload}
                        className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                          activeFeature === 'image'
                            ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                            : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                        }`}
                        title="Show image"
                      >
                        <FiImage size={18} />
                      </button>
                    ) : (
                      <label
                        htmlFor="image-upload"
                        className="flex items-center justify-center p-2 rounded-full transition-all duration-300 focus:outline-none cursor-pointer text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10"
                        title="Upload image"
                      >
                        <FiImage size={18} />
                      </label>
                    )}
                  </div>
                  
                  {/* Vertical separator */}
                  <div className="h-5 w-px bg-gray-700/50 mx-2"></div>
                  
                  {/* Vote post toggle */}
                  <button
                    type="button"
                    onClick={toggleVotePost}
                    className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                      activeFeature === 'vote'
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
                      activeFeature === 'tag'
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
                      activeFeature === 'schedule'
                        ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                        : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                    }`}
                    title={isScheduled ? "Cancel scheduling" : "Schedule for later"}
                  >
                    <FiClock size={18} />
                  </button>

                  {/* Divider */}
                  <div className="h-5 w-px bg-gray-700/50 mx-2"></div>
                  
                  {/* Lock button - only show when not in vote post mode */}
                  {!isVotePost && (
                    <button
                      type="button"
                      onClick={toggleLockOptions}
                      className={`flex items-center justify-center p-2 rounded-full transition-all duration-300 ${
                        activeFeature === 'lock'
                          ? 'text-[#00ffa3] bg-[#00ffa3]/10' 
                          : 'text-gray-400 hover:text-[#00ffa3] hover:bg-[#00ffa3]/10'
                      }`}
                      title={isLocked ? "Cancel locking" : "Lock post content"}
                    >
                      <FiLock size={18} />
                    </button>
                  )}
                </div>
                
                <div className="text-xs text-gray-400">
                  {content.length} characters
                </div>
              </div>
            </div>
          </div>
          
          {/* Now ensure only one panel shows at a time - Show link preview only if no other panel is active */}
          {detectedUrl && !isPanelActive && (
            <div className="transition-all duration-300 opacity-100 mt-3">
              <LinkPreview url={detectedUrl} />
            </div>
          )}
          
          {/* Schedule options - only shown when showScheduleOptions is true */}
          {showScheduleOptions && (
            <div className="mt-2 p-3 bg-[#13141B] border border-gray-800/60 rounded-lg transition-all duration-300 animate-fadeIn">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <FiClock className="mr-1 text-[#00ffa3]" size={14} />
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
              
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1">
                  <label htmlFor="schedule-date" className="block text-xs text-gray-400 mb-1">Date</label>
                  <div className="relative">
                    <input
                      id="schedule-date"
                      type="date"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                      <FiCalendar className="text-[#00ffa3]" size={12} />
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <label htmlFor="schedule-time" className="block text-xs text-gray-400 mb-1">Time</label>
                  <div className="relative">
                    <input
                      id="schedule-time"
                      type="time"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                      <FiClock className="text-[#00ffa3]" size={12} />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-2 text-xs text-[#00ffa3]/80 flex items-center bg-[#00ffa3]/5 p-1.5 rounded-md">
                <FiCheck className="mr-1 flex-shrink-0" size={10} /> 
                <span>Will publish in your timezone. Won't appear until scheduled time.</span>
              </div>
            </div>
          )}
          
          {/* Lock options - only shown when showLockOptions is true */}
          {showLockOptions && (
            <div className="mt-2 p-3 bg-[#13141B] border border-gray-800/60 rounded-lg transition-all duration-300 animate-fadeIn">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <FiLock className="mr-1 text-[#00ffa3]" size={14} />
                  <span className="text-xs font-medium text-white">Lock Post</span>
                </div>
                <button
                  type="button"
                  onClick={toggleLockOptions}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <FiX size={12} />
                </button>
              </div>
              
              <div className="flex flex-col space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label htmlFor="lock-amount" className="block text-xs text-gray-400 mb-1">Amount (₿)</label>
                    <input
                      id="lock-amount"
                      type="number"
                      value={lockAmount}
                      onChange={(e) => setLockAmount(Math.max(0.001, parseFloat(e.target.value) || 0.001))}
                      min={0.001}
                      step="0.001"
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300"
                    />
                    <div className="text-xs text-gray-500 mt-0.5">Min: 0.001 BSV</div>
                  </div>
                  <div className="flex-1">
                    <label htmlFor="lock-duration" className="block text-xs text-gray-400 mb-1">Duration (blocks)</label>
                    <input
                      id="lock-duration"
                      type="number"
                      value={lockDuration}
                      onChange={(e) => setLockDuration(Math.max(1, parseInt(e.target.value) || 1))}
                      min={1}
                      className="w-full bg-[#13141B] border border-gray-800/60 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30 transition-all duration-300"
                    />
                    <div className="text-xs text-gray-500 mt-0.5">≈ {Math.round(lockDuration / 144)} days</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-2 text-xs text-[#00ffa3]/80 flex items-center bg-[#00ffa3]/5 p-1.5 rounded-md">
                <FiCheck className="mr-1 flex-shrink-0" size={10} /> 
                <span>The specified BSV amount will be locked until the duration expires.</span>
              </div>
            </div>
          )}
          
          {/* Image preview - only show when no other panels are active or showImagePanel is true */}
          {imagePreview && (showImagePanel || !isPanelActive) && (
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
              
              <div className="space-y-2">
                {vote_options.map((option, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handlevote_optionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-grow px-2 py-1 bg-[#13141B] border border-gray-800/60 rounded-md text-xs text-gray-200 focus:outline-none focus:border-[#00ffa3] focus:ring-1 focus:ring-[#00ffa3]/30"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovevote_option(index)}
                      className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-full transition-colors duration-300 focus:outline-none"
                      disabled={vote_options.length <= 2}
                    >
                      <FiTrash2 size={14} />
                    </button>
                  </div>
                ))}
                <div>
                  <button
                    type="button"
                    onClick={handleAddvote_option}
                    className="flex items-center px-2 py-1 text-xs text-[#00ffa3] hover:text-[#00ffa3]/80 hover:bg-[#00ffa3]/10 rounded-md transition-colors duration-300 focus:outline-none mt-1"
                  >
                    <FiPlus size={12} className="mr-1" /> Add Option
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Action buttons */}
          <div className="flex justify-end space-x-3 mt-4">
            {isSubmitting && transactionStartTime && (
              <div className="flex items-center text-gray-400 text-sm mr-auto">
                <div className="animate-pulse mr-2">
                  <div className="h-2 w-2 bg-green-400 rounded-full inline-block"></div>
                </div>
                Transaction in progress
                {Date.now() - transactionStartTime > 5000 && (
                  <span className="ml-1 text-yellow-500">
                    (taking longer than usual...)
                  </span>
                )}
              </div>
            )}
            
            {isSubmitting && (
              <button
                type="button"
                onClick={cancelSubmission}
                className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-200 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            )}
            
            <button
              type="submit"
              disabled={isSubmitting || !content.trim() || (!isConnected && !wallet?.isReady)}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${
                isSubmitting || !content.trim() || (!isConnected && !wallet?.isReady)
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#00ffa3] to-[#00ffa3] text-black shadow-lg shadow-[#00ffa3]/10 hover:shadow-[#00ffa3]/20 hover:scale-105 transform'
              }`}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isScheduled ? 'Scheduling...' : 'Publishing...'}
                </div>
              ) : (
                <span>{isScheduled ? 'Schedule Post' : 'Publish'}</span>
              )}
            </button>
          </div>
          {/* Show error message and retry button when there's an error */}
          {error && (
            <div className="mb-4 bg-red-900/20 border border-red-500/30 p-4 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
              {showRetryButton && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="mt-2 px-4 py-2 bg-red-700/30 hover:bg-red-700/50 text-white rounded-lg text-sm transition-colors duration-200 flex items-center"
                >
                  <FiRefreshCw className="mr-2" /> Retry with Reconnected Wallet
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default CreatePost;