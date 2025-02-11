import { toast } from 'react-hot-toast';

export interface LinkPreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const SUPPORTED_PLATFORMS = {
  twitter: /twitter\.com|x\.com/,
  telegram: /t\.me/,
  youtube: /youtube\.com|youtu\.be/,
};

export const getLinkPreview = async (url: string): Promise<LinkPreviewData | null> => {
  try {
    // First check if it's a supported platform
    for (const [platform, regex] of Object.entries(SUPPORTED_PLATFORMS)) {
      if (regex.test(url)) {
        return handlePlatformPreview(platform, url);
      }
    }

    // For other URLs, use a general link preview service
    // You can use services like:
    // - https://www.linkpreview.net/
    // - https://microlink.io/
    // - https://iframely.com/
    // For this example, we'll use a mock response
    return {
      url,
      title: 'Website Preview',
      description: 'A preview of the linked content will appear here.',
      siteName: new URL(url).hostname
    };
  } catch (error) {
    console.error('Error fetching link preview:', error);
    toast.error('Failed to load link preview');
    return null;
  }
};

const handlePlatformPreview = async (platform: string, url: string): Promise<LinkPreviewData> => {
  // In a real implementation, you would make API calls to the respective platforms
  // For now, we'll return mock data
  switch (platform) {
    case 'twitter':
      return {
        url,
        title: 'Twitter Post',
        description: 'This is a preview of a Twitter post',
        siteName: 'Twitter'
      };
    case 'telegram':
      return {
        url,
        title: 'Telegram Post',
        description: 'This is a preview of a Telegram post',
        siteName: 'Telegram'
      };
    case 'youtube':
      return {
        url,
        title: 'YouTube Video',
        description: 'This is a preview of a YouTube video',
        image: 'https://img.youtube.com/vi/' + getYouTubeVideoId(url) + '/hqdefault.jpg',
        siteName: 'YouTube'
      };
    default:
      return {
        url,
        title: url,
        siteName: new URL(url).hostname
      };
  }
};

const getYouTubeVideoId = (url: string): string => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}; 