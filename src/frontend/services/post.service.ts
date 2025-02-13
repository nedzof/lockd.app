import * as React from 'react';
import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';
import { YoursWalletAdapter } from '../utils/YoursWalletAdapter';
import { MimeTypes, MAP } from 'yours-wallet-provider';
import { getFeeRate } from '../../shared/utils/whatsOnChain';

export interface PredictionMarketData {
  source: string;
  prediction: string;
  endDate: Date;
  probability?: number;
}

export interface PostCreationData {
  content: string;
  author_address: string;
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

// Helper function to create base MAP data
function createBaseMapData(type: string, content: string, tags?: string[]): Record<string, string> {
  return {
    app: 'lockd.app',
    type,
    content: content.toString(),
    timestamp: new Date().toISOString().toLowerCase(),
    contentType: 'text/plain',
    version: '1.0.0',
    tags: JSON.stringify([...(tags || [])])
  };
}

// Helper function to create lock data
function createLockData(duration: number, amount: number, currentBlockHeight: number): Record<string, string> {
  return {
    lockDuration: duration.toString(),
    lockAmount: amount.toString(),
    unlockHeight: (currentBlockHeight + duration).toString()
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

// Helper function to create a post object
function createPostObject(
  txid: string,
  content: string,
  authorAddress: string,
  options: {
    tags?: string[],
    media_type?: string,
    media_url?: string,
    prediction_market_data?: PredictionMarketData,
    isLocked?: boolean,
    lockDuration?: number,
    lockAmount?: number,
    unlockHeight?: number
  } = {}
): Post {
  return {
    txid,
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
  const mapData = createBaseMapData('vote_option', optionData.optionText);
  Object.assign(mapData, createLockData(optionData.lockDuration, optionData.lockAmount, 0));
  mapData.voteOptions = JSON.stringify({
    questionTxid: optionData.questionTxid,
    optionText: optionData.optionText,
    isVoteOption: 'true'
  });

  const request = createInscriptionRequest(
    authorAddress,
    optionData.optionText,
    mapData as MAP,
    optionData.lockAmount
  );

  const response = await wallet.inscribe([request]);
  const inscriptionTx = handleTransactionResponse(response);

  return createPostObject(inscriptionTx.id, optionData.optionText, authorAddress, {
    tags: ['vote_option'],
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
  lockData?: { isLocked: boolean; duration?: number; amount?: number; isPoll?: boolean; options?: Array<{ text: string; lockDuration: number; lockAmount: number }> }
): Promise<Post> => {
  try {
    console.log('Creating post with:', { 
      content, 
      authorAddress, 
      hasImage: !!imageFile, 
      imageType: imageFile?.type,
      imageSize: imageFile?.size,
      description,
      tags,
      predictionMarketData,
      lockData
    });
    
    // Validate input based on post type
    if (!imageFile && !content.trim()) {
      throw new Error('Please provide either text content or an image');
    }

    // For vote posts, validate options
    if (lockData?.isPoll) {
      if (!lockData.options || lockData.options.length < 2) {
        throw new Error('Please provide at least 2 vote options');
      }
      if (lockData.options.some(opt => !opt.text.trim())) {
        throw new Error('Please fill in all vote options');
      }
      if (lockData.options.some(opt => !opt.lockAmount || !opt.lockDuration)) {
        throw new Error('Please provide both lock duration and amount for all options');
      }
    }

    // Get current block height if locking
    let currentBlockHeight: number | undefined;
    if (lockData?.isLocked || (lockData?.isPoll && lockData.options?.some(opt => opt.lockAmount > 0))) {
      currentBlockHeight = await getCurrentBlockHeight();
    }

    // Get current balance to ensure we have enough funds
    const balance = await wallet.getBalance();
    console.log('Current wallet balance:', balance);

    // Calculate base satoshis per output based on content size
    const contentSize = new TextEncoder().encode(content).length;
    const baseSatoshis = await calculateOutputSatoshis(contentSize);

    // Calculate total required balance for all outputs
    const outputCount = 1 + // Content output
      (imageFile ? 1 : 0) + // Image output
      (lockData?.isPoll ? 1 : 0) + // Vote question output
      (lockData?.options?.length || 0) + // Vote options outputs
      (tags && tags.length > 0 ? 1 : 0); // Tags output

    const requiredBalance = (outputCount * baseSatoshis) +
      (lockData?.isPoll 
        ? (lockData.options?.reduce((sum, opt) => sum + opt.lockAmount, 0) || 0)
        : (lockData?.isLocked ? (lockData.amount || 0) : 0));

    if (!balance?.satoshis || balance.satoshis < requiredBalance) {
      throw new Error(`Insufficient balance. Required: ${requiredBalance} satoshis`);
    }

    let inscriptionRequests: InscribeRequest[] = [];
    let media_url: string | undefined;
    let media_type: string | undefined;
    const timestamp = new Date().toISOString().toLowerCase();
    const postId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Create content output
    const contentMap = createBaseMapData('content', content, []);
    contentMap.MAP_CONTENT_TYPE = 'text/plain';
    contentMap.MAP_DESCRIPTION = description || '';
    contentMap.MAP_POST_ID = postId;
    contentMap.MAP_SEQUENCE = '0';
    contentMap.MAP_TOTAL_OUTPUTS = '1'; // Will be updated as we add more outputs
    contentMap.MAP_TIMESTAMP = timestamp;
    contentMap.MAP_VERSION = '1.0.0';
    contentMap.MAP_TYPE = 'content';
    contentMap.MAP_AUTHOR = authorAddress;
    
    inscriptionRequests.push(createInscriptionRequest(
      authorAddress,
      content,
      contentMap as MAP,
      baseSatoshis
    ));

    // Create image output if present
    if (imageFile) {
      console.log("Converting image to base64...");
      const b64 = await fileToBase64(imageFile);
      
      const imageMap = createBaseMapData('image', '', []);
      imageMap.MAP_CONTENT_TYPE = imageFile.type;
      imageMap.MAP_IS_IMAGE = 'true';
      imageMap.MAP_POST_ID = postId;
      imageMap.MAP_SEQUENCE = '1';
      imageMap.MAP_PARENT_SEQUENCE = '0';
      imageMap.MAP_TIMESTAMP = timestamp;
      imageMap.MAP_VERSION = '1.0.0';
      imageMap.MAP_FILE_SIZE = imageFile.size.toString();
      imageMap.MAP_FILE_NAME = imageFile.name;
      imageMap.MAP_TYPE = 'image';
      imageMap.MAP_AUTHOR = authorAddress;
      
      inscriptionRequests.push(createInscriptionRequest(
        authorAddress,
        createImageContent(imageFile, b64, ''),
        imageMap as MAP,
        baseSatoshis,
        imageFile.type
      ));

      media_type = imageFile.type;
    }

    // Create vote question and options outputs if it's a poll
    if (lockData?.isPoll && lockData.options) {
      // First, create the vote question output
      const questionMap = createBaseMapData('vote_question', content, []);
      questionMap.MAP_CONTENT_TYPE = 'text/plain';
      questionMap.MAP_POST_ID = postId;
      questionMap.MAP_SEQUENCE = imageFile ? '2' : '1';
      questionMap.MAP_PARENT_SEQUENCE = '0';
      questionMap.MAP_IS_VOTE = 'true';
      questionMap.MAP_IS_VOTE_QUESTION = 'true';
      questionMap.MAP_VOTE_OPTIONS_COUNT = lockData.options.length.toString();
      questionMap.MAP_SEVERITY = 'info';
      questionMap.MAP_TIMESTAMP = timestamp;
      questionMap.MAP_VERSION = '1.0.0';
      questionMap.MAP_TYPE = 'vote_question';
      questionMap.MAP_AUTHOR = authorAddress;
      questionMap.MAP_VOTE_OPTIONS_TOTAL_LOCK = lockData.options
        .reduce((sum, opt) => sum + opt.lockAmount, 0)
        .toString();

      inscriptionRequests.push(createInscriptionRequest(
        authorAddress,
        content,
        questionMap as MAP,
        baseSatoshis
      ));

      // Then create individual outputs for each option
      lockData.options.forEach((opt, index) => {
        const baseSequence = ((imageFile ? 3 : 2) + (index * 2)); // Adjust base sequence based on image presence

        // Create option text output
        const optionTextMap = createBaseMapData('vote_option_text', opt.text, []);
        optionTextMap.MAP_CONTENT_TYPE = 'text/plain';
        optionTextMap.MAP_POST_ID = postId;
        optionTextMap.MAP_SEQUENCE = baseSequence.toString();
        optionTextMap.MAP_PARENT_SEQUENCE = imageFile ? '2' : '1'; // Parent is vote question
        optionTextMap.MAP_IS_VOTE = 'true';
        optionTextMap.MAP_VOTE_OPTION_INDEX = index.toString();
        optionTextMap.MAP_QUESTION_CONTENT = content;
        optionTextMap.MAP_TIMESTAMP = timestamp;
        optionTextMap.MAP_VERSION = '1.0.0';
        optionTextMap.MAP_TYPE = 'vote_option_text';
        optionTextMap.MAP_AUTHOR = authorAddress;

        inscriptionRequests.push(createInscriptionRequest(
          authorAddress,
          opt.text,
          optionTextMap as MAP,
          baseSatoshis
        ));

        // Create option lock data output
        const optionLockMap = createBaseMapData('vote_option_lock', '', []);
        optionLockMap.MAP_CONTENT_TYPE = 'application/json';
        optionLockMap.MAP_POST_ID = postId;
        optionLockMap.MAP_SEQUENCE = (baseSequence + 1).toString();
        optionLockMap.MAP_PARENT_SEQUENCE = baseSequence.toString(); // Parent is option text
        optionLockMap.MAP_IS_VOTE = 'true';
        optionLockMap.MAP_VOTE_OPTION_INDEX = index.toString();
        optionLockMap.MAP_TIMESTAMP = timestamp;
        optionLockMap.MAP_VERSION = '1.0.0';
        optionLockMap.MAP_TYPE = 'vote_option_lock';
        optionLockMap.MAP_AUTHOR = authorAddress;
        Object.assign(optionLockMap, {
          MAP_LOCK_DURATION: opt.lockDuration.toString(),
          MAP_LOCK_AMOUNT: opt.lockAmount.toString(),
          MAP_UNLOCK_HEIGHT: ((currentBlockHeight || 0) + opt.lockDuration).toString(),
          MAP_CURRENT_HEIGHT: (currentBlockHeight || 0).toString(),
          MAP_LOCK_PERCENTAGE: ((opt.lockAmount / requiredBalance) * 100).toFixed(2)
        });

        inscriptionRequests.push(createInscriptionRequest(
          authorAddress,
          JSON.stringify({
            lockDuration: opt.lockDuration,
            lockAmount: opt.lockAmount,
            optionIndex: index,
            postId: postId,
            currentHeight: currentBlockHeight || 0,
            unlockHeight: (currentBlockHeight || 0) + opt.lockDuration,
            lockPercentage: ((opt.lockAmount / requiredBalance) * 100).toFixed(2)
          }),
          optionLockMap as MAP,
          opt.lockAmount
        ));
      });
    }

    // Create tags output if present
    if (tags && tags.length > 0) {
      const tagsMap = createBaseMapData('tags', '', tags);
      tagsMap.MAP_CONTENT_TYPE = 'application/json';
      tagsMap.MAP_POST_ID = postId;
      tagsMap.MAP_SEQUENCE = inscriptionRequests.length.toString();
      tagsMap.MAP_PARENT_SEQUENCE = '0';
      tagsMap.MAP_TIMESTAMP = timestamp;
      tagsMap.MAP_VERSION = '1.0.0';
      tagsMap.MAP_TAGS_COUNT = tags.length.toString();
      tagsMap.MAP_TYPE = 'tags';
      tagsMap.MAP_AUTHOR = authorAddress;
      
      inscriptionRequests.push(createInscriptionRequest(
        authorAddress,
        JSON.stringify(tags),
        tagsMap as MAP,
        baseSatoshis
      ));
    }

    // Update total outputs count in content map
    contentMap.MAP_TOTAL_OUTPUTS = inscriptionRequests.length.toString();

    // Add lock data to content output if present
    if (lockData?.isLocked && currentBlockHeight && lockData.duration) {
      Object.assign(contentMap, {
        MAP_LOCK_DURATION: lockData.duration.toString(),
        MAP_LOCK_AMOUNT: (lockData.amount || baseSatoshis).toString(),
        MAP_UNLOCK_HEIGHT: (currentBlockHeight + lockData.duration).toString()
      });
    }

    // Add prediction market data if present
    if (predictionMarketData) {
      contentMap.MAP_PREDICTION_DATA = JSON.stringify({
        source: predictionMarketData.source,
        prediction: predictionMarketData.prediction,
        endDate: predictionMarketData.endDate.toISOString(),
        probability: predictionMarketData.probability?.toString()
      });
    }

    console.log('Creating inscription with requests:', {
      count: inscriptionRequests.length,
      types: inscriptionRequests.map(req => req.map.type)
    });

    const response = await wallet.inscribe(inscriptionRequests);
    const inscriptionTx = handleTransactionResponse(response);

    if (!inscriptionTx?.id) {
      console.error('No txid in response:', inscriptionTx);
      throw new Error('Failed to broadcast inscription - no transaction ID returned');
    }

    // If it was an image inscription, set the media URL
    if (imageFile) {
      media_url = `https://testnet.ordinals.sv/content/${inscriptionTx.id}`;
    }

    console.log('Inscription successful with txid:', inscriptionTx.id);

    // Create the post object
    const post = createPostObject(inscriptionTx.id, content, authorAddress, {
      media_type,
      media_url,
      tags,
      prediction_market_data: predictionMarketData,
      isLocked: lockData?.isLocked || false,
      lockDuration: lockData?.duration,
      lockAmount: lockData?.amount,
      unlockHeight: lockData?.isLocked && currentBlockHeight && lockData.duration 
        ? currentBlockHeight + lockData.duration 
        : undefined
    });
    console.log('Created post object:', post);

    toast.success('Post created successfully!');
    
    // Open WhatsOnChain in a new tab with mainnet URL
    const whatsOnChainUrl = `https://whatsonchain.com/tx/${inscriptionTx.id}`;
    console.log('Opening WhatsOnChain URL:', whatsOnChainUrl);
    window.open(whatsOnChainUrl, '_blank');
    
    return post;
  } catch (error) {
    console.error('Error creating post:', error);
    toast.error('Failed to create post: ' + (error instanceof Error ? error.message : 'Unknown error'));
    throw error;
  }
}; 