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
  console.log('Starting file to base64 conversion for:', file.name);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      console.log('FileReader loaded successfully');
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        console.log('Base64 conversion successful, length:', base64.length);
        resolve(base64);
      } else {
        console.error('FileReader result is not a string:', typeof reader.result);
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => {
      console.error('FileReader error:', error);
      reject(error);
    };
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
      console.log("Starting image inscription process for:", imageFile.name);
      
      console.log("Converting image to base64...");
      const b64 = await fileToBase64(imageFile);
      console.log("Base64 conversion complete, starting inscription...");
      
      console.log("Creating image inscription transaction...");
      inscriptionTx = await wallet.sendBsv([{
        satoshis: 1,
        address: authorAddress,
        data: [
          'ord',
          '01',
          imageFile.type,
          '0',
          b64
        ]
      }]);
      console.log("Image inscription transaction created:", inscriptionTx);
      
      if (!inscriptionTx?.txid) {
        console.error('Transaction response:', inscriptionTx);
        throw new Error('Failed to create image inscription - no transaction ID returned');
      }

      media_url = `https://ord.sv/${inscriptionTx.txid}`;
      media_type = imageFile.type;
      console.log("Image inscription complete, media_url:", media_url);
    } else if (content.trim()) {
      console.log("Creating text post:", content);
      inscriptionTx = await wallet.sendBsv([{
        satoshis: 1,
        address: authorAddress,
        data: [
          'ord',
          '01',
          'text/plain;charset=utf-8',
          '0',
          content
        ]
      }]);
      console.log("Text inscription complete:", inscriptionTx);
    }
    
    console.log('Inscription transaction:', inscriptionTx);

    if (!inscriptionTx?.txid) {
      console.error('No txid in response:', inscriptionTx);
      throw new Error('Failed to broadcast inscription - no transaction ID returned');
    }

    console.log('Inscription successful with txid:', inscriptionTx.txid);

    // Create the post object based on the type of content
    const post: Post = {
      txid: inscriptionTx.txid,
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
    
    // Open WhatsOnChain in a new tab
    const whatsOnChainUrl = `https://whatsonchain.com/tx/${inscriptionTx.txid}`;
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