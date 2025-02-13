import * as React from 'react';
import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';
import { YoursWalletAdapter } from '../utils/YoursWalletAdapter';
import { MimeTypes, MAP } from 'yours-wallet-provider';
import { getFeeRate } from '../../shared/utils/whatsOnChain';
import { FiExternalLink } from 'react-icons/fi';

// Add API base URL configuration at the top of the file
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001';

export interface PredictionMarketData {
  source: string;
  prediction: string;
  endDate: Date;
  probability?: number;
}

export interface PostCreationData {
  content: string;
  author_address: string;
  postId: string;
  media_url?: string | null;
  media_type?: string;
  description?: string;
  tags?: string[];
  prediction_market_data?: PredictionMarketData;
  isLocked: boolean;
  lockDuration?: number;
  lockAmount?: number;
  unlockHeight?: number;
}

export interface Post extends PostCreationData {
  txid: string;
  created_at: string;
}

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

// Helper function to convert File to base64
const fileToBase64 = (file: File): Promise<string> => {
  console.log('Starting file to base64 conversion for:', {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size,
    lastModified: new Date(file.lastModified).toISOString()
  });
  
  return new Promise((resolve, reject) => {
    // Create URL from file
    const url = URL.createObjectURL(file);

    // Create image element
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Wait for image to load
    img.onload = () => {
      try {
        // Calculate dimensions
        let width = img.width;
        let height = img.height;

        // Resize if needed (max 800px)
        const maxSize = 800;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        // Set canvas size
        canvas.width = width;
        canvas.height = height;

        // Draw with black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to base64
        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

        // Log conversion details
        console.log('Base64 conversion details:', {
          originalWidth: img.width,
          originalHeight: img.height,
          finalWidth: width,
          finalHeight: height,
          base64Length: base64.length,
          base64Preview: base64.substring(0, 50) + '...'
        });

        // Cleanup
        URL.revokeObjectURL(url);

        resolve(base64);
      } catch (error) {
        console.error('Error processing image:', error);
        reject(error);
      }
    };

    img.onerror = error => {
      console.error('Error loading image:', error);
      URL.revokeObjectURL(url);
      reject(error);
    };

    img.src = url;
  });
};

// Helper function to convert base64 to hex
const base64ToHex = (base64: string): string => {
  console.log('Starting base64 to hex conversion:', {
    inputLength: base64.length,
    inputPreview: base64.substring(0, 50) + '...'
  });
  
  const raw = atob(base64);
  console.log('Decoded base64 to raw binary:', {
    rawLength: raw.length,
    rawPreview: raw.substring(0, 20).split('').map(c => c.charCodeAt(0)).join(',') + '...'
  });
  
  let hex = '';
  for (let i = 0; i < raw.length; i++) {
    const hexByte = raw.charCodeAt(i).toString(16);
    hex += hexByte.length === 2 ? hexByte : '0' + hexByte;
    if (i < 10) {
      console.log(`Byte ${i}: charCode=${raw.charCodeAt(i)}, hex=${hexByte}`);
    }
  }
  
  console.log('Hex conversion complete:', {
    hexLength: hex.length,
    hexPreview: hex.substring(0, 100) + '...',
    firstFewBytes: hex.match(/.{1,2}/g)?.slice(0, 10)
  });
  
  return hex;
};

// Helper function to get current block height
const getCurrentBlockHeight = async (): Promise<number> => {
  try {
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    return data.blocks;
  } catch (error) {
    console.error('Failed to fetch current block height:', error);
    throw new Error('Failed to fetch current block height');
  }
};

interface LockData {
  isLocked: boolean;
  duration?: number; // in blocks
  amount?: number; // in satoshis
  unlockHeight?: number;
}

interface InscribeRequest {
  address: string;
  base64Data: string;
  mimeType: MimeTypes;
  map: MAP;
  satoshis: number;
}

interface StringifiedMapData {
  app: string;
  type: string;
  content: string;
  timestamp: string;
  contentType: string;
  version: string;
  tags: string;
  prediction_market_data?: string;
  lock_data?: string;
  voteOptions?: string;
  isVoteQuestion?: string;
}

