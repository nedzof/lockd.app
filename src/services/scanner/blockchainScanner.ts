import { createClient } from '@supabase/supabase-js';
import { bsv } from 'scrypt-ts';
import type { Database } from '../../types/supabase';

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL as string;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

interface BlockchainTransaction {
  txid: string;
  content: string;
  author_address: string;
  amount: number;
  locked_until: number;
  media_url?: string;
  media_type?: string;
  description?: string;
}

export class BlockchainScanner {
  private lastScannedHeight: number;
  private isScanning: boolean;
  private scanInterval: number; // in milliseconds
  private readonly LOCKUP_CONTRACT_PREFIX = '0063036f7264'; // ord protocol prefix

  constructor(startHeight: number = 0, scanInterval: number = 10000) {
    this.lastScannedHeight = startHeight;
    this.isScanning = false;
    this.scanInterval = scanInterval;
  }

  public async startScanning() {
    if (this.isScanning) {
      console.log('Scanner is already running');
      return;
    }

    this.isScanning = true;
    console.log('Starting blockchain scanner...');
    
    while (this.isScanning) {
      try {
        await this.scanNewBlocks();
        await new Promise(resolve => setTimeout(resolve, this.scanInterval));
      } catch (error) {
        console.error('Error during blockchain scan:', error);
        // Continue scanning even if there's an error
      }
    }
  }

  public stopScanning() {
    this.isScanning = false;
    console.log('Stopping blockchain scanner...');
  }

  private async scanNewBlocks() {
    try {
      const currentHeight = await this.getCurrentBlockHeight();
      
      if (currentHeight <= this.lastScannedHeight) {
        return; // No new blocks to scan
      }

      console.log(`Scanning blocks from ${this.lastScannedHeight + 1} to ${currentHeight}`);

      // Scan each block for relevant transactions
      for (let height = this.lastScannedHeight + 1; height <= currentHeight; height++) {
        const transactions = await this.getBlockTransactions(height);
        await this.processTransactions(transactions);
      }

      this.lastScannedHeight = currentHeight;
    } catch (error) {
      console.error('Error scanning blocks:', error);
      throw error;
    }
  }

  private async getCurrentBlockHeight(): Promise<number> {
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/test/chain/info');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.blocks;
  }

  private async getBlockTransactions(height: number): Promise<BlockchainTransaction[]> {
    const transactions: BlockchainTransaction[] = [];
    
    try {
      // Get block hash
      const hashResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/test/block/height/${height}`);
      if (!hashResponse.ok) {
        throw new Error(`HTTP error! status: ${hashResponse.status}`);
      }
      const blockHash = await hashResponse.text();
      
      // Get block details
      const blockResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/test/block/hash/${blockHash}`);
      if (!blockResponse.ok) {
        throw new Error(`HTTP error! status: ${blockResponse.status}`);
      }
      const block = await blockResponse.json();
      
      // Process each transaction in the block
      for (const txid of block.tx) {
        const tx = await this.getTransaction(txid);
        if (tx) {
          transactions.push(tx);
        }
      }
    } catch (error) {
      console.error(`Error getting transactions for block ${height}:`, error);
    }

