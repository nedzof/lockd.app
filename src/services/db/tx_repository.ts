/**
 * Transaction Repository
 * 
 * Handles database operations for transactions
 */

import prisma from '../../db.js';
import logger from '../logger.js';
import type { ParsedTransaction } from '../tx/tx_parser.js';

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
      // Extract relevant data from parsed transaction
      const { txId, outputs, blockHeight, timestamp } = parsedTx;
      
      // Skip if no valid transaction ID
      if (!txId) {
        logger.warn('Cannot save transaction: No transaction ID provided');
        return;
      }

      // Get valid outputs
      const validOutputs = outputs.filter(output => output.isValid);
      
      // Determine if this is a vote transaction
      const isVote = validOutputs.some(output => output.metadata?.is_vote === true);
      
      // Prepare metadata object
      let combinedMetadata: Record<string, any> = {};
      
      if (isVote) {
        // For votes, handle question and options separately
        // Find question output (typically the first or the one with total_options)
        const questionOutput = validOutputs.find(o => o.metadata?.total_options) || validOutputs[0];
        const optionOutputs = validOutputs.filter(o => o !== questionOutput && o.metadata?.is_vote === true);
        
        // Start with question metadata
        combinedMetadata = { ...questionOutput.metadata };
        
        // Use question content as the primary content
        combinedMetadata.content = questionOutput.content || '';
        
        // Add all contents to an array
        combinedMetadata.contents = validOutputs
          .filter(output => output.content)
          .map(output => output.content || '');
        
        // Make sure vote-specific fields are set correctly
        combinedMetadata.is_vote = true;
        combinedMetadata.options = optionOutputs.map((option, index) => ({
          content: option.content,
          option_index: option.metadata?.option_index || index + 1
        }));
      } else {
        // For regular posts, combine metadata from all outputs
        combinedMetadata = validOutputs.reduce((acc, output) => {
          // Add output content if available
          if (output.content) {
            if (!acc.contents) acc.contents = [];
            acc.contents.push(output.content);
            
            // For non-votes, use the first content as main content
            if (!acc.content) {
              acc.content = output.content;
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
          
          return newAcc;
        }, {} as Record<string, any>);
      }
      
      // Sanitize metadata to prevent database errors
      const sanitizedMetadata = this.sanitizeMetadata(combinedMetadata);
      
      // Convert timestamp to BigInt for block_time if available
      let blockTime: bigint = BigInt(0);
      if (timestamp) {
        try {
          blockTime = BigInt(Math.floor(new Date(timestamp).getTime() / 1000));
        } catch (error) {
          logger.warn(`Invalid timestamp format: ${timestamp}`);
        }
      }
      
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
      
      logger.debug(`Saved transaction ${txId} to database as ${isVote ? 'vote' : 'post'}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save transaction to database: ${errorMessage}`);
    }
  }

  /**
   * Check if a transaction is already saved in the database
   */
  async isTransactionSaved(txId: string): Promise<boolean> {
    try {
      const transaction = await prisma.processed_transaction.findUnique({
        where: {
          tx_id: txId
        }
      });
      
      return !!transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to check if transaction is saved: ${errorMessage}`);
      return false;
    }
  }
}

// Export singleton instance
export const tx_repository = new TxRepository(); 