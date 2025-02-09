const { createClient } = require('@supabase/supabase-js');
const { bsv } = require('scrypt-ts');
const fetch = require('node-fetch');

/**
 * @typedef {Object} Post
 * @property {string} id
 * @property {string} content
 * @property {string} author_address
 * @property {string} created_at
 * @property {boolean} is_locked
 * @property {string|null} [media_url]
 * @property {string|null} [media_type]
 * @property {string|null} [description]
 */

/**
 * @typedef {Object} LockLike
 * @property {string} txid
 * @property {number} amount
 * @property {string} handle_id
 * @property {number} locked_until
 * @property {string} created_at
 * @property {string} post_id
 */

/**
 * @typedef {Object} Database
 * @property {Object} public
 * @property {Object} public.Tables
 * @property {Object} public.Tables.Post
 * @property {Post} public.Tables.Post.Row
 * @property {Object} public.Tables.LockLike
 * @property {LockLike} public.Tables.LockLike.Row
 */

/**
 * @typedef {Object} BlockchainTransaction
 * @property {string} txid
 * @property {number} outputIndex
 * @property {string} script
 * @property {number} satoshis
 */

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - The number of milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class BlockchainScanner {
  constructor() {
    if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Missing required environment variables: VITE_SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
    }

    /** @type {import('@supabase/supabase-js').SupabaseClient} */
    this.supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    this.isScanning = false;
    this.lastScannedHeight = 883000; // Start from a recent block to avoid scanning the entire chain
    this.SCAN_INTERVAL = 10000; // 10 seconds
    this.scanIntervalId = null;
    this.API_DELAY = 1000; // 1 second delay between API calls

    console.log('BlockchainScanner initialized with:');
    console.log(`- Supabase URL: ${process.env.VITE_SUPABASE_URL}`);
    console.log(`- Starting block height: ${this.lastScannedHeight}`);
    console.log(`- Scan interval: ${this.SCAN_INTERVAL}ms`);
    console.log(`- API delay: ${this.API_DELAY}ms`);
  }

  /**
   * Start the blockchain scanning process
   * @returns {Promise<void>}
   */
  async startScanning() {
    if (this.isScanning) {
      console.log('Scanner is already running');
      return;
    }

    this.isScanning = true;
    console.log('Starting blockchain scanner...');
    
    try {
      // Test Supabase connection
      const { error } = await this.supabase.from('Post').select('id').limit(1);
      if (error) {
        throw new Error(`Supabase connection test failed: ${error.message}`);
      }
      console.log('Successfully connected to Supabase');

      // Test WhatsOnChain API
      const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
      if (!response.ok) {
        throw new Error(`WhatsOnChain API test failed: ${response.status} ${response.statusText}`);
      }
      console.log('Successfully connected to WhatsOnChain API');
    } catch (error) {
      console.error('Initialization tests failed:', error);
      this.isScanning = false;
      return;
    }
    
    while (this.isScanning) {
      try {
        await this.scanNewBlocks();
        console.log(`Waiting ${this.SCAN_INTERVAL}ms before next scan...`);
        await new Promise(resolve => setTimeout(resolve, this.SCAN_INTERVAL));
      } catch (error) {
        console.error('Error during blockchain scan:', error);
        // Continue scanning even if there's an error
      }
    }
  }

  /**
   * Stop the blockchain scanning process
   */
  stopScanning() {
    this.isScanning = false;
    console.log('Stopping blockchain scanner...');
  }

  /**
   * Scan new blocks for relevant transactions
   * @returns {Promise<void>}
   */
  async scanNewBlocks() {
    try {
      const currentHeight = await this.getCurrentBlockHeight();
      
      if (currentHeight <= this.lastScannedHeight) {
        console.log('No new blocks to scan');
        return;
      }

      // Limit the number of blocks to scan in one batch to avoid overloading
      const batchSize = 10;
      const endHeight = Math.min(currentHeight, this.lastScannedHeight + batchSize);
      
      console.log(`Scanning blocks from ${this.lastScannedHeight + 1} to ${endHeight} (current height: ${currentHeight})`);
      
      for (let height = this.lastScannedHeight + 1; height <= endHeight; height++) {
        console.log(`Scanning block ${height}...`);
        const transactions = await this.getBlockTransactions(height);
        if (transactions.length > 0) {
          console.log(`Found ${transactions.length} relevant transactions in block ${height}`);
          await this.processTransactions(transactions);
        }
        this.lastScannedHeight = height;
      }
    } catch (error) {
      console.error('Error scanning blocks:', error);
      throw error;
    }
  }

  /**
   * Get the current block height
   * @returns {Promise<number>}
   */
  async getCurrentBlockHeight() {
    try {
      const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.blocks;
    } catch (error) {
      console.error('Error getting current block height:', error);
      throw error;
    }
  }

  /**
   * Get transactions from a specific block
   * @param {number} height - The block height
   * @returns {Promise<BlockchainTransaction[]>}
   */
  async getBlockTransactions(height) {
    const transactions = [];
    
    try {
      // Get block hash
      const hashResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/main/block/height/${height}`);
      if (!hashResponse.ok) {
        throw new Error(`HTTP error! status: ${hashResponse.status}`);
      }
      const blockHash = await hashResponse.text();
      
      // Add delay before next API call
      await sleep(this.API_DELAY);
      
      // Get block details
      const blockResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/main/block/hash/${blockHash}`);
      if (!blockResponse.ok) {
        throw new Error(`HTTP error! status: ${blockResponse.status}`);
      }
      const block = await blockResponse.json();
      
      // Process each transaction in the block
      for (const txid of block.tx) {
        // Add delay before next API call
        await sleep(this.API_DELAY);
        
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

  /**
   * Get a specific transaction
   * @param {string} txid - The transaction ID
   * @returns {Promise<BlockchainTransaction | null>}
   */
  async getTransaction(txid) {
    try {
      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`);
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

  /**
   * Check if a transaction is relevant to our application
   * @param {Object} tx - The transaction object
   * @returns {boolean}
   */
  isRelevantTransaction(tx) {
    try {
      return tx.vout.some(output => {
        const script = output.scriptPubKey.hex;
        // Check if it's a post or lock transaction
        return script.includes('6a') || // OP_RETURN
               script.includes('63') || // OP_IF
               script.includes('67');   // OP_ELSE
      });
    } catch (error) {
      console.error('Error checking transaction relevance:', error);
      return false;
    }
  }

  /**
   * Extract content from transaction
   * @param {Object} tx - The transaction object
   * @returns {string}
   */
  extractContent(tx) {
    try {
      const opReturnOutput = tx.vout.find(output => 
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

  /**
   * Extract author address from transaction
   * @param {Object} tx - The transaction object
   * @returns {string}
   */
  extractAuthorAddress(tx) {
    try {
      if (tx.vin && tx.vin[0] && tx.vin[0].addr) {
        return tx.vin[0].addr;
      }
    } catch (error) {
      console.error('Error extracting author address:', error);
    }
    return '';
  }

  /**
   * Extract amount from transaction
   * @param {Object} tx - The transaction object
   * @returns {number}
   */
  extractAmount(tx) {
    try {
      const lockOutput = tx.vout.find(output => 
        output.scriptPubKey.hex.includes('63') || // OP_IF
        output.scriptPubKey.hex.includes('67')    // OP_ELSE
      );
      
      if (lockOutput) {
        return Math.floor(lockOutput.value * 100000000); // Convert BSV to satoshis
      }
    } catch (error) {
      console.error('Error extracting amount:', error);
    }
    return 0;
  }

  /**
   * Extract lock time from transaction
   * @param {Object} tx - The transaction object
   * @returns {number}
   */
  extractLockTime(tx) {
    try {
      return tx.locktime || 0;
    } catch (error) {
      console.error('Error extracting lock time:', error);
      return 0;
    }
  }

  /**
   * Extract media URL from transaction
   * @param {Object} tx - The transaction object
   * @returns {string|undefined}
   */
  extractMediaUrl(tx) {
    try {
      const opReturnOutput = tx.vout.find(output => 
        output.scriptPubKey.type === 'nulldata' &&
        output.scriptPubKey.hex.includes('media_url=')
      );

      if (opReturnOutput) {
        const hex = opReturnOutput.scriptPubKey.hex;
        const data = Buffer.from(hex, 'hex').toString('utf8');
        const match = data.match(/media_url=(.*?)(?:\||$)/);
        return match ? match[1] : undefined;
      }
    } catch (error) {
      console.error('Error extracting media URL:', error);
    }
    return undefined;
  }

  /**
   * Extract media type from transaction
   * @param {Object} tx - The transaction object
   * @returns {string|undefined}
   */
  extractMediaType(tx) {
    try {
      const opReturnOutput = tx.vout.find(output => 
        output.scriptPubKey.type === 'nulldata' &&
        output.scriptPubKey.hex.includes('media_type=')
      );

      if (opReturnOutput) {
        const hex = opReturnOutput.scriptPubKey.hex;
        const data = Buffer.from(hex, 'hex').toString('utf8');
        const match = data.match(/media_type=(.*?)(?:\||$)/);
        return match ? match[1] : undefined;
      }
    } catch (error) {
      console.error('Error extracting media type:', error);
    }
    return undefined;
  }

  /**
   * Extract description from transaction
   * @param {Object} tx - The transaction object
   * @returns {string|undefined}
   */
  extractDescription(tx) {
    try {
      const opReturnOutput = tx.vout.find(output => 
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

  /**
   * Process a list of transactions
   * @param {BlockchainTransaction[]} transactions
   * @returns {Promise<void>}
   */
  async processTransactions(transactions) {
    for (const tx of transactions) {
      try {
        // First, check if the transaction is already in the database
        const { data: existingPost } = await this.supabase
          .from('Post')
          .select('id')
          .eq('id', tx.txid)
          .single();

        if (!existingPost) {
          // Insert new post
          const { error: postError } = await this.supabase
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
          const { error: lockError } = await this.supabase
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

module.exports = BlockchainScanner; 