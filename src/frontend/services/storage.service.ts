import { MemeVideoMetadata } from '../../shared/types/metadata';
import { supabase } from '../utils/supabaseClient';
import type { Database } from '../../types/supabase';

interface Post {
  content: string;
  mediaUrl?: string | null;
  lockUntilBlock: number;
  amount: number;
  initialVibes: number;
  timestamp: number;
  txid: string;
}

class StorageService {
  private currentBlockHeight: number = 0;

  constructor() {
    this.fetchCurrentBlockHeight();
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
    return (amount / 100000000) * Math.log(lockPeriod);
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
          id: post.txid,
          creator: post.creator?.handle || 'anon',
          title: `Post by ${post.creator?.handle || 'anon'}`,
          description: post.content || '',
          prompt: '',
          style: 'viral',
          duration: 30,
          format: 'video/mp4',
          fileUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content || '')}`,
          thumbnailUrl: post.media_url || `https://placehold.co/600x400/1A1B23/00ffa3?text=${encodeURIComponent(post.content || '')}`,
          txId: post.txid,
          locks: totalAmountandLockLiked,
          status: 'minted' as const,
          tags: ['meme', 'viral'],
          createdAt: new Date(post.created_at),
          updatedAt: new Date(post.created_at),
          initialVibes,
          totalLockLikeVibes,
          totalVibes: initialVibes + totalLockLikeVibes,
          locklikes: post.locklikes?.map((locklike: any) => ({
            txid: locklike.txid,
            amount: locklike.amount,
            locked_until: locklike.locked_until,
            created_at: new Date(locklike.created_at)
          })) || []
        };
      });
    } catch (error) {
      console.error('Failed to fetch posts:', error);
      throw error;
    }
  }

  async createPost(post: Post): Promise<void> {
    try {
      const { error } = await supabase
        .from('Post')
        .insert({
          txid: post.txid,
          amount: Math.floor(post.amount * 100000000), // Convert BSV to satoshis
          content: post.content,
          media_url: post.mediaUrl || null,
          locked_until: post.lockUntilBlock,
          handle_id: 'anon', // For now, use anon handle
          created_at: new Date(post.timestamp).toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
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
export default storageService; 