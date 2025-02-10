import * as React from 'react';
import { useState, useEffect } from 'react';
import { FiCheck, FiLoader } from 'react-icons/fi';
import { supabase } from '../utils/supabaseClient';
import { toast } from 'react-hot-toast';

const AVAILABLE_TAGS = [
  'Politics',
  'Crypto',
  'Sports',
  'Pop Culture',
  'Economics/Business',
  'Science/Technology',
  'Current Events',
  'Finance',
  'Health',
  'Miscellaneous/Oddities'
];

interface TagPreferencesProps {
  userId: string;
}

export const TagPreferences: React.FC<TagPreferencesProps> = ({ userId }) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchUserPreferences();
  }, [userId]);

  const fetchUserPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('UserPreferences')
        .select('preferred_tags')
        .eq('handle_id', userId)
        .single();

      if (error) throw error;
      
      if (data) {
        setSelectedTags(data.preferred_tags || []);
      }
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      toast.error('Failed to load preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('UserPreferences')
        .upsert({
          handle_id: userId,
          preferred_tags: selectedTags,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      
      toast.success('Preferences saved successfully');
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <FiLoader className="w-6 h-6 text-[#00ffa3] animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-[#2A2A40] border border-gray-800 rounded-lg p-6">
      <h2 className="text-xl font-semibold text-white mb-4">Content Preferences</h2>
      <p className="text-gray-400 mb-6">Select the types of content you'd like to see in your feed</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {AVAILABLE_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => handleTagToggle(tag)}
            className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-300 ${
              selectedTags.includes(tag)
                ? 'bg-[#00ffa3]/10 border-[#00ffa3] text-[#00ffa3]'
                : 'border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <span>{tag}</span>
            {selectedTags.includes(tag) && (
              <FiCheck className="w-5 h-5" />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={isSaving}
        className="w-full flex items-center justify-center px-6 py-3 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] text-black rounded-lg font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 disabled:opacity-50"
      >
        {isSaving ? (
          <>
            <FiLoader className="w-5 h-5 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          'Save Preferences'
        )}
      </button>
    </div>
  );
}; 