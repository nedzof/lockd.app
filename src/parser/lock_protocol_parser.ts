/**
 * Lock Protocol Parser
 * 
 * Parses Lock protocol specific data from transactions.
 * Follows KISS principles with minimal, focused responsibilities.
 */

import BaseParser from './base_parser.js';
import { db_client } from '../db/db_client.js';

/**
 * Convert a hexadecimal string to UTF-8 string
 * @param hex - The hexadecimal string to convert
 * @returns The UTF-8 string
 */
function hexToUtf8(hex: string): string {
  try {
    // Remove '0x' prefix if present
    hex = hex.startsWith('0x') ? hex.slice(2) : hex;
    
    // Ensure even number of characters
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    
    // Convert hex to bytes and then to string
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      str += String.fromCharCode(byte);
    }
    
    // Try to decode as UTF-8
    try {
      return decodeURIComponent(escape(str));
    } catch (e) {
      // If decoding fails, return the raw string
      return str;
    }
  } catch (error) {
    console.error('Error converting hex to UTF-8:', error);
    return '';
  }
}

// Lock protocol action types
export enum LockActionType {
  POST = 'post',
  LIKE = 'like',
  VOTE = 'vote',
  COMMENT = 'comment',
  UNKNOWN = 'unknown'
}

interface LockProtocolData {
  action: LockActionType;
  content?: string;
  post_id?: string;
  author_address: string;
  vote_options?: { tx_id: string; content: string; option_index: number }[];
  raw_data?: any; // Store raw data for debugging
  is_vote?: boolean;
  options_hash?: string;
  parent_sequence?: string;
  sequence?: string;
  timestamp?: string;
  type?: string;
}

export class LockProtocolParser extends BaseParser {
  constructor() {
    super();
  }
  
  /**
   * Parse Lock protocol data from a transaction
   * @param transaction The transaction to parse
   * @returns The parsed Lock protocol data or null if not a Lock protocol transaction
   */
  async parse_lock_protocol(transaction: any): Promise<LockProtocolData | null> {
    try {
      // Extract transaction data
      const transactionId = transaction.tx?.h;
      const blockTime = transaction.block?.time;
      
      if (!transactionId || !blockTime) {
        this.log_warning('Missing transaction ID or block time', { transaction });
        return null;
      }
      
      // Check if this is a Lock protocol transaction
      if (!this.is_lock_protocol_transaction(transaction)) {
        this.log_info('Not a Lock protocol transaction', { 
          transaction_id: transactionId,
          transaction_format: transaction.tx ? 'JungleBus' : 'Standard'
        });
        return null;
      }
      
      this.log_info('Processing Lock protocol transaction', { 
        transaction_id: transactionId
      });
      
      // Extract Lock protocol data
      const lockData = this.extract_lock_data(transaction);
      
      if (!lockData) {
        this.log_warning('Failed to extract Lock protocol data', { transaction_id: transactionId });
        return null;
      }
      
      // Save the raw transaction data in the database with clean metadata structure
      // Following KISS principles - only include the essential information
      const blockHeight = transaction.block?.height || transaction.block_height || 0;
      const blockHash = transaction.block?.hash || '';
      
      // Create enhanced metadata object with comprehensive translated data
      const enhancedLockData = {
        // Include transaction details
        transaction_id: transactionId,
        block_height: blockHeight,
        block_hash: blockHash,
        block_time: blockTime,
        
        // Include all lock protocol data
        action: lockData.action,
        content: lockData.content,
        post_id: lockData.post_id,
        author_address: lockData.author_address,
        is_vote: lockData.is_vote,
        vote_options: lockData.vote_options,
        
        // Include additional fields if available
        options_hash: lockData.options_hash,
        parent_sequence: lockData.parent_sequence,
        sequence: lockData.sequence,
        timestamp: lockData.timestamp,
        type: lockData.action // Use action as type for consistency
      };
      
      this.log_info('Saving transaction with enhanced lock data', {
        transaction_id: transactionId,
        metadata_structure: 'original_transaction + translated_data',
        translated_data_fields: Object.keys(enhancedLockData)
      });
      
      await db_client.transaction.save_processed_transaction({
        tx_id: transactionId,
        block_height: blockHeight,
        block_time: blockTime,
        type: lockData.action,
        protocol: 'lock',
        metadata: {
          // Include the original transaction for complete reference
          original_transaction: transaction,
          // Include the enhanced translated data
          translated_data: enhancedLockData
          // No need to duplicate data that's already in translated_data
          // This follows KISS principles by avoiding redundancy
        }
      });
      
      // Process the Lock protocol data based on action type
      await this.process_lock_data(transactionId, lockData, new Date(blockTime * 1000));
      
      return lockData;
    } catch (error) {
      this.log_error('Error parsing Lock protocol data', error as Error, {
        tx_id: transaction.tx?.h
      });
      return null;
    }
  }
  
