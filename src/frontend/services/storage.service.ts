import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase';
import { WalletError } from '../../shared/utils/errors';
import { supabase } from '../utils/supabaseClient';
import { MemeSubmission as MemeVideoMetadata } from '../types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://armwtaxnwajmunysmbjr.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg5MjI1MDQsImV4cCI6MjA1NDQ5ODUwNH0.RN5aElUBDafoPqdHI6xTL4EycZ72wxuOyFzWHJ0Un2g';

export class StorageService {
  private static instance: StorageService;
  private supabase = createClient<Database>(supabaseUrl, supabaseKey);
  private currentBlockHeight: number = 830000; // Default block height

  constructor() {
    this.fetchCurrentBlockHeight();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async fetchCurrentBlockHeight(): Promise<void> {
    try {
      const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
      const data = await response.json();
      this.currentBlockHeight = data.blocks;
    } catch (error) {
      console.error('Failed to fetch block height:', error);
      this.currentBlockHeight = 830000; // Fallback value
    }
  }

  private calculateVibes(amount: number, lockPeriod: number): number {
    return amount * Math.log(lockPeriod + 1);
  }

  async createBitcoiner(handle: string, pubkey: string, avatar?: string) {
    try {
      const { data, error } = await this.supabase
        .from('Bitcoiner')
        .insert([
          {
            handle,
            pubkey,
            avatar: avatar || null,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;
      return data;
    } catch (err) {
      throw new WalletError('Failed to create bitcoiner');
    }
  }

  async getBitcoiner(handle: string) {
    try {
      const { data, error } = await this.supabase
        .from('Bitcoiner')
        .select('*')
        .eq('handle', handle)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw new WalletError('Failed to get bitcoiner');
    }
  }

  async createPost(txid: string, handle: string, content: string, amount: number, mediaUrl?: string) {
    try {
      // Fetch current block height
      const blockResponse = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
      const blockData = await blockResponse.json();
      const currentBlock = blockData.blocks;

      const { data, error } = await this.supabase
        .from('Post')
        .insert([
          {
            txid,
            handle_id: handle,
            content,
            amount,
            media_url: mediaUrl || null,
            created_at: new Date().toISOString(),
            blockHeight: currentBlock
          }
        ]);

      if (error) throw error;
      return data;
    } catch (err) {
      throw new WalletError('Failed to create post');
    }
  }

  async getPosts() {
    try {
      const { data, error } = await this.supabase
        .from('Post')
        .select(`
          *,
          creator:Bitcoiner(*),
          locklikes:LockLike(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (err) {
      throw new WalletError('Failed to get posts');
    }
  }

  async createLockLike(txid: string, handle: string, postId: string, amount: number, lockedUntil: number) {
    try {
      const { data, error } = await this.supabase
        .from('LockLike')
        .insert([
          {
            txid,
            handle_id: handle,
            post_id: postId,
            amount,
            locked_until: lockedUntil,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) throw error;
      return data;
    } catch (err) {
      throw new WalletError('Failed to create lock like');
    }
  }

  async getLockLikes(postId: string) {
    try {
      const { data, error } = await this.supabase
        .from('LockLike')
        .select('*')
        .eq('post_id', postId);

      if (error) throw error;
      return data;
    } catch (err) {
      throw new WalletError('Failed to get lock likes');
    }
  }

  async getMemeVideos(page: number, limit: number): Promise<MemeVideoMetadata[]> {
    try {
      const { data: posts, error } = await supabase
        .from('Post')
        .select(`
          *,
          creator:Bitcoiner(*),
          locklikes:LockLike(*)
        `)
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (error) throw error;
      if (!posts) return [];

      return posts.map(post => {
        const totalLockLiked = post.locklikes?.reduce((sum: number, locklike: any) => sum + locklike.amount, 0) || 0;
        const totalAmountandLockLiked = post.amount + totalLockLiked;

        const lockPeriod = post.locked_until - this.currentBlockHeight;
        const initialVibes = this.calculateVibes(post.amount, Math.max(1, lockPeriod));
        const totalLockLikeVibes = post.locklikes?.reduce((sum: number, locklike: any) => {
          const locklikePeriod = locklike.locked_until - this.currentBlockHeight;
          return sum + this.calculateVibes(locklike.amount, Math.max(1, locklikePeriod));
        }, 0) || 0;

        return {
          id: post.id,
          creator: post.creator.handle,
          title: post.title || `Post by ${post.creator.handle}`,
          description: post.content,
          prompt: post.prompt || '',
          style: post.style || 'viral',
          duration: post.duration || 30,
          format: post.format || 'video/mp4',
          fileUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content)}`,
          thumbnailUrl: post.thumbnail_url || post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content)}`,
          txId: post.txid,
          locks: totalAmountandLockLiked,
          status: 'minted',
          tags: post.tags || ['meme', 'viral'],
          createdAt: new Date(post.created_at),
          updatedAt: new Date(post.updated_at || post.created_at),
          totalLocked: totalAmountandLockLiked,
          threshold: 1000000000, // 10 BSV threshold
          isTop10Percent: totalAmountandLockLiked > 1000000000,
          isTop3: totalAmountandLockLiked > 2000000000,
          locklikes: post.locklikes,
          vibes: initialVibes + totalLockLikeVibes
        };
      });
    } catch (error) {
      console.error('Failed to fetch meme videos:', error);
      return [];
    }
  }

  async uploadMedia(mediaData: string): Promise<string> {
    try {
      // Convert base64 to blob
      const base64Data = mediaData.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteArrays: Uint8Array[] = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
        const slice = byteCharacters.slice(offset, offset + 1024);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      const blob = new Blob(byteArrays, { type: 'image/jpeg' });
      const file = new File([blob], `upload_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('media')
        .upload(`public/${file.name}`, file);

      if (error) throw error;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(`public/${file.name}`);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading media:', error);
      // Return placeholder on error
      return `https://placehold.co/600x400/1A1B23/00ffa3?text=Upload+Failed`;
    }
  }
}

export const storageService = new StorageService(); 