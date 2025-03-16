/**
 * Update Post Authors Script
 * 
 * Updates author addresses for existing posts by re-parsing the transaction data
 */

import prisma from '../db.js';
import logger from '../services/logger.js';
import { tx_parser } from '../services/tx/tx_parser.js';
import { tx_fetcher } from '../services/tx/tx_fetcher.js';

/**
 * Fix BigInt issue before processing
 */
function sanitizeTransactionData(tx: any): any {
  if (!tx) return tx;
  
  // Create a copy to avoid mutating the original
  const sanitized: any = { ...tx };
  
  // Convert BigInt values to strings to avoid mixing with other types
  if (typeof sanitized.block_time === 'bigint') {
    sanitized.block_time = Number(sanitized.block_time);
  }
  
  // Handle metadata
  if (sanitized.metadata && typeof sanitized.metadata === 'object') {
    try {
      // Clone the metadata to avoid reference issues
      sanitized.metadata = JSON.parse(JSON.stringify(sanitized.metadata));
    } catch (error) {
      // If there's an error during JSON conversion, create a new object
      const newMetadata: any = {};
      
      // Copy safe properties
      for (const key in sanitized.metadata) {
        const value = sanitized.metadata[key];
        
        // Skip BigInt values or convert them to strings
        if (typeof value === 'bigint') {
          newMetadata[key] = String(value);
        } else if (value !== null && typeof value !== 'function' && typeof value !== 'symbol') {
          newMetadata[key] = value;
        }
      }
      
      sanitized.metadata = newMetadata;
    }
  }
  
  return sanitized;
}

/**
 * Extract author address directly from transaction ID
 */
async function getAuthorAddressFromTxId(txId: string): Promise<string | undefined> {
  try {
    // Fetch the transaction directly from JungleBus API
    const txData = await tx_fetcher.fetch_transaction(txId);
    
    if (!txData) {
      logger.warn(`Transaction ${txId} not found in API`);
      return undefined;
    }
    
    // Extract author address from addresses array
    if (txData.addresses && Array.isArray(txData.addresses) && txData.addresses.length > 0) {
      return txData.addresses[0];
    }
    
    // Try to extract from inputs
    if (txData.inputs && Array.isArray(txData.inputs) && txData.inputs.length > 0) {
      const input = txData.inputs[0];
      if (input && typeof input === 'object') {
        if (input.address) return input.address;
        if (input.addresses && Array.isArray(input.addresses) && input.addresses.length > 0) {
          return input.addresses[0];
        }
      }
    }
    
    return undefined;
  } catch (error) {
    logger.error(`Error fetching transaction ${txId}: ${error}`);
    return undefined;
  }
}

/**
 * Update author addresses for existing posts
 */
async function updatePostAuthors(): Promise<void> {
  try {
    logger.info('Starting post author update');
    
    // Get all posts with null author_address
    const postsWithoutAuthor = await prisma.post.findMany({
      where: {
        author_address: null
      },
      orderBy: { created_at: 'asc' }
    });
    
    logger.info(`Found ${postsWithoutAuthor.length} posts without author address`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    // Process each post
    for (const post of postsWithoutAuthor) {
      try {
        // Get author address directly from API
        const authorAddress = await getAuthorAddressFromTxId(post.tx_id);
        
        // Check if we have an author address
        if (authorAddress) {
          // Update the post
          await prisma.post.update({
            where: { id: post.id },
            data: { author_address: authorAddress }
          });
          
          // Also update related vote options
          await prisma.vote_option.updateMany({
            where: { post_id: post.id },
            data: { author_address: authorAddress }
          });
          
          logger.info(`Updated author address for post ${post.id} to ${authorAddress}`);
          updatedCount++;
        } else {
          logger.warn(`Could not extract author address for transaction ${post.tx_id}`);
        }
      } catch (error) {
        errorCount++;
        logger.error(`Error updating post ${post.id}: ${error}`);
      }
    }
    
    logger.info('Post author update completed');
    logger.info(`Total posts without author: ${postsWithoutAuthor.length}`);
    logger.info(`Total updated: ${updatedCount}`);
    logger.info(`Total errors: ${errorCount}`);
    
    process.exit(0);
  } catch (error) {
    logger.error(`Update failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run the update
updatePostAuthors().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 