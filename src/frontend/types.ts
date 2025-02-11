export interface LockLike {
  id: string;
  postId: string;
  amount: number;
  handle: string;
  lockPeriod: number;
  createdAt: Date;
  updatedAt: Date;
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
  content?: string;
} 