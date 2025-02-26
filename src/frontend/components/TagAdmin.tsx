import React, { useState, useEffect } from 'react';
import { useTags, Tag } from '../hooks/useTags';
import { FiRefreshCw, FiTrash2, FiEdit, FiSave, FiX } from 'react-icons/fi';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const TagAdmin: React.FC = () => {
  const { 
    currentEventTags, 
    isGeneratingTags, 
    generateTags, 
    fetchCurrentEventTags,
    updateTag,
    deleteTag
  } = useTags();
  
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // Fetch all tags with metadata
  const fetchAllTags = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/tags/all`);
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      
      const data = await response.json();
      if (data.success && Array.isArray(data.tags)) {
        setAllTags(data.tags);
      }
    } catch (error) {
      console.error('Error fetching all tags:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchAllTags();
  }, []);
  
  const handleGenerateTags = async () => {
    const success = await generateTags();
    if (success) {
      fetchAllTags();
    }
  };
  
  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Are you sure you want to delete this tag?')) {
      return;
    }
    
    const success = await deleteTag(tagId);
    if (success) {
      // Remove tag from local state
      setAllTags(allTags.filter(tag => tag.id !== tagId));
    }
  };
  
  const startEditing = (tag: Tag) => {
    setEditingTag(tag);
    setEditValue(tag.name);
  };
  
  const cancelEditing = () => {
    setEditingTag(null);
    setEditValue('');
  };
  
  const saveTagEdit = async () => {
    if (!editingTag || !editValue.trim()) {
      return;
    }
    
    const success = await updateTag(editingTag.id || '', editValue);
    if (success) {
      // Update tag in local state
      setAllTags(allTags.map(tag => 
        tag.id === editingTag.id ? { ...tag, name: editValue.trim() } : tag
      ));
      
      // Reset editing state
      setEditingTag(null);
      setEditValue('');
    }
  };
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Tag Management</h2>
        <button
          onClick={handleGenerateTags}
          disabled={isGeneratingTags}
          className="flex items-center px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
        >
          <FiRefreshCw className={`mr-2 ${isGeneratingTags ? 'animate-spin' : ''}`} />
          {isGeneratingTags ? 'Generating...' : 'Generate Tags'}
        </button>
      </div>
      
      {isLoading ? (
        <div className="text-center py-4">Loading tags...</div>
      ) : (
        <div>
          <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2">Current Event Tags</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Usage Count</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                {allTags
                  .filter(tag => tag.type === 'current_event')
                  .map(tag => (
                    <tr key={tag.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingTag?.id === tag.id ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border rounded dark:bg-gray-700 dark:text-white"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 dark:text-white">{tag.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 dark:text-gray-400">{tag.usageCount}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(tag.createdAt || '').toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingTag?.id === tag.id ? (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={saveTagEdit}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                            >
                              <FiSave />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <FiX />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => startEditing(tag)}
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              <FiEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag.id || '')}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                {allTags.filter(tag => tag.type === 'current_event').length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No current event tags found. Generate some tags to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mt-6 mb-2">Other Tags</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Usage Count</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
                {allTags
                  .filter(tag => tag.type !== 'current_event')
                  .map(tag => (
                    <tr key={tag.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingTag?.id === tag.id ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full p-1 border rounded dark:bg-gray-700 dark:text-white"
                          />
                        ) : (
                          <div className="text-sm text-gray-900 dark:text-white">{tag.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 dark:text-gray-400">{tag.type || 'regular'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500 dark:text-gray-400">{tag.usageCount}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingTag?.id === tag.id ? (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={saveTagEdit}
                              className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                            >
                              <FiSave />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <FiX />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => startEditing(tag)}
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              <FiEdit />
                            </button>
                            <button
                              onClick={() => handleDeleteTag(tag.id || '')}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                {allTags.filter(tag => tag.type !== 'current_event').length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No other tags found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagAdmin;
