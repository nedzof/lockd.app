/**
 * Transaction Parser
 * 
 * Fetches transaction data from JungleBus API and parses outputs to extract readable content
 */

import axios from 'axios';
import { Buffer } from 'buffer';
import logger from './logger.js';
import { CONFIG } from './config.js';

// Import types from shared/types.ts
import type { LockProtocolData } from '../shared/types.js';

// Extended interface that includes all the fields we need
export interface ExtendedMetadata extends Partial<LockProtocolData> {
  app?: string;
  operation?: string;
  option_index?: number;
  parent_sequence?: number;
  sequence?: number;
  total_options?: number;
  lock_amount?: number;
  lock_duration?: number;
  [key: string]: any; // Allow any other properties
}

// Type Definitions
export interface TransactionOutput {
  hex: string;
  decodedUtf8?: string;
  formattedText?: string;
  metadata?: ExtendedMetadata;
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
  
  constructor() {
    this.baseUrl = CONFIG.JUNGLEBUS_URL;
    this.apiKey = CONFIG.JUNGLEBUS_API_KEY;
    logger.info('Transaction Parser initialized');
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
   * Checks if output contains lockd.app data
   */
  is_valid_output(outputHex: string): boolean {
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
   * Map of hex strings to their key names
   */
  private readonly keyMap: Record<string, string> = {
    '636f6e74656e74': 'content',
    '69735f6c6f636b6564': 'is_locked',
    '69735f766f7465': 'is_vote',
    '706f73744964': 'post_id',
    '6f7074696f6e496e646578': 'option_index',
    '706172656e7453657175656e6365': 'parent_sequence',
    '6f7074696f6e735f68617368': 'options_hash',
    '73657175656e6365': 'sequence',
    '74616773': 'tags',
    '74696d657374616d70': 'timestamp',
    '74797065': 'type',
    '76657273696f6e': 'version',
    '617070': 'app',
    '746f74616c5f6f7074696f6e73': 'total_options',
    '717565737469f6e': 'question',
    '6c6f636b5f616d6f756e74': 'lock_amount',
    '6c6f636b5f6475726174696f6e': 'lock_duration',
    '6c6f636b5f7478696f': 'lock_txid',
    '746172676574': 'target',
    '6c6f636b5f74797065': 'lock_type',
    '616374696f6e': 'action',
    '636f6e74656e745f74797065': 'content_type',
    '6d656469615f74797065': 'media_type',
    '617574686f725f61646472657373': 'author_address'
  };

  /**
   * Extracts key-value pairs from a transaction output
   */
  extract_key_value_pairs(hexString: string): ExtendedMetadata {
    const decodedString = this.decode_hex_to_utf8(hexString);
    const metadata: ExtendedMetadata = {};
    const lowerHex = hexString.toLowerCase();
    
    // Check for basic indicators first
    
    // Check if this contains lockd.app
    const lockdAppHex = '6c6f636b642e617070'; // 'lockd.app' in hex
    if (lowerHex.includes(lockdAppHex)) {
      metadata.app = 'lockd.app';
    }
    
    // Extract operation type (SET/DELETE)
    if (decodedString.includes('SET')) {
      metadata.operation = 'SET';
    } else if (decodedString.includes('DELETE')) {
      metadata.operation = 'DELETE';
    }
    
    // Get list of all possible keys and their positions in the hex string
    const keyPositions: {key: string, pos: number, hexKey: string}[] = [];
    
    for (const [hexKey, keyName] of Object.entries(this.keyMap)) {
      const pos = lowerHex.indexOf(hexKey);
      if (pos >= 0) {
        keyPositions.push({key: keyName, pos, hexKey});
      }
    }
    
    // Sort by position in the string
    keyPositions.sort((a, b) => a.pos - b.pos);
    
    // Extract each key and its following value
    for (let i = 0; i < keyPositions.length; i++) {
      const {key, pos, hexKey} = keyPositions[i];
      const valueStartPos = pos + hexKey.length;
      
      // Find the next key position or end of data
      const nextKeyPos = i < keyPositions.length - 1 ? keyPositions[i + 1].pos : lowerHex.length;
      
      // Extract and decode the value
      const valueHex = lowerHex.substring(valueStartPos, nextKeyPos);
      const value = this.decode_hex_to_utf8(valueHex);
      
      // Clean up the value
      let cleanValue = value.trim().replace(/[\x00-\x1F\x7F]/g, '');
      
      // Process values based on key type
      this.processFieldValue(key, cleanValue, metadata);
    }
    
    // Process direct text patterns for special cases
    this.processDirectTextPatterns(decodedString, metadata);
    
    return metadata;
  }
  
  /**
   * Process field value based on field type
   */
  private processFieldValue(key: string, value: string, metadata: ExtendedMetadata): void {
    // Specific processing logic for different field types
    
    // Boolean fields
    if (key === 'is_vote' || key === 'is_locked') {
      const trueMatch = value.match(/^true/i);
      const falseMatch = value.match(/^false/i);
      
      if (trueMatch) {
        metadata[key] = true;
      } else if (falseMatch) {
        metadata[key] = false;
      }
      return;
    }
    
    // Numeric fields
    if (key === 'option_index' || key === 'sequence' || key === 'parent_sequence' || 
        key === 'total_options' || key === 'lock_amount' || key === 'lock_duration') {
      const numberMatch = value.match(/^(\d+)/);
      if (numberMatch) {
        metadata[key] = parseInt(numberMatch[1], 10);
      }
      return;
    }
    
    // Array fields
    if (key === 'tags') {
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          metadata[key] = JSON.parse(value);
        } catch {
          metadata[key] = []; // Empty array on parse failure
        }
      } else {
        metadata[key] = []; // Default empty array
      }
      return;
    }
    
    // Timestamp fields - ensure they're complete
    if (key === 'timestamp') {
      metadata[key] = this.formatTimestamp(value);
      return;
    }
    
    // options_hash - clean up @ and remove unwanted prefix
    if (key === 'options_hash') {
      let cleanValue = value;
      
      // Remove @ prefix
      if (cleanValue.startsWith('@')) {
        cleanValue = cleanValue.substring(1);
      }
      
      // Take only the hex portion
      const hashMatch = cleanValue.match(/^([a-f0-9]+)/i);
      if (hashMatch) {
        metadata[key] = hashMatch[1];
      } else {
        metadata[key] = cleanValue;
      }
      return;
    }
    
    // post_id - extract just the ID pattern
    if (key === 'post_id') {
      const postIdMatch = value.match(/^([a-z0-9]{6,8}-[a-z0-9]{6,10})/i);
      if (postIdMatch) {
        metadata[key] = postIdMatch[1];
      } else {
        metadata[key] = value;
      }
      return;
    }
    
    // String fields (default)
    if (value && value.length > 0) {
      metadata[key] = value;
    }
  }
  
