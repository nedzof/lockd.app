// Type for MimeTypes
export type MimeTypes = 
  | "text/plain"
  | "text/markdown"
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml"
  | "application/pdf"
  | "application/json";

// Type for MAP data
export type MAP = Record<string, string>;

// Import standardized types from shared
import { 
  VoteOption as SharedVoteOption,
  ImageMetadata as SharedImageMetadata
} from '../../../shared/types';

// Frontend-specific vote option (extends the shared one)
export interface VoteOption extends SharedVoteOption {
  text: string;
  lock_amount: number;
  lock_duration: number;
  optionIndex: number;
  feeSatoshis?: number;
}

export interface VoteData {
  is_vote_question: boolean;
  question?: string;
  options?: VoteOption[];
  total_options?: number;
  options_hash?: string;
  selectedOption?: VoteOption;
}

// Frontend-specific image data
export interface ImageData {
  file: File;
  content_type: string;
  base64Data: string;
  description?: string;
  metadata?: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
}

// Database-aligned interfaces
export interface DbPost {
  id: string;
  tx_id: string;
  post_id: string;
  content: string;
  author_address: string;
  media_type?: string;
  block_height?: number;
  amount?: number;
  unlock_height?: number;
  description?: string;
  created_at: Date;
  tags: string[];
  metadata?: Record<string, any>;
  is_locked: boolean;
  lock_duration?: number;
  raw_image_data?: string;
  image_format?: string;
  image_source?: string;
  is_vote: boolean;
  vote_options?: DbVoteOption[];
  scheduled_at?: Date;
}

export interface DbVoteOption {
  id: string;
  tx_id: string;
  content: string;
  author_address: string;
  created_at: Date;
  post_id: string;
  option_index: number;
  tags: string[];
}

// Main metadata interface
export interface PostMetadata {
  app: string;
  type: string;
  content: string;
  timestamp: string;
  version: string;
  tags: string[];
  sequence: number;
  parentSequence?: number;
  post_id: string;
  block_height?: number;
  amount?: number;
  unlock_height?: number;
  is_locked: boolean;
  lock_duration?: number;
  is_vote: boolean;
  scheduled?: ScheduleInfo;
  vote?: {
    is_vote_question: boolean;
    question?: string;
    options?: Array<{
      text: string;
      lock_amount: number;
      lock_duration: number;
      optionIndex: number;
      unlock_height?: number;
      currentHeight?: number;
      lockPercentage?: number;
      feeSatoshis?: number;
    }>;
    total_options?: number;
    options_hash?: string;
    optionIndex?: number;
    optionText?: string;
    lock_amount?: number;
    lock_duration?: number;
  };
  image?: {
    file: File;
    content_type: string;
    base64Data: string;
    format: string;
    source?: string;
    description?: string;
    metadata?: {
      width: number;
      height: number;
      format: string;
      size: number;
    };
  };
}

// Interface for post creation clients
export interface PostCreationData {
  content: string;
  author_address: string;
  post_id: string;
  media_url?: string | null;
  media_type?: string;
  description?: string;
  tags?: string[];
  is_locked: boolean;
  lock_duration?: number;
  lock_amount?: number;
  unlock_height?: number;
  scheduled?: ScheduleInfo;
}

// Output post data
export interface Post extends PostCreationData {
  tx_id: string;
  created_at: string;
}

// Inscription request structure
export interface InscribeRequest {
  address: string;
  base64Data: string;
  mimeType: MimeTypes;
  contentType: 'image' | 'text';
  type: 'image' | 'text';
  map: MAP;
  satoshis: number;
}

// Schedule info type
export interface ScheduleInfo {
  scheduledAt: string;
  timezone: string;
}

// Lock settings type
export interface LockSettings {
  is_locked: boolean;
  lock_amount: number;
  lock_duration: number;
} 