  /**
   * Check if a transaction is a Lock protocol transaction
   * @param transaction The transaction to check
   * @returns True if the transaction is a Lock protocol transaction
   */
  /**
   * Check if a transaction is a Lock protocol transaction
   * @param transaction The transaction to check
   * @returns True if the transaction is a Lock protocol transaction, false otherwise
   */
  public is_lock_protocol_transaction(transaction: any): boolean {
    try {
      this.log_info('Checking if transaction is Lock protocol', {
        tx_id: transaction.id || transaction.tx?.h || '',
        has_outputs: !!(transaction.outputs || transaction.out),
        output_count: (transaction.outputs || transaction.out || []).length
      });
      
      // Check for Lock protocol markers in transaction outputs
      const outputs = transaction.outputs || transaction.out || [];
      
      // No outputs? Not a Lock protocol transaction
      if (outputs.length === 0) {
        return false;
      }
      
      // Check transaction id format to determine if it's a JungleBus transaction
      const isJungleBusFormat = transaction.tx && transaction.tx.h;
      this.log_info('Transaction format detection', {
        tx_id: transaction.id || transaction.tx?.h || '',
        format: isJungleBusFormat ? 'JungleBus' : 'Standard'
      });
      
      // Special handling for JungleBus format
      if (isJungleBusFormat && transaction.tx) {
        // Look for lock protocol data in transaction inputs and outputs
        if (transaction.in) {
          for (const input of transaction.in) {
            if (input.e && input.e.a && (input.e.a.includes('lock') || input.e.a.includes('LOCK'))) {
              this.log_info('Found Lock protocol in JungleBus input', {
                tx_id: transaction.tx.h,
                address: input.e.a
              });
              return true;
            }
          }
        }
        
        // Check for opReturn outputs in JungleBus format
        if (transaction.out) {
          for (const output of transaction.out) {
            // Check for OP_RETURN with 'lock' protocol
            if (output.s1 === 'OP_RETURN' && output.s2) {
              const script = output.s2;
              if (script.includes('lock') || script.includes('LOCK') || 
                  script.includes('6c6f636b') /* 'lock' in hex */ || 
                  script.includes('6c6f636b642e617070') /* 'lockd.app' in hex */) {
                this.log_info('Found Lock protocol in JungleBus OP_RETURN', {
                  tx_id: transaction.tx.h,
                  script: script.substring(0, 50) + '...'
                });
                return true;
              }
            }
          }
        }
      }
      
      // If we have raw outputs as hex strings
      if (outputs.length > 0 && typeof outputs[0] === 'string') {
        for (const output of outputs) {
          // Check for lockd.app or lock in the output
          if (output.includes('6c6f636b642e617070') || // 'lockd.app' in hex
              output.includes('6c6f636b')) { // 'lock' in hex
            this.log_info('Found Lock protocol in raw hex output', {
              tx_id: transaction.id || transaction.tx?.h || ''
            });
            return true;
          }
        }
      } else {
        // If we have parsed outputs
        for (const output of outputs) {
          // Check for s2 field (script data)
          if (output.s2) {
            const script = output.s2;
            
            // Check for Lock protocol markers
            if (script.includes('lock') || script.includes('LOCK')) {
              this.log_info('Found Lock protocol in parsed output', {
                tx_id: transaction.id || transaction.tx?.h || '',
                script_fragment: script.substring(0, 30) + '...'
              });
              return true;
            }
          }
          
          // Check for b0 field (used in some transaction formats)
          if (output.b0) {
            const data = output.b0;
            if (typeof data === 'string' && 
                (data.includes('lock') || data.includes('LOCK') || 
                 data.includes('6c6f636b') || data.includes('6c6f636b642e617070'))) {
              this.log_info('Found Lock protocol in b0 field', {
                tx_id: transaction.id || transaction.tx?.h || ''
              });
              return true;
            }
          }
        }
      }
    
      return false;
    } catch (error) {
      this.log_error('Error checking if transaction is Lock protocol', error as Error, {
        tx_id: transaction.id || transaction.tx?.h || ''
      });
      return false;
    }
  }
  
