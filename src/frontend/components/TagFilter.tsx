import { API_URL } from "../config";
import React, { useState, useEffect, useCallback } from 'react';
import { FiX, FiTag, FiChevronDown, FiChevronUp } from 'react-icons/fi';

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
  const [isTagsVisible, setIsTagsVisible] = useState(false);

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

  // Show tags if any are selected
  useEffect(() => {
    if (selected_tags.length > 0 && !isTagsVisible) {
      setIsTagsVisible(true);
    }
  }, [selected_tags, isTagsVisible]);

  const handleTagClick = (tag: string) => {
    const newselected_tags = selected_tags.includes(tag)
      ? selected_tags.filter(t => t !== tag)
      : [...selected_tags, tag];
    onTagSelect(newselected_tags);
  };

  const toggleTagsVisibility = () => {
    setIsTagsVisible(!isTagsVisible);
  };

  // Render only the first row of tags
  const renderTagGroups = () => {
    return (
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isTagsVisible ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
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

  return (
    <div className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg mb-6">
      <div className="px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FiTag size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-300">Tags</span>
            {selected_tags.length > 0 && (
              <div className="flex items-center space-x-1 ml-2">
                <span className="text-xs bg-[#00ffa3]/10 text-[#00ffa3] px-2 py-0.5 rounded-full">
                  {selected_tags.length} selected
                </span>
                <button
                  onClick={() => onTagSelect([])}
                  className="text-gray-400 hover:text-gray-300 focus:outline-none"
                  title="Clear all tags"
                >
                  <FiX size={14} />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={toggleTagsVisibility}
            className="flex items-center space-x-1 text-xs text-gray-400 hover:text-gray-300 focus:outline-none px-2 py-1 rounded-md hover:bg-white/5"
          >
            <span>{isTagsVisible ? 'Hide Tags' : 'Show Tags'}</span>
            {isTagsVisible ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
          </button>
        </div>
      </div>
      
      {/* Tag Chips */}
      {renderTagGroups()}
    </div>
  );
};

export default TagFilter;