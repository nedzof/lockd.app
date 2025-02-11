import * as React from 'react';
import { useState } from 'react';
import { FiSend, FiX, FiImage, FiTrash2, FiTwitter, FiMessageCircle, FiLoader, FiBarChart2, FiTag, FiLock } from 'react-icons/fi';
import { createPost, createVoteOptionPost } from '../services/post.service';
import { getLinkPreview, LinkPreviewData } from '../services/link-preview.service';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import ImageUploading, { ImageListType } from 'react-images-uploading';

// Available tags based on schema comment
const AVAILABLE_TAGS = [
  'Politics',
  'Crypto',
  'Sports',
  'Pop Culture',
  'Business',
  'Tech',
  'Current Events',
  'Finance',
  'Health',
  'Memes'
];

interface PollOption {
  text: string;
  lockAmount: number;
  lockDuration: number;
}

interface CreatePostProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

interface PredictionMarketData {
  source: string;
  prediction: string;
  endDate: Date;
  probability: number;
  options?: string[];
  lockDurationBlocks?: number;
}

interface StandardLockOptions {
  isLocked: boolean;
  duration?: number;
  amount?: number;
}

interface PollLockOptions {
  isPoll: true;
  options: Array<{
    text: string;
    lockDuration: number;
    lockAmount: number;
  }>;
}

type LockOptions = StandardLockOptions | PollLockOptions;

interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