  /**
   * Extract Lock protocol data from a transaction
   * @param transaction The transaction to extract data from
   * @returns The extracted Lock protocol data or null if extraction failed
   */
  public extract_lock_data(transaction: any): LockProtocolData | null {
    try {
      // Handle different transaction formats
      const outputs = transaction.outputs || transaction.out || [];
      let actionType = LockActionType.UNKNOWN;
      let content = '';
      let postId = '';
      let authorIdentity = transaction?.addresses?.[0] || '';
      let voteOptions: { tx_id: string; content: string; option_index: number }[] = [];
      let isVote = false;
      let optionsHash = '';
      let parentSequence = '';
      let sequence = '';
      let timestamp = '';
      let type = '';
      let rawData: any = {};
      
      // If we have raw outputs as hex strings, parse them
      if (typeof outputs[0] === 'string') {
        const parsedData = this.parse_ord_outputs(outputs, transaction.id || transaction.tx?.h || '');
        
        if (parsedData) {
          this.log_info('Parsed ORD output data', { transaction_id: transaction.id || transaction.tx?.h || '' });
          
          // Display the parsed data in the logs
          if (parsedData.is_vote === 'true') {
            this.log_info('🗳️ VOTE POST DETECTED', { 
              question: parsedData.content,
              options: parsedData.vote_options?.map((opt: { content: string }) => opt.content).join(', ') || '',
              timestamp: new Date().toISOString()
            });
          } else {
            this.log_info('📝 TEXT POST DETECTED', { 
              content: parsedData.content,
              timestamp: new Date().toISOString()
            });
          }
          
          // Set action type based on parsed data
          if (parsedData.is_vote === 'true') {
            actionType = LockActionType.VOTE;
            isVote = true;
          } else {
            actionType = LockActionType.POST;
          }
          
          // Set other fields from parsed data
          content = parsedData.content || '';
          postId = parsedData.post_id || '';
          voteOptions = parsedData.vote_options || [];
          optionsHash = parsedData.options_hash || '';
          parentSequence = parsedData.parent_sequence || '';
          sequence = parsedData.sequence || '';
          timestamp = parsedData.timestamp || '';
          type = parsedData.type || '';
          rawData = parsedData;
        }
      } else {
        // Legacy parsing for JungleBus format
        for (const output of outputs) {
          const script = output.s2 || '';
          
          // Extract action type
          if (script.includes('lock:post')) {
            actionType = LockActionType.POST;
          } else if (script.includes('lock:like')) {
            actionType = LockActionType.LIKE;
          } else if (script.includes('lock:vote')) {
            actionType = LockActionType.VOTE;
            isVote = true;
          } else if (script.includes('lock:comment')) {
            actionType = LockActionType.COMMENT;
          }
          
          // Extract content
          const contentMatch = script.match(/content:([^|]+)/);
          if (contentMatch) {
            content = contentMatch[1].trim();
          }
          
          // Extract post ID for likes, votes, and comments
          const postIdMatch = script.match(/post_id:([^|]+)/);
          if (postIdMatch) {
            postId = postIdMatch[1].trim();
          }
          
          // Extract author identity
          const authorMatch = script.match(/author:([^|]+)/);
          if (authorMatch) {
            authorIdentity = authorMatch[1].trim();
          }
          
          // Extract vote options
          const voteOptionsMatch = script.match(/options:([^|]+)/);
          if (voteOptionsMatch) {
            const optionsString = voteOptionsMatch[1].trim();
            const options = optionsString.split(',');
            
            voteOptions = options.map((option: string, index: number) => ({
              tx_id: `${transaction.tx?.h || transaction.id}_${index}`,
              content: option.trim(),
              option_index: index
            }));
          }
        }
      }
      
      // Ensure we have the minimum required data
      if (actionType === LockActionType.UNKNOWN) {
        return null;
      }
      
      return {
        action: actionType,
        content: content || undefined,
        post_id: postId || undefined,
        author_address: authorIdentity,
        vote_options: voteOptions.length > 0 ? voteOptions : undefined,
        raw_data: rawData,
        is_vote: isVote,
        options_hash: optionsHash || undefined,
        parent_sequence: parentSequence || undefined,
        sequence: sequence || undefined,
        timestamp: timestamp || undefined,
        type: type || undefined
      };
    } catch (error) {
      this.log_error('Error extracting Lock protocol data', error as Error);
      return null;
    }
  }
  
