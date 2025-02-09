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
    this.lastScannedHeight = 1660424; // Start from testnet block
    this.SCAN_INTERVAL = 10000; // 10 seconds
    this.MEMPOOL_SCAN_INTERVAL = 5000; // 5 seconds for mempool
    this.scanIntervalId = null;
    this.mempoolIntervalId = null;
    this.API_DELAY = 1000; // 1 second delay between API calls
    this.NETWORK = 'test'; // Use testnet
    this.processedMempoolTxs = new Set(); // Track processed mempool transactions

    console.log('BlockchainScanner initialized with:');
    console.log(`- Supabase URL: ${process.env.VITE_SUPABASE_URL}`);
    console.log(`- Starting block height: ${this.lastScannedHeight}`);
    console.log(`- Network: ${this.NETWORK}`);
    console.log(`- Scan interval: ${this.SCAN_INTERVAL}ms`);
    console.log(`- Mempool scan interval: ${this.MEMPOOL_SCAN_INTERVAL}ms`);
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
      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/chain/info`);
      if (!response.ok) {
        throw new Error(`WhatsOnChain API test failed: ${response.status} ${response.statusText}`);
      }
      console.log('Successfully connected to WhatsOnChain API');
    } catch (error) {
      console.error('Initialization tests failed:', error);
      this.isScanning = false;
      return;
    }

    // Start mempool scanning
    this.startMempoolScanning();
    
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
   * Start scanning the mempool for unconfirmed transactions
   */
  async startMempoolScanning() {
    console.log('Starting mempool scanner...');
    this.mempoolIntervalId = setInterval(async () => {
      try {
        await this.scanMempool();
      } catch (error) {
        console.error('Error during mempool scan:', error);
      }
    }, this.MEMPOOL_SCAN_INTERVAL);
  }

  /**
   * Scan mempool for unconfirmed transactions
   */
  async scanMempool() {
    try {
      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/mempool/raw`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const mempoolTxs = await response.json();

      console.log(`Found ${mempoolTxs.length} transactions in mempool`);

      for (const txid of mempoolTxs) {
        if (!this.processedMempoolTxs.has(txid)) {
          await sleep(this.API_DELAY);
          const tx = await this.getTransaction(txid);
          if (tx) {
            console.log(`Processing mempool transaction: ${txid}`);
            await this.processTransactions([tx], true);
            this.processedMempoolTxs.add(txid);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning mempool:', error);
    }
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
      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/chain/info`);
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
      console.log(`Fetching block at height ${height} from ${this.NETWORK} network...`);
      
      // Get block hash
      const hashUrl = `https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/block/height/${height}`;
      console.log(`Fetching block hash from: ${hashUrl}`);
      const hashResponse = await fetch(hashUrl);
      
      if (!hashResponse.ok) {
        throw new Error(`Failed to get block hash: ${hashResponse.status} ${hashResponse.statusText}`);
      }
      
      const blockInfo = await hashResponse.json();
      const blockHash = blockInfo.hash;
      console.log(`Got block hash: ${blockHash}`);
      
      // Add delay before next API call
      await sleep(this.API_DELAY);
      
      // Get block details
      const blockUrl = `https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/block/hash/${blockHash}`;
      console.log(`Fetching block details from: ${blockUrl}`);
      const blockResponse = await fetch(blockUrl);
      
      if (!blockResponse.ok) {
        throw new Error(`Failed to get block details: ${blockResponse.status} ${blockResponse.statusText}`);
      }
      
      const block = await blockResponse.json();
      console.log(`Found ${block.tx.length} transactions in block`);
      
      // Process each transaction in the block
      for (const txid of block.tx) {
        // Add delay before next API call
        await sleep(this.API_DELAY);
        
        console.log(`Checking transaction: ${txid}`);
        const tx = await this.getTransaction(txid);
        if (tx) {
          console.log(`Found relevant transaction: ${txid}`);
          transactions.push(tx);
        }
      }
      
      console.log(`Found ${transactions.length} relevant transactions in block ${height}`);
    } catch (error) {
      console.error(`Error getting transactions for block ${height}:`, error);
      throw error;
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
      const txUrl = `https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/tx/hash/${txid}`;
      console.log(`Fetching transaction from: ${txUrl}`);
      const response = await fetch(txUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to get transaction: ${response.status} ${response.statusText}`);
      }
      
      const tx = await response.json();
      
      if (this.isRelevantTransaction(tx)) {
        console.log(`Transaction ${txid} is relevant to our application`);
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
      } else {
        console.log(`Transaction ${txid} is not relevant to our application`);
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
      console.log('Checking transaction outputs for relevance...');
      const isRelevant = tx.vout.some(output => {
        const script = output.scriptPubKey.hex;
        // Check if it's a post or lock transaction
        const hasOpReturn = script.includes('6a');
        const hasOpIf = script.includes('63');
        const hasOpElse = script.includes('67');
        
        console.log(`Output script: ${script}`);
        console.log(`Has OP_RETURN: ${hasOpReturn}, Has OP_IF: ${hasOpIf}, Has OP_ELSE: ${hasOpElse}`);
        
        return hasOpReturn || hasOpIf || hasOpElse;
      });
      
      console.log(`Transaction relevance: ${isRelevant}`);
      return isRelevant;
    } catch (error) {
      console.error('Error checking transaction relevance:', error);
      return false;
    }
  }

  /**
   * Extract content from a transaction
   * @param {BlockchainTransaction} tx
   * @returns {string|null}
   */
  extractContent(tx) {
    try {
      console.log('Extracting content from transaction:', tx.txid);

      // First check OP_RETURN outputs
      for (const output of tx.vout) {
        if (output.scriptPubKey && output.scriptPubKey.type === 'nulldata') {
          const asm = output.scriptPubKey.asm;
          if (asm && asm.startsWith('OP_RETURN')) {
            // Extract the hex data after OP_RETURN
            const hexData = asm.split(' ')[1];
            if (hexData) {
              const content = Buffer.from(hexData, 'hex').toString('utf8');
              console.log('Found content in OP_RETURN:', content);
              return content;
            }
          }
        }
      }

      // Then check P2PKH outputs
      for (const output of tx.vout) {
        if (output.scriptPubKey && output.scriptPubKey.type === 'pubkeyhash') {
          const asm = output.scriptPubKey.asm;
          if (asm) {
            const parts = asm.split(' ');
            // Look for data after OP_CHECKSIG
            const dataIndex = parts.indexOf('OP_CHECKSIG') + 1;
            if (dataIndex < parts.length) {
              const hexData = parts[dataIndex];
              const content = Buffer.from(hexData, 'hex').toString('utf8');
              console.log('Found content in P2PKH:', content);
              return content;
            }
          }
        }
      }

      console.log('No content found in transaction:', tx.txid);
      return null;
    } catch (error) {
      console.error('Error extracting content:', error);
      return null;
    }
  }

  /**
   * Extract author address from a transaction
   * @param {BlockchainTransaction} tx
   * @returns {string|null}
   */
  extractAuthorAddress(tx) {
    try {
      console.log('Extracting author address from transaction:', tx.txid);

      // First try to get from vin[0]
      if (tx.vin && tx.vin[0]) {
        const firstInput = tx.vin[0];
        
        // Check if we have a direct address
        if (firstInput.address) {
          console.log('Found address in vin[0]:', firstInput.address);
          return firstInput.address;
        }

        // Check if we have scriptSig
        if (firstInput.scriptSig && firstInput.scriptSig.asm) {
          const parts = firstInput.scriptSig.asm.split(' ');
          // The public key is usually the second element
          if (parts.length >= 2) {
            const pubKeyHex = parts[1];
            // Convert public key to address
            // This is a simplified version - you might need a more robust conversion
            const address = this.pubKeyToAddress(pubKeyHex);
            if (address) {
              console.log('Derived address from public key:', address);
              return address;
            }
          }
        }
      }

      // Then check vout for change address
      for (const output of tx.vout) {
        if (output.scriptPubKey && output.scriptPubKey.addresses && output.scriptPubKey.addresses.length > 0) {
          const address = output.scriptPubKey.addresses[0];
          console.log('Found address in vout:', address);
          return address;
        }
      }

      console.log('No author address found in transaction:', tx.txid);
      return null;
    } catch (error) {
      console.error('Error extracting author address:', error);
      return null;
    }
  }

  /**
   * Convert a public key to a Bitcoin address
   * @param {string} pubKeyHex
   * @returns {string|null}
   */
  pubKeyToAddress(pubKeyHex) {
    try {
      // This is a placeholder - you'll need to implement proper Bitcoin address derivation
      // You might want to use a library like bitcoinjs-lib for this
      console.log('Converting public key to address:', pubKeyHex);
      return null;
    } catch (error) {
      console.error('Error converting public key to address:', error);
      return null;
    }
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
   * @param {boolean} [isMempool=false] - Whether these are mempool transactions
   * @returns {Promise<void>}
   */
  async processTransactions(transactions, isMempool = false) {
    for (const tx of transactions) {
      try {
        console.log('Processing transaction:', {
          txid: tx.txid,
          content: tx.content,
          author_address: tx.author_address,
          amount: tx.amount,
          isMempool
        });

        if (!tx.author_address) {
          console.error('No author address found for transaction:', tx.txid);
          continue;
        }

        // Generate a handle from the address
        const handle = tx.author_address.slice(0, 10);
        console.log('Generated handle:', handle);

        // First, ensure the Bitcoiner record exists
        const { data: existingBitcoiner, error: bitcoinerCheckError } = await this.supabase
          .from('Bitcoiner')
          .select('*')
          .eq('address', tx.author_address)
          .single();

        if (bitcoinerCheckError && bitcoinerCheckError.code !== 'PGRST116') {
          console.error('Error checking bitcoiner:', bitcoinerCheckError);
          continue;
        }

        if (!existingBitcoiner) {
          console.log('Creating new Bitcoiner record:', {
            address: tx.author_address,
            handle
          });

          const { error: bitcoinerError } = await this.supabase
            .from('Bitcoiner')
            .insert({
              address: tx.author_address,
              handle: handle
            });

          if (bitcoinerError) {
            console.error('Error creating bitcoiner:', bitcoinerError);
            continue;
          }
        } else {
          console.log('Found existing Bitcoiner:', existingBitcoiner);
        }

        // Upsert the post with confirmed status
        const postData = {
          id: tx.txid,
          content: tx.content,
          author_address: tx.author_address,
          is_locked: true,
          created_at: new Date().toISOString(),
          media_url: tx.media_url,
          media_type: tx.media_type,
          description: tx.description,
          confirmed: !isMempool
        };

        console.log('Upserting post:', postData);

        const { error: postError } = await this.supabase
          .from('Post')
          .upsert(postData, {
            onConflict: 'id'
          });

        if (postError) {
          console.error('Error upserting post:', postError);
          continue;
        }

        // If there's a lock amount, upsert the lock information
        if (tx.amount > 0) {
          const lockData = {
            txid: tx.txid,
            amount: tx.amount,
            handle_id: tx.author_address,
            locked_until: tx.locked_until,
            post_id: tx.txid,
            created_at: new Date().toISOString(),
            confirmed: !isMempool
          };

          console.log('Upserting lock:', lockData);

          const { error: lockError } = await this.supabase
            .from('LockLike')
            .upsert(lockData, {
              onConflict: 'txid'
            });

          if (lockError) {
            console.error('Error upserting lock:', lockError);
          }
        }

        console.log(`Successfully processed ${isMempool ? 'mempool' : 'confirmed'} transaction ${tx.txid}`);
      } catch (error) {
        console.error(`Error processing transaction ${tx.txid}:`, error);
      }
    }
  }
}

module.exports = BlockchainScanner; 