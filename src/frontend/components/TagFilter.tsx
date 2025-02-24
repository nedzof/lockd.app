import React, { useState, useEffect, useCallback } from 'react';
import { FiX } from 'react-icons/fi';

interface TagCount {
  tag: string;
  count: number;
  totalLocked?: number;
}

interface TagFilterProps {
  onTagSelect: (tags: string[]) => void;
  selectedTags: string[];
}

// Use environment variable for API URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const TagFilter: React.FC<TagFilterProps> = ({ onTagSelect, selectedTags }) => {
  const [tags, setTags] = useState<TagCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTags(data.tags);
      setIsLoading(false);
    } catch (err) {
      console.error('Error fetching tags:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tags');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleTagClick = (tag: string) => {
    const newSelectedTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    onTagSelect(newSelectedTags);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[100px]">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-[#00ffa3]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center space-y-4 min-h-[100px]">
        <p className="text-red-500">{error}</p>
        <button 
          onClick={fetchTags}
          className="px-4 py-2 text-[#00ffa3] border border-[#00ffa3] rounded-lg hover:bg-[#00ffa3] hover:text-black transition-all duration-300"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 p-4">
      {tags && tags.length > 0 ? tags.map((tag) => (
        <button
          key={tag.tag}
          onClick={() => handleTagClick(tag.tag)}
          className={`
            px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300
            ${selectedTags.includes(tag.tag)
              ? 'bg-[#00ffa3] text-black hover:bg-[#00ff9d]'
              : 'bg-[#2A2B33] text-gray-300 hover:bg-[#3A3B43]'
            }
          `}
        >
          <span>{tag.tag}</span>
          <span className="ml-2 text-xs opacity-70">
            {tag.count}
          </span>
          {tag.totalLocked && tag.totalLocked > 0 && (
            <span className="ml-2 text-xs opacity-70">
              ({formatBSV(tag.totalLocked)} BSV)
            </span>
          )}
        </button>
      )) : null}
    </div>
  );
};

export default TagFilter;