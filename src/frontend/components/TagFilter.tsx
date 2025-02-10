import * as React from 'react';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { supabase } from '../utils/supabaseClient';

export const AVAILABLE_TAGS = [
  'Politics',
  'Crypto',
  'Sports',
  'Pop Culture',
  'Business',
  'Tech',
  'Current Events',
  'Finance',
  'Health',
  'Memes'
] as const;

interface TagFilterProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  userId?: string;
}

export const TagFilter: React.FC<TagFilterProps> = ({ selectedTags, onTagsChange, userId }) => {
  const [userPreferredTags, setUserPreferredTags] = useState<string[]>([]);

  useEffect(() => {
    if (userId) {
      fetchUserPreferences();
    }
  }, [userId]);

  const fetchUserPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('UserPreferences')
        .select('content_preferences')
        .eq('address', userId)
        .single();

      if (error) throw error;
      
      if (data?.content_preferences?.preferred_tags) {
        setUserPreferredTags(data.content_preferences.preferred_tags);
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
    }
  };

  const handleTagToggle = (tag: string) => {
    onTagsChange(
      selectedTags.includes(tag)
        ? selectedTags.filter(t => t !== tag)
        : [...selectedTags, tag]
    );
  };

  return (
    <div className="bg-[#2A2A40]/20 backdrop-blur-sm rounded-lg p-4">
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => handleTagToggle(tag)}
            className={clsx(
              'px-3 py-1 rounded-md text-sm transition-all duration-200',
              selectedTags.includes(tag)
                ? 'bg-[#00ffa3] text-black'
                : 'bg-[#2A2A40] text-gray-400 hover:text-white hover:bg-[#3A3A50]',
              userPreferredTags.includes(tag) && !selectedTags.includes(tag)
                ? 'border border-[#00ffa3]/30'
                : 'border border-transparent'
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}; 