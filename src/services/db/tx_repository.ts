/**
 * Transaction Repository
 * 
 * Handles database operations for transactions
 */

import prisma from '../../db.js';
import logger from '../logger.js';
import type { ParsedTransaction } from '../tx/tx_parser.js';
import { extractImageFromOutputs, extractImageFromOutput, extractImageFromRawTx } from '../utils/image_extractor.js';

/**
 * Transaction Repository class
 * Handles database operations for processed transactions
 */
export class TxRepository {
  /**
   * Sanitize metadata to prevent database errors
   * Handles invalid dates and control characters
   */
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    // Create a new sanitized object to avoid mutating the original
    const sanitized: Record<string, any> = {};
    
    // Process each property
    for (const [key, value] of Object.entries(metadata)) {
      // Handle Date objects
      if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          // Skip invalid dates
          logger.warn(`Removed invalid Date for key '${key}'`);
          continue;
        }
        sanitized[key] = value;
        continue;
      }
      
      // Handle strings - remove control characters
      if (typeof value === 'string') {
        sanitized[key] = value.replace(/[\x00-\x1F\x7F]/g, '');
        continue;
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        sanitized[key] = value.map(item => {
          // If array item is a string, sanitize it
          if (typeof item === 'string') {
            return item.replace(/[\x00-\x1F\x7F]/g, '');
          }
          // If array item is an object, recursively sanitize it
          else if (typeof item === 'object' && item !== null) {
            return this.sanitizeNestedObject(item);
          }
          // Return other types as-is
          return item;
        });
        continue;
      }
      
      // Handle nested objects
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
        continue;
      }
      
      // Copy other values as-is
      sanitized[key] = value;
    }
    
    return sanitized;
  }
  
  /**
   * Helper method to sanitize a nested object
   * Used for objects inside arrays
   */
  private sanitizeNestedObject(obj: Record<string, any>): Record<string, any> {
    // Create a new sanitized object
    const sanitized: Record<string, any> = {};
    
    // Process each property
    for (const [key, value] of Object.entries(obj)) {
      // Handle string values - remove control characters
      if (typeof value === 'string') {
        sanitized[key] = value.replace(/[\x00-\x1F\x7F]/g, '');
      }
      // Handle nested objects
      else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        if (Array.isArray(value)) {
          // Handle nested arrays
          sanitized[key] = value.map(item => {
            if (typeof item === 'string') {
              return item.replace(/[\x00-\x1F\x7F]/g, '');
            } else if (typeof item === 'object' && item !== null) {
              return this.sanitizeNestedObject(item);
            }
            return item;
          });
        } else {
          // Handle nested objects
          sanitized[key] = this.sanitizeNestedObject(value);
        }
      }
      // Handle Date objects
      else if (value instanceof Date) {
        if (!isNaN(value.getTime())) {
          sanitized[key] = value;
        }
      }
      // Copy other values as-is
      else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Save a parsed transaction to the database
   */
  async saveProcessedTransaction(parsedTx: ParsedTransaction): Promise<void> {
    try {
      // Log start of transaction processing
      logger.info(`🔄 Processing transaction ${parsedTx.txId} for database storage`);
      
      // Extract relevant data from parsed transaction
      const { txId, outputs, blockHeight, timestamp, rawTx } = parsedTx;
      
      // Skip if no valid transaction ID
      if (!txId) {
        logger.warn('❌ Cannot save transaction: No transaction ID provided');
        return;
      }

      // Get valid outputs
      const validOutputs = outputs.filter(output => output.isValid);
      logger.debug(`📊 Transaction has ${validOutputs.length} valid outputs out of ${outputs.length} total`);
      
      // Determine if this is a vote transaction
      const isVote = validOutputs.some(output => output.metadata?.is_vote === true);
      
      // Log transaction type detection
      if (isVote) {
        logger.info(`🗳️ Detected vote transaction: ${txId}`);
      } else if (validOutputs.some(output => output.metadata?.content_type?.includes('image'))) {
        logger.info(`🖼️ Detected image post transaction: ${txId}`);
      } else {
        logger.info(`📝 Detected text post transaction: ${txId}`);
      }
      
      // Prepare metadata object
      let combinedMetadata: Record<string, any> = {};
      
      if (isVote) {
        // We now exclusively use single-output votes with embedded options
        const output = validOutputs[0];
        const customMeta = (output.metadata as any)._custom_metadata || {};
        
        logger.debug('🔍 Processing vote with embedded options');
        
        // Start with output metadata
        combinedMetadata = { ...output.metadata };
        
        // Use content as the primary content (vote question)
        combinedMetadata.content = output.content || '';
        
        // Make sure vote-specific fields are set correctly
        combinedMetadata.is_vote = true;
        
        // Extract vote options from custom metadata if available
        if (customMeta.vote_option_objects && Array.isArray(customMeta.vote_option_objects)) {
          combinedMetadata.options = customMeta.vote_option_objects.map((option: any, index: number) => ({
            content: option.text || '',
            index: option.optionIndex || index
          }));
          
          logger.debug(`🗳️ Processed vote with ${combinedMetadata.options.length} embedded options`);
          logger.debug(`👀 Vote question: "${combinedMetadata.content || 'No question'}" with options: ${JSON.stringify(combinedMetadata.options.map((o: any) => o.content))}`);
        } 
        // Otherwise, check for direct vote_options array
        else if (output.metadata.vote_options && Array.isArray(output.metadata.vote_options)) {
          combinedMetadata.options = output.metadata.vote_options.map((text: string, index: number) => ({
            content: text,
            index
          }));
          
          logger.debug(`🗳️ Processed vote with ${combinedMetadata.options.length} options from vote_options array`);
          logger.debug(`👀 Vote question: "${combinedMetadata.content || 'No question'}" with options: ${JSON.stringify(combinedMetadata.options.map((o: any) => o.content))}`);
        }
        // Fallback - create an empty options array
        else {
          combinedMetadata.options = [];
          logger.warn('⚠️ Vote without options detected - may be incorrectly formatted');
        }
        
        // Add author address if available
        if (parsedTx.authorAddress) {
          combinedMetadata.author_address = parsedTx.authorAddress;
          logger.debug(`✍️ Author address: ${parsedTx.authorAddress}`);
        } else {
          logger.debug('⚠️ No author address found for vote transaction');
        }
      } else {
        // For regular posts, combine metadata from all outputs
        logger.debug(`🔄 Combining metadata from ${validOutputs.length} outputs`);
        
        combinedMetadata = validOutputs.reduce((acc, output, index) => {
          // Add output content if available
          if (output.content) {
            if (!acc.contents) acc.contents = [];
            acc.contents.push(output.content);
            
            // For non-votes, use the first content as main content
            if (!acc.content) {
              acc.content = output.content;
              logger.debug(`📄 Main content from output #${index}: "${output.content.substring(0, 50)}${output.content.length > 50 ? '...' : ''}"`);
            }
          }
          
          // Merge metadata (without overwriting existing data if possible)
          const newAcc = { ...acc };
          
          // Only copy fields that don't exist yet or are empty
          for (const [key, value] of Object.entries(output.metadata)) {
            if (value !== undefined && (newAcc[key] === undefined || newAcc[key] === null || newAcc[key] === '')) {
              newAcc[key] = value;
            }
          }
          
          // Add custom metadata fields if available
          if ((output.metadata as any)._custom_metadata) {
            if (!newAcc._custom_metadata) {
              newAcc._custom_metadata = {};
            }
            
            // Merge custom metadata
            newAcc._custom_metadata = {
              ...newAcc._custom_metadata,
              ...(output.metadata as any)._custom_metadata
            };
          }
          
          // Add author address if available
          if (output._authorAddress) {
            newAcc.author_address = output._authorAddress;
            logger.debug(`✍️ Author address from output: ${output._authorAddress}`);
          } else if (parsedTx.authorAddress && !newAcc.author_address) {
            newAcc.author_address = parsedTx.authorAddress;
            logger.debug(`✍️ Author address from transaction: ${parsedTx.authorAddress}`);
          }
          
          return newAcc;
        }, {} as Record<string, any>);
      }
      
      // Try to extract image data from the outputs
      try {
        // Get all output scripts as hex strings
        const outputHexes = outputs.map(output => output.hex).filter(Boolean);
        
        if (outputHexes.length > 0) {
          logger.debug(`🔍 Checking ${outputHexes.length} outputs for image data`);
          
          // Try extracting from each output individually
          let imageFound = false;
          
          for (let i = 0; i < outputHexes.length; i++) {
            const image = extractImageFromOutput(outputHexes[i]);
            if (image) {
              logger.info(`🖼️ Found ${image.format} image in output #${i}, size: ${image.size} bytes`);
              
              // Add image metadata to combined metadata
              combinedMetadata.image_metadata = {
                format: image.format,
                mime_type: image.mime_type,
                size: image.size,
                position: image.position,
                output_index: i
              };
              
              // Add data URL for direct usage
              combinedMetadata.image_data_url = image.data_url;
              
              // Store the raw image data as base64
              combinedMetadata.raw_image_data = image.data.toString('base64');
              
              imageFound = true;
              break;
            }
          }
          
          if (!imageFound) {
            // If no image was found in individual outputs, try extracting from 
            // all outputs combined (for cases where image spans multiple outputs)
            const image = extractImageFromOutputs(outputHexes);
            
            if (image) {
              logger.info(`🖼️ Found ${image.format} image across multiple outputs, size: ${image.size} bytes`);
              
              // Add image metadata to combined metadata
              combinedMetadata.image_metadata = {
                format: image.format,
                mime_type: image.mime_type,
                size: image.size,
                position: image.position
              };
              
              // Add data URL for direct usage
              combinedMetadata.image_data_url = image.data_url;
              
              // Store the raw image data as base64
              combinedMetadata.raw_image_data = image.data.toString('base64');
            } else if (rawTx) {
              // If no image found in outputs, try the raw transaction data
              logger.debug('🔍 Checking raw transaction data for images');
              const image = extractImageFromRawTx(rawTx);
              
              if (image) {
                logger.info(`🖼️ Found ${image.format} image in raw transaction data, size: ${image.size} bytes`);
                
                // Add image metadata to combined metadata
                combinedMetadata.image_metadata = {
                  format: image.format,
                  mime_type: image.mime_type,
                  size: image.size,
                  position: image.position,
                  source: 'raw_tx'
                };
                
                // Add data URL for direct usage
                combinedMetadata.image_data_url = image.data_url;
                
                // Store the raw image data as base64
                combinedMetadata.raw_image_data = image.data.toString('base64');
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`⚠️ Error extracting image data from transaction ${txId}: ${error}`);
      }
      
      // Sanitize metadata to prevent database errors
      logger.debug('🧹 Sanitizing metadata for database storage');
      const sanitizedMetadata = this.sanitizeMetadata(combinedMetadata);
      
      // Convert timestamp to BigInt for block_time if available
      let blockTime: bigint = BigInt(0);
      if (timestamp) {
        try {
          blockTime = BigInt(Math.floor(new Date(timestamp).getTime() / 1000));
          logger.debug(`⏰ Converted timestamp ${timestamp} to block_time ${blockTime}`);
        } catch (error) {
          logger.warn(`⚠️ Invalid timestamp format: ${timestamp}`);
        }
      }
      
      // Log DB operation details
      logger.info(`💾 Saving transaction ${txId} to database (Block: ${blockHeight || 'unconfirmed'}, Type: ${isVote ? 'vote' : 'post'})`);
      
      // Save to database
      await prisma.processed_transaction.upsert({
        where: {
          tx_id: txId
        },
        update: {
          block_height: blockHeight || 0,
          type: isVote ? 'vote' : 'post',
          protocol: 'MAP',
          metadata: sanitizedMetadata,
          block_time: blockTime,
          updated_at: new Date()
        },
        create: {
          tx_id: txId,
          block_height: blockHeight || 0,
          type: isVote ? 'vote' : 'post',
          protocol: 'MAP',
          metadata: sanitizedMetadata,
          block_time: blockTime
        }
      });
      
      logger.info(`✅ Transaction ${txId} successfully saved to database as ${isVote ? 'vote' : 'post'}`);
      
      // Log summary of stored data
      const metadataKeys = Object.keys(sanitizedMetadata);
      logger.debug(`📊 Stored metadata contains ${metadataKeys.length} fields: ${metadataKeys.join(', ')}`);
      
      // Additional logging for vote transactions
      if (isVote && sanitizedMetadata.options) {
        const optionsCount = Array.isArray(sanitizedMetadata.options) ? sanitizedMetadata.options.length : 0;
        logger.info(`🗳️ Stored vote with ${optionsCount} options`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to save transaction to database: ${errorMessage}`, {
        error_stack: error instanceof Error ? error.stack : undefined,
        tx_id: parsedTx.txId
      });
    }
  }

  /**
   * Check if a transaction is already saved in the database
   */
  async isTransactionSaved(txId: string): Promise<boolean> {
    try {
      logger.debug(`🔍 Checking if transaction ${txId} is already in database`);
      
      const transaction = await prisma.processed_transaction.findUnique({
        where: {
          tx_id: txId
        }
      });
      
      if (transaction) {
        logger.debug(`✓ Transaction ${txId} already exists in database (type: ${transaction.type})`);
      } else {
        logger.debug(`✗ Transaction ${txId} not found in database`);
      }
      
      return !!transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Failed to check if transaction is saved: ${errorMessage}`, {
        tx_id: txId,
        error_stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }
}

// Export singleton instance
export const tx_repository = new TxRepository(); 