interface TransactionResponse {
  id: string;
  tx?: any; // Make tx optional since not all responses include it
}

interface MetadataObject {
  app: string;
  type: string;
  description: string;
  tags: string[];
  timestamp: string;
  version: string;
  lock_data?: {
    isLocked: boolean;
    duration: number;
    amount: number;
    unlockHeight: number;
  };
  protocol?: string;
}

interface VoteOptionData {
  questionTxid: string;
  optionText: string;
  lockDuration: number;
  lockAmount: number;
}

interface VotePostData extends PostCreationData {
  isVoteQuestion: boolean;
  voteTxid?: string;
  voteOptionIndex?: number;
  totalOptions?: number;
}

function createMapData(data: Record<string, any>): MAP {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      result[key] = JSON.stringify(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = JSON.stringify(value);
    } else {
      result[key] = String(value);
    }
  }
  return result as MAP;
}

// Add new helper functions for sequence management
function generatePostId(): string {
  return [
    Date.now().toString(36),
    Math.random().toString(36).substr(2, 9)
  ].join('-').substr(0, 32);
}

interface ComponentSequence {
  current: number;
  next(): number;
}

function createSequence(): ComponentSequence {
  let current = 0;
  return {
    get current() { return current; },
    next() { return current++; }
  };
}

// Update base MAP data creation
function createBaseMapData(
  type: string,
  content: string,
  tags: string[],
  postId: string,
  sequence: number,
  parentSequence?: number
): MAP {
  return {
    app: 'lockd.app',
    type,
    content,
    timestamp: new Date().toISOString(),
    postId,
    sequence: sequence.toString(),
    parentSequence: parentSequence?.toString(),
    version: '1.0.0',
    tags: JSON.stringify(tags)
  } as MAP;
}

// Add component creation functions
async function createImageComponent(
  imageFile: File,
  postId: string,
  sequence: number,
  parentSequence: number,
  address: string
): Promise<InscribeRequest> {
  const b64 = await fileToBase64(imageFile);
  return {
    address,
    base64Data: b64,
    mimeType: imageFile.type as MimeTypes,
    map: {
      ...createBaseMapData('image', '', [], postId, sequence, parentSequence),
      contentType: imageFile.type,
      encoding: 'base64',
      fileName: imageFile.name,
      fileSize: imageFile.size.toString()
    },
    satoshis: await calculateOutputSatoshis(b64.length)
  };
}

