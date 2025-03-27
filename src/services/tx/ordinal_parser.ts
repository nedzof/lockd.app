/**
 * Ordinal Parser
 * 
 * Parses JSON ordinal inscriptions with the new format
 */

import logger from '../logger.js';
import type { OrdinalInscription, OrdinalMetadata, VoteData, ImageMetadata, LockProtocolData } from '../../shared/types.js';

/**
 * Extracts and parses JSON content from an ordinal inscription
 */
export function parseOrdinalInscription(content: string): OrdinalInscription | null {
  if (!content) return null;
  
  try {
    // Try to parse the content as JSON
    const jsonContent = JSON.parse(content);
    
    // Validate it has the required fields for our ordinal format
    if (!jsonContent.metadata || !jsonContent.metadata.protocol) {
      return null;
    }
    
    // Check if it's a lockd.app inscription
    if (jsonContent.metadata.protocol !== 'lockd.app') {
      return null;
    }
    
    // Return the validated inscription
    return jsonContent as OrdinalInscription;
  } catch (error) {
    // If parsing fails, it's not a valid JSON ordinal
    return null;
  }
}

/**
 * Convert ordinal inscription to LockProtocolData
 */
export function convertOrdinalToLockProtocolData(ordinal: OrdinalInscription): LockProtocolData {
  const metadata = ordinal.metadata;
  
  // Initialize lock protocol data
  const lockData: LockProtocolData = {
    post_id: metadata.post_id,
    content: ordinal.content || '',
    lock_amount: metadata.lock_amount || 0,
    lock_duration: metadata.lock_duration || 0,
    vote_options: [],
    vote_question: '',
    image: null,
    image_metadata: ordinal.image_metadata || {} as ImageMetadata,
    is_vote: metadata.is_vote,
    content_type: metadata.content_type,
    tags: metadata.tags || []
  };
  
  // Handle vote data if present
  if (metadata.is_vote && ordinal.vote_data) {
    lockData.vote_question = ordinal.vote_data.question || '';
    lockData.total_options = ordinal.vote_data.total_options;
    
    // Convert vote options
    if (ordinal.vote_data.options && Array.isArray(ordinal.vote_data.options)) {
      lockData.vote_options = ordinal.vote_data.options.map(option => option.content);
    }
  }
  
  return lockData;
}

/**
 * Detect if content is a JSON ordinal inscription
 */
export function isJsonOrdinalInscription(content: string): boolean {
  if (!content || !content.trim().startsWith('{')) {
    return false;
  }
  
  try {
    const json = JSON.parse(content);
    return !!(json.metadata && json.metadata.protocol === 'lockd.app');
  } catch (error) {
    return false;
  }
} 