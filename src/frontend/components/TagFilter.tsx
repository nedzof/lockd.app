import { API_URL } from "../config";
import React, { useState, useEffect, useCallback } from 'react';
import { FiX } from 'react-icons/fi';

interface TagCount {
  tag: string;
  count: number;
  totalLocked?: number;
}

interface TagFilterProps {
  onTagSelect: (tags: string[]) => void;
  selected_tags: string[];
}

// Use environment variable for API URL

// Preset categories/tags sorted by popularity
const PRESET_TAGS = [
  'memes',
  'art',
  'news',
  'music',
  'gaming',
  'tech',
  'crypto',
  'bitcoin',
  'bsv',
  'nfts',
  'defi',
  'politics',
  'sports',
  'food',
  'travel',
  'photography',
  'science',
  'education',
  'history',
  'philosophy',
  'davos',
  'dump',
  'plitics',
  'switzerland',
  'trump',
  'wef'
];

// Tags sorted by popularity (first row only)
const POPULAR_TAGS = [
  'memes',
  'art',
  'news',
  'music',
  'gaming',
  'tech',
  'crypto',
  'bitcoin',
  'bsv',
  'nfts',
  'defi'
];

const TagFilter: React.FC<TagFilterProps> = ({ onTagSelect, selected_tags }) => {
  const [tags, setTags] = useState<string[]>(POPULAR_TAGS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional: Fetch additional tags if server is available
  const fetchAdditionalTags = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const response = await fetch(`${API_URL}/api/tags`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Get the most popular tags (first row only)
      const fetchedTags = data.tags || [];
      const sortedTags = [...fetchedTags].sort((a, b) => {
        // Sort by popularity if available, otherwise use preset order
        if (a.count && b.count) return b.count - a.count;
        return 0;
      });
      
      // Take only the first row (11 tags)
      const popularTags = sortedTags.slice(0, 11).map(tag => 
        typeof tag === 'string' ? tag : tag.name || tag.tag
      );
      
      // If we have popular tags from the server, use them, otherwise fall back to preset
      if (popularTags.length > 0) {
        setTags(popularTags);
      } else {
        setTags(POPULAR_TAGS);
      }
    } catch (err) {
      console.error('Error fetching additional tags:', err);
      // Don't set error state - we're already using preset tags
      // Just log the error for debugging purposes
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Start with preset popular tags immediately
    setTags(POPULAR_TAGS);
    setIsLoading(false);
    
    // Optionally try to fetch additional tags in the background
    fetchAdditionalTags();
  }, [fetchAdditionalTags]);

  const handleTagClick = (tag: string) => {
    const newselected_tags = selected_tags.includes(tag)
      ? selected_tags.filter(t => t !== tag)
      : [...selected_tags, tag];
    onTagSelect(newselected_tags);
  };

  // Render only the first row of tags
  const renderTagGroups = () => {
    return (
      <div className="flex flex-wrap gap-2 p-4">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => handleTagClick(tag)}
            className={`
              px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300
              ${selected_tags.includes(tag)
                ? 'bg-[#00ffa3] text-black hover:bg-[#00ff9d]'
                : 'bg-[#2A2B33] text-gray-300 hover:bg-[#3A3B43]'
              }
            `}
          >
            {tag}
          </button>
        ))}
      </div>
    );
  };

  if (isLoading && tags.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[100px]">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-[#00ffa3]"></div>
      </div>
    );
  }

  return renderTagGroups();
};

export default TagFilter;