// Replace the hashContent function with a browser-compatible version
async function hashContent(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Update the createVoteQuestionComponent function to use async/await
async function createVoteQuestionComponent(
  question: string,
  options: Array<{ text: string }>,
  postId: string,
  sequence: number,
  parentSequence: number,
  address: string
): Promise<InscribeRequest> {
  return {
    address,
    base64Data: btoa(question),
    mimeType: 'text/plain',
    map: {
      ...createBaseMapData('vote_question', question, [], postId, sequence, parentSequence),
      totalOptions: options.length.toString(),
      optionsHash: await hashContent(options.map(o => o.text).join('|'))
    },
    satoshis: 1000
  };
}

function createVoteOptionComponent(
  option: { text: string; lockDuration: number; lockAmount: number },
  postId: string,
  sequence: number,
  parentSequence: number,
  optionIndex: number,
  address: string
): InscribeRequest {
  return {
    address,
    base64Data: btoa(option.text),
    mimeType: 'text/plain',
    map: {
      ...createBaseMapData('vote_option', option.text, [], postId, sequence, parentSequence),
      optionIndex: optionIndex.toString(),
      lockAmount: option.lockAmount.toString(),
      lockDuration: option.lockDuration.toString()
    },
    satoshis: option.lockAmount
  };
}

function createTagsComponent(
  tags: string[],
  postId: string,
  sequence: number,
  parentSequence: number,
  address: string
): InscribeRequest {
  return {
    address,
    base64Data: btoa(JSON.stringify(tags)),
    mimeType: 'application/json',
    map: {
      ...createBaseMapData('tags', '', tags, postId, sequence, parentSequence),
      count: tags.length.toString()
    },
    satoshis: 1000
  };
}

// Helper function to create inscription request
function createInscriptionRequest(
  address: string, 
  content: string, 
  map: MAP, 
  satoshis: number,
  mimeType: string = 'text/plain'
): InscribeRequest {
  return {
    address,
    base64Data: btoa(content),
    mimeType: mimeType as MimeTypes,
    map: map as MAP,
    satoshis
  };
}

// Helper function to handle transaction response
function handleTransactionResponse(response: any): TransactionResponse {
  const inscriptionTx = {
    id: response.txid || response.id,
    tx: response.tx
  };

  if (!inscriptionTx?.id) {
    throw new Error('Failed to create inscription - no transaction ID returned');
  }

  return inscriptionTx;
}

// Update component validation
function validateComponentStructure(components: InscribeRequest[]) {
  // Check for content component
  const contentComp = components.find(c => c.map.type === 'content');
  if (!contentComp) {
    throw new Error('Missing content component');
  }

  // Check for unique sequence numbers
  const sequences = components.map(c => Number(c.map.sequence));
  if (new Set(sequences).size !== components.length) {
    throw new Error('Duplicate sequence numbers detected');
  }

  // Validate parent-child relationships
  components.forEach(comp => {
    const parentSeq = comp.map.parentSequence;
    if (parentSeq !== undefined) {
      const parentExists = components.some(c => Number(c.map.sequence) === Number(parentSeq));
      if (!parentExists) {
        throw new Error(`Parent sequence ${parentSeq} not found for component with sequence ${comp.map.sequence}`);
      }
    }
  });

  // Validate vote options
  const voteQuestion = components.find(c => c.map.type === 'vote_question');
  if (voteQuestion) {
    const voteOptions = components.filter(c => 
      c.map.type === 'vote_option' && 
      Number(c.map.parentSequence) === Number(voteQuestion.map.sequence)
    );
    
    if (voteOptions.length === 0) {
      throw new Error('Vote question found but no vote options');
    }

    // Check option indexes
    const optionIndexes = voteOptions.map(opt => Number(opt.map.optionIndex));
    if (new Set(optionIndexes).size !== voteOptions.length) {
      throw new Error('Duplicate vote option indexes detected');
    }
  }
}

// Update createPostObject to include postId
function createPostObject(
  txid: string,
  content: string,
  authorAddress: string,
  options: {
    postId: string,
    tags?: string[],
    media_type?: string,
    media_url?: string,
    prediction_market_data?: PredictionMarketData,
    isLocked?: boolean,
    lockDuration?: number,
    lockAmount?: number,
    unlockHeight?: number
  }
): Post {
  return {
    txid,
    postId: options.postId,
    content,
    author_address: authorAddress,
    created_at: new Date().toISOString(),
    media_type: options.media_type,
    media_url: options.media_url,
    tags: options.tags || [],
    prediction_market_data: options.prediction_market_data,
    isLocked: options.isLocked || false,
    lockDuration: options.lockDuration,
    lockAmount: options.lockAmount,
    unlockHeight: options.unlockHeight
  };
}

// Helper function to create vote question content
function createVoteQuestionContent(content: string): string {
  return `MAP_TYPE=vote_question\nCONTENT=${content}`;
}

// Helper function to create vote option content
function createVoteOptionContent(opt: { text: string; lockAmount: number; lockDuration: number }): string {
  return `MAP_TYPE=vote_option\nCONTENT=${opt.text}\nLOCK_AMOUNT=${opt.lockAmount}\nLOCK_DURATION=${opt.lockDuration}`;
}

// Helper function to create image content
function createImageContent(imageFile: File, b64: string, description?: string): string {
  return [
    'MAP_TYPE=image',
    `MIME_TYPE=${imageFile.type}`,
    `DESCRIPTION=${description || ''}`,
    `CONTENT=data:${imageFile.type};base64,${b64}`
  ].join('\n');
}

// Calculate satoshis based on fee rate and content size
async function calculateOutputSatoshis(contentSize: number): Promise<number> {
  try {
    const feeRate = await getFeeRate();
    // Estimate transaction size: base size (250 bytes) + content size
    const estimatedTxSize = 250 + contentSize;
    // Calculate required satoshis based on fee rate
    return Math.ceil(estimatedTxSize * feeRate);
  } catch (error) {
    console.error('Error calculating fee:', error);
    // Default to minimum viable fee if calculation fails
    return 1; // Minimum 1 satoshi as dust limit
  }
}

export const createVoteOptionPost = async (
  optionData: VoteOptionData,
  authorAddress: string,
  wallet: YoursWallet,
): Promise<Post> => {
  const mapData = createBaseMapData('vote_option', optionData.optionText, [], generatePostId(), 0, 0);
  mapData.lock_duration = optionData.lockDuration.toString();
  mapData.lock_amount = optionData.lockAmount.toString();
  mapData.voteOptions = JSON.stringify({
    questionTxid: optionData.questionTxid,
    optionText: optionData.optionText,
    lockDuration: optionData.lockDuration,
    lockAmount: optionData.lockAmount
  });

  const inscriptionRequest = createInscriptionRequest(
    authorAddress,
    optionData.optionText,
    mapData as MAP,
    optionData.lockAmount
  );

  const response = await wallet.inscribe([inscriptionRequest]);
  const inscriptionTx = handleTransactionResponse(response);

  return createPostObject(inscriptionTx.id, optionData.optionText, authorAddress, {
    postId: generatePostId(),
    isLocked: true,
    lockDuration: optionData.lockDuration,
    lockAmount: optionData.lockAmount
  });
};

export const createPost = async (
  content: string,
  authorAddress: string,
  wallet: YoursWallet,
  imageFile?: File,
  description?: string,
  tags?: string[],
  predictionMarketData?: PredictionMarketData,
  lockData?: {
    isLocked: boolean;
    duration?: number;
    amount?: number;
    isPoll?: boolean;
    options?: Array<{ text: string; lockDuration: number; lockAmount: number }>;
  }
): Promise<Post> => {
  try {
    const postId = generatePostId();
    const sequence = createSequence();
    const components: InscribeRequest[] = [];

    // Create main content component
    const contentSeq = sequence.next();
    const contentComponent = createInscriptionRequest(
      authorAddress,
      content,
      createBaseMapData('content', content, tags || [], postId, contentSeq),
      await calculateOutputSatoshis(content.length)
    );
    
    if (description) {
      contentComponent.map.description = description;
    }
    
    if (predictionMarketData) {
      contentComponent.map.prediction_market_data = JSON.stringify(predictionMarketData);
    }
    
    if (lockData?.isLocked) {
      const currentHeight = await getCurrentBlockHeight();
      contentComponent.map.lock_duration = lockData.duration?.toString() || '0';
      contentComponent.map.lock_amount = lockData.amount?.toString() || '0';
      contentComponent.map.unlock_height = (currentHeight + (lockData.duration || 0)).toString();
    }
    
    components.push(contentComponent);

    // Add image if present
    if (imageFile) {
      const imageComponent = await createImageComponent(
        imageFile,
        postId,
        sequence.next(),
        contentSeq,
        authorAddress
      );
      components.push(imageComponent);
    }

    // Add vote components if present
    if (lockData?.isPoll && lockData.options?.length) {
      const questionSeq = sequence.next();
      const questionComponent = await createVoteQuestionComponent(
        content,
        lockData.options,
        postId,
        questionSeq,
        contentSeq,
        authorAddress
      );
      components.push(questionComponent);

      // Add vote options
      lockData.options.forEach((option, idx) => {
        components.push(
          createVoteOptionComponent(
            option,
            postId,
            sequence.next(),
            questionSeq,
            idx,
            authorAddress
          )
        );
      });
    }

    // Add tags if present
    if (tags?.length) {
      components.push(
        createTagsComponent(
          tags,
          postId,
          sequence.next(),
          contentSeq,
          authorAddress
        )
      );
    }

    // Validate component structure
    validateComponentStructure(components);

    // Show pending toast
    const pendingToast = toast.loading('Creating post...', {
      style: {
        background: '#1A1B23',
        color: '#fff',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }
    });

    try {
      // Send to wallet
      const response = await wallet.inscribe(components);
      const inscriptionTx = handleTransactionResponse(response);

      console.log('Transaction details:', {
        inscriptionTx,
        txId: inscriptionTx.id,
        fullTx: response
      });

      // Create post in database immediately
      const postData = {
        txid: inscriptionTx.id,
        postId,
        content,
        author_address: authorAddress,
        media_type: imageFile?.type,
        description,
        tags: tags || [],
        metadata: {
          app: 'lockd.app',
          version: '1.0.0',
          prediction_market_data: predictionMarketData,
          lock: lockData?.isLocked ? {
            isLocked: true,
            duration: lockData.duration,
            amount: lockData.amount,
            unlockHeight: lockData.duration ? await getCurrentBlockHeight() + lockData.duration : undefined
          } : undefined
        },
        is_locked: lockData?.isLocked || false,
        lock_duration: lockData?.duration,
        is_vote: lockData?.isPoll || false,
        vote_options: lockData?.isPoll && lockData.options ? 
          lockData.options.map((option, index) => ({
            text: option.text,
            lockAmount: option.lockAmount || 1000,
            lockDuration: option.lockDuration || 1,
            index
          })) : undefined
      };

      console.log('Creating post in database with data:', postData);

      // Use configured API URL
      const dbResponse = await fetch(`${API_BASE_URL}/api/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
      });

      if (!dbResponse.ok) {
        const errorData = await dbResponse.json();
        console.error('Detailed error in post creation:', errorData);
        throw new Error(`Database error (${dbResponse.status}): ${errorData.message || 'Failed to create post in database'}`);
      }

      const createdPost = await dbResponse.json();
      console.log('Successfully created post:', createdPost);

      // Update toast
      toast.success('Post created successfully!', {
        id: pendingToast,
        style: {
          background: '#1A1B23',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }
      });

      // Show WhatsOnChain link
      toast.success(
        `View on WhatsOnChain: https://whatsonchain.com/tx/${inscriptionTx.id}`,
        {
          duration: 10000,
          style: {
            background: '#1A1B23',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }
        }
      );

      return createdPost;
    } catch (error) {
      console.error('Top-level error in createPost:', error);
      toast.error('Failed to create post', {
        id: pendingToast,
        style: {
          background: '#1A1B23',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }
      });
      throw error;
    }
  } catch (error) {
    console.error('Error in createPost:', error);
    throw error;
  }
};

export interface PostFilters {
  timeFilter?: '1d' | '7d' | '30d';
  rankingFilter?: string;
  personalFilter?: string;
  blockFilter?: string;
  selectedTags?: string[];
  userId?: string;
}

export const fetchPosts = async (filters: PostFilters = {}): Promise<Post[]> => {
  try {
    const queryParams = new URLSearchParams();
    
    if (filters.timeFilter) {
      queryParams.append('timeFilter', filters.timeFilter);
    }
    if (filters.rankingFilter) {
      queryParams.append('rankingFilter', filters.rankingFilter);
    }
    if (filters.personalFilter) {
      queryParams.append('personalFilter', filters.personalFilter);
    }
    if (filters.blockFilter) {
      queryParams.append('blockFilter', filters.blockFilter);
    }
    if (filters.selectedTags && filters.selectedTags.length > 0) {
      queryParams.append('selectedTags', JSON.stringify(filters.selectedTags));
    }
    if (filters.userId) {
      queryParams.append('userId', filters.userId);
    }

    const response = await fetch(`${API_BASE_URL}/api/posts?${queryParams.toString()}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const posts = await response.json();
    
    // Transform the response to match the Post interface
    return posts.map((post: any) => ({
      content: post.content,
      author_address: post.author_address,
      postId: post.postId,
      media_url: post.media_type ? `/api/posts/${post.id}/media` : null,
      media_type: post.media_type,
      description: post.description,
      tags: post.tags,
      prediction_market_data: post.metadata?.prediction_market_data,
      isLocked: post.is_locked,
      lockDuration: post.lock_duration,
      lockAmount: post.amount,
      unlockHeight: post.unlock_height,
      txid: post.txid,
      created_at: post.created_at
    }));
  } catch (error) {
    console.error('Error fetching posts:', error);
    toast.error('Failed to fetch posts. Please try again later.');
    return [];
  }
}; 