    return transactions;
  }

  private async getTransaction(txid: string): Promise<BlockchainTransaction | null> {
    try {
      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/test/tx/hash/${txid}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const tx = await response.json();
      
      if (this.isRelevantTransaction(tx)) {
        return {
          txid: tx.txid,
          content: this.extractContent(tx),
          author_address: this.extractAuthorAddress(tx),
          amount: this.extractAmount(tx),
          locked_until: this.extractLockTime(tx),
          media_url: this.extractMediaUrl(tx),
          media_type: this.extractMediaType(tx),
          description: this.extractDescription(tx)
        };
      }
    } catch (error) {
      console.error(`Error getting transaction ${txid}:`, error);
    }
    
    return null;
  }

  private isRelevantTransaction(tx: any): boolean {
    try {
      return tx.vout.some((output: any) => {
        const script = output.scriptPubKey.hex;
        // Check for ordinal inscription
        return script.includes('6f7264') && // 'ord' in hex
               script.includes('0063036f7264'); // OP_0 OP_IF ord
      });
    } catch (error) {
      console.error('Error checking transaction relevance:', error);
      return false;
    }
  }

  private extractContent(tx: any): string {
    try {
      // Look for OP_RETURN output with content
      const opReturnOutput = tx.vout.find((output: any) => 
        output.scriptPubKey.type === 'nulldata' || 
        output.scriptPubKey.hex.startsWith('6a')
      );

      if (opReturnOutput) {
        const hex = opReturnOutput.scriptPubKey.hex.slice(4); // Remove OP_RETURN prefix
        return Buffer.from(hex, 'hex').toString('utf8');
      }
    } catch (error) {
      console.error('Error extracting content:', error);
    }
    return '';
  }

  private extractAuthorAddress(tx: any): string {
    try {
      // Get the first input's address as the author
      if (tx.vin && tx.vin[0] && tx.vin[0].addr) {
        return tx.vin[0].addr;
      }
    } catch (error) {
      console.error('Error extracting author address:', error);
    }
    return '';
  }

  private extractAmount(tx: any): number {
    try {
      // Find the Lockup contract output
      const lockupOutput = tx.vout.find((output: any) => 
        output.scriptPubKey.hex.startsWith(this.LOCKUP_CONTRACT_PREFIX)
      );
      
      if (lockupOutput) {
        return Math.floor(lockupOutput.value * 100000000); // Convert BSV to satoshis
      }
    } catch (error) {
      console.error('Error extracting amount:', error);
    }
    return 0;
  }

  private extractLockTime(tx: any): number {
    try {
      // Extract lock time from the transaction's nLockTime
      return tx.locktime || 0;
    } catch (error) {
      console.error('Error extracting lock time:', error);
    }
    return 0;
  }

  private extractMediaUrl(tx: any): string | undefined {
    try {
      // Check for ordinal inscription
      const inscriptionOutput = tx.vout.find((output: any) => {
        const script = output.scriptPubKey.hex;
        return script.includes('6f7264') && // 'ord' in hex
               script.includes('0063036f7264'); // OP_0 OP_IF ord
      });

      if (inscriptionOutput) {
        return `https://testnet.ordinals.sv/content/${tx.txid}`;
      }
    } catch (error) {
      console.error('Error extracting media URL:', error);
    }
    return undefined;
  }

  private extractMediaType(tx: any): string | undefined {
    try {
      // Check for ordinal inscription
      const inscriptionOutput = tx.vout.find((output: any) => {
        const script = output.scriptPubKey.hex;
        return script.includes('6f7264') && // 'ord' in hex
               script.includes('0063036f7264'); // OP_0 OP_IF ord
      });

      if (inscriptionOutput) {
        const script = inscriptionOutput.scriptPubKey.hex;
        // Extract MIME type from inscription
        const mimeTypeMatch = script.match(/(?<=00)(?:[0-9a-f]{2})+(?=00)/);
        if (mimeTypeMatch) {
          const mimeType = Buffer.from(mimeTypeMatch[0], 'hex').toString('utf8');
          if (mimeType.startsWith('image/')) {
            return mimeType;
          }
        }
      }
    } catch (error) {
      console.error('Error extracting media type:', error);
    }
    return undefined;
  }

  private extractDescription(tx: any): string | undefined {
    try {
      // Look for description in OP_RETURN data
      const opReturnOutput = tx.vout.find((output: any) => 
        output.scriptPubKey.type === 'nulldata' &&
        output.scriptPubKey.hex.includes('description=')
      );

      if (opReturnOutput) {
        const hex = opReturnOutput.scriptPubKey.hex;
        const data = Buffer.from(hex, 'hex').toString('utf8');
        const match = data.match(/description=(.*?)(?:\||$)/);
        return match ? match[1] : undefined;
      }
    } catch (error) {
      console.error('Error extracting description:', error);
    }
    return undefined;
  }

  private async processTransactions(transactions: BlockchainTransaction[]) {
    for (const tx of transactions) {
      try {
        // First, check if the transaction is already in the database
        const { data: existingPost } = await supabase
          .from('Post')
          .select('id')
          .eq('id', tx.txid)
          .single();

        if (!existingPost) {
          // Insert new post
          const { error: postError } = await supabase
            .from('Post')
            .insert({
              id: tx.txid,
              content: tx.content,
              author_address: tx.author_address,
              is_locked: true,
              created_at: new Date().toISOString(),
              media_url: tx.media_url,
              media_type: tx.media_type,
              description: tx.description
            });

          if (postError) {
            console.error('Error inserting post:', postError);
            continue;
          }

          // Insert lock information
          const { error: lockError } = await supabase
            .from('LockLike')
            .insert({
              txid: tx.txid,
              amount: tx.amount,
              handle_id: tx.author_address,
              locked_until: tx.locked_until,
              post_id: tx.txid,
              created_at: new Date().toISOString()
            });

          if (lockError) {
            console.error('Error inserting lock:', lockError);
          }
        }
      } catch (error) {
        console.error(`Error processing transaction ${tx.txid}:`, error);
      }
    }
  }
} 