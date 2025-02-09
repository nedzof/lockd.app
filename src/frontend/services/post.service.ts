import * as React from 'react';
import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';
import { YoursWalletAdapter } from '../utils/YoursWalletAdapter';

export interface Post {
  txid: string;
  content: string;
  author_address: string;
  created_at: string;
  media_url?: string;
  media_type?: string;
  description?: string;
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
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      console.log('FileReader loaded successfully');
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        console.log('Base64 conversion details:', {
          originalLength: reader.result.length,
          dataUrlPrefix: reader.result.substring(0, reader.result.indexOf(',')),
          base64Length: base64.length,
          base64Preview: base64.substring(0, 50) + '...'
        });
        resolve(base64);
      } else {
        console.error('FileReader result error:', {
          resultType: typeof reader.result,
          result: reader.result
        });
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => {
      console.error('FileReader error:', error);
      reject(error);
    };
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

export const createPost = async (
  content: string, 
  authorAddress: string, 
  wallet: YoursWallet,
  imageFile?: File,
  description?: string
): Promise<Post> => {
  try {
    console.log('Creating post with:', { 
      content, 
      authorAddress, 
      hasImage: !!imageFile, 
      imageType: imageFile?.type,
      imageSize: imageFile?.size,
      description 
    });
    
    // Validate input based on post type
    if (!imageFile && !content.trim()) {
      throw new Error('Please provide either text content or an image');
    }

    // Get current balance to ensure we have enough funds
    const balance = await wallet.getBalance();
    console.log('Current wallet balance:', balance);

    if (!balance?.satoshis || balance.satoshis < 10) {
      throw new Error('Insufficient balance to create post');
    }

    let inscriptionTx;
    let media_url, media_type;

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
        
        // Convert address to proper format and create instance
        const addressObj = new bsv.Address(authorAddress);
        const instance = new OrdiNFTP2PKH(Addr(addressObj.toByteString()))
        await instance.connect(signer)

        console.log("Creating inscription with parameters:", {
          contentLength: b64.length,
          contentType: imageFile.type,
          receiverAddress: authorAddress,
          satoshis: 1000000
        });

        // Create inscription transaction using scrypt-ord - directly use base64 data
        inscriptionTx = await instance.inscribeImage(b64, imageFile.type);
        
        // Analyze raw transaction
        if (inscriptionTx?.tx) {
          const txHex = inscriptionTx.tx.toString('hex');
          
          console.log("Raw transaction analysis:", {
            success: !!inscriptionTx?.id,
            txid: inscriptionTx?.id,
            size: {
              total: txHex.length,
              hex: txHex.length / 2,
              estimated: b64.length
            },
            data: {
              hasOrdMarker: txHex.includes('ord'),
              hasImageType: txHex.includes(imageFile.type),
              hasHexData: txHex.includes(base64ToHex(b64).substring(0, 50))
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
          media_type
        }, null, 2));

      } catch (txError) {
        console.error("Image inscription error:", {
          error: txError,
          message: txError instanceof Error ? txError.message : 'Unknown error',
          stack: txError instanceof Error ? txError.stack : undefined
        });
        throw txError;
      }
    } else if (content.trim()) {
      console.log("Creating text post:", content);
      try {
        console.log("Sending text inscription transaction...");
        
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
        
        // Convert address to proper format and create instance
        const addressObj = new bsv.Address(authorAddress);
        const instance = new OrdiNFTP2PKH(Addr(addressObj.toByteString()))
        await instance.connect(signer)

        console.log("Creating text inscription with parameters:", {
          contentLength: content.length,
          contentType: 'text/plain;charset=utf-8',
          receiverAddress: authorAddress
        });

        // Create inscription transaction using scrypt-ord
        inscriptionTx = await instance.inscribeText(content);
        
        // Log and validate text inscription
        if (inscriptionTx?.tx) {
          const txHex = inscriptionTx.tx.toString('hex');
          console.log("Text inscription response:", JSON.stringify({
            txid: inscriptionTx?.id,
            rawTxLength: txHex.length,
            scriptPreview: txHex.includes('6a') ? txHex.substring(txHex.indexOf('6a'), txHex.indexOf('6a') + 100) + '...' : 'No OP_RETURN found',
            containsOrdData: txHex.includes('ord'),
            containsContent: txHex.includes(content)
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

    // Create the post object based on the type of content
    const post: Post = {
      txid: inscriptionTx.id,
      content: imageFile ? (description || '') : content,
      author_address: authorAddress,
      created_at: new Date().toISOString(),
      ...(imageFile && {
        media_url,
        media_type,
        description: content.trim() ? content : undefined
      })
    };
    console.log('Created post object:', post);

    // Show success message based on post type
    let successMessage = 'Post created successfully!';
    if (imageFile && content.trim()) {
      successMessage = 'Image post with description created successfully!';
    } else if (imageFile) {
      successMessage = 'Image post created successfully!';
    }
    toast.success(successMessage);
    
    // Open WhatsOnChain in a new tab with testnet URL
    const whatsOnChainUrl = `https://test.whatsonchain.com/tx/${inscriptionTx.id}`;
    console.log('Opening WhatsOnChain URL:', whatsOnChainUrl);
    window.open(whatsOnChainUrl, '_blank');
    
    return post;
  } catch (error) {
    console.error("Error creating post:", error);
    // Log the full error details
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        cause: error.cause
      });
    }
    toast.error("Failed to create post: " + (error as Error).message);
    throw error;
  }
}; 