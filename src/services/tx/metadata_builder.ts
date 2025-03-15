/**
 * Metadata Builder
 * 
 * Builds structured metadata from transaction outputs
 */

import type { LockProtocolData } from '../../shared/types.js';
import { decode_hex_to_utf8 } from './utils/hex_utils.js';
import { format_timestamp, is_valid_iso_timestamp } from './utils/timestamp_utils.js';

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
        const valueText = decode_hex_to_utf8(valueHex);
        
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
 * Build metadata object based on LockProtocolData interface
 */
export function build_metadata(keyValuePairs: Record<string, string>, content: string): LockProtocolData {
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
    if (is_valid_iso_timestamp(keyValuePairs.timestamp)) {
      metadata.created_at = new Date(keyValuePairs.timestamp);
    } else {
      // Try to parse a partial timestamp
      try {
        const cleanedTimestamp = format_timestamp(keyValuePairs.timestamp);
        metadata.created_at = new Date(cleanedTimestamp);
      } catch (e) {
        // If we can't parse the timestamp, don't set it
      }
    }
  }
  
  return metadata as LockProtocolData;
} 