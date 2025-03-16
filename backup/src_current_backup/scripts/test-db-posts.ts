/**
 * Test DB Posts Script
 * 
 * Tests creating posts from processed transactions
 */

import prisma from '../db.js';
import logger from '../services/logger.js';
import { post_repository } from '../services/db/post_repository.js';

// Test transaction IDs
const TEST_TRANSACTION_IDS = [
  'c8ebe9050fdb87a546c0477b024d70727e07c9088ad11065fac5fb227b5a72f8', // Vote transaction
  'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053', // Transaction with an image
];

/**
 * Delete existing test posts to start fresh
 */
async function deleteExistingPosts(): Promise<void> {
  try {
    logger.info('Deleting existing test posts from database');
    
    for (const txId of TEST_TRANSACTION_IDS) {
      // Find post by transaction ID
      const post = await prisma.post.findUnique({
        where: { tx_id: txId },
        include: { vote_options: true }
      });
      
      if (post) {
        // Delete vote options first
        if (post.vote_options.length > 0) {
          await prisma.vote_option.deleteMany({
            where: { post_id: post.id }
          });
          logger.info(`Deleted ${post.vote_options.length} vote options for post ${post.id}`);
        }
        
        // Delete post
        await prisma.post.delete({
          where: { id: post.id }
        });
        logger.info(`Deleted post for transaction ${txId}`);
      } else {
        logger.info(`No post found for transaction ${txId}, nothing to delete`);
      }
    }
  } catch (error) {
    logger.error(`Error deleting existing posts: ${(error as Error).message}`);
  }
}

/**
 * Test creating posts from processed transactions
 */
async function testCreatePosts(): Promise<void> {
  try {
    logger.info('Starting post creation test');
    
    // First, delete existing posts
    await deleteExistingPosts();
    
    for (const txId of TEST_TRANSACTION_IDS) {
      logger.info(`Processing transaction ${txId} for post creation`);
      
      // Get processed transaction from database
      const tx = await prisma.processed_transaction.findUnique({
        where: { tx_id: txId }
      });
      
      if (!tx) {
        logger.warn(`Transaction ${txId} not found in database, skipping post creation`);
        continue;
      }
      
      // Process transaction to create post
      await post_repository.processTransaction(tx);
      
      logger.info(`Processed transaction ${txId} for post creation`);
    }
    
    // Display created posts
    await displayCreatedPosts();
    
    logger.info('Test completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Test failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Display created posts
 */
async function displayCreatedPosts(): Promise<void> {
  logger.info('Displaying created posts:');
  
  for (const txId of TEST_TRANSACTION_IDS) {
    const post = await prisma.post.findUnique({
      where: { tx_id: txId },
      include: { vote_options: true }
    });
    
    if (!post) {
      logger.info(`No post found for transaction ${txId}`);
      continue;
    }
    
    console.log(`\n=== POST ${post.id} ===`);
    console.log(`Transaction ID: ${post.tx_id}`);
    console.log(`Content: ${post.content}`);
    console.log(`Author: ${post.author_address || 'Unknown'}`);
    console.log(`Is Vote: ${post.is_vote}`);
    console.log(`Block Height: ${post.block_height}`);
    console.log(`Created At: ${post.created_at}`);
    
    if (post.media_type) {
      console.log(`Media Type: ${post.media_type}`);
      
      // Use typecasting to handle potential missing fields
      const postAny = post as any;
      
      if (postAny.content_type) {
        console.log(`Content Type: ${postAny.content_type}`);
      }
      
      if (postAny.image_metadata) {
        console.log('Image Metadata:', postAny.image_metadata);
      }
      
      if (post.raw_image_data) {
        console.log(`Raw Image Data: [${post.raw_image_data.length} bytes]`);
      }
    }
    
    if (post.is_vote && post.vote_options.length > 0) {
      console.log('\nVote Options:');
      for (const option of post.vote_options) {
        console.log(`- [${option.option_index}] ${option.content}`);
      }
    }
  }
}

// Run the test
testCreatePosts().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 