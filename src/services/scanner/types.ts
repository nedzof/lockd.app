import { Prisma } from '@prisma/client';

// JungleBus Types
export interface JungleBusTransaction {
  id: string;
  transaction: string;
  addresses: string[];
  block_hash?: string;
  block_height: number;
  block_time?: number;
  block_index?: number;
  merkle_proof?: any;
  output_types?: string[];
  contexts?: string[];
  sub_contexts?: string[];
  data?: string[];
  outputs?: JungleBusOutput[];
}

export interface JungleBusOutput {
  script?: {
    asm?: string;
    hex?: string;
  };
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

export enum MAP_TYPES {
  CONTENT = 'content',
  IMAGE = 'image',
  VOTE_QUESTION = 'vote_question',
  VOTE_OPTION = 'vote_option',
  TAGS = 'tags'
}

export interface BaseMapMetadata {
  app: string;
  version: string;
  type: MAP_TYPES;
  postId: string;
  sequence: number;
  parentSequence?: number;
  timestamp: string;
}

export interface ContentMapMetadata extends BaseMapMetadata {
  type: MAP_TYPES.CONTENT;
  title?: string;
  description?: string;
}

export interface ImageMapMetadata extends BaseMapMetadata {
  type: MAP_TYPES.IMAGE;
  contentType: string;
  encoding: 'base64' | 'hex';
}

export interface VoteQuestionMapMetadata extends BaseMapMetadata {
  type: MAP_TYPES.VOTE_QUESTION;
  totalOptions: number;
  optionsHash: string;
}

export interface VoteOptionMapMetadata extends BaseMapMetadata {
  type: MAP_TYPES.VOTE_OPTION;
  parentSequence: number;
  optionIndex: number;
  lockAmount?: number;
  lockDuration?: number;
}

export interface TagsMapMetadata extends BaseMapMetadata {
  type: MAP_TYPES.TAGS;
}

export type MapMetadata = 
  | ContentMapMetadata 
  | ImageMapMetadata 
  | VoteQuestionMapMetadata 
  | VoteOptionMapMetadata 
  | TagsMapMetadata;

export interface ParsedPost {
  txid: string;
  postId: string;
  author: string;
  content: {
    text: string;
    title?: string;
    description?: string;
  };
  metadata: {
    app: string;
    version: string;
    lock?: {
      isLocked: boolean;
      duration: number;
      unlockHeight?: number;
    };
  };
  vote?: {
    question: string;
    totalOptions: number;
    optionsHash: string;
    options: {
      text: string;
      index: number;
      lockAmount?: number;
      lockDuration?: number;
      unlockHeight?: number;
      currentHeight?: number;
      lockPercentage?: number;
    }[];
  };
  tags: string[];
  timestamp: number;
  blockHeight: number;
  images: {
    data: string;
    contentType: string;
    encoding: string;
    dataURL?: string;
  }[];
}

export interface ContentOutput {
  type: MAP_TYPES.CONTENT;
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
  metadata: BaseMapMetadata;
}

export interface ImageOutput {
  type: MAP_TYPES.IMAGE;
  fileName: string;
  fileSize: number;
  imageUrl?: string;
  metadata: BaseMapMetadata;
}

export interface VoteQuestionOutput {
  type: MAP_TYPES.VOTE_QUESTION;
  question: string;
  optionsCount: number;
  totalLockAmount: number;
  metadata: BaseMapMetadata;
}

export interface VoteOptionTextOutput {
  type: MAP_TYPES.VOTE_OPTION;
  optionText: string;
  optionIndex: number;
  questionContent: string;
  metadata: BaseMapMetadata;
}

export interface VoteOptionLockOutput {
  type: MAP_TYPES.VOTE_OPTION;
  optionIndex: number;
  lockDuration: number;
  lockAmount: number;
  currentHeight: number;
  unlockHeight: number;
  lockPercentage: number;
  metadata: BaseMapMetadata;
}

export interface TagsOutput {
  type: MAP_TYPES.TAGS;
  tags: string[];
  tagsCount: number;
  metadata: BaseMapMetadata;
}

export type OutputType = 'content' | 'image' | 'vote_question' | 'vote_option_text' | 'vote_option_lock' | 'tags'; 