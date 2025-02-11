import React, { useState, useEffect } from 'react';
import { FiX, FiPlus } from 'react-icons/fi';

const API_URL = 'http://localhost:3001';

interface TagPreferencesProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export const TagPreferences: React.FC<TagPreferencesProps> = ({ selectedTags, onTagsChange }) => {
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
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

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tag: newTag.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to add tag');
      }

      setAvailableTags([...availableTags, newTag.trim()]);
      setNewTag('');
    } catch (error) {
      console.error('Error adding tag:', error);
      setError(error instanceof Error ? error.message : 'Failed to add tag');
    }
  };

  if (isLoading) {
    return <div className="text-gray-400">Loading tags...</div>;
  }

  if (error) {
    return <div className="text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
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

      <form onSubmit={handleAddTag} className="flex space-x-2">
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Add new tag..."
          className="flex-1 bg-[#2A2A40]/30 border border-gray-700/20 rounded-lg px-3 py-1.5 text-white placeholder-gray-400/70 focus:border-[#00ffa3]/30 focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={!newTag.trim()}
          className="flex items-center space-x-1 px-4 py-1.5 bg-gradient-to-r from-[#00ffa3]/80 to-[#00ff9d]/80 text-black rounded-lg font-medium hover:shadow-lg hover:from-[#00ff9d]/90 hover:to-[#00ffa3]/90 transition-all duration-300 disabled:opacity-50"
        >
          <FiPlus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </form>
    </div>
  );
}; 