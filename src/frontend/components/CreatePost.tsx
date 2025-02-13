import * as React from 'react';
import { useState } from 'react';
import { FiSend, FiX, FiImage, FiTrash2, FiTwitter, FiMessageCircle, FiLoader, FiBarChart2, FiTag, FiLock } from 'react-icons/fi';
import { createPost } from '../services/post.service';
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
  lockAmount?: number;
  lockDuration?: number;
}

interface CreatePostProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

export const CreatePost: React.FC<CreatePostProps> = ({ isOpen, onClose, onPostCreated }) => {
  const { bsvAddress, wallet } = useWallet();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<ImageListType>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showLockOptions, setShowLockOptions] = useState(false);
  const [lockDuration, setLockDuration] = useState<number>(1);
  const [lockAmount, setLockAmount] = useState<number>(1000);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [hasVoteOptions, setHasVoteOptions] = useState(false);
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
  const [showVoteOptions, setShowVoteOptions] = useState(false);
  const [activeOption, setActiveOption] = useState<'vote' | 'tags' | 'lock' | null>(null);

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

    if (!content.trim() && !images.length) {
      toast.error('Please provide either text content or an image');
      return;
    }

    if (hasVoteOptions) {
      if (pollOptions.length < 2) {
        toast.error('Please add at least 2 poll options');
        return;
      }
      if (pollOptions.some(opt => !opt.text.trim())) {
        toast.error('Please fill in all poll options');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const standardLockOptions = isLocked ? {
        isLocked: true,
        duration: lockDuration,
        amount: lockAmount
      } : { isLocked: false };

      const voteOptions = hasVoteOptions ? {
        isPoll: true,
        options: pollOptions.map(opt => ({
          text: opt.text,
          lockDuration: 1,  // Default values, will be configured later
          lockAmount: 1000
        }))
      } : undefined;

      await createPost(
        content,
        bsvAddress,
        wallet,
        images[0]?.file,
        undefined,
        selectedTags,
        undefined,
        {
          ...standardLockOptions,
          ...voteOptions
        }
      );

      // Reset form
      setContent('');
      setImages([]);
      setSelectedTags([]);
      setIsLocked(false);
      setLockDuration(1);
      setLockAmount(1000);
      setPollOptions([]);
      setHasVoteOptions(false);
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
    setPollOptions(prev => [...prev, { text: '' }]);
  };

  const removePollOption = (index: number) => {
    setPollOptions(prev => prev.filter((_, i) => i !== index));
  };

  // Extract URLs from text
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

  const handleOptionClick = (option: 'vote' | 'tags' | 'lock') => {
    if (activeOption === option) {
      setActiveOption(null);
      setShowVoteOptions(false);
      setShowTagSelector(false);
      setShowLockOptions(false);
      if (option === 'vote') setHasVoteOptions(false);
      if (option === 'lock') setIsLocked(false);
    } else {
      setActiveOption(option);
      setShowVoteOptions(option === 'vote');
      setShowTagSelector(option === 'tags');
      setShowLockOptions(option === 'lock');
      if (option === 'vote') {
        setHasVoteOptions(true);
        if (pollOptions.length === 0) {
          setPollOptions([
            { text: '' },
            { text: '' }
          ]);
        }
      }
      if (option === 'lock') setIsLocked(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-gradient-to-br from-[#2A2A40] to-[#1A1B23] rounded-xl shadow-xl w-full max-w-2xl mx-4 transform transition-all overflow-y-auto max-h-[90vh]">
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
        <div className="p-6 space-y-6">
          {/* Main Content */}
          <div className="space-y-4">
            <div className="relative">
              <textarea
                value={content}
                onChange={handleContentChange}
                placeholder="What's on your mind?"
                className="w-full px-4 py-3 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none min-h-[120px]"
                disabled={isSubmitting}
              />
              
              {/* Image Upload Button */}
              <ImageUploading
                multiple={false}
                value={images}
                onChange={onImagesChange}
                maxNumber={1}
                dataURLKey="data_url"
              >
                {({
                  imageList,
                  onImageUpload,
                  onImageRemove,
                  isDragging,
                  dragProps
                }) => (
                  <div>
                    {imageList.length === 0 ? (
                      <button
                        onClick={onImageUpload}
                        {...dragProps}
                        className="absolute bottom-3 right-3 p-2 text-gray-400 hover:text-[#00ffa3] transition-colors rounded-lg hover:bg-[#00ffa3]/5"
                        title="Add image"
                      >
                        <FiImage className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="mt-2">
                        <div className="relative rounded-lg overflow-hidden group">
                          <img
                            src={imageList[0].data_url}
                            alt="Upload preview"
                            className="w-full h-auto max-h-[200px] object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() => onImageRemove(0)}
                              className="p-2 text-white/80 hover:text-white transition-colors"
                              title="Remove image"
                            >
                              <FiTrash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ImageUploading>
            </div>

            {/* Optional Features */}
            <div className="flex items-center gap-4 py-2">
              {/* Vote Options Toggle */}
              <button
                onClick={() => handleOptionClick('vote')}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  activeOption === 'vote'
                    ? 'text-[#00ffa3]'
                    : 'text-gray-400 hover:text-[#00ffa3]'
                }`}
              >
                <FiBarChart2 className="w-4 h-4" />
                <span>Add Vote Options</span>
              </button>

              {/* Tags Toggle */}
              <button
                onClick={() => handleOptionClick('tags')}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  activeOption === 'tags'
                    ? 'text-[#00ffa3]'
                    : 'text-gray-400 hover:text-[#00ffa3]'
                }`}
              >
                <FiTag className="w-4 h-4" />
                <span>Add Tags</span>
              </button>

              {/* Lock Toggle */}
              <button
                onClick={() => handleOptionClick('lock')}
                className={`flex items-center gap-2 text-sm transition-colors ${
                  activeOption === 'lock'
                    ? 'text-[#00ffa3]'
                    : 'text-gray-400 hover:text-[#00ffa3]'
                }`}
              >
                <FiLock className="w-4 h-4" />
                <span>{activeOption === 'lock' ? 'Locking' : 'Add Lock'}</span>
              </button>
            </div>

            {/* Vote Options Section */}
            {activeOption === 'vote' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-gray-400 text-sm">Vote Options</h3>
                  <button
                    onClick={addPollOption}
                    className="text-[#00ffa3] text-xs hover:text-[#00ffa3]/80 transition-colors"
                  >
                    Add Option
                  </button>
                </div>

                <div className="space-y-2">
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => handlePollOptionChange(index, 'text', e.target.value)}
                        placeholder={`Option ${index + 1}`}
                        className="flex-1 px-3 py-2 text-sm bg-[#1A1B23] border border-gray-800/50 rounded-lg text-white/90 focus:outline-none focus:border-[#00ffa3]/50"
                      />
                      <button
                        onClick={() => removePollOption(index)}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                        title="Remove option"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tag Selector */}
            {activeOption === 'tags' && (
              <div className="flex flex-wrap gap-2 py-2">
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-[#1A1B23] text-[#00ffa3] border border-[#00ffa3]/20'
                        : 'bg-[#1A1B23] text-gray-400 border border-gray-800/50 hover:text-white hover:border-gray-700'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Lock Options */}
            {activeOption === 'lock' && (
              <div className="grid grid-cols-2 gap-4 py-2">
                <div>
                  <label className="text-gray-400 text-sm block mb-2">Duration (blocks)</label>
                  <input
                    type="number"
                    min="1"
                    max="52560"
                    value={lockDuration}
                    onChange={(e) => setLockDuration(Math.min(52560, Math.max(1, parseInt(e.target.value) || 0)))}
                    className="w-full px-3 py-2 text-sm bg-[#1A1B23] border border-gray-800/50 rounded-lg text-white focus:outline-none focus:border-[#00ffa3]/50"
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
                    className="w-full px-3 py-2 text-sm bg-[#1A1B23] border border-gray-800/50 rounded-lg text-white focus:outline-none focus:border-[#00ffa3]/50"
                  />
                  <span className="text-xs text-gray-500 mt-1 block">Min: 1000 sats</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-800/30">
          <div className="text-sm text-gray-400">
            {content.length} characters
          </div>
          <div className="flex items-center gap-4">
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
                <span>{isSubmitting ? 'Creating...' : 'Create Post'}</span>
                <FiSend className={`w-4 h-4 transition-all duration-300 ${isSubmitting ? 'animate-pulse' : 'group-hover:rotate-45'}`} />
              </div>
              <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 