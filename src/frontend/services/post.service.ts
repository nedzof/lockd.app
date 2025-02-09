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
}

type YoursWallet = NonNullable<ReturnType<typeof useYoursWallet>>;

export const createPost = async (content: string, authorAddress: string, wallet: YoursWallet): Promise<Post> => {
  try {
    console.log('Creating post with:', { content, authorAddress });
    
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

    // Convert address to proper format
    const bsvAddress = new bsv.Address(authorAddress);
    const byteString = bsvAddress.toByteString();
    
    // Create an instance of OrdiNFTP2PKH for text inscription
    const instance = new OrdiNFTP2PKH(Addr(byteString));
    
    // Connect the signer
    await instance.connect(signer);
    
    // Inscribe the text content
    console.log("Inscribing text:", content);
    const inscriptionTx = await instance.inscribeText(content);
    
    console.log('Inscription transaction:', inscriptionTx);

    if (!inscriptionTx?.id) {
      console.error('No txid in response:', inscriptionTx);
      throw new Error('Failed to broadcast inscription - no txid returned');
    }

    console.log('Inscription successful with txid:', inscriptionTx.id);

    const post: Post = {
      txid: inscriptionTx.id,
      content,
      author_address: authorAddress,
      created_at: new Date().toISOString()
    };

    // Show success message
    toast.success("Post created and inscribed successfully!");
    
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