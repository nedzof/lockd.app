import * as React from 'react';
import { toast } from 'react-hot-toast';
import type { useYoursWallet } from 'yours-wallet-provider';
import { OrdiNFTP2PKH } from 'scrypt-ord';
import { bsv, Addr, PandaSigner } from 'scrypt-ts';
import { OrdiProvider } from 'scrypt-ord';

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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

export const createPost = async (
  content: string, 
  authorAddress: string, 
  wallet: YoursWallet,
  imageFile?: File,
  description?: string
): Promise<Post> => {
  try {
    console.log('Creating post with:', { content, authorAddress, hasImage: !!imageFile, description });
    
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

    // Create a PandaSigner instance with OrdiProvider
    const signer = new PandaSigner(new OrdiProvider());
    
    // Request authentication
    const { isAuthenticated, error } = await signer.requestAuth();
    if (!isAuthenticated) {
      throw new Error(error || 'Failed to authenticate with wallet');
    }

    // Convert address to proper format and create instance
    const bsvAddress = new bsv.Address(authorAddress);
    const instance = new OrdiNFTP2PKH(Addr(bsvAddress.toByteString()));
    
    // Connect the signer
    await instance.connect(signer);
    
    let inscriptionTx;
    let media_url, media_type;

    // Handle different post types
    if (imageFile) {
      // Handle image inscription
      console.log("Inscribing image:", imageFile.name);
      const b64 = await fileToBase64(imageFile);
      inscriptionTx = await instance.inscribeImage(b64, imageFile.type);
      media_url = `https://ord.sv/${inscriptionTx.id}`;
      media_type = imageFile.type;
    }

    // Handle text content if present
    if (content.trim()) {
      console.log("Inscribing text:", content);
      inscriptionTx = await instance.inscribeText(content);
    }
    
    console.log('Inscription transaction:', inscriptionTx);

    if (!inscriptionTx?.id) {
      console.error('No txid in response:', inscriptionTx);
      throw new Error('Failed to broadcast inscription - no txid returned');
    }

    console.log('Inscription successful with txid:', inscriptionTx.id);

    // Create the post object based on the type of content
    const post: Post = {
      txid: inscriptionTx.id,
      content: imageFile ? (description || '') : content, // For image-only posts, content can be empty
      author_address: authorAddress,
      created_at: new Date().toISOString(),
      ...(imageFile && {
        media_url,
        media_type,
        description: content.trim() ? content : undefined // Only include description if text content is provided
      })
    };

    // Show success message based on post type
    let successMessage = 'Post created successfully!';
    if (imageFile && content.trim()) {
      successMessage = 'Image post with description created successfully!';
    } else if (imageFile) {
      successMessage = 'Image post created successfully!';
    }
    toast.success(successMessage);
    
    // Open WhatsOnChain in a new tab
    const whatsOnChainUrl = `https://whatsonchain.com/tx/${inscriptionTx.id}`;
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
        name: error.name
      });
    }
    toast.error("Failed to create post: " + (error as Error).message);
    throw error;
  }
}; 