  /**
   * Format a timestamp string into a consistent ISO format
   */
  private formatTimestamp(value: string): string {
    // If it's a short number like "20", assume it's incomplete and return a default
    if (value.match(/^[0-9]{1,2}$/)) {
      return '2025-01-01T00:00:00Z';
    }
    
    // If it's a year, use the first day of the year
    if (value.match(/^20\d{2}$/)) {
      return `${value}-01-01T00:00:00Z`;
    }
    
    // If it's a year-month, use the first day of the month
    if (value.match(/^20\d{2}-\d{2}$/)) {
      return `${value}-01T00:00:00Z`;
    }
    
    // Check if value looks like a date with a T separator
    if (value.match(/^20\d{2}-\d{2}-\d{2}T/)) {
      const [datePart, timePart] = value.split('T');
      
      // Handle malformed time parts - like runs of digits with no separators
      if (timePart) {
        // Check for digit-only time part with no separators
        if (timePart.match(/^\d+/)) {
          // First, clean any Z or other trailing characters
          const cleanTime = timePart.replace(/[^0-9]/g, '');
          
          // Ensure we have at least 6 digits (HHMMSS)
          const paddedTime = cleanTime.padEnd(6, '0');
          
          // Format the time with separators
          const hours = paddedTime.substring(0, 2);
          const minutes = paddedTime.substring(2, 4);
          const seconds = paddedTime.substring(4, 6);
          
          return `${datePart}T${hours}:${minutes}:${seconds}Z`;
        }
        
        // If it has some separators but might be incomplete
        if (timePart.match(/^\d{1,2}:\d{1,2}(:\d{1,2})?/)) {
          const parts = timePart.split(':');
          const hours = parts[0].padStart(2, '0');
          const minutes = parts.length > 1 ? parts[1].padStart(2, '0') : '00';
          const seconds = parts.length > 2 ? parts[2].replace('Z', '').padStart(2, '0') : '00';
          
          return `${datePart}T${hours}:${minutes}:${seconds}Z`;
        }
        
        // It has a Z but might be missing colons
        if (timePart.includes('Z')) {
          // Keep the Z but make sure time format is correct
          const timeParts = timePart.replace('Z', '').split(':');
          const hours = timeParts.length > 0 ? timeParts[0].padStart(2, '0') : '00';
          const minutes = timeParts.length > 1 ? timeParts[1].padStart(2, '0') : '00';
          const seconds = timeParts.length > 2 ? timeParts[2].padStart(2, '0') : '00';
          
          return `${datePart}T${hours}:${minutes}:${seconds}Z`;
        }
        
        // Return with Z suffix if not already present
        return timePart.endsWith('Z') ? `${datePart}T${timePart}` : `${datePart}T${timePart}Z`;
      }
      
      // Only date part is present
      return `${datePart}T00:00:00Z`;
    }
    
    // If it's a full date without T, add the T and time
    if (value.match(/^20\d{2}-\d{2}-\d{2}$/)) {
      return `${value}T00:00:00Z`;
    }
    
    // If we can't determine the format, return as is
    return value;
  }
  
