export interface Post {
  id: string;
  tx_id: string;
  content: string;
  author_address: string;
  media_type?: string;
  block_height?: number;
  amount?: number;
  unlock_height?: number;
  description?: string;
  created_at: string | Date;
  tags: string[];
  metadata?: Record<string, any>;
  is_locked: boolean;
  lock_duration?: number;
  raw_image_data?: string;
  image_format?: string;
  image_source?: string;
  is_vote: boolean;
  vote_options?: vote_option[];
}

export interface vote_option {
  id: string;
  tx_id: string;
  content: string;
  author_address: string;
  created_at: string | Date;
  lock_amount: number;
  lock_duration: number;
  unlock_height?: number;
  tags: string[];
  post_id: string;
}

export interface ExtendedPost extends Post {
  imageUrl?: string;
  lockLikes?: LockLike[];
}

export interface LockLike {
  id: string;
  tx_id: string;
  author_address: string;
  amount: number;
  created_at: string | Date;
  post_id: string;
}

export interface PostStats {
  total_posts: number;
  total_locked: number;
  unique_participants: number;
} 