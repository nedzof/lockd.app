const { createClient } = require('@supabase/supabase-js');
const { bsv } = require('scrypt-ts');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');

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
    // Load environment variables from .env.local
    const envPath = path.resolve(process.cwd(), '.env.local');
    console.log('Loading environment variables from:', envPath);
    dotenv.config({ path: envPath });

    // Hardcode the service key temporarily for testing
    const supabaseUrl = 'https://armwtaxnwajmunysmbjr.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFybXd0YXhud2FqbXVueXNtYmpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODkyMjUwNCwiZXhwIjoyMDU0NDk4NTA0fQ.KPNFwEEq1IbonZrwBHr9cAdLaB5PULlw6jXSGAO-eq8';

    // Debug logging
    console.log('Environment check:', {
      cwd: process.cwd(),
      envPath,
      envExists: require('fs').existsSync(envPath),
      nodeEnv: process.env.NODE_ENV,
      supabaseUrlPresent: !!supabaseUrl,
      supabaseKeyPresent: !!supabaseKey,
      supabaseKeyLength: supabaseKey ? supabaseKey.length : 0,
      keyType: 'service'
    });

    if (!supabaseUrl || !supabaseKey) {
      console.error('Environment variables:', {
        VITE_SUPABASE_URL: supabaseUrl ? 'present' : 'missing',
        SUPABASE_SERVICE_KEY: supabaseKey ? 'present' : 'missing'
      });
      throw new Error('Missing required environment variables: VITE_SUPABASE_URL and/or SUPABASE_SERVICE_KEY');
    }

    console.log('Initializing scanner with Supabase URL:', supabaseUrl);

    /** @type {import('@supabase/supabase-js').SupabaseClient} */
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'X-Client-Info': 'blockchain-scanner'
        }
      }
    });

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
    console.log(`- Supabase URL: ${supabaseUrl}`);
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
      // Test Supabase connection with more detailed error handling
      console.log('Testing Supabase connection...');
      console.log('Supabase client config:', {
        url: this.supabase.supabaseUrl,
        keyLength: this.supabase.supabaseKey?.length,
        headers: this.supabase.rest.headers
      });

      const { data, error, status, statusText } = await this.supabase
        .from('Post')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Supabase connection test details:', {
          error,
          status,
          statusText,
          url: this.supabase.supabaseUrl,
          keyLength: this.supabase.supabaseKey?.length
        });
        throw new Error(`Supabase connection test failed: ${error.message}`);
      }

      console.log('Successfully connected to Supabase. Test query result:', data);

      // Test WhatsOnChain API
      console.log('Testing WhatsOnChain API...');
      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/${this.NETWORK}/chain/info`);
      if (!response.ok) {
        throw new Error(`WhatsOnChain API test failed: ${response.status} ${response.statusText}`);
      }
      const chainInfo = await response.json();
      console.log('Successfully connected to WhatsOnChain API:', chainInfo);

      // Start mempool scanning
      console.log('Starting mempool scanner...');
      this.startMempoolScanning();
      
      // Start block scanning loop
      console.log('Starting block scanning loop...');
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
    } catch (error) {
      console.error('Initialization tests failed:', error);
      this.isScanning = false;
      return;
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
        const content = this.extractContent(tx);
        const authorAddress = this.extractAuthorAddress(tx);
        const { mediaUrl, mediaType, description } = this.extractMediaInfo(content);
        
        console.log('Extracted transaction data:', {
          txid,
          content,
          authorAddress,
          mediaUrl,
          mediaType,
          description
        });

        return {
          txid: tx.txid,
          content,
          author_address: authorAddress,
          amount: this.extractAmount(tx),
          locked_until: this.extractLockTime(tx),
          media_url: mediaUrl,
          media_type: mediaType,
          description
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
      
      // Log the full transaction for debugging
      console.log('Full transaction:', JSON.stringify(tx, null, 2));
      
      for (const output of tx.vout) {
        const script = output.scriptPubKey;
        console.log('Checking output:', script);

        // Check for OP_RETURN with content
        if (script.type === 'nulldata') {
          const asm = script.asm;
          console.log('Found nulldata output with ASM:', asm);
          
          if (asm && asm.startsWith('OP_RETURN')) {
            try {
              // Split by OP_RETURN and get all remaining parts
              const parts = asm.split('OP_RETURN ')[1].split(' ');
              console.log('ASM parts:', parts);
              
              // Try each part as potential hex data
              for (const hexData of parts) {
                if (hexData && !hexData.startsWith('OP_')) {
                  try {
                    const content = Buffer.from(hexData, 'hex').toString('utf8');
                    console.log('Decoded content:', content);
                    if (content.length > 0 && this.isValidUTF8(content)) {
                      // Try to parse as JSON
                      try {
                        const jsonContent = JSON.parse(content);
                        console.log('Valid JSON content found:', jsonContent);
                        return true;
                      } catch (e) {
                        // Not JSON but still valid UTF-8
                        console.log('Valid UTF-8 content found:', content);
                        return true;
                      }
                    }
                  } catch (e) {
                    console.log('Failed to decode hex data:', hexData, e);
                  }
                }
              }
            } catch (e) {
              console.log('Failed to decode OP_RETURN data:', e);
            }
          }
        }

        // Check for lock transaction
        if (script.hex) {
          const hasLockOps = script.hex.includes('63ac') || // OP_IF OP_CHECKSIG
                            script.hex.includes('67ac') ||   // OP_ELSE OP_CHECKSIG
                            script.hex.includes('6976a914'); // OP_IF OP_DUP OP_HASH160
          
          if (hasLockOps) {
            console.log('Found lock operation in script');
            return true;
          }
        }
      }
      
      return false;
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
      console.log('Extracting content from transaction:', tx.txid);
      
      // Look for OP_RETURN outputs
      for (const output of tx.vout) {
        if (output.scriptPubKey.type === 'nulldata') {
          console.log('Found OP_RETURN output:', output.scriptPubKey);
          
          // Try ASM first as it's more reliable
          if (output.scriptPubKey.asm) {
            const parts = output.scriptPubKey.asm.split('OP_RETURN ');
            if (parts.length > 1) {
              try {
                // Remove any OP_ prefixes and clean the hex
                const cleanHex = parts[1].replace(/OP_[0-9A-F]+\s*/gi, '').trim();
                const content = Buffer.from(cleanHex, 'hex').toString('utf8');
                console.log('Extracted content from ASM:', content);
                
                // Try to parse as JSON first
                try {
                  const jsonContent = JSON.parse(content);
                  console.log('Parsed JSON content:', jsonContent);
                  
                  // If it's our application's format
                  if (jsonContent.text || jsonContent.content) {
                    return jsonContent.text || jsonContent.content;
                  }
                  if (jsonContent.msg || jsonContent.message) {
                    return jsonContent.msg || jsonContent.message;
                  }
                  // If it's a plain object, stringify it
                  return JSON.stringify(jsonContent, null, 2);
                } catch (e) {
                  // Not JSON, check if it's valid UTF-8
                  if (this.isValidUTF8(content)) {
                    console.log('Content is valid UTF-8:', content);
                    return content;
                  }
                }
              } catch (e) {
                console.log('Failed to decode ASM content:', e);
              }
            }
          }
          
          // Fallback to hex if ASM failed
          if (output.scriptPubKey.hex) {
            try {
              // Skip OP_RETURN (6a) and length byte
              const hex = output.scriptPubKey.hex;
              const dataStart = hex.indexOf('6a');
              if (dataStart >= 0) {
                // Skip OP_RETURN and length byte
                const dataHex = hex.slice(dataStart + 4);
                const content = Buffer.from(dataHex, 'hex').toString('utf8');
                console.log('Extracted content from hex:', content);
                
                // Try to parse as JSON
                try {
                  const jsonContent = JSON.parse(content);
                  console.log('Parsed JSON content from hex:', jsonContent);
                  
                  if (jsonContent.text || jsonContent.content) {
                    return jsonContent.text || jsonContent.content;
                  }
                  if (jsonContent.msg || jsonContent.message) {
                    return jsonContent.msg || jsonContent.message;
                  }
                  return JSON.stringify(jsonContent, null, 2);
                } catch (e) {
                  // Not JSON, check if it's valid UTF-8
                  if (this.isValidUTF8(content)) {
                    console.log('Content is valid UTF-8:', content);
                    return content;
                  }
                }
              }
            } catch (e) {
              console.log('Failed to decode hex content:', e);
            }
          }
        }
      }
      
      console.log('No valid content found in transaction');
      return 'No content found';
    } catch (error) {
      console.error('Error extracting content:', error);
      return 'Error extracting content';
    }
  }

  /**
   * Check if a string is valid UTF-8
   * @param {string} str - The string to check
   * @returns {boolean}
   */
  isValidUTF8(str) {
    try {
      // Try to encode then decode - if it matches, it's valid UTF-8
      const encoded = Buffer.from(str, 'utf8');
      const decoded = encoded.toString('utf8');
      return str === decoded;
    } catch (e) {
      return false;
    }
  }

  /**
   * Extract author address from transaction
   * @param {Object} tx - The transaction object
   * @returns {string}
   */
  extractAuthorAddress(tx) {
    try {
      console.log('Extracting author address from transaction:', tx.txid);

      // First try to get from vin[0]
      if (tx.vin && tx.vin[0]) {
        // Check direct address
        if (tx.vin[0].addr) {
          console.log('Found address in vin[0].addr:', tx.vin[0].addr);
        return tx.vin[0].addr;
        }
        
        // Check addresses array
        if (tx.vin[0].addresses && tx.vin[0].addresses.length > 0) {
          console.log('Found address in vin[0].addresses:', tx.vin[0].addresses[0]);
          return tx.vin[0].addresses[0];
        }

        // Try to extract from scriptSig
        if (tx.vin[0].scriptSig && tx.vin[0].scriptSig.asm) {
          const parts = tx.vin[0].scriptSig.asm.split(' ');
          if (parts.length >= 2) {
            try {
              // The public key is usually the second element
              const pubKeyHex = parts[1];
              const publicKey = bsv.PublicKey.fromString(pubKeyHex);
              const address = publicKey.toAddress().toString();
              console.log('Extracted address from scriptSig:', address);
              return address;
            } catch (e) {
              console.log('Failed to extract address from scriptSig:', e);
            }
          }
        }
      }

      // Try to find in vout as a fallback
      for (const output of tx.vout) {
        if (output.scriptPubKey) {
          // Check addresses array
          if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.length > 0) {
            console.log('Found address in vout scriptPubKey:', output.scriptPubKey.addresses[0]);
            return output.scriptPubKey.addresses[0];
          }
          
          // Check address field
          if (output.scriptPubKey.address) {
            console.log('Found address in vout scriptPubKey.address:', output.scriptPubKey.address);
            return output.scriptPubKey.address;
          }
        }
      }

      console.log('No valid address found in transaction');
      return '';
    } catch (error) {
      console.error('Error extracting author address:', error);
      return '';
    }
  }

  /**
   * Extract media information from transaction data
   * @param {string} content - The transaction content
   * @returns {Object} Media information object
   */
  extractMediaInfo(content) {
    try {
      console.log('Extracting media info from content:', content);
      
      let mediaUrl = null;
      let mediaType = null;
      let description = null;

      // Check for base64 encoded images
      const base64Regex = /data:image\/[^;]+;base64,[^"'\s]+/;
      const base64Match = content.match(base64Regex);
      if (base64Match) {
        mediaUrl = base64Match[0];
        mediaType = 'image';
        // Remove the base64 data from content for description
        description = content.replace(base64Match[0], '').trim();
        return { mediaUrl, mediaType, description };
      }

      // Try parsing as JSON first
      try {
        const jsonData = JSON.parse(content);
        console.log('Parsed JSON data:', jsonData);

        // Check for media in standard JSON format
        if (jsonData.media) {
          mediaUrl = jsonData.media.url || jsonData.media.src;
          mediaType = jsonData.media.type;
          description = jsonData.media.description || jsonData.description;
        } else {
          // Check various possible JSON keys for media URL
          mediaUrl = jsonData.mediaUrl || 
                    jsonData.media_url || 
                    jsonData.image ||
                    jsonData.img ||
                    jsonData.imageUrl ||
                    jsonData.url;

          // Check various possible JSON keys for media type
          mediaType = jsonData.mediaType || 
                     jsonData.media_type || 
                     jsonData.type;

          // Check various possible JSON keys for description
          description = jsonData.description || 
                       jsonData.desc || 
                       jsonData.text || 
                       jsonData.caption;
        }

        if (mediaUrl && !mediaType) {
          // Try to determine media type from URL
          if (mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            mediaType = 'image';
          } else if (mediaUrl.match(/\.(mp4|webm|mov)$/i)) {
            mediaType = 'video';
          } else if (mediaUrl.match(/\.(mp3|wav|ogg)$/i)) {
            mediaType = 'audio';
          }
        }

      } catch (e) {
        console.log('Content is not JSON, trying string parsing');
        
        // Try to extract URL using common patterns
        const urlRegex = /(https?:\/\/[^\s|,;]+\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg))/i;
        const urlMatch = content.match(urlRegex);
        if (urlMatch) {
          mediaUrl = urlMatch[1];
          // Determine media type from extension
          const extension = urlMatch[2].toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
            mediaType = 'image';
          } else if (['mp4', 'webm', 'mov'].includes(extension)) {
            mediaType = 'video';
          } else if (['mp3', 'wav', 'ogg'].includes(extension)) {
            mediaType = 'audio';
          }
        }

        // Try to extract description (anything before the URL)
        if (mediaUrl) {
          const parts = content.split(mediaUrl);
          if (parts[0]) {
            description = parts[0].trim();
          } else if (parts[1]) {
            description = parts[1].trim();
          }
        } else {
          description = content;
        }
      }

      // Clean up description
      if (description) {
        // Remove any remaining base64 data
        description = description.replace(/data:image\/[^;]+;base64,[^"'\s]+/g, '').trim();
        // Remove any remaining URLs
        description = description.replace(/https?:\/\/[^\s]+/g, '').trim();
      }

      console.log('Extracted media info:', { mediaUrl, mediaType, description });
      return { mediaUrl, mediaType, description };
    } catch (error) {
      console.error('Error extracting media info:', error);
      return { mediaUrl: null, mediaType: null, description: null };
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
      // First try to get from transaction locktime
      if (tx.locktime && tx.locktime > 0) {
        console.log('Found locktime in transaction:', tx.locktime);
        return tx.locktime;
      }

      // Look for OP_CHECKLOCKTIMEVERIFY in outputs
      for (const output of tx.vout) {
        if (output.scriptPubKey.asm) {
          const asm = output.scriptPubKey.asm;
          const parts = asm.split(' ');
          
          // Look for a number followed by OP_CHECKLOCKTIMEVERIFY
          for (let i = 0; i < parts.length - 1; i++) {
            if (parts[i].match(/^\d+$/) && parts[i + 1] === 'OP_CHECKLOCKTIMEVERIFY') {
              const locktime = parseInt(parts[i], 10);
              console.log('Found CLTV locktime:', locktime);
              return locktime;
            }
          }
        }
      }

      // Default to 30 days from now if no explicit lock time found
      const thirtyDaysFromNow = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      console.log('Using default 30-day locktime:', thirtyDaysFromNow);
      return thirtyDaysFromNow;
    } catch (error) {
      console.error('Error extracting lock time:', error);
      const defaultLockTime = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      console.log('Using fallback 30-day locktime:', defaultLockTime);
      return defaultLockTime;
    }
  }

  /**
   * Validate Bitcoiner data before insertion
   * @param {Object} bitcoiner - The bitcoiner data to validate
   * @returns {Object} - Object containing validation result and any errors
   */
  async validateBitcoinerData(bitcoiner) {
    console.log('Validating bitcoiner data:', bitcoiner);
    
    if (!bitcoiner.address) {
      console.error('Missing required field: address');
      return false;
    }
    
    if (!bitcoiner.handle) {
      // Use first 10 chars of address as handle if missing
      bitcoiner.handle = bitcoiner.address.substring(0, 10);
      console.log('Generated handle from address:', bitcoiner.handle);
    }
    
    // Check if bitcoiner already exists
    const { data: existing, error } = await this.supabase
      .from('Bitcoiner')
      .select('address, handle')
      .eq('address', bitcoiner.address)
      .single();
      
    if (error) {
      console.error('Error checking existing bitcoiner:', error);
      return false;
    }
    
    if (existing) {
      console.log('Bitcoiner already exists:', existing);
      return true; // Allow update of existing bitcoiner
    }
    
    return true;
  }

  /**
   * Validate Post data before insertion
   * @param {Object} post - The post data to validate
   * @returns {Object} - Object containing validation result and any errors
   */
  async validatePostData(post) {
    console.log('Validating post data:', post);
    
    if (!post.id || !post.author_address) {
      console.error('Missing required fields: id or author_address');
      return false;
    }
    
    // Ensure content is never empty
    if (!post.content) {
      post.content = 'No content found';
      console.log('Set default content for empty post');
    }
    
    // Check if post already exists
    const { data: existing, error } = await this.supabase
      .from('Post')
      .select('id')
      .eq('id', post.id)
      .single();
      
    if (error) {
      console.error('Error checking existing post:', error);
      return false;
    }
    
    if (existing) {
      console.log('Post already exists:', existing);
      return true; // Allow update of existing post
    }
    
    return true;
  }

  /**
   * Validate LockLike data before insertion
   * @param {Object} lockLike - The lock like data to validate
   * @returns {Object} - Object containing validation result and any errors
   */
  async validateLockLikeData(lockLike) {
    console.log('Validating lock like data:', lockLike);
    
    if (!lockLike.txid || !lockLike.handle_id || !lockLike.post_id) {
      console.error('Missing required fields: txid, handle_id, or post_id');
      return false;
    }
    
    if (!lockLike.amount || lockLike.amount <= 0) {
      console.error('Invalid amount:', lockLike.amount);
      return false;
    }
    
    if (!lockLike.locked_until || lockLike.locked_until <= 0) {
      // Set default lock time if missing
      lockLike.locked_until = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      console.log('Set default lock time:', lockLike.locked_until);
    }
    
    // Check if lock like already exists
    const { data: existing, error } = await this.supabase
      .from('LockLike')
      .select('txid')
      .eq('txid', lockLike.txid)
      .single();
      
    if (error) {
      console.error('Error checking existing lock like:', error);
      return false;
    }
    
    if (existing) {
      console.log('Lock like already exists:', existing);
      return true; // Allow update of existing lock like
    }
    
    return true;
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
          media_url: tx.media_url,
          media_type: tx.media_type,
          description: tx.description,
          isMempool
        });

        if (!tx.author_address) {
          console.error('No author address found for transaction:', tx.txid);
          continue;
        }

        // Generate a handle from the address
        const handle = tx.author_address.slice(0, 10);
        console.log('Generated handle:', handle);

        // Validate Bitcoiner data
        const bitcoinerData = {
          address: tx.author_address,
          handle: handle
        };
        
        const bitcoinerValidation = await this.validateBitcoinerData(bitcoinerData);
        if (!bitcoinerValidation) {
          console.error('Invalid Bitcoiner data');
          continue;
        }

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
          console.log('Creating new Bitcoiner record:', bitcoinerData);

          const { error: bitcoinerError } = await this.supabase
            .from('Bitcoiner')
            .insert(bitcoinerData);

          if (bitcoinerError) {
            console.error('Error creating bitcoiner:', bitcoinerError);
            continue;
          }
        } else {
          console.log('Found existing Bitcoiner:', existingBitcoiner);
        }

        // Extract media information from content
        const { mediaUrl, mediaType, description } = this.extractMediaInfo(tx.content);
        console.log('Extracted media info:', { mediaUrl, mediaType, description });

        // Prepare and validate post data
        const postData = {
          id: tx.txid,
          content: description || tx.content || '',
          author_address: tx.author_address,
          is_locked: tx.amount > 0,
          created_at: new Date().toISOString(),
          media_url: mediaUrl || tx.media_url || null,
          media_type: mediaType || tx.media_type || null,
          description: description || tx.content || '',
          confirmed: !isMempool
        };

        const postValidation = await this.validatePostData(postData);
        if (!postValidation) {
          console.error('Invalid Post data');
          continue;
        }

        console.log('Upserting post:', postData);

        // Upsert the post
        const { error: postError } = await this.supabase
          .from('Post')
          .upsert(postData, {
            onConflict: 'id'
          });

        if (postError) {
          console.error('Error upserting post:', postError);
          continue;
        }

        // If there's a lock amount, prepare and validate lock data
        if (tx.amount > 0) {
          const lockData = {
            txid: tx.txid,
            amount: tx.amount,
            handle_id: tx.author_address,
            locked_until: tx.locked_until || Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days default
            post_id: tx.txid,
            created_at: new Date().toISOString(),
            confirmed: !isMempool
          };

          const lockValidation = await this.validateLockLikeData(lockData);
          if (!lockValidation) {
            console.error('Invalid LockLike data');
            continue;
          }

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

  async processTransaction(tx) {
    try {
      console.log('\nProcessing transaction:', tx.txid);
      
      // Extract content and validate data before inserting
      const content = this.extractContent(tx);
      console.log('Extracted content:', content);
      
      const lockTime = this.extractLockTime(tx);
      console.log('Extracted lock time:', new Date(lockTime * 1000).toISOString());
      
      // Get the first input address as author
      const authorAddress = tx.vin[0]?.address;
      if (!authorAddress) {
        console.error('No author address found in transaction');
        return;
      }
      
      // Create or update bitcoiner
      const bitcoiner = {
        address: authorAddress,
        handle: authorAddress.substring(0, 10), // Default to first 10 chars of address
        created_at: new Date().toISOString()
      };
      
      if (await this.validateBitcoinerData(bitcoiner)) {
        console.log('Upserting bitcoiner:', bitcoiner);
        const { error: bitcoinerError } = await this.supabase
          .from('Bitcoiner')
          .upsert(bitcoiner);
          
        if (bitcoinerError) {
          console.error('Error upserting bitcoiner:', bitcoinerError);
          return;
        }
      }
      
      // Create post
      const post = {
        id: tx.txid,
        content: content || 'No content found',
        author_address: authorAddress,
        created_at: new Date().toISOString(),
        is_locked: true,
        confirmed: true
      };
      
      if (await this.validatePostData(post)) {
        console.log('Upserting post:', post);
        const { error: postError } = await this.supabase
          .from('Post')
          .upsert(post);
          
        if (postError) {
          console.error('Error upserting post:', postError);
          return;
        }
      }
      
      // Calculate amount in satoshis
      let amount = 0;
      for (const output of tx.vout) {
        if (output.value) {
          amount += Math.floor(output.value * 100000000); // Convert BSV to satoshis
        }
      }
      
      // Create lock like
      const lockLike = {
        txid: tx.txid,
        amount: amount,
        handle_id: authorAddress,
        locked_until: lockTime,
        created_at: new Date().toISOString(),
        post_id: tx.txid,
        confirmed: true
      };
      
      if (await this.validateLockLikeData(lockLike)) {
        console.log('Upserting lock like:', lockLike);
        const { error: lockError } = await this.supabase
          .from('LockLike')
          .upsert(lockLike);
          
        if (lockError) {
          console.error('Error upserting lock like:', lockError);
          return;
        }
      }
      
      console.log('Successfully processed transaction:', tx.txid);
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  }

  async processBlock(height) {
    try {
      console.log(`\nProcessing block at height ${height}...`);
      const block = await this.whatsOnChain.getBlockByHeight(height);
      
      if (!block || !block.tx) {
        console.error('Invalid block data:', block);
        return;
      }
      
      console.log(`Found ${block.tx.length} transactions in block`);
      
      for (const txid of block.tx) {
        try {
          // Add delay between API calls
          await new Promise(resolve => setTimeout(resolve, this.apiDelay));
          
          const tx = await this.whatsOnChain.getTransaction(txid);
          if (!tx) {
            console.error('Failed to fetch transaction:', txid);
            continue;
          }
          
          // Check if transaction has OP_RETURN output
          const hasOpReturn = tx.vout.some(output => 
            output.scriptPubKey?.type === 'nulldata' || 
            output.scriptPubKey?.asm?.includes('OP_RETURN')
          );
          
          if (hasOpReturn) {
            console.log('Found OP_RETURN transaction:', txid);
            await this.processTransaction(tx);
          }
        } catch (error) {
          console.error('Error processing transaction:', txid, error);
        }
      }
      
      console.log(`Finished processing block ${height}`);
    } catch (error) {
      console.error('Error processing block:', error);
    }
  }
}

// Export the BlockchainScanner class
module.exports = BlockchainScanner; 

// Create and start the scanner if running directly
if (require.main === module) {
  const scanner = new BlockchainScanner();
  scanner.startScanning().catch(error => {
    console.error('Error starting scanner:', error);
    process.exit(1);
  });
} 