  /**
   * Process Lock protocol data and save to database
   * @param transactionId The transaction ID
   * @param lockData The Lock protocol data to process
   * @param timestamp The timestamp of the transaction
   */
  private async process_lock_data(
    transactionId: string,
    lockData: LockProtocolData,
    timestamp: Date
  ): Promise<void> {
    try {
      switch (lockData.action) {
        case LockActionType.POST:
          await this.process_post(transactionId, lockData, timestamp);
          break;
          
        case LockActionType.LIKE:
          await this.process_like(transactionId, lockData, timestamp);
          break;
          
        case LockActionType.VOTE:
          await this.process_vote(transactionId, lockData, timestamp);
          break;
          
        case LockActionType.COMMENT:
          await this.process_comment(transactionId, lockData, timestamp);
          break;
          
        default:
          this.log_warning('Unknown Lock action type', {
            transaction_id: transactionId,
            action: lockData.action
          });
      }
    } catch (error) {
      this.log_error('Error processing Lock protocol data', error as Error, {
        transaction_id: transactionId,
        action: lockData.action
      });
    }
  }
  
  /**
   * Process a Lock post action
   * @param transactionId The transaction ID
   * @param lockData The Lock protocol data
   * @param timestamp The timestamp of the transaction
   */
  private async process_post(
    transactionId: string,
    lockData: LockProtocolData,
    timestamp: Date
  ): Promise<void> {
    if (!lockData.content) {
      this.log_warning('Missing content for post action', {
        transaction_id: transactionId
      });
      return;
    }
    
    try {
      // Create post in database
      const post = await db_client.create_post({
        tx_id: transactionId,
        content: lockData.content,
        author_address: lockData.author_address,
        created_at: timestamp,
        vote_options: lockData.vote_options?.map(option => ({
          tx_id: option.tx_id,
          content: option.content,
          option_index: option.option_index,
          created_at: timestamp
        }))
      });
      
      this.log_info('Created post', {
        tx_id: transactionId,
        post_id: post.id
      });
    } catch (error) {
      this.log_error('Error creating post', error as Error, {
        tx_id: transactionId
      });
    }
  }
  
  /**
   * Process a Lock like action
   * @param transactionId The transaction ID
   * @param lockData The Lock protocol data
   * @param timestamp The timestamp of the transaction
   */
  private async process_like(
    transactionId: string,
    lockData: LockProtocolData,
    timestamp: Date
  ): Promise<void> {
    if (!lockData.post_id) {
      this.log_warning('Missing post ID for like action', {
        tx_id: transactionId
      });
      return;
    }
    
    try {
      // Create lock like in database
      const lockLike = await db_client.create_lock_like({
        tx_id: transactionId,
        post_id: lockData.post_id,
        author_address: lockData.author_address,
        created_at: timestamp
      });
      
      this.log_info('Created lock like', {
        tx_id: transactionId,
        like_id: lockLike.id
      });
    } catch (error) {
      this.log_error('Error creating lock like', error as Error, {
        tx_id: transactionId,
        post_id: lockData.post_id
      });
    }
  }
  
  /**
   * Process a Lock vote action
   * @param transactionId The transaction ID
   * @param lockData The Lock protocol data
   * @param timestamp The timestamp of the transaction
   */
  private async process_vote(
    transactionId: string,
    lockData: LockProtocolData,
    timestamp: Date
  ): Promise<void> {
    // Early return if missing required data
    if (!lockData.content) {
      this.log_warning('Missing content for vote action', {
        transaction_id: transactionId
      });
      return;
    }
    
    if (!lockData.vote_options || lockData.vote_options.length === 0) {
      this.log_warning('Missing vote options for vote action', {
        transaction_id: transactionId
      });
      return;
    }
    
    // Validate author address
    if (!lockData.author_address) {
      this.log_warning('Missing author address for vote action', {
        transaction_id: transactionId
      });
      return;
    }
    
    try {
      // Prepare vote options with consistent timestamps
      const voteOptions = lockData.vote_options.map(option => ({
        tx_id: option.tx_id,
        content: option.content,
        option_index: option.option_index,
        created_at: timestamp,
        author_address: lockData.author_address
      }));
      
      // Create vote post in database
      const votePost = await db_client.create_post({
        tx_id: transactionId,
        content: lockData.content,
        author_address: lockData.author_address,
        created_at: timestamp,
        is_vote: true,
        vote_options: voteOptions
      });
      
      this.log_info('Created vote post', {
        tx_id: transactionId,
        post_id: votePost.id,
        option_count: voteOptions.length
      });
    } catch (error) {
      // Handle unique constraint violations separately
      if (error instanceof Error && error.message.includes('Unique constraint failed')) {
        this.log_info('Vote post already exists', {
          tx_id: transactionId
        });
        return;
      }
      
      this.log_error('Error creating vote post', error as Error, {
        tx_id: transactionId
      });
    }
  }
  
