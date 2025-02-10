import * as React from 'react';
import { useState } from 'react';
import { FiSend, FiX, FiImage, FiTrash2, FiTwitter, FiMessageCircle, FiLoader, FiBarChart2 } from 'react-icons/fi';
import { createPost } from '../services/post.service';
import { toast } from 'react-hot-toast';
import { useWallet } from '../providers/WalletProvider';
import ImageUploading, { ImageListType } from 'react-images-uploading';

interface CreatePostProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

export const CreatePost: React.FC<CreatePostProps> = ({ isOpen, onClose, onPostCreated }) => {
  const { bsvAddress, wallet } = useWallet();
  const [content, setContent] = useState('');
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<ImageListType>([]);
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importType, setImportType] = useState<'x' | 'telegram' | 'polymarket' | null>(null);
  const [mode, setMode] = useState<'create' | 'import'>('create');

  const onImagesChange = (imageList: ImageListType) => {
    setImages(imageList);
  };

  const handleImport = async () => {
    if (!importUrl || !importType) return;

    setIsSubmitting(true);
    try {
      // Here you would implement the actual import logic
      // For now, we'll just extract the content from the URL
      let importedContent = '';
      if (importType === 'x') {
        // Extract X post ID and fetch content
        const tweetId = importUrl.split('/').pop();
        // You would implement the actual Twitter API call here
        importedContent = `Imported from X: ${importUrl}`;
      } else if (importType === 'telegram') {
        // Extract Telegram post info and fetch content
        importedContent = `Imported from Telegram: ${importUrl}`;
      } else if (importType === 'polymarket') {
        // Extract Polymarket prediction market URL and fetch content
        importedContent = `Imported from Polymarket: ${importUrl}`;
      }

      setContent(importedContent);
      setImportUrl('');
      setImportType(null);
      setShowImportOptions(false);
      toast.success(`Successfully imported from ${importType === 'x' ? 'X' : importType === 'telegram' ? 'Telegram' : 'Polymarket'}`);
    } catch (error) {
      console.error('Failed to import post:', error);
      toast.error('Failed to import post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!wallet || !bsvAddress || (!content.trim() && !images.length)) {
      toast.error('Please provide either text content or an image');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await createPost(
        content, 
        bsvAddress, 
        wallet,
        images[0]?.file,
        comment
      );
      setContent('');
      setComment('');
      setImages([]);
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
        <div className="flex flex-col border-b border-gray-800/30">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-xl font-semibold text-white">
              {mode === 'create' ? 'Create Post' : 'Import Post'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          
          {/* Mode Toggle */}
          <div className="flex px-6 pb-4">
            <div className="flex p-1 bg-[#1A1B23] rounded-lg">
              <button
                onClick={() => {
                  setMode('create');
                  setShowImportOptions(false);
                  setImportType(null);
                  setImportUrl('');
                }}
                className={`px-4 py-2 rounded-md transition-all duration-200 ${
                  mode === 'create'
                    ? 'bg-[#00ffa3] text-black font-medium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Create Post
              </button>
              <button
                onClick={() => {
                  setMode('import');
                  setShowImportOptions(true);
                }}
                className={`px-4 py-2 rounded-md transition-all duration-200 ${
                  mode === 'import'
                    ? 'bg-[#00ffa3] text-black font-medium'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Import
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {mode === 'import' ? (
            <div className="space-y-4 p-4 bg-[#1A1B23]/50 rounded-lg border border-gray-800/30">
              <div className="flex space-x-2">
                <button
                  onClick={() => setImportType('x')}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors ${
                    importType === 'x'
                      ? 'bg-[#00ffa3]/10 text-[#00ffa3]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <FiTwitter className="w-4 h-4" />
                  <span>X (Twitter)</span>
                </button>
                <button
                  onClick={() => setImportType('telegram')}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors ${
                    importType === 'telegram'
                      ? 'bg-[#00ffa3]/10 text-[#00ffa3]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <FiMessageCircle className="w-4 h-4" />
                  <span>Telegram</span>
                </button>
                <button
                  onClick={() => setImportType('polymarket')}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors ${
                    importType === 'polymarket'
                      ? 'bg-[#00ffa3]/10 text-[#00ffa3]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <FiBarChart2 className="w-4 h-4" />
                  <span>Polymarket</span>
                </button>
              </div>

              {importType && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder={`Enter ${
                      importType === 'x' 
                        ? 'X' 
                        : importType === 'telegram' 
                          ? 'Telegram' 
                          : 'Polymarket'
                    } ${importType === 'polymarket' ? 'prediction market URL' : 'post URL'}`}
                    className="w-full px-4 py-2 bg-[#1A1B23] border border-gray-800/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#00ffa3]/30"
                  />
                  <button
                    onClick={handleImport}
                    disabled={!importUrl || isSubmitting}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-[#00ffa3]/10 text-[#00ffa3] rounded-lg hover:bg-[#00ffa3]/20 transition-colors disabled:opacity-50"
                  >
                    <span>
                      {importType === 'polymarket' ? 'Import prediction market from' : 'Import from'} {
                        importType === 'x' 
                          ? 'X' 
                          : importType === 'telegram' 
                            ? 'Telegram' 
                            : 'Polymarket'
                      }
                    </span>
                    {isSubmitting && <FiLoader className="w-4 h-4 animate-spin" />}
                  </button>
                </div>
              )}
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
                onChange={(e) => setContent(e.target.value)}
                placeholder={images.length > 0 ? "Add a description (optional)..." : "What's on your mind?"}
                className="w-full h-40 px-4 py-3 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none"
                disabled={isSubmitting}
              />
              
              {/* Character count */}
              <div className="flex justify-end">
                <span className="text-sm text-gray-400">
                  {content.length} characters
                </span>
              </div>

              {/* Comment Section Toggle */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800/30">
                <button
                  onClick={() => setShowComment(!showComment)}
                  className="flex items-center space-x-2 text-gray-400 hover:text-[#00ffa3] transition-colors"
                >
                  <span className="text-sm">
                    {showComment ? 'Hide Comment' : 'Add Comment'}
                  </span>
                  <svg
                    className={`w-4 h-4 transform transition-transform ${
                      showComment ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {comment && (
                  <span className="text-xs text-gray-500">
                    {comment.length} characters
                  </span>
                )}
              </div>

              {/* Comment Input */}
              {showComment && (
                <div className="space-y-2">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add your comment here..."
                    className="w-full h-24 px-4 py-3 text-white bg-[#1A1B23] border border-gray-800 rounded-lg focus:outline-none focus:border-[#00ffa3] resize-none text-sm"
                    disabled={isSubmitting}
                  />
                </div>
              )}
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
              <span>{isSubmitting ? 'Creating...' : mode === 'create' ? 'Create Post' : 'Import Post'}</span>
              <FiSend className={`w-4 h-4 transition-all duration-300 ${isSubmitting ? 'animate-pulse' : 'group-hover:rotate-45'}`} />
            </div>
            <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
          </button>
        </div>
      </div>
    </div>
  );
}; 