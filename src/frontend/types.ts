export interface LockLike {
  id: string;
  postId: string;
  amount: number;
  handle: string;
  lockPeriod: number;
  created_at: Date;
  updated_at: Date;
}

export const DEFAULT_LOCKLIKE_AMOUNT = 0.001; // Default amount in BSV
export const DEFAULT_LOCKLIKE_BLOCKS = 1; // Default lock duration in blocks

export interface Post {
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
  tx_id: string;
  locks: number;
  status: 'minted';
  tags: string[];
  created_at: Date;
  updated_at: Date;
  totalLocked: number;
  threshold: number;
  isTop10Percent: boolean;
  isTop3: boolean;
  locklikes: LockLike[];
  content: string;
  unlock_height: number | null;
  block_height: number;
} 