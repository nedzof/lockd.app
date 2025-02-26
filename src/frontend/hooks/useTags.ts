import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const useTags = () => {
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTags = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_URL}/api/tags`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      
      const data = await response.json();
      
      // Assuming the API returns an array of tags
      if (Array.isArray(data)) {
        setTags(data);
      } else if (data.tags && Array.isArray(data.tags)) {
        setTags(data.tags);
      } else {
        // Fallback to some default tags if the API doesn't return the expected format
        setTags([
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
        ]);
      }
    } catch (err) {
      console.error('Error fetching tags:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch tags'));
      
      // Use default tags on error
      setTags([
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
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch tags on initial mount
  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const addTag = useCallback(async (newTag: string) => {
    if (!newTag.trim()) return;
    
    try {
      // Check if tag already exists
      if (tags.includes(newTag.trim())) {
        return;
      }
      
      // Optimistically update UI
      setTags(prev => [...prev, newTag.trim()]);
      
      // You can implement API call to save the new tag if needed
      // const response = await fetch(`${API_URL}/api/tags`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({ tag: newTag.trim() }),
      // });
      
      // if (!response.ok) {
      //   throw new Error('Failed to add tag');
      // }
      
    } catch (err) {
      console.error('Error adding tag:', err);
      toast.error('Failed to add tag');
      
      // Revert the optimistic update
      setTags(prev => prev.filter(tag => tag !== newTag.trim()));
    }
  }, [tags]);

  return {
    tags,
    isLoading,
    error,
    fetchTags,
    addTag
  };
};
