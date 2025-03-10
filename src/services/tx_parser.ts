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
  raw_image_data?: Buffer | null;
  content_type?: string;
  media_type?: string;
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
    '617574686f725f61646472657373': 'author_address',
    '696d6167655f64617461': 'raw_image_data'
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
      
      // Special handling for image data
      if (key === 'raw_image_data') {
        try {
          // First try to decode as base64
          let buffer: Buffer | null = null;
          
          // Check if the value is base64 encoded
          const isBase64 = /^[A-Za-z0-9+/=]+$/.test(valueHex);
          
          if (isBase64) {
            // If it's base64, decode directly
            buffer = Buffer.from(valueHex, 'base64');
          } else {
            // If not base64, try hex decoding as fallback
            buffer = Buffer.from(valueHex, 'hex');
          }
          
          if (buffer.length > 0) {
            metadata.raw_image_data = buffer;
            logger.info('Found raw_image_data in transaction', {
              data_length: buffer.length,
              encoding: isBase64 ? 'base64' : 'hex'
            });
          }
        } catch (error) {
          logger.error('Error processing raw_image_data:', {
            error: error instanceof Error ? error.message : String(error),
            valueHex: valueHex.substring(0, 100) + '...' // Log first 100 chars
          });
        }
        continue;
      }
      
      const value = this.decode_hex_to_utf8(valueHex);
      
      // Clean up the value
      let cleanValue = value.trim().replace(/[\x00-\x1F\x7F]/g, '');
      
      // Process values based on key type
      this.processFieldValue(key, cleanValue, metadata);
    }
    
    // Process direct text patterns for special cases
    this.processDirectTextPatterns(decodedString, metadata);
    
    // Look for image data in the hex string if not already found
    if (!metadata.raw_image_data) {
      // First check if we have content type in metadata
      const contentType = metadata.content_type?.toLowerCase();
      const mediaType = metadata.media_type?.toLowerCase();
      
      if ((contentType?.startsWith('image/') || mediaType?.startsWith('image/')) && metadata.content) {
        try {
          // Try to decode the content as base64 first
          const isBase64 = /^[A-Za-z0-9+/=]+$/.test(metadata.content);
          let buffer: Buffer | null = null;
          
          if (isBase64) {
            buffer = Buffer.from(metadata.content, 'base64');
          } else {
            // Try hex as fallback
            buffer = Buffer.from(metadata.content, 'hex');
          }
          
          if (buffer.length > 0) {
            metadata.raw_image_data = buffer;
            metadata.content_type = contentType || mediaType;
            metadata.media_type = mediaType || contentType;
            
            logger.info('Found image data from content with type', {
              content_type: metadata.content_type,
              media_type: metadata.media_type,
              data_length: buffer.length,
              encoding: isBase64 ? 'base64' : 'hex'
            });
          }
        } catch (error) {
          logger.error('Error processing image data from content:', {
            error: error instanceof Error ? error.message : String(error),
            content_type: contentType,
            media_type: mediaType
          });
        }
      } else {
        // Fallback: Try to find image data after content type markers
        const imageMarkers = [
          { type: 'image/jpeg', hex: '696d6167652f6a706567' },
          { type: 'image/png', hex: '696d6167652f706e67' },
          { type: 'image/gif', hex: '696d6167652f676966' },
          { type: 'image/webp', hex: '696d6167652f77656270' }
        ];
        
        for (const marker of imageMarkers) {
          const markerPos = lowerHex.indexOf(marker.hex);
          if (markerPos >= 0) {
            try {
              // Found an image marker, look for the actual image data
              const dataStartPos = markerPos + marker.hex.length;
              
              // Try to find the end of the image data
              // First look for the next key position
              let dataEndPos = lowerHex.length;
              for (const {pos} of keyPositions) {
                if (pos > dataStartPos) {
                  dataEndPos = pos;
                  break;
                }
              }
              
              // Extract the image data
              const imageDataHex = lowerHex.substring(dataStartPos, dataEndPos);
              
              // Try base64 first, then hex as fallback
              const isBase64 = /^[A-Za-z0-9+/=]+$/.test(imageDataHex);
              let buffer: Buffer | null = null;
              
              if (isBase64) {
                buffer = Buffer.from(imageDataHex, 'base64');
              } else {
                buffer = Buffer.from(imageDataHex, 'hex');
              }
              
              // Only store if we got actual data
              if (buffer.length > 0) {
                metadata.raw_image_data = buffer;
                metadata.content_type = marker.type;
                metadata.media_type = marker.type;
                
                logger.info('Found image data after content type marker', {
                  content_type: marker.type,
                  media_type: marker.type,
                  data_length: buffer.length,
                  encoding: isBase64 ? 'base64' : 'hex'
                });
              }
            } catch (error) {
              logger.error('Error processing image data after content type marker:', {
                error: error instanceof Error ? error.message : String(error),
                markerType: marker.type,
                markerPos
              });
            }
            break;
          }
        }
      }
    }
    
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
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue)) {
        metadata[key] = numValue;
      }
      return;
    }
    
    // Content type fields
    if (key === 'content_type' || key === 'media_type') {
      metadata[key] = value.toLowerCase();
      return;
    }
    
    // Default string fields
    metadata[key] = value;
  }
  
  /**
   * Format timestamp value
   */
  private formatTimestamp(value: string): string {
    // Try parsing as Unix timestamp first
    const unixTimestamp = parseInt(value, 10);
    if (!isNaN(unixTimestamp)) {
      const date = new Date(unixTimestamp * 1000);
      if (date.getTime() > 0) {
        return date.toISOString();
      }
    }
    
    // Try parsing as ISO string
    try {
      const date = new Date(value);
      if (date.getTime() > 0) {
        return date.toISOString();
      }
    } catch (e) {
      // Ignore parsing errors
    }
    
    // Return original value if parsing fails
    return value;
  }
  
  /**
   * Process direct text patterns in decoded string
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
      
      // If we have image data, convert it to a Buffer
      if (metadata.raw_image_data) {
        try {
          // Store the raw hex data in metadata
          metadata.raw_image_data = metadata.raw_image_data;
          
          // Log image data found
          logger.info('Found image data in transaction', {
            content_type: metadata.content_type,
            media_type: metadata.media_type,
            data_length: metadata.raw_image_data.length
          });
        } catch (error) {
          logger.error('Error processing image data', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
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