export const CreatePost: React.FC<CreatePostProps> = ({ isOpen, onClose, onPostCreated }) => {
  const { bsvAddress, wallet } = useWallet();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<ImageListType>([]);
  const [mode, setMode] = useState<'create' | 'poll'>('create');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [predictionMarketData, setPredictionMarketData] = useState<PredictionMarketData | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [showLockOptions, setShowLockOptions] = useState(false);
  const [lockDuration, setLockDuration] = useState<number>(1); // Default 1 block
  const [lockAmount, setLockAmount] = useState<number>(1000); // Default 1000 sats
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);

  const onImagesChange = (imageList: ImageListType) => {
    setImages(imageList);
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!wallet || !bsvAddress) {
      toast.error('Please connect your wallet');
      return;
    }

    if (mode === 'poll') {
      if (!content.trim()) {
        toast.error('Please provide a poll question');
        return;
      }
      if (pollOptions.length < 2) {
        toast.error('Please add at least 2 poll options');
        return;
      }
      if (pollOptions.some(opt => !opt.text.trim())) {
        toast.error('Please fill in all poll options');
        return;
      }
      if (pollOptions.some(opt => !opt.lockAmount || !opt.lockDuration)) {
        toast.error('Please provide both lock duration and amount for all options');
        return;
      }
    } else if (!content.trim() && !images.length) {
      toast.error('Please provide either text content or an image');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'poll') {
        // First create the main vote question post
        const questionPost = await createPost(
          content,
          bsvAddress,
          wallet,
          undefined,
          undefined,
          [...selectedTags, 'vote_question'],
          undefined,
          {
            isLocked: false,
            isPoll: true,
            options: pollOptions.map(opt => ({
              text: opt.text,
              lockDuration: opt.lockDuration,
              lockAmount: opt.lockAmount
            }))
          }
        );

        // Then create individual posts for each option
        const optionPromises = pollOptions.map(async (option) => {
          return createVoteOptionPost(
            {
              questionTxid: questionPost.txid,
              optionText: option.text,
              lockDuration: option.lockDuration,
              lockAmount: option.lockAmount
            },
            bsvAddress,
            wallet
          );
        });

        // Wait for all option posts to be created
        await Promise.all(optionPromises);
      } else {
        const standardLockOptions: StandardLockOptions | undefined = isLocked ? {
          isLocked: true,
          duration: lockDuration,
          amount: lockAmount
        } : undefined;

        await createPost(
          content,
          bsvAddress,
          wallet,
          images[0]?.file,
          undefined,
          selectedTags,
          predictionMarketData || undefined,
          standardLockOptions
        );
      }

      setContent('');
      setImages([]);
      setSelectedTags([]);
      setPredictionMarketData(null);
      setIsLocked(false);
      setLockDuration(1);
      setLockAmount(1000);
      setPollOptions([]);
      onPostCreated?.();
      onClose();
    } catch (error) {
      console.error('Failed to create post:', error);
      toast.error('Failed to create post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePollOptionChange = (index: number, field: keyof PollOption, value: string | number) => {
    setPollOptions(prev => {
      const newOptions = [...prev];
      if (field === 'text') {
        newOptions[index] = { ...newOptions[index], text: value as string };
      } else if (field === 'lockAmount') {
        newOptions[index] = { ...newOptions[index], lockAmount: Math.max(1000, Number(value)) };
      } else if (field === 'lockDuration') {
        newOptions[index] = { ...newOptions[index], lockDuration: Math.min(52560, Math.max(1, Number(value))) };
      }
      return newOptions;
    });
  };

  const addPollOption = () => {
    setPollOptions(prev => [...prev, { text: '', lockAmount: 1000, lockDuration: 1 }]);
  };

  const removePollOption = (index: number) => {
    setPollOptions(prev => prev.filter((_, i) => i !== index));
  };

  // Function to extract URLs from text
  const extractUrls = (text: string): string[] => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
  };

  // Handle content change with link detection
  const handleContentChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    // Extract URLs and fetch preview for the first one
    const urls = extractUrls(newContent);
    if (urls.length > 0 && (!linkPreview || linkPreview.url !== urls[0])) {
      const preview = await getLinkPreview(urls[0]);
      if (preview) {
        setLinkPreview(preview);
      }
    } else if (urls.length === 0 && linkPreview) {
      setLinkPreview(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl shadow-xl w-full max-w-2xl mx-4 transform transition-all">
        {/* Header */}
        <div className="flex flex-col border-b border-gray-800/30">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-xl font-semibold text-white">
              {mode === 'create' ? 'Create Post' : 'Create Vote'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          
          {/* Mode Toggle */}
          <div className="flex justify-center px-6 pb-4">
            <div className="flex p-1 bg-[#1A1B23] rounded-lg">
              <button
                onClick={() => {
                  setMode('create');
                }}
                className={`px-6 py-2 rounded-md transition-all duration-200 ${
                  mode === 'create'
                    ? 'bg-[#00ffa3] text-black font-medium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Create Post
              </button>
              <button
                onClick={() => {
                  setMode('poll');
                }}
                className={`px-6 py-2 rounded-md transition-all duration-200 ${
                  mode === 'poll'
                    ? 'bg-[#00ffa3] text-black font-medium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Create Vote
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {mode === 'poll' ? (
            <div className="space-y-6">
              {/* Poll Title/Question */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter your poll question..."
                className="w-full px-4 py-3 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none"
                disabled={isSubmitting}
              />

              {/* Poll Options */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-medium">Poll Options</h3>
                  <button
                    onClick={addPollOption}
                    className="px-3 py-1.5 text-sm bg-[#00ffa3]/10 text-[#00ffa3] rounded-lg hover:bg-[#00ffa3]/20 transition-colors"
                  >
                    Add Option
                  </button>
                </div>

                {pollOptions.map((option, index) => (
                  <div key={index} className="p-3 bg-[#1A1B23] border border-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => handlePollOptionChange(index, 'text', e.target.value)}
                        placeholder={`Option ${index + 1}`}
                        className="flex-1 px-3 py-2 bg-[#1A1B23] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-[#00ffa3]"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1000"
                          step="1000"
                          value={option.lockAmount}
                          onChange={(e) => handlePollOptionChange(index, 'lockAmount', e.target.value)}
                          className="w-28 px-3 py-2 bg-[#1A1B23] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-[#00ffa3]"
                          placeholder="Lock amount"
                        />
                        <span className="text-gray-500 text-sm">sats</span>
                      </div>
                      <button
                        onClick={() => removePollOption(index)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove option"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Locks for {(option.lockDuration / 144).toFixed(1)} days
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Image Upload */}
              <ImageUploading value={images} onChange={onImagesChange} maxNumber={1} dataURLKey="data_url">
                {({ imageList, onImageUpload, onImageRemove, isDragging, dragProps }) => (
                  <div className="space-y-4">
                    {/* Upload Button */}
                    {imageList.length === 0 && (
                      <button
                        type="button"
                        onClick={onImageUpload}
                        {...dragProps}
                        className={`w-full p-4 border-2 border-dashed rounded-lg transition-colors ${
                          isDragging 
                            ? 'border-[#00ffa3] bg-[#00ffa3]/5' 
                            : 'border-gray-800 hover:border-[#00ffa3]/50'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-2 text-gray-400">
                          <FiImage className="w-8 h-8" />
                          <span>Click or drag image here</span>
                        </div>
                      </button>
                    )}

                    {/* Image Preview */}
                    {imageList.map((image, index) => (
                      <div key={index} className="relative">
                        <img
                          src={image.data_url}
                          alt="Upload preview"
                          className="w-full h-48 object-cover rounded-lg"
                        />
                        <button
                          onClick={() => onImageRemove(index)}
                          className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 rounded-full text-white transition-colors"
                        >
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </ImageUploading>

              {/* Text content field */}
              <textarea
                value={content}
                onChange={handleContentChange}
                placeholder={images.length > 0 ? "Add a description (optional)..." : "What's on your mind?"}
                className="w-full h-40 px-4 py-3 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none"
                disabled={isSubmitting}
              />
              
              {/* Link Preview */}
              {linkPreview && (
                <div className="mt-2 p-4 bg-[#1A1B23] border border-gray-800 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        {linkPreview.siteName && (
                          <span className="text-sm text-gray-400">{linkPreview.siteName}</span>
                        )}
                        <h3 className="text-white font-medium">{linkPreview.title}</h3>
                      </div>
                      {linkPreview.description && (
                        <p className="mt-1 text-sm text-gray-400 line-clamp-2">{linkPreview.description}</p>
                      )}
                      <a 
                        href={linkPreview.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="mt-2 text-xs text-[#00ffa3] hover:underline truncate block"
                      >
                        {linkPreview.url}
                      </a>
                    </div>
                    {linkPreview.image && (
                      <div className="ml-4 flex-shrink-0">
                        <img 
                          src={linkPreview.image} 
                          alt="Link preview" 
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => setLinkPreview(null)}
                      className="ml-2 p-1 text-gray-400 hover:text-white"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Tag Selector */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowTagSelector(!showTagSelector)}
                  className="flex items-center space-x-2 text-gray-400 hover:text-[#00ffa3] transition-colors"
                >
                  <FiTag className="w-4 h-4" />
                  <span>
                    {selectedTags.length ? `${selectedTags.length} tags selected` : 'Add tags'}
                  </span>
                </button>
                
                {showTagSelector && (
                  <div className="p-4 bg-[#1A1B23] border border-gray-800 rounded-lg">
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TAGS.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleTagToggle(tag)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            selectedTags.includes(tag)
                              ? 'bg-[#00ffa3] text-black'
                              : 'bg-gray-800/50 text-gray-400 hover:text-white'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Lock Options */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setShowLockOptions(!showLockOptions);
                    if (!showLockOptions) setIsLocked(true);
                  }}
                  className="flex items-center space-x-2 text-gray-400 hover:text-[#00ffa3] transition-colors"
                >
                  <FiLock className="w-4 h-4" />
                  <span>
                    {isLocked ? `Lock: ${lockDuration} ${lockDuration === 1 ? 'block' : 'blocks'} / ${lockAmount} sats` : 'Add Lock'}
                  </span>
                </button>
                
                {showLockOptions && (
                  <div className="p-4 bg-[#1A1B23] border border-gray-800 rounded-lg space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <label className="text-gray-400">Lock Post</label>
                      <button
                        onClick={() => setIsLocked(!isLocked)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${
                          isLocked ? 'bg-[#00ffa3]' : 'bg-gray-700'
                        }`}
                      >
                        <span
                          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform transform ${
                            isLocked ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {isLocked && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-gray-400 text-sm block mb-2">Duration (blocks)</label>
                          <input
                            type="number"
                            min="1"
                            max="52560"
                            value={lockDuration}
                            onChange={(e) => setLockDuration(Math.min(52560, Math.max(1, parseInt(e.target.value) || 0)))}
                            className="w-full px-3 py-2 bg-[#1A1B23] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-[#00ffa3]"
                          />
                          <span className="text-xs text-gray-500 mt-1 block">≈ {(lockDuration / 144).toFixed(1)} days</span>
                        </div>

                        <div>
                          <label className="text-gray-400 text-sm block mb-2">Amount (sats)</label>
                          <input
                            type="number"
                            min="1000"
                            step="1000"
                            value={lockAmount}
                            onChange={(e) => setLockAmount(Math.max(1000, parseInt(e.target.value) || 0))}
                            className="w-full px-3 py-2 bg-[#1A1B23] border border-gray-800 rounded-lg text-white focus:outline-none focus:border-[#00ffa3]"
                          />
                          <span className="text-xs text-gray-500 mt-1 block">Min: 1000 sats</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Character count */}
              <div className="flex justify-end">
                <span className="text-sm text-gray-400">
                  {content.length} characters
                </span>
              </div>
            </>
          )}
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
            disabled={isSubmitting || (!content.trim() && !images.length)}
            className="group relative px-6 py-2 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl transition-all duration-300"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#00ff9d] to-[#00ffa3] rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300"></div>
            <div className="relative flex items-center space-x-2 text-black">
              <span>{isSubmitting ? 'Creating...' : mode === 'create' ? 'Create Post' : 'Create Vote'}</span>
              <FiSend className={`w-4 h-4 transition-all duration-300 ${isSubmitting ? 'animate-pulse' : 'group-hover:rotate-45'}`} />
            </div>
            <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
          </button>
        </div>
      </div>
    </div>
  );
}; 