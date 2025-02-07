export interface Bitcoiner {
  id: string;
  handle: string;
  pubkey: string;
  avatar_url?: string;
}

export interface LockLike {
  id: string;
  post_id: string;
  handle: string;
  amount: number;
  lock_period: number;
  created_at: string;
}

export interface Post {
  txid: string;
  creator: Bitcoiner;
  content: string;
  amount: number;
  media_url?: string;
  created_at: string;
  locklikes: LockLike[];
}

export interface MemeSubmission {
  id: string;
  creator: string;
  title: string;
  description: string;
  prompt: string;
  style: string;
  duration: number;
  format: string;
  fileUrl: string;
  thumbnailUrl: string;
  txId: string;
  locks: number;
  status: 'minted';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  totalLocked: number;
  threshold: number;
  isTop10Percent: boolean;
  isTop3: boolean;
  locklikes: LockLike[];
} 