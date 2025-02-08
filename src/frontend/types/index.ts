export interface Bitcoiner {
  id: string;
  handle: string;
  pubkey: string;
  avatar_url?: string;
}

export interface LockLike {
  txid: string;
  handle_id: string;
  amount: number;
  locked_until: number;
  created_at: Date;
}

export interface Post {
  txid: string;
  amount: number;
  handle_id: string;
  content: string;
  created_at: string;
  locked_until: number;
  media_url: string | null;
  creator: {
    handle: string;
  };
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

export interface HODLTransaction {
  txid: string;
  handle_id: string;
  content: string;
  media_url?: string;
  amount: number;
  created_at: Date;
  locklikes: LockLike[];
  replies: HODLTransaction[];
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

export interface Lock {
  id: string;
  txId: string;
  amount: number;
  status: LockStatus;
  lockUntilHeight: number;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface Transaction {
  id: string;
  txId: string;
  type: TxType;
  status: TxStatus;
  amount: number;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface CreateLockParams {
  recipientAddress: string;
  amount: number;
  lockUntilHeight: number;
} 