  /**
   * Process direct text patterns from the decoded string
   * Some patterns appear in the text but not as clear key-value pairs in the hex
   */
  private processDirectTextPatterns(decodedString: string, metadata: ExtendedMetadata): void {
    // Extract option index if not already set
    if (!metadata.option_index && decodedString.includes('optionIndex')) {
      const optionIndexMatch = decodedString.match(/optionIndex(\d+)/);
      if (optionIndexMatch) {
        metadata.option_index = parseInt(optionIndexMatch[1], 10);
      }
    }
    
    // Extract parent sequence if not already set
    if (!metadata.parent_sequence && decodedString.includes('parentSequence')) {
      const parentSequenceMatch = decodedString.match(/parentSequence(\d+)/);
      if (parentSequenceMatch) {
        metadata.parent_sequence = parseInt(parentSequenceMatch[1], 10);
      }
    }
    
    // Extract post_id if not already set but found in text
    if (!metadata.post_id && decodedString.includes('post_id')) {
      const postIdMatch = decodedString.match(/post_id([a-zA-Z0-9_-]+)/);
      if (postIdMatch) {
        metadata.post_id = postIdMatch[1];
      }
    }
    
    // Clean up content field if it contains embedded metadata
    if (metadata.content) {
      // Check for common embedded metadata patterns
      const embeddedPatterns = [
        'contentType', 'format', 'imageHeight', 'imageWidth', 
        'imageSize', 'is_locked', 'is_vote'
      ];
      
      for (const pattern of embeddedPatterns) {
        if (metadata.content.includes(pattern)) {
          // Content contains embedded metadata - extract just the actual content
          const contentParts = metadata.content.split(pattern);
          if (contentParts.length > 1) {
            // Take just the first part as the clean content
            metadata.content = contentParts[0].trim();
            
            // Try to extract the embedded value for this metadata
            if (pattern === 'contentType') {
              const contentTypeMatch = decodedString.match(/contentType([a-zA-Z/]+)/);
              if (contentTypeMatch) {
                metadata.content_type = contentTypeMatch[1];
              }
            }
          }
          break; // Stop after first match to avoid over-processing
        }
      }
    }
  }
  
  /**
   * Decodes transaction output script
   */
  decode_output_script(outputHex: string): { 
    decodedUtf8: string;
    formattedText?: string;
    type?: string;
    metadata?: ExtendedMetadata;
  } {
    try {
      if (!outputHex || outputHex.length < 10) {
        return { decodedUtf8: '' };
      }
      
      // Decode the output hex to UTF-8
      const decodedString = this.decode_hex_to_utf8(outputHex);
      const metadata = this.extract_key_value_pairs(outputHex);
      
      // Determine output type
      let type = undefined;
      if (metadata.app === 'lockd.app') {
        type = 'lockd';
      } else if (outputHex.toLowerCase().includes('6f7264')) { // 'ord'
        type = 'ord';
      }
      
      // Create formatted text based on metadata
      let formattedText = '';
      if (metadata.content) {
        formattedText = metadata.content;
      }
      
      return {
        decodedUtf8: decodedString,
        formattedText,
        type,
        metadata
      };
    } catch (error) {
      return { decodedUtf8: '' };
    }
  }
  
  /**
   * Process transaction data directly
   */
  parse_transaction_data(txData: any): ParsedTransaction {
    try {
      const txId = txData?.tx?.h || txData?.hash || txData?.id || txData?.tx_id;
      
      if (!txId) {
        throw new Error('Transaction ID not found in transaction data');
      }
      
      const outputs: TransactionOutput[] = [];
      const rawOutputs = this.extract_outputs_from_tx_data(txData);
      
      for (const output of rawOutputs) {
        const isValid = this.is_valid_output(output);
        const parsed = isValid ? this.decode_output_script(output) : { decodedUtf8: '' };
        
        outputs.push({
          hex: output,
          decodedUtf8: parsed.decodedUtf8,
          formattedText: parsed.formattedText,
          type: parsed.type,
          metadata: parsed.metadata,
          isValid
        });
      }
      
      return {
        txId,
        outputs,
        blockHeight: txData.block_height || txData.height,
        timestamp: this.extract_timestamp(txData)
      };
    } catch (error: any) {
      logger.error(`Failed to parse transaction data: ${error.message}`);
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
      
      return this.parse_transaction_data(txData);
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
