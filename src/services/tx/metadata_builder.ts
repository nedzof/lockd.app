/**
 * Metadata Builder
 * 
 * Builds structured metadata from transaction outputs
 */

import type { LockProtocolData } from '../../shared/types.js';
import { decode_hex_to_utf8 } from './utils/hex_utils.js';
import { format_timestamp, is_valid_iso_timestamp } from './utils/timestamp_utils.js';
import logger from '../logger.js';

/**
 * Extract key-value pairs from hex
 */
export function extract_key_value_pairs(hexString: string): Record<string, string> {
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
    'option_index': '6f7074696f6e5f696e646578',  // 'option_index' in hex
    'optionIndex': '6f7074696f6e496e646578',  // 'optionIndex' in hex (camelCase variant)
    'content_type': '636f6e74656e745f74797065',  // 'content_type' in hex
    'media_type': '6d656469615f74797065',  // 'media_type' in hex
    'version': '76657273696f6e',  // 'version' in hex
    'vote_data': '766f74655f64617461',  // 'vote_data' in hex
    'vote_question': '766f74655f7175657374696f6e',  // 'vote_question' in hex
  };
  
  // Look for each key in the hex
  for (const [key, hexKey] of Object.entries(keys)) {
    if (lowerHex.includes(hexKey)) {
      const pos = lowerHex.indexOf(hexKey);
      if (pos >= 0) {
        // Extract value after the key
        const valueHex = lowerHex.substring(pos + hexKey.length);
        const valueText = decode_hex_to_utf8(valueHex);
        
        // Find end of value (next non-printable char or field)
        const endPos = valueText.search(/[\x00-\x1F\x7F]/);
        const value = endPos > 0 ? valueText.substring(0, endPos) : valueText;
        result[key] = value.trim();
      }
    }
  }
  
  // Also look for option0, option1, option2, etc. pattern
  for (let i = 0; i < 10; i++) {  // Support up to 10 options
    const optionKey = `option${i}`;
    const optionHexKey = Buffer.from(optionKey).toString('hex');
    
    if (lowerHex.includes(optionHexKey)) {
      const pos = lowerHex.indexOf(optionHexKey);
      if (pos >= 0) {
        // Extract value after the key
        const valueHex = lowerHex.substring(pos + optionHexKey.length);
        const valueText = decode_hex_to_utf8(valueHex);
        
        // Find end of value (next non-printable char or field)
        const endPos = valueText.search(/[\x00-\x1F\x7F]/);
        const value = endPos > 0 ? valueText.substring(0, endPos) : valueText;
        result[optionKey] = value.trim();
      }
    }
  }
  
  return result;
}

/**
 * Build metadata object based on LockProtocolData interface
 */
