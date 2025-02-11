import * as React from 'react';
import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';
import { YoursWalletAdapter } from '../utils/YoursWalletAdapter';

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

interface MapData {
  app: string;
  type: string;
  content: string;
  timestamp: string;
  contentType: string;
  version: string;
  tags: string[];
  prediction?: string;
  lockDuration?: string;
  lockAmount?: string;
  unlockHeight?: string;
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

export const createPost = async (
  content: string, 
  authorAddress: string, 
  wallet: YoursWallet,
  imageFile?: File,
  description?: string,
  tags?: string[],
  predictionMarketData?: PredictionMarketData,
  lockData?: { isLocked: boolean; duration?: number; amount?: number }
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

    // Validate lock data if present
    if (lockData?.isLocked) {
      if (!lockData.duration || lockData.duration < 1) {
        throw new Error('Lock duration must be at least 1 block');
      }
      if (lockData.duration > 52560) { // ~1 year worth of blocks
        throw new Error('Lock duration cannot exceed 52560 blocks (approximately 1 year)');
      }
      if (!lockData.amount || lockData.amount < 1000) {
        throw new Error('Lock amount must be at least 1000 satoshis');
      }
    }

    // Get current block height if locking
    let currentBlockHeight: number | undefined;
    if (lockData?.isLocked) {
      currentBlockHeight = await getCurrentBlockHeight();
    }

    // Get current balance to ensure we have enough funds
    const balance = await wallet.getBalance();
    console.log('Current wallet balance:', balance);

    const requiredBalance = (lockData?.isLocked ? (lockData.amount || 0) : 0) + 10; // 10 sats for transaction fee
    if (!balance?.satoshis || balance.satoshis < requiredBalance) {
      throw new Error(`Insufficient balance. Required: ${requiredBalance} satoshis`);
    }

    let inscriptionTx: TransactionResponse;
    let media_url: string | undefined;
    let media_type: string | undefined;

    // Handle different post types
    if (imageFile) {
      console.log("Starting image inscription process:", {
        fileName: imageFile.name,
        fileType: imageFile.type,
        fileSize: imageFile.size,
        contentDescription: content || 'No description'
      });
      
      console.log("Converting image to base64...");
      const b64 = await fileToBase64(imageFile);
      console.log("Base64 conversion metrics:", {
        originalFileSize: imageFile.size,
        base64Length: b64.length,
        base64ByteSize: Math.ceil(b64.length * 3/4),
        estimatedHexSize: Math.ceil(b64.length * 3/4) * 2
      });
      
      console.log("Creating image inscription transaction...");
      try {
        // Initialize ordinal inscription
        console.log("Initializing ordinal inscription...");
        const provider = new OrdiProvider();
        const signer = new YoursWalletAdapter(wallet, provider);
        
        // Request authentication
        console.log("Requesting authentication...");
        const { isAuthenticated, error } = await signer.requestAuth();
        if (!isAuthenticated) {
            throw new Error(`Authentication failed: ${error}`);
        }

        // Create metadata object
        const metadata: MetadataObject = {
          app: 'lockd.app',
          type: 'image',
          description: description || content || 'Image inscription',
          tags: ['lockdapp', ...(tags || [])],
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        };

        // Add lock data only if present
        if (lockData?.isLocked && currentBlockHeight && lockData.duration) {
          metadata.lock_data = {
            isLocked: true,
            duration: lockData.duration,
            amount: lockData.amount || 1000,
            unlockHeight: currentBlockHeight + lockData.duration
          };
        }

        // Create the inscription content following 1Sat Ordinals format
        const inscriptionContent = `data:${imageFile.type};base64,${b64}`;

        // Create inscription transaction using MAP protocol format
        const response = await wallet.inscribe([{
          address: authorAddress,
          base64Data: btoa(inscriptionContent),
          mimeType: imageFile.type,
          satoshis: lockData?.isLocked ? (lockData.amount || 1000) : 1000,
          map: {
            app: 'lockd.app',
            type: 'image',
            content: description || content || '',
            contentType: imageFile.type,
            tags: JSON.stringify(['lockdapp', ...(tags || [])]),
            timestamp: new Date().toISOString().toLowerCase(),
            version: '1.0.0',
            ...(lockData?.isLocked && currentBlockHeight && lockData.duration) && {
              lockDuration: lockData.duration.toString(),
              lockAmount: (lockData.amount || 1000).toString(),
              unlockHeight: (currentBlockHeight + lockData.duration).toString()
            }
          }
        }]);

        // Convert response to expected format
        inscriptionTx = {
          id: (response as any).txid || (response as any).id,
          tx: (response as any).tx
        };
        
        // Analyze raw transaction
        if (inscriptionTx?.tx) {
          const txHex = inscriptionTx.tx.toString('hex');
          
          console.log("Raw transaction analysis:", {
            success: !!inscriptionTx?.id,
            txid: inscriptionTx?.id,
            size: {
              total: txHex.length,
              hex: txHex.length / 2,
              estimated: inscriptionContent.length
            }
          });
        }

        if (!inscriptionTx?.id) {
          console.error('Transaction response invalid:', inscriptionTx);
          throw new Error('Failed to create image inscription - no transaction ID returned');
        }

        // Use testnet URLs
        media_url = `https://testnet.ordinals.sv/content/${inscriptionTx.id}`;
        media_type = imageFile.type;
        console.log("Image inscription complete:", JSON.stringify({
          txid: inscriptionTx.id,
          media_url,
          media_type,
          metadata
        }, null, 2));

      } catch (txError) {
        console.error("Image inscription error:", {
          error: txError,
          message: txError instanceof Error ? txError.message : 'Unknown error',
          stack: txError instanceof Error ? txError.stack : undefined
        });
        throw txError;
      }
    } else {
      console.log("Creating text post:", content);
      try {
        // Create MAP data with tags, prediction market data, and lock data
        const mapData: MapData = {
          app: 'lockd.app',
          type: predictionMarketData ? 'prediction' : 'text',
          content: content,
          timestamp: new Date().toISOString().toLowerCase(),
          contentType: 'text/plain',
          version: '1.0.0',
          tags: ['lockdapp', ...(tags || [])],
          ...(predictionMarketData && {
            prediction: JSON.stringify(predictionMarketData)
          }),
          ...(lockData?.isLocked && currentBlockHeight && lockData.duration && {
            lockDuration: lockData.duration.toString(),
            lockAmount: (lockData.amount || 1000).toString(),
            unlockHeight: (currentBlockHeight + lockData.duration).toString()
          })
        };

        // Convert to Record<string, string> for wallet API
        const stringifiedMapData: Record<string, string> = {
          ...mapData,
          tags: JSON.stringify(mapData.tags)
        };

        // Create inscription transaction using MAP protocol
        const response = await wallet.inscribe([{
          address: authorAddress,
          base64Data: btoa(content),
          mimeType: 'text/plain',
          map: stringifiedMapData,
          satoshis: lockData?.isLocked ? (lockData.amount || 1000) : 1000
        }]);

        // Convert response to expected format
        inscriptionTx = {
          id: (response as any).txid || (response as any).id,
          tx: (response as any).tx
        };
        
        // Log and validate text inscription
        if (inscriptionTx?.tx) {
          console.log("MAP transaction response:", JSON.stringify({
            txid: inscriptionTx?.id,
            map: mapData
          }, null, 2));
        }
      } catch (txError) {
        console.error("Text inscription error:", JSON.stringify({
          error: txError,
          message: txError instanceof Error ? txError.message : 'Unknown error',
          stack: txError instanceof Error ? txError.stack : undefined
        }, null, 2));
        throw txError;
      }
    }
    
    console.log('Final inscription transaction state:', JSON.stringify({
      txid: inscriptionTx?.id,
      hasRawTx: !!inscriptionTx?.tx,
      rawTxLength: inscriptionTx?.tx?.toString('hex').length,
      responseType: typeof inscriptionTx,
      fullResponse: inscriptionTx
    }, null, 2));

    if (!inscriptionTx?.id) {
      console.error('No txid in response:', inscriptionTx);
      throw new Error('Failed to broadcast inscription - no transaction ID returned');
    }

    console.log('Inscription successful with txid:', inscriptionTx.id);

    // Create the post object
    const post: Post = {
      txid: inscriptionTx.id,
      content: content,
      author_address: authorAddress,
      created_at: new Date().toISOString(),
      media_type,
      media_url,
      tags: tags || [],
      prediction_market_data: predictionMarketData,
      isLocked: lockData?.isLocked || false,
      lockDuration: lockData?.duration,
      lockAmount: lockData?.amount,
      unlockHeight: lockData?.isLocked && currentBlockHeight && lockData.duration 
        ? currentBlockHeight + lockData.duration 
        : undefined
    };
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