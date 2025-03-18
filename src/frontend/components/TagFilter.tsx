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
  isVisible: boolean; // Add this prop to control visibility from parent
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

const TagFilter: React.FC<TagFilterProps> = ({ onTagSelect, selected_tags, isVisible }) => {
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

  if (isLoading && tags.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50px]">
        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-[#00ffa3]"></div>
      </div>
    );
  }

  return (
    <div className={`bg-[#20213A]/70 backdrop-blur-sm rounded-b-lg mt-0 mb-2 relative z-20 transition-all duration-300 ${isVisible ? 'max-h-96 opacity-100 border-t border-gray-800/30' : 'max-h-0 opacity-0 overflow-hidden'}`}>
      <div className={`flex flex-wrap gap-2 p-4 transition-all duration-300 ${selected_tags.length > 0 ? 'pb-5' : ''}`}>
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => handleTagClick(tag)}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300
              ${selected_tags.includes(tag)
                ? 'bg-[#00ffa3] text-black hover:bg-[#00ff9d]'
                : 'bg-[#2A2B33] text-gray-300 hover:bg-[#3A3B43]'
              }
            `}
            aria-label={`Tag: ${tag} ${selected_tags.includes(tag) ? '(selected)' : ''}`}
          >
            {tag}
          </button>
        ))}
        
        {/* Clear tags button - only shows when tags are selected */}
        {selected_tags.length > 0 && (
          <button
            onClick={() => onTagSelect([])}
            className="absolute bottom-1 right-2 text-xs text-gray-400 hover:text-gray-300 focus:outline-none flex items-center"
            title="Clear all tags"
            aria-label="Clear all selected tags"
          >
            <span className="mr-1">Clear all tags</span>
            <FiX size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TagFilter;