export function build_metadata(keyValuePairs: Record<string, string>, content: string): LockProtocolData {
  const metadata: Partial<LockProtocolData> = {
    content: content
  };
  
  // Create a custom metadata object for properties not in LockProtocolData
  const custom_metadata: Record<string, any> = {};
  
  // Map extracted fields to metadata
  if (keyValuePairs.post_id) {
    // Extract just the ID pattern without additional data
    // Lockd post_ids are typically in format: XXXXXXXX-XXXXXXXXXX
    const postIdMatch = keyValuePairs.post_id.match(/^([a-z0-9]{6,8}-[a-z0-9]{6,10})/i);
    metadata.post_id = postIdMatch ? postIdMatch[1] : keyValuePairs.post_id.substring(0, 16); // Take just first part if no match
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
  
  // Handle option_index for direct field access
  if (keyValuePairs.option_index || keyValuePairs.optionIndex) {
    const optionIndexValue = keyValuePairs.option_index || keyValuePairs.optionIndex;
    const numMatch = optionIndexValue.match(/^(\d+)/);
    if (numMatch) {
      custom_metadata.option_index = parseInt(numMatch[1], 10);
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
  
  // Boolean fields - ensure proper string to boolean conversion
  if (keyValuePairs.is_vote !== undefined) {
    // Convert various truthy strings to boolean
    const value = keyValuePairs.is_vote.toLowerCase().trim();
    metadata.is_vote = value === 'true' || value === '1' || value === 'yes';
  }
  
  // Store is_locked in custom_metadata
  if (keyValuePairs.is_locked !== undefined) {
    const value = keyValuePairs.is_locked.toLowerCase().trim();
    custom_metadata.is_locked = value === 'true' || value === '1' || value === 'yes';
  }
  
  // Other fields
  if (keyValuePairs.options_hash) {
    // Clean up @ prefix if present
    metadata.options_hash = keyValuePairs.options_hash.replace(/^@/, '');
  }
  
  if (keyValuePairs.content_type) {
    metadata.content_type = keyValuePairs.content_type;
  }
  
  // Store timestamp-related data in custom_metadata
  if (keyValuePairs.timestamp) {
    // Validate and clean up the timestamp format
    if (is_valid_iso_timestamp(keyValuePairs.timestamp)) {
      custom_metadata.created_at = new Date(keyValuePairs.timestamp);
    } else {
      // Try to parse a partial timestamp
      try {
        const cleanedTimestamp = format_timestamp(keyValuePairs.timestamp);
        custom_metadata.created_at = new Date(cleanedTimestamp);
      } catch (e) {
        // If we can't parse the timestamp, don't set it
      }
    }
  }
  
  // Process vote_data field (consolidated vote data format)
  if (keyValuePairs.vote_data) {
    try {
      const voteData = JSON.parse(keyValuePairs.vote_data);
      logger.debug('Found vote_data field in transaction', voteData);
      
      // Mark as a vote
      metadata.is_vote = true;
      
      // Extract vote question
      if (voteData.question) {
        metadata.vote_question = voteData.question;
        // Set content to the vote question for consistency
        metadata.content = voteData.question;
      }
      
      // Extract options
      if (voteData.options && Array.isArray(voteData.options)) {
        metadata.vote_options = voteData.options.map((option: any) => {
          return typeof option === 'string' ? option : (option.text || '');
        });
        metadata.total_options = voteData.options.length;
        
        // Store the full option objects in custom metadata
        custom_metadata.vote_option_objects = voteData.options;
      }
    } catch (error) {
      logger.error('Error parsing vote_data:', error);
    }
  }
  
  // Process direct option fields (option0, option1, etc.)
  const optionFields: string[] = [];
  for (let i = 0; i < 10; i++) {
    const optionKey = `option${i}`;
    if (keyValuePairs[optionKey]) {
      optionFields.push(optionKey);
      
      // If we find option fields, mark as a vote
      metadata.is_vote = true;
      
      // Extract vote question - use the content if we don't have vote_question
      if (!metadata.vote_question) {
        metadata.vote_question = keyValuePairs.vote_question || content;
      }
    }
  }
  
  // If we found option fields, process them
  if (optionFields.length > 0) {
    logger.debug(`Found ${optionFields.length} direct option fields`);
    
    const options: string[] = [];
    const optionObjects: any[] = [];
    
    for (const optionKey of optionFields) {
      const index = parseInt(optionKey.replace('option', ''), 10);
      const optionText = keyValuePairs[optionKey];
      options.push(optionText);
      
      const optionObject: any = {
        text: optionText,
        option_index: index
      };
      
      optionObjects.push(optionObject);
    }
    
    // Set the vote options and total options
    metadata.vote_options = options;
    metadata.total_options = options.length;
    
    // Store the full option objects in custom metadata
    custom_metadata.vote_option_objects = optionObjects;
  }
  
  // Set vote_question if we have it directly
  if (keyValuePairs.vote_question) {
    metadata.vote_question = keyValuePairs.vote_question;
  }
  
  // Attach custom metadata to the main metadata object as a custom field
  (metadata as any)._custom_metadata = custom_metadata;
  
  return metadata as LockProtocolData;
} 