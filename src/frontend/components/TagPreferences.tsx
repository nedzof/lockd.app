import { API_URL } from "../config";
import React, { useState, useEffect } from 'react';
import { FiX, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { useTags } from '../hooks/useTags';


interface TagPreferencesProps {
  selected_tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export const TagPreferences: React.FC<TagPreferencesProps> = ({ selected_tags, onTagsChange }) => {
  const { 
    tags, 
    currentEventTags, 
    isLoading, 
    error, 
    isGeneratingTags,
    generateTags,
    addTag
  } = useTags();
  
  const [newTag, setNewTag] = useState('');

  const handleTagClick = (tag: string) => {
    if (selected_tags.includes(tag)) {
      onTagsChange(selected_tags.filter(t => t !== tag));
    } else {
      onTagsChange([...selected_tags, tag]);
    }
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;

    await addTag(newTag.trim());
    
    // Add to selected tags
    if (!selected_tags.includes(newTag.trim())) {
      onTagsChange([...selected_tags, newTag.trim()]);
    }
    
    // Clear input
    setNewTag('');
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Tag Preferences</h2>
        <button
          onClick={() => generateTags()}
          disabled={isGeneratingTags}
          className="flex items-center px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          <FiRefreshCw className={`mr-2 ${isGeneratingTags ? 'animate-spin' : ''}`} />
          {isGeneratingTags ? 'Generating...' : 'Generate Tags'}
        </button>
      </div>
      
      {isLoading ? (
        <div className="text-center py-4">Loading tags...</div>
      ) : error ? (
        <div className="text-red-500 text-center py-4">{error instanceof Error ? error.message : 'Error loading tags'}</div>
      ) : (
        <>
          {/* Current Event Tags Section */}
          {currentEventTags.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Event Tags</h3>
              <div className="flex flex-wrap gap-2">
                {currentEventTags.map((tag) => (
                  <button
                    key={tag.id || tag.name}
                    type="button"
                    onClick={() => handleTagClick(tag.name)}
                    className={`px-3 py-1 text-sm rounded-full ${
                      selected_tags.includes(tag.name)
                        ? 'bg-green-500 text-white'
                        : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    }`}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Popular Tags Section */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Popular Tags</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagClick(tag)}
                  className={`px-3 py-1 text-sm rounded-full ${
                    selected_tags.includes(tag)
                      ? 'bg-blue-500 text-white'
                      : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          
          {/* Selected Tags Section */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Selected Tags</h3>
            <div className="flex flex-wrap gap-2">
              {selected_tags.length > 0 ? (
                selected_tags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center px-3 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleTagClick(tag)}
                      className="ml-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
                    >
                      <FiX size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No tags selected. Select tags above or add your own.</p>
              )}
            </div>
          </div>
          
          {/* Add Custom Tag Form */}
          <form onSubmit={handleAddTag} className="mt-4">
            <div className="flex">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className="flex-grow px-3 py-2 border dark:border-gray-700 rounded-l-lg dark:bg-gray-700 dark:text-white"
                placeholder="Add a custom tag..."
              />
              <button
                type="submit"
                className="px-3 py-2 bg-indigo-500 text-white rounded-r-lg hover:bg-indigo-600 flex items-center"
              >
                <FiPlus size={18} className="mr-1" /> Add
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};