import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

export interface Tag {
  id?: string;
  name: string;
  type?: string;
  usageCount?: number;
  created_at?: string;
}

export const useTags = () => {
  const [tags, setTags] = useState<string[]>([]);
  const [currentEventTags, setCurrentEventTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);

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

  const fetchCurrentEventTags = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/tags/current-events`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch current event tags');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.tags)) {
        setCurrentEventTags(data.tags);
      }
    } catch (err) {
      console.error('Error fetching current event tags:', err);
      // Don't set error state here to avoid disrupting the main tag list
    }
  }, []);

  const generateTags = useCallback(async () => {
    setIsGeneratingTags(true);
    
    try {
      const response = await fetch(`${API_URL}/api/tags/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate tags');
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Tags generated successfully!');
        // Refresh both tag lists
        fetchTags();
        fetchCurrentEventTags();
        return true;
      } else {
        throw new Error(data.error || 'Failed to generate tags');
      }
    } catch (err) {
      console.error('Error generating tags:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate tags');
      return false;
    } finally {
      setIsGeneratingTags(false);
    }
  }, [fetchTags, fetchCurrentEventTags]);

  // Fetch tags on initial mount
  useEffect(() => {
    fetchTags();
    fetchCurrentEventTags();
  }, [fetchTags, fetchCurrentEventTags]);

  const addTag = useCallback(async (newTag: string) => {
    if (!newTag.trim()) return;
    
    try {
      // Check if tag already exists
      if (tags.includes(newTag.trim())) {
        return;
      }
      
      // Optimistically update UI
      setTags(prev => [...prev, newTag.trim()]);
      
      // Record tag usage
      await fetch(`${API_URL}/api/tags/usage/${encodeURIComponent(newTag.trim())}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
    } catch (err) {
      console.error('Error adding tag:', err);
      toast.error('Failed to add tag');
      
      // Revert the optimistic update
      setTags(prev => prev.filter(tag => tag !== newTag.trim()));
    }
  }, [tags]);

  const updateTag = useCallback(async (id: string, newName: string) => {
    if (!newName.trim() || !id) return false;
    
    try {
      const response = await fetch(`${API_URL}/api/tags/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName.trim() }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update tag');
      }
      
      toast.success('Tag updated successfully');
      return true;
    } catch (err) {
      console.error('Error updating tag:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update tag');
      return false;
    }
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    if (!id) return false;
    
    try {
      const response = await fetch(`${API_URL}/api/tags/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete tag');
      }
      
      toast.success('Tag deleted successfully');
      return true;
    } catch (err) {
      console.error('Error deleting tag:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete tag');
      return false;
    }
  }, []);

  return {
    tags,
    currentEventTags,
    isLoading,
    error,
    isGeneratingTags,
    fetchTags,
    fetchCurrentEventTags,
    generateTags,
    addTag,
    updateTag,
    deleteTag
  };
};
