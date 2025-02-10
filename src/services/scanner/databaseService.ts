import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/supabase.js';
import type { BlockchainTransaction } from './types.js';

export class DatabaseService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL as string;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
  }

  async storeMediaContent(txid: string, mediaContent: Buffer, mediaType: string): Promise<string | undefined> {
    try {
      // Store media in Supabase storage
      const { data, error } = await this.supabase.storage
        .from('media')
        .upload(`${txid}`, mediaContent, {
          contentType: mediaType,
          upsert: true
        });

      if (error) {
        console.error('Error storing media content:', error);
        return undefined;
      }

      // Get public URL for the stored media
      const { data: { publicUrl } } = this.supabase.storage
        .from('media')
        .getPublicUrl(`${txid}`);

      console.log(`Successfully stored media for ${txid}, public URL: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error('Error in storeMediaContent:', error);
      return undefined;
    }
  }

  async updatePost(txid: string, updates: Partial<Database['public']['Tables']['Post']['Update']>) {
    try {
      const { error } = await this.supabase
        .from('Post')
        .update(updates)
        .eq('id', txid);

      if (error) {
        console.error('Error updating post:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error in updatePost:', error);
      return false;
    }
  }

  async processTransactions(transactions: BlockchainTransaction[]) {
    for (const tx of transactions) {
      try {
        // First ensure the Bitcoiner record exists
        const { error: bitcoinerError } = await this.supabase
          .from('Bitcoiner')
          .upsert({
            address: tx.author_address,
            handle: tx.author_address,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'address',
            ignoreDuplicates: true
          });

        if (bitcoinerError) {
          console.error('Error upserting Bitcoiner:', bitcoinerError);
          continue;
        }

        console.log(`Successfully upserted Bitcoiner for address ${tx.author_address}`);

        // Then create/update the post
        const postData = {
          id: tx.txid,
          content: tx.content || '', // Raw hex content from the transaction
          author_address: tx.author_address,
          is_locked: true,
          created_at: new Date().toISOString(),
          media_type: tx.media_type || 'image/jpeg',
          description: tx.description || `JPEG image inscription from testnet block ${tx.blockHeight || 'unknown'}`,
          media_url: null // Always set to null as we store raw content
        };

        console.log('Upserting post with data:', postData);

        const { error: postError } = await this.supabase
          .from('Post')
          .upsert(postData, {
            onConflict: 'id',
            ignoreDuplicates: false
          });

        if (postError) {
          console.error('Error upserting post:', postError);
          continue;
        }

        console.log(`Successfully upserted post for transaction ${tx.txid}`);

        // Insert lock information
        const lockData = {
          txid: tx.txid,
          amount: tx.amount || 0,
          handle_id: tx.author_address,
          locked_until: tx.locked_until || 0,
          post_id: tx.txid,
          created_at: new Date().toISOString()
        };

        console.log('Upserting lock with data:', lockData);

        const { error: lockError } = await this.supabase
          .from('LockLike')
          .upsert(lockData, {
            onConflict: 'txid',
            ignoreDuplicates: false
          });

        if (lockError) {
          console.error('Error upserting lock:', lockError);
        } else {
          console.log(`Successfully upserted lock for transaction ${tx.txid}`);
        }
      } catch (error) {
        console.error(`Error processing transaction ${tx.txid}:`, error);
      }
    }
  }

  async extractTransactionData(txid: string, height: number): Promise<BlockchainTransaction | null> {
    try {
      // Get raw transaction data
      const rawTxResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/test/tx/${txid}/raw`);
      const rawTxData = await rawTxResponse.text();

      // Get decoded transaction data for input/output details
      const txResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/test/tx/${txid}/out/0`);
      const txData = await txResponse.json();

      // Extract author address from the first output that's a pubkeyhash type
      let authorAddress = '';
      const outputsResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/test/tx/${txid}/out`);
      const outputs = await outputsResponse.json();
      for (const output of outputs) {
        if (output.type === 'pubkeyhash') {
          authorAddress = output.address;
          break;
        }
      }

      if (!authorAddress) {
        console.warn(`No valid author address found for transaction ${txid}`);
        return null;
      }

      const blockchainTx: BlockchainTransaction = {
        txid,
        content: rawTxData, // Store the raw transaction data
        author_address: authorAddress,
        media_type: 'image/jpeg',
        blockHeight: height
      };

      console.log('Created blockchain transaction:', blockchainTx);
      return blockchainTx;
    } catch (error) {
      console.error(`Error extracting transaction data for ${txid}:`, error);
      return null;
    }
  }
} 