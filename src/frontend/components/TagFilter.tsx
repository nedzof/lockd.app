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
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const TagFilter: React.FC<TagFilterProps> = ({ onTagSelect, selected_tags }) => {
  const [tags, setTags] = useState<string[]>([]);
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
      setTags(data.tags || []);
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
    const newselected_tags = selected_tags.includes(tag)
      ? selected_tags.filter(t => t !== tag)
      : [...selected_tags, tag];
    onTagSelect(newselected_tags);
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

export default TagFilter;