  /**
   * Process a Lock comment action
   * @param transactionId The transaction ID
   * @param lockData The Lock protocol data
   * @param timestamp The timestamp of the transaction
   */
  private async process_comment(
    transactionId: string,
    _lockData: LockProtocolData,
    _timestamp: Date
  ): Promise<void> {
    // TODO: Implement comment processing
    this.log_info('Comment processing not yet implemented', {
      tx_id: transactionId
    });
  }
  /**
   * Parse ORD outputs from transaction
   * @param outputs Array of hex-encoded outputs
   * @param txId Transaction ID
   * @returns Parsed data including content and vote options
   */
  private parse_ord_outputs(outputs: string[], txId: string): Record<string, any> {
    try {
      // Initialize result object
      const result: Record<string, any> = {
        vote_options: []
      };
      
      // Process each output
      for (let i = 0; i < outputs.length; i++) {
        const output = outputs[i];
        
        // Skip non-ORD outputs
        if (!output.startsWith('0063036f7264')) {
          continue;
        }
        
        // Parse the ORD output
        const parsedOutput = this.parse_ord_output(output);
        
        if (!parsedOutput) {
          continue;
        }
        
        // If this is a vote option
        if (parsedOutput.is_vote === 'true' && parsedOutput.optionIndex) {
          result.vote_options.push({
            tx_id: `${txId}_${parsedOutput.optionIndex}`,
            content: parsedOutput.content || '',
            option_index: parseInt(parsedOutput.optionIndex)
          });
        }
        
        // If this is the main post/question
        if ((parsedOutput.is_vote === 'true' || parsedOutput.is_vote === 'false') && 
            !parsedOutput.optionIndex) {
          // Copy all properties to result
          Object.assign(result, parsedOutput);
        }
      }
      
      return result;
    } catch (error) {
      this.log_error('Error parsing ORD outputs', error as Error);
      return { vote_options: [] };
    }
  }
  
  /**
   * Parse a single ORD output
   * @param output Hex-encoded output
   * @returns Parsed data or null if parsing fails
   */
  private parse_ord_output(output: string): Record<string, any> | null {
    try {
      // Find the MAP data section
      const mapStart = output.indexOf('0353455403617070');
      if (mapStart === -1) {
        return null;
      }
      
      // Extract the text content from the ORD output
      const contentStart = output.indexOf('510a746578742f706c61696e00');
      if (contentStart === -1) {
        return null;
      }
      
      // The content length is encoded right after the content type
      const contentLengthHex = output.substring(contentStart + 24, contentStart + 26);
      const contentLength = parseInt(contentLengthHex, 16);
      
      // Extract the content
      const contentHex = output.substring(contentStart + 26, contentStart + 26 + contentLength * 2);
      const content = hexToUtf8(contentHex);
      
      // Parse the MAP data
      const mapSection = output.substring(mapStart);
      
      // Parse key-value pairs
      const keyValuePairs = this.extract_key_value_pairs(mapSection);
      
      // Add content and key-value pairs to result
      return {
        content,
        ...keyValuePairs
      };
    } catch (error) {
      this.log_error('Error parsing ORD output', error as Error);
      return null;
    }
  }
  
  /**
   * Extract key-value pairs from MAP data
   * @param mapSection Hex-encoded MAP section
   * @returns Object with key-value pairs
   */
  private extract_key_value_pairs(mapSection: string): Record<string, string> {
    const result: Record<string, string> = {};
    
    // Known keys to look for
    const keys = [
      'app',
      'content',
      'is_locked',
      'is_vote',
      'options_hash',
      'optionIndex',
      'parentSequence',
      'post_id',
      'sequence',
      'tags',
      'timestamp',
      'type'
    ];
    
    for (const key of keys) {
      try {
        // Convert key to hex
        const keyHex = Buffer.from(key).toString('hex');
        const keyIndex = mapSection.indexOf(keyHex);
        
        if (keyIndex !== -1) {
          // Find the value length (it's encoded as a single byte before the value)
          const valueLengthHex = mapSection.substring(keyIndex + keyHex.length, keyIndex + keyHex.length + 2);
          const valueLength = parseInt(valueLengthHex, 16);
          
          // Extract the value
          const valueHex = mapSection.substring(
            keyIndex + keyHex.length + 2, 
            keyIndex + keyHex.length + 2 + valueLength * 2
          );
          const value = hexToUtf8(valueHex);
          
          // Add to result
          result[key] = value;
        }
      } catch (error) {
        this.log_warning(`Error extracting key-value pair for key: ${key}`, { error: (error as Error).message });
      }
    }
    
    return result;
  }
}

// Export singleton instance
export const lock_protocol_parser = new LockProtocolParser();

// Export default for inheritance
export default LockProtocolParser;
