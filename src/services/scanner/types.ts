import { Prisma } from '@prisma/client';

// JungleBus Types
export interface JungleBusTransaction {
  id: string;
  transaction: string;
  block_hash?: string;
  block_height?: number;
  block_time?: number;
  block_index?: number;
  merkle_proof?: any;
  output_types?: string[];
  contexts?: string[];
  sub_contexts?: string[];
  data?: string[];
}

export interface ControlMessage {
  statusCode: number;
}

export interface SubscriptionErrorContext {
  type: string;
  error: {
    code: number;
    message: string;
    temporary: boolean;
  };
}

export interface JungleBusSubscription {
  subscriptionID: string;
  currentBlock: number;
  Subscribe: () => void;
  UnSubscribe: () => void;
  GetCurrentBlock: () => number;
}

export interface JungleBusClient {
  Subscribe(
    from: string,
    fromBlock: number,
    onTransaction: (tx: JungleBusTransaction) => void,
    onStatus: (message: ControlMessage) => void,
    onError: (error: any) => void,
    onMempool: (tx: JungleBusTransaction) => void
  ): Promise<any>;
  GetTransaction(txid: string): Promise<JungleBusTransaction>;
}

// Transaction Types
export interface TransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    hex: string;
    asm: string;
    type: string;
    addresses?: string[];
  };
}

export interface TransactionInput {
  txid: string;
  vout: number;
  scriptSig: {
    hex: string;
    asm: string;
    addresses?: string[];
  };
  sequence: number;
  addresses?: string[];
  addr?: string;
}

export interface Transaction {
  transaction: string;
  tx: {
    h: string;  // transaction hash
  };
  blk?: {
    t: number;  // block timestamp
    h: number;  // block height
  };
}

// Vote Types
export interface VoteOption {
  content: string;
  author_address: string;
  lock_amount: number;
  lock_duration: number;
  tags: string[];
}

export interface VoteQuestionData {
  txid: string;
  content: string;
  author_address: string;
  created_at: Date;
  options: VoteOption[];
  tags: string[];
}

export interface VoteOptionData {
  txid: string;
  question_txid: string;
  content: string;
  author_address: string;
  created_at: Date;
  lock_amount: number;
  lock_duration: number;
  tags: string[];
}

export interface StructuredTransaction {
  txid: string;
  content: string;
  author_address: string;
  block_height: number;
  timestamp: Date;
  tags: string[];
  metadata?: any;
  is_vote?: boolean;
  vote_options?: string[];
  media_type?: string;
  raw_image_data?: string;
  image_format?: string;
  image_source?: string;
}

// Media Types
export interface MediaContent {
  content: Buffer;
  type: string;
}

// Constants
export const TRANSACTION_TYPES = {
  IMAGE_TYPES: ['image/'],
  ORDINAL_TYPES: ['ord'],
  MAP: {
    PREFIX: '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5',
    APP: 'lockd.app',
    TYPE: 'post'
  },
  OUTPUT_TYPES: {
    ORD: 'ord',
    PUBKEYHASH: 'bitcoin.pubkeyhash',
    MAP: 'map'
  },
  ORD_PREFIX: '6f7264' // 'ord' in hex
} as const;

export type PostCreateInput = {
  txid: string;
  content: string;
  author_address: string;
  media_type?: string;
  block_height: number;
  amount?: number;
  unlock_height?: number;
  description?: string;
  created_at: Date;
  tags: string[];
  metadata?: any;
  is_locked?: boolean;
  lock_duration?: number;
  raw_image_data?: string;
  image_format?: string;
  image_source?: string;
  is_vote?: boolean;
  vote_options?: {
    create: Array<{
      txid: string;
      post_txid: string;
      content: string;
      author_address: string;
      created_at: Date;
      lock_amount: number;
      lock_duration: number;
      tags: string[];
    }>;
  };
};

export interface MapMetadata {
  type: string;
  contentType: string;
  postId: string;
  sequence: number;
  parentSequence?: number;
  timestamp: string;
  version: string;
  author: string;
  description?: string;
  totalOutputs?: number;
}

export interface ContentOutput extends MapMetadata {
  content: string;
  lockDuration?: number;
  lockAmount?: number;
  unlockHeight?: number;
  predictionData?: {
    source: string;
    prediction: string;
    endDate: string;
    probability?: string;
  };
}

export interface ImageOutput extends MapMetadata {
  fileName: string;
  fileSize: number;
  imageUrl?: string;
}

export interface VoteQuestionOutput extends MapMetadata {
  question: string;
  optionsCount: number;
  totalLockAmount: number;
}

export interface VoteOptionTextOutput extends MapMetadata {
  optionText: string;
  optionIndex: number;
  questionContent: string;
}

export interface VoteOptionLockOutput extends MapMetadata {
  optionIndex: number;
  lockDuration: number;
  lockAmount: number;
  currentHeight: number;
  unlockHeight: number;
  lockPercentage: number;
}

export interface TagsOutput extends MapMetadata {
  tags: string[];
  tagsCount: number;
}

export interface ParsedPost {
  txid: string;
  content: ContentOutput;
  image?: ImageOutput;
  voteQuestion?: VoteQuestionOutput;
  voteOptions?: Array<{
    text: VoteOptionTextOutput;
    lock: VoteOptionLockOutput;
  }>;
  tags?: TagsOutput;
  createdAt: string;
}

export type OutputType = 'content' | 'image' | 'vote_question' | 'vote_option_text' | 'vote_option_lock' | 'tags'; 