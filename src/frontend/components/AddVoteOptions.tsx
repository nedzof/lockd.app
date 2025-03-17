import React, { useState } from 'react';
import { addVoteOptionsToPost } from '../services/post.service';

interface AddVoteOptionsProps {
  postId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AddVoteOptions({ postId, onSuccess, onCancel }: AddVoteOptionsProps) {
  const [vote_options, setvote_options] = useState<string[]>(['', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddOption = () => {
    setvote_options([...vote_options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (vote_options.length <= 2) {
      setError('Vote posts require at least 2 options');
      return;
    }
    
    const newOptions = [...vote_options];
    newOptions.splice(index, 1);
    setvote_options(newOptions);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...vote_options];
    newOptions[index] = value;
    setvote_options(newOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Filter out empty options
    const filteredOptions = vote_options.filter(option => option.trim() !== '');
    
    if (filteredOptions.length < 2) {
      setError('Vote posts require at least 2 valid options');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await addVoteOptionsToPost(postId, filteredOptions);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to add vote options');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 shadow-lg">
      <h3 className="text-xl font-semibold mb-4">Add Vote Options</h3>
      
      {error && (
        <div className="bg-red-900/30 border border-red-500 text-red-200 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="space-y-3 mb-4">
          {vote_options.map((option, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                value={option}
                onChange={(e) => handleOptionChange(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => handleRemoveOption(index)}
                className="text-red-400 hover:text-red-300"
                disabled={isSubmitting || vote_options.length <= 2}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        
        <div className="flex items-center space-x-2 mb-4">
          <button
            type="button"
            onClick={handleAddOption}
            className="text-blue-400 hover:text-blue-300 flex items-center"
            disabled={isSubmitting}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Option
          </button>
        </div>
        
        <div className="flex justify-end space-x-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
              disabled={isSubmitting}
            >
              Cancel
            </button>
          )}
          
          <button
            type="submit"
            className={`px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Vote Options'}
          </button>
        </div>
      </form>
    </div>
  );
} 