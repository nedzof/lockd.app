import React, { useState, useEffect } from 'react';
import { FiX } from 'react-icons/fi';

const API_URL = 'http://localhost:3001';

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export const TagFilter: React.FC<TagFilterProps> = ({ selectedTags, onTagsChange }) => {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch(`${API_URL}/api/tags`);
        if (!response.ok) {
          throw new Error('Failed to fetch tags');
        }
        const tags = await response.json();
        setAvailableTags(tags);
      } catch (error) {
        console.error('Error fetching tags:', error);
        setError(error instanceof Error ? error.message : 'Failed to load tags');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTags();
  }, []);

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  if (isLoading) {
    return <div className="text-gray-400">Loading tags...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {availableTags.map(tag => (
        <button
          key={tag}
          onClick={() => handleTagClick(tag)}
          className={`px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1 transition-all duration-300 ${
            selectedTags.includes(tag)
              ? 'bg-[#00ffa3] text-black'
              : 'bg-[#2A2A40]/30 text-gray-300 hover:bg-[#2A2A40]/50'
          }`}
        >
          <span>{tag}</span>
          {selectedTags.includes(tag) && (
            <FiX className="w-4 h-4 ml-1" />
          )}
        </button>
      ))}
    </div>
  );
}; 