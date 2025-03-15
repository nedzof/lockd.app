/**
 * Transaction Parser
 * 
 * Fetches transaction data from JungleBus API and parses outputs using bmapjs to extract readable content
 */

import axios from 'axios';
import { BMAP } from 'bmapjs';
import logger from './logger.js';
import { CONFIG } from './config.js';

// Import types from shared/types.ts
import type { LockProtocolData } from '../shared/types.js';

// Type Definitions
export interface TransactionOutput {
  hex: string;
  content?: string;
  metadata: LockProtocolData;
  type?: string;
  isValid: boolean;
}

export interface ParsedTransaction {
  txId: string;
  outputs: TransactionOutput[];
  timestamp?: string;
  blockHeight?: number;
}

/**
 * Transaction Parser class
 * Handles fetching and parsing Bitcoin transactions
 */
export class TxParser {
  protected baseUrl: string;
  protected apiKey?: string;
  protected bmap: BMAP;
  
  constructor() {
    this.baseUrl = CONFIG.JUNGLEBUS_URL;
    this.apiKey = CONFIG.JUNGLEBUS_API_KEY;
    this.bmap = new BMAP();
    logger.info('Transaction Parser initialized with bmapjs');
  }

  /**
   * Fetches transaction data from JungleBus API
   */
  async fetch_transaction(txId: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/transaction/get/${txId}`;
      const headers: Record<string, string> = {};
      
      if (this.apiKey) {
        headers['Authorization'] = this.apiKey;
      }
      
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        logger.warn(`Transaction ${txId} not found in API`);
        return null;
      }
      
      logger.error(`Failed to fetch transaction ${txId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Checks if a transaction output contains lockd.app data
   */
  is_valid_output(output: any): boolean {
    if (!output) return false;
    
    // Get the hex script
    const outputHex = typeof output === 'string' ? output : output.s || output.script || '';
    
    if (!outputHex || outputHex.length < 10) return false;
    
    const lowerOutput = outputHex.toLowerCase();
    
    // Skip standard P2PKH payment outputs without additional data
    if (lowerOutput.startsWith('76a914') && lowerOutput.endsWith('88ac') && lowerOutput.length < 50) {
      return false;
    }
    
    // Check specifically for lockd.app pattern
    return lowerOutput.includes('6c6f636b642e617070'); // 'lockd.app' in hex
  }
  
  /**
   * Parse transaction data
   */
  async parse_transaction_data(txData: any): Promise<ParsedTransaction> {
    try {
      const txId = txData?.tx?.h || txData?.hash || txData?.id || txData?.tx_id;
      
      if (!txId) {
        throw new Error('Transaction ID not found in transaction data');
      }
      
      // Extract outputs from transaction data
      const txOutputs = this.extract_outputs_from_tx_data(txData);
      const outputs: TransactionOutput[] = [];
      
      // Process each output
      for (const output of txOutputs) {
        // Check if it's a valid lockd.app output
        const isValid = this.is_valid_output(output);
        
        // Process only valid outputs
        if (isValid) {
          try {
            // Parse output with our extraction methods
            const parsed = await this.parse_output(output);
            outputs.push({
              hex: output,
              content: parsed.content,
              metadata: parsed.metadata,
              type: parsed.type,
              isValid: true
            });
          } catch (parseError: unknown) {
            const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
            logger.error(`Failed to parse output: ${errorMessage}`);
            outputs.push({
              hex: output,
              metadata: {} as LockProtocolData,
              isValid: false
            });
          }
        } else {
          // Add invalid output to the list
          outputs.push({
            hex: output,
            metadata: {} as LockProtocolData,
            isValid: false
          });
        }
      }
      
      return {
        txId,
        outputs,
        blockHeight: txData.block_height || txData.height,
        timestamp: this.extract_timestamp(txData)
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to parse transaction data: ${errorMessage}`);
      return {
        txId: txData?.tx?.h || 'unknown',
        outputs: [],
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Extract timestamp from transaction data
   */
  private extract_timestamp(txData: any): string {
    if (txData.block_time) {
      return new Date(txData.block_time * 1000).toISOString();
    } 
    if (txData.time) {
      return new Date(txData.time * 1000).toISOString();
    }
    return new Date().toISOString();
  }
  
  /**
   * Extracts outputs from raw transaction data
   */
  extract_outputs_from_tx_data(txData: any): string[] {
    const outputs: string[] = [];
    
    if (txData?.tx?.out && Array.isArray(txData.tx.out)) {
      txData.tx.out.forEach((out: any) => {
        if (out.s) outputs.push(out.s);
        else if (out.script) outputs.push(out.script);
      });
    } else if (txData?.outputs && Array.isArray(txData.outputs)) {
      outputs.push(...txData.outputs);
    } else if (txData?.out && Array.isArray(txData.out)) {
      txData.out.forEach((out: any) => {
        if (typeof out === 'string') outputs.push(out);
        else if (out.s) outputs.push(out.s);
        else if (out.script) outputs.push(out.script);
      });
    }
    
    return outputs;
  }
  
  /**
   * Extract key-value pairs from hex
   */
  private extract_key_value_pairs(hexString: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lowerHex = hexString.toLowerCase();
    
    // Common keys in the protocol (converted to hex)
    const keys = {
      'app': '617070',  // 'app' in hex
      'type': '74797065',  // 'type' in hex
      'content': '636f6e74656e74',  // 'content' in hex
      'post_id': '706f73745f6964',  // 'post_id' in hex
      'timestamp': '74696d657374616d70',  // 'timestamp' in hex
      'is_vote': '69735f766f7465',  // 'is_vote' in hex
      'is_locked': '69735f6c6f636b6564',  // 'is_locked' in hex
      'sequence': '73657175656e6365',  // 'sequence' in hex
      'parent_sequence': '706172656e7453657175656e6365',  // 'parentSequence' in hex
      'tags': '74616773',  // 'tags' in hex
      'total_options': '746f74616c5f6f7074696f6e73',  // 'total_options' in hex
      'options_hash': '6f7074696f6e735f68617368',  // 'options_hash' in hex
      'lock_amount': '6c6f636b5f616d6f756e74',  // 'lock_amount' in hex
      'lock_duration': '6c6f636b5f6475726174696f6e',  // 'lock_duration' in hex
      'option_index': '6f7074696f6e496e646578',  // 'optionIndex' in hex
      'content_type': '636f6e74656e745f74797065',  // 'content_type' in hex
      'media_type': '6d656469615f74797065',  // 'media_type' in hex
      'version': '76657273696f6e',  // 'version' in hex
    };
    
    // Look for each key in the hex
    for (const [key, hexKey] of Object.entries(keys)) {
      if (lowerHex.includes(hexKey)) {
        const pos = lowerHex.indexOf(hexKey);
        if (pos >= 0) {
          // Extract value after the key
          const valueHex = lowerHex.substring(pos + hexKey.length);
          const valueText = this.decode_hex_to_utf8(valueHex);
          
          // Find end of value (next non-printable char or field)
          const endPos = valueText.search(/[\x00-\x1F\x7F]/);
          const value = endPos > 0 ? valueText.substring(0, endPos) : valueText;
          result[key] = value.trim();
        }
      }
    }
    
    return result;
  }
  
  /**
   * Parse a script output
   */
  async parse_output(outputHex: string): Promise<{
    content?: string;
    type?: string;
    metadata: LockProtocolData;
  }> {
    try {
      const cleanHex = outputHex.toLowerCase();
      let metadata = {} as LockProtocolData;
      let content = '';
      let type = undefined;
      
      // Extract data from OP_RETURN
      if (cleanHex.includes('6a')) { // OP_RETURN opcode is 0x6a
        // Find position of OP_RETURN
        const opReturnPos = cleanHex.indexOf('6a');
        if (opReturnPos >= 0) {
          // Extract everything after OP_RETURN
          const opReturnData = cleanHex.substring(opReturnPos + 2);
          
          // Check for lockd.app signature
          if (opReturnData.includes('6c6f636b642e617070')) { // 'lockd.app' in hex
            type = 'lockd';
            
            // Extract all key-value pairs
            const keyValuePairs = this.extract_key_value_pairs(opReturnData);
            
            // Process content - try to extract clean content
            if (keyValuePairs.content) {
              content = this.extract_clean_content(keyValuePairs.content);
            } else {
              // If no content key found, try to extract content from the beginning
              content = this.extract_clean_content(this.decode_hex_to_utf8(opReturnData));
            }
            
            // Build metadata object based on LockProtocolData interface
            metadata = this.build_metadata(keyValuePairs, content);
          }
        }
      }
      
      return {
        content,
        type,
        metadata
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error parsing output: ${errorMessage}`);
      return { metadata: {} as LockProtocolData };
    }
  }
  
  /**
   * Extract clean content by removing metadata markers
   */
  private extract_clean_content(rawContent: string): string {
    if (!rawContent) return '';
    
    // Common metadata markers to clean up
    const metadataMarkers = [
      'is_locked', 'is_vote', 'post_id', 'timestamp', 'type', 'version',
      'sequence', 'parentSequence', 'tags', 'content_type', 'optionIndex',
      'option_index', 'options_hash', 'total_options', 'contentType',
      'imageHeight', 'imageWidth', 'imageSize', 'format'
    ];
    
    // First, remove any non-alphanumeric characters at the beginning of the content
    // This handles leading characters like 1, 9, -, ), / etc. that appear in ord payloads
    let cleanContent = rawContent.trim().replace(/^[^a-zA-Z0-9\s"']+/, '');
    
    // If content appears to start with a single digit or special char followed by text,
    // it's likely an unwanted prefix (common in ord payloads)
    cleanContent = cleanContent.replace(/^[0-9\-\)\/@\+\*\!\~\^]{1}([A-Z])/, '$1');
    
    // Remove metadata markers from content
    for (const marker of metadataMarkers) {
      const markerPos = cleanContent.indexOf(marker);
      if (markerPos > 0) {
        cleanContent = cleanContent.substring(0, markerPos).trim();
      }
    }
    
    // If content has true/false immediately after it, remove that too
    const truePos = cleanContent.indexOf('true');
    if (truePos > 0) {
      cleanContent = cleanContent.substring(0, truePos).trim();
    }
    
    const falsePos = cleanContent.indexOf('false');
    if (falsePos > 0) {
      cleanContent = cleanContent.substring(0, falsePos).trim();
    }
    
    return cleanContent;
  }
  
  /**
   * Build metadata object based on LockProtocolData interface
   */
  private build_metadata(keyValuePairs: Record<string, string>, content: string): LockProtocolData {
    const metadata: Partial<LockProtocolData> = {
      content: content
    };
    
    // Map extracted fields to metadata
    if (keyValuePairs.post_id) {
      // Extract just the ID pattern without additional data
      // Lockd post_ids are typically in format: XXXXXXXX-XXXXXXXXXX
      const postIdMatch = keyValuePairs.post_id.match(/^([a-z0-9]{6,8}-[a-z0-9]{6,10})/i);
      metadata.post_id = postIdMatch ? postIdMatch[1] : keyValuePairs.post_id.substring(0, 16); // Take just first part if no match
    }
    
    // Boolean fields
    if (keyValuePairs.is_vote !== undefined) {
      metadata.is_vote = keyValuePairs.is_vote.toLowerCase() === 'true';
    }
    
    if (keyValuePairs.is_locked !== undefined) {
      metadata.is_locked = keyValuePairs.is_locked.toLowerCase() === 'true';
    }
    
    // Numeric fields
    if (keyValuePairs.lock_amount) {
      const numMatch = keyValuePairs.lock_amount.match(/^(\d+)/);
      if (numMatch) {
        metadata.lock_amount = parseInt(numMatch[1], 10);
      }
    }
    
    if (keyValuePairs.lock_duration) {
      const numMatch = keyValuePairs.lock_duration.match(/^(\d+)/);
      if (numMatch) {
        metadata.lock_duration = parseInt(numMatch[1], 10);
      }
    }
    
    if (keyValuePairs.total_options) {
      const numMatch = keyValuePairs.total_options.match(/^(\d+)/);
      if (numMatch) {
        metadata.total_options = parseInt(numMatch[1], 10);
      }
    }
    
    // Array fields
    if (keyValuePairs.tags) {
      try {
        metadata.tags = JSON.parse(keyValuePairs.tags);
      } catch {
        metadata.tags = [];
      }
    }
    
    // Other fields
    if (keyValuePairs.options_hash) {
      // Clean up @ prefix if present
      metadata.options_hash = keyValuePairs.options_hash.replace(/^@/, '');
    }
    
    if (keyValuePairs.content_type) {
      metadata.content_type = keyValuePairs.content_type;
    }
    
    if (keyValuePairs.timestamp) {
      // Validate and clean up the timestamp format
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
      if (isoDateRegex.test(keyValuePairs.timestamp)) {
        metadata.created_at = new Date(keyValuePairs.timestamp);
      } else {
        // Try to parse a partial timestamp
        try {
          const cleanedTimestamp = this.format_timestamp(keyValuePairs.timestamp);
          metadata.created_at = new Date(cleanedTimestamp);
        } catch (e) {
          // If we can't parse the timestamp, don't set it
        }
      }
    }
    
    return metadata as LockProtocolData;
  }
  
  /**
   * Format a possibly malformed timestamp into ISO format
   */
  private format_timestamp(timestamp: string): string {
    // If timestamp appears to be just a year
    if (/^20\d{2}$/.test(timestamp)) {
      return `${timestamp}-01-01T00:00:00Z`;
    }
    
    // If timestamp appears to be year and month
    if (/^20\d{2}-\d{2}$/.test(timestamp)) {
      return `${timestamp}-01T00:00:00Z`;
    }
    
    // If timestamp appears to be a date with no time
    if (/^20\d{2}-\d{2}-\d{2}$/.test(timestamp)) {
      return `${timestamp}T00:00:00Z`;
    }
    
    // If timestamp appears to be a date with partial time
    if (/^20\d{2}-\d{2}-\d{2}T\d{2}(:\d{2})?$/.test(timestamp)) {
      // Add seconds if missing
      if (timestamp.split(':').length === 1) {
        return `${timestamp}:00:00Z`;
      } else {
        return `${timestamp}:00Z`;
      }
    }
    
    // If timestamp appears to be a date with time but no Z
    if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(timestamp)) {
      return `${timestamp}Z`;
    }
    
    // If timestamp appears to be complete but missing milliseconds
    if (/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) {
      return timestamp;
    }
    
    // Return as is for any other case
    return timestamp;
  }
  
  /**
   * Decodes hex data to UTF-8 string
   */
  decode_hex_to_utf8(hex: string): string {
    try {
      const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
      const buffer = Buffer.from(cleanHex, 'hex');
      return buffer.toString('utf8');
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Parse a single transaction by ID
   */
  async parse_transaction(txId: string): Promise<ParsedTransaction> {
    try {
      const txData = await this.fetch_transaction(txId);
      
      if (!txData) {
        return {
          txId,
          outputs: [],
          timestamp: new Date().toISOString()
        };
      }
      
      return await this.parse_transaction_data(txData);
    } catch (error: any) {
      logger.error(`Failed to parse transaction ${txId}: ${error.message}`);
      return {
        txId,
        outputs: [],
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Process multiple transactions sequentially
   */
  async parse_transactions(txIds: string[]): Promise<ParsedTransaction[]> {
    if (txIds.length === 0) return [];
    
    logger.info(`Processing ${txIds.length} transactions`);
    
    const results: ParsedTransaction[] = [];
    for (const txId of txIds) {
      try {
        results.push(await this.parse_transaction(txId));
      } catch (error: any) {
        logger.error(`Error processing transaction ${txId}: ${error.message}`);
        results.push({
          txId,
          outputs: [],
          timestamp: new Date().toISOString()
        });
      }
    }
    return results;
  }
}

/**
 * Utility function to decode hex string to UTF-8
 */
export function decode_hex_string(hex: string): string {
  try {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const buffer = Buffer.from(cleanHex, 'hex');
    return buffer.toString('utf8');
  } catch (error) {
    return '';
  }
}

// Export singleton instance
export const tx_parser = new TxParser();
