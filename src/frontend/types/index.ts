export interface Bitcoiner {
  id: string;
  handle: string;
  pubkey: string;
  avatar_url?: string;
}

export interface LockLike {
  tx_id: string;
  handle_id: string;
  amount: number;
  locked_until: number;
  created_at: Date;
}

export interface Post {
  tx_id: string;
  amount: number;
  handle_id: string;
  content: string;
  created_at: string;
  locked_until: number;
  media_url: string | null;
  media_type?: string;
  description?: string;
  creator: {
    handle: string;
  };
  lock_likes: LockLike[];
}

export interface PostExtended {
  id: string;
  creator: string;
  title: string;
  description: string;
  prompt: string;
  style: string;
  duration: number;
  format: string;
  file_url: string;
  thumbnail_url: string;
  tx_id: string;
  locks: number;
  status: 'minted';
  tags: string[];
  created_at: Date;
  updated_at: Date;
  total_locked: number;
  threshold: number;
  is_top_10_percent: boolean;
  is_top_3: boolean;
  lock_likes: LockLike[];
  content: string;
  unlock_height?: number;
  block_height?: number;
  is_vote?: boolean;
  vote_options?: Array<{
    id: string;
    tx_id: string;
    post_id: string;
    post_tx_id: string;
    content: string;
    author_address: string;
    created_at: string;
    lock_amount: number;
    lock_duration: number;
    unlock_height: number;
    current_height: number;
    lock_percentage: number;
    tags: string[];
  }>;
}

export interface HODLTransaction {
  tx_id: string;
  handle_id: string;
  content: string;
  media_url?: string;
  media_type?: string;
  raw_image_data?: string;
  description?: string;
  amount: number;
  created_at: Date;
  lock_likes: LockLike[];
  replies: HODLTransaction[];
  is_vote?: boolean;
  content_type?: string;
  metadata?: any;
  block_height?: number;
  vote_options?: vote_option[];
}

export interface vote_option {
  id: string;
  tx_id: string;
  content: string;
  lock_amount: number;
  total_locked: number;
  created_at: string;
}

export interface BitcoinerSettings {
  handle: string;
  pubkey: string;
  paymail: string;
}

export const DEFAULT_LOCKLIKE_AMOUNT = 0.01;
export const DEFAULT_LOCKLIKE_BLOCKS = 1000;

export enum LockStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED'
}

export enum TxType {
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK'
}

export enum TxStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED'
}

export interface PolymarketData {
  market_id: string;
  question: string;
  description: string;
  close_time: string;
  probability: number;
  status: 'open' | 'closed' | 'resolved';
  resolved_outcome?: string;
}

export interface Lock {
  id: string;
  tx_id: string;
  amount: number;
  status: LockStatus;
  lock_until_height: number;
  created_at: string;
  metadata?: Record<string, any>;
  polymarket_data?: PolymarketData;
}

export interface Transaction {
  id: string;
  tx_id: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface CreateLockParams {
  recipient_address: string;
  amount: number;
  lock_until_height: number;
}