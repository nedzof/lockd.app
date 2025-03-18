import React, { useState, useEffect } from 'react';
import { getLinkPreview } from 'link-preview-js';
import { FiExternalLink, FiYoutube } from 'react-icons/fi';

interface LinkPreviewProps {
  url: string;
}

interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  images?: string[];
  favicon?: string;
  mediaType?: string;
  videoId?: string; // Added for YouTube videos
}

const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const [previewData, setPreviewData] = useState<LinkPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const fetchPreview = async () => {
      if (!url) return;
      
      try {
        setIsLoading(true);
        setHasError(false);
        
        // Special handling for YouTube links - process them directly
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          const videoId = getYouTubeVideoId(url);
          
          if (videoId) {
            // For YouTube, we can create a reliable preview without making API calls
            setPreviewData({
              url,
              title: 'YouTube Video',
              description: 'Click to watch this video on YouTube',
              siteName: 'YouTube',
              images: [`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`],
              favicon: 'https://www.youtube.com/favicon.ico',
              videoId
            });
            setIsLoading(false);
            return;
          }
        }
        
        // For all other links, try to fetch preview
        try {
          // Use link-preview-js directly
          const data = await getLinkPreview(url, {
            timeout: 5000,
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
          });
          
          console.log('Preview data fetched:', data);
          
          // Format the data
          const formattedData: LinkPreviewData = {
            url: data.url,
            title: 'title' in data ? data.title : undefined,
            description: 'description' in data ? data.description : undefined,
            images: 'images' in data ? data.images : undefined,
            favicon: 'favicons' in data && data.favicons.length > 0 ? data.favicons[0] : undefined,
            siteName: 'siteName' in data ? data.siteName : new URL(url).hostname,
          };
          
          setPreviewData(formattedData);
        } catch (error) {
          console.error('Error with link-preview-js:', error);
          
          // Fall back to basic preview for known domains
          const hostname = new URL(url).hostname;
          
          if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            setPreviewData({
              url,
              title: 'Twitter Post',
              description: 'View this post on Twitter',
              siteName: 'Twitter',
              favicon: 'https://abs.twimg.com/responsive-web/client-web/icon-ios.b1fc7275.png'
            });
          } else if (hostname.includes('facebook.com') || hostname.includes('fb.com')) {
            setPreviewData({
              url,
              title: 'Facebook Content',
              description: 'View this content on Facebook',
              siteName: 'Facebook',
              favicon: 'https://facebook.com/favicon.ico'
            });
          } else if (hostname.includes('instagram.com')) {
            setPreviewData({
              url,
              title: 'Instagram Post',
              description: 'View this post on Instagram',
              siteName: 'Instagram',
              favicon: 'https://instagram.com/favicon.ico'
            });
          } else if (hostname.includes('telegram') || hostname.includes('t.me')) {
            setPreviewData({
              url,
              title: 'Telegram Content',
              description: 'View this content on Telegram',
              siteName: 'Telegram',
              favicon: 'https://telegram.org/favicon.ico'
            });
          } else {
            // Generic fallback
            setPreviewData({
              url,
              title: hostname,
              description: 'Visit this website',
              siteName: hostname
            });
          }
        }
      } catch (error) {
        console.error('Error in overall preview logic:', error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreview();
  }, [url]);

  const getYouTubeVideoId = (url: string): string | null => {
    // Support for youtu.be and youtube.com URLs
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
  };

  if (isLoading) {
    return (
      <div className="bg-gray-100 dark:bg-[#13141B] rounded-lg p-3 mt-3 animate-pulse">
        <div className="flex items-center space-x-4">
          <div className="rounded-md bg-gray-200 dark:bg-gray-700 h-16 w-16"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (hasError || !previewData) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline break-all flex items-center mt-2"
      >
        {url} <FiExternalLink className="ml-1" size={14} />
      </a>
    );
  }
  
  // Special YouTube preview
  if (previewData.videoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block mt-3 rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200 bg-[#13141B] border border-gray-800/30"
      >
        <div className="relative group">
          {/* Video thumbnail with play button overlay */}
          <div className="relative">
            <img
              src={`https://img.youtube.com/vi/${previewData.videoId}/maxresdefault.jpg`}
              alt="YouTube video thumbnail"
              className="w-full h-auto object-cover"
              onError={(e) => {
                // If maxresdefault fails, try hqdefault
                const target = e.target as HTMLImageElement;
                target.src = `https://img.youtube.com/vi/${previewData.videoId}/hqdefault.jpg`;
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black bg-opacity-70 rounded-full p-4 text-red-500 transform group-hover:scale-110 transition-transform duration-300">
                <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
          
          {/* Content info */}
          <div className="p-3">
            <div className="flex items-center space-x-2 mb-2">
              <img 
                src="https://www.youtube.com/favicon.ico"
                alt="YouTube favicon"
                className="w-4 h-4"
              />
              <span className="text-xs text-gray-400">YouTube</span>
            </div>
            <h3 className="font-medium text-white text-sm mb-1">
              {previewData.title || "YouTube Video"}
            </h3>
            <p className="text-xs text-gray-300">
              {previewData.description || "Click to watch this video on YouTube"}
            </p>
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-3 rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200 bg-[#13141B] border border-gray-800/30"
    >
      <div className="flex flex-col sm:flex-row">
        {previewData.images && previewData.images.length > 0 && (
          <div className="sm:w-1/3 bg-gray-100 dark:bg-[#0D0E14]">
            <img
              src={previewData.images[0]}
              alt={previewData.title || 'Link preview image'}
              className="w-full h-full object-cover sm:max-h-32"
              onError={(e) => {
                // Hide image on error
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="p-3 flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 mb-1">
              {previewData.favicon && (
                <img 
                  src={previewData.favicon} 
                  alt="Site favicon" 
                  className="w-4 h-4"
                  onError={(e) => {
                    // Hide favicon on error
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}
              <span className="text-xs text-gray-400 truncate">
                {previewData.siteName || new URL(url).hostname}
              </span>
            </div>
            <FiExternalLink className="text-gray-400 h-4 w-4" />
          </div>
          
          {previewData.title && (
            <h3 className="font-medium text-white text-sm mb-1 line-clamp-2">
              {previewData.title}
            </h3>
          )}
          
          {previewData.description && (
            <p className="text-xs text-gray-300 line-clamp-2">
              {previewData.description}
            </p>
          )}
        </div>
      </div>
    </a>
  );
};

export default LinkPreview; 