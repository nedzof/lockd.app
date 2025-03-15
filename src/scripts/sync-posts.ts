/**
 * Sync Posts Script
 * 
 * Syncs all processed transactions to posts
 */

import prisma from '../db.js';
import logger from '../services/logger.js';
import { post_repository } from '../services/db/post_repository.js';

/**
 * Sync all processed transactions to posts
 */
async function syncPosts(): Promise<void> {
  try {
    logger.info('Starting post synchronization');
    
    // Get count of processed transactions
    const totalTx = await prisma.processed_transaction.count();
    logger.info(`Found ${totalTx} processed transactions to sync`);
    
    // Get count of existing posts
    const existingPosts = await prisma.post.count();
    logger.info(`Found ${existingPosts} existing posts`);
    
    // Process in batches to avoid memory issues
    const BATCH_SIZE = 25;
    let processedCount = 0;
    let createdCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    // Process in batches
    let hasMore = true;
    let lastId: string | undefined = undefined;
    
    while (hasMore) {
      // Get next batch
      const batch = await prisma.processed_transaction.findMany({
        where: lastId ? { id: { gt: lastId } } : {},
        orderBy: { id: 'asc' },
        take: BATCH_SIZE
      });
      
      if (batch.length === 0) {
        hasMore = false;
        break;
      }
      
      // Update lastId for next batch
      lastId = batch[batch.length - 1].id;
      
      // Process each transaction
      for (const tx of batch) {
        try {
          // Skip if post already exists
          const existingPost = await prisma.post.findUnique({
            where: { tx_id: tx.tx_id }
          });
          
          if (existingPost) {
            skipCount++;
            continue;
          }
          
          // Process transaction
          await post_repository.processTransaction(tx);
          createdCount++;
        } catch (error) {
          errorCount++;
          logger.error(`Error processing transaction ${tx.tx_id}: ${error}`);
        }
        
        processedCount++;
      }
      
      // Log progress
      logger.info(`Processed ${processedCount}/${totalTx} transactions (${createdCount} created, ${skipCount} skipped, ${errorCount} errors)`);
    }
    
    logger.info('Post synchronization completed');
    logger.info(`Total processed: ${processedCount}`);
    logger.info(`Total created: ${createdCount}`);
    logger.info(`Total skipped: ${skipCount}`);
    logger.info(`Total errors: ${errorCount}`);
    
    process.exit(0);
  } catch (error) {
    logger.error(`Sync failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Run the sync
syncPosts().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 