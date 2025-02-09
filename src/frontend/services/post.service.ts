import { supabase } from '../utils/supabaseClient';
import type { Database } from '../../types/supabase';

type Post = Database['public']['Tables']['Post']['Row'];
type PostInsert = Database['public']['Tables']['Post']['Insert'];

export const createPost = async (content: string, authorAddress: string): Promise<Post> => {
  const newPost: PostInsert = {
    content,
    author_address: authorAddress,
    is_locked: false,
  };

  const { data, error } = await supabase
    .from('Post')
    .insert([newPost])
    .select()
    .single();

  if (error) {
    console.error('Failed to create post:', error);
    throw new Error(`Failed to create post: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned from post creation');
  }

  return data;
}; 