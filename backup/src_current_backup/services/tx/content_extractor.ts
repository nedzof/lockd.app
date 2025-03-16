/**
 * Content Extractor
 * 
 * Extracts and cleans content from transaction outputs
 */
import { decode_hex_to_utf8 } from './utils/hex_utils.js';

/**
 * Extract clean content by removing metadata markers and unwanted characters
 */
export function extract_clean_content(rawContent: string): string {
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
 * Extract content from OP_RETURN data
 */
export function extract_content_from_op_return(opReturnData: string): string {
  // Try to find content field specifically
  const contentHexIdentifier = '636f6e74656e74'; // 'content' in hex
  const contentPos = opReturnData.indexOf(contentHexIdentifier);
  
  if (contentPos >= 0) {
    // Extract everything after 'content' identifier
    const contentHex = opReturnData.substring(contentPos + contentHexIdentifier.length);
    const rawContent = decode_hex_to_utf8(contentHex);
    return extract_clean_content(rawContent);
  }
  
  // If no content field found, try to extract from the whole string
  return extract_clean_content(decode_hex_to_utf8(opReturnData));
} 