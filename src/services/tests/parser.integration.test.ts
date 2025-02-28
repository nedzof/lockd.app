/**
 * @jest-environment node
 * @jest-environment-options {"forceExit": true}
 */

import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../db/prisma.js';
import { ParsedTransaction } from '../../shared/types.js';

// Define the test output directory
const testOutputDir = path.join(process.cwd(), 'test-output');

// Define a test transaction ID
const TEST_TXID = "test_transaction_" + Date.now();
const TEST_POST_ID = "test_post_" + Date.now();
const TEST_VOTE_TXID = "test_vote_transaction_" + Date.now();
const TEST_VOTE_POST_ID = "test_vote_post_" + Date.now();

// Set a longer timeout for the entire test suite
beforeAll(() => {
  jest.setTimeout(60000);
});

// Create a mock transaction for testing
const mockTransaction: ParsedTransaction = {
  txid: TEST_TXID,
  type: 'post',
  protocol: 'LOCK',
  block_height: 800000,
  block_time: BigInt(1677777777),
  metadata: {
    post_id: TEST_POST_ID,
    content: 'This is a test post from the integration test',
    sender_address: 'test_address_123',
    tags: ['test', 'integration'],
    content_type: 'text'
  }
};

// Create a mock vote transaction for testing
const mockVoteTransaction: ParsedTransaction = {
  txid: TEST_VOTE_TXID,
  type: 'vote',
  protocol: 'LOCK',
  block_height: 800001,
  block_time: BigInt(1677777888),
  metadata: {
    post_id: TEST_VOTE_POST_ID,
    content: 'This is a test vote post from the integration test',
    sender_address: 'test_address_123',
    tags: ['test', 'vote', 'integration'],
    content_type: 'vote',
    vote_options: ['Yes', 'No', 'Maybe']
  }
};

describe('Transaction Parser Tests', () => {

  beforeAll(async () => {
    // Create test output directory if it doesn't exist
    if (!fs.existsSync(testOutputDir)) {
      await fs.promises.mkdir(testOutputDir, { recursive: true });
    }

    // Clean up any existing test transactions
    try {
      const existingPost = await prisma.post.findUnique({
        where: { txid: TEST_TXID }
      });
      
      if (existingPost) {
        logger.info(`Cleaning up existing test transaction: ${TEST_TXID}`);
        await prisma.post.delete({
          where: { txid: TEST_TXID }
        });
      }
      
      const existingVotePost = await prisma.post.findUnique({
        where: { txid: TEST_VOTE_TXID }
      });
      
      if (existingVotePost) {
        logger.info(`Cleaning up existing vote test transaction: ${TEST_VOTE_TXID}`);
        await prisma.post.delete({
          where: { txid: TEST_VOTE_TXID }
        });
      }
    } catch (error) {
      logger.error(`Error cleaning up test transactions:`, error);
    }
  });

  afterAll(async () => {
    // Clean up
    logger.info('Tests completed, cleaning up...');
    
    // Clean up test transactions
    try {
      const existingPost = await prisma.post.findUnique({
        where: { txid: TEST_TXID }
      });
      
      if (existingPost) {
        logger.info(`Cleaning up test transaction: ${TEST_TXID}`);
        await prisma.post.delete({
          where: { txid: TEST_TXID }
        });
      }
      
      const existingVotePost = await prisma.post.findUnique({
        where: { txid: TEST_VOTE_TXID }
      });
      
      if (existingVotePost) {
        logger.info(`Cleaning up vote test transaction: ${TEST_VOTE_TXID}`);
        await prisma.post.delete({
          where: { txid: TEST_VOTE_TXID }
        });
      }
    } catch (error) {
      logger.error(`Error cleaning up test transactions:`, error);
    }
    
    // Disconnect Prisma to avoid open handles
    try {
      await prisma.$disconnect();
    } catch (error) {
      logger.error('Error disconnecting Prisma client', { error });
    }
  });

  it('should create a post directly using Prisma', async () => {
    logger.info(`Testing direct post creation for ${TEST_TXID}`);

    try {
      // Create a post directly using Prisma
      const post = await prisma.post.create({
        data: {
          txid: TEST_TXID,
          content: mockTransaction.metadata.content,
          authorAddress: mockTransaction.metadata.sender_address,
          blockHeight: mockTransaction.block_height,
          createdAt: new Date(Number(mockTransaction.block_time)),
          tags: mockTransaction.metadata.tags || [],
          metadata: mockTransaction.metadata || {},
          isLocked: false,
          isVote: false
        }
      });
      
      logger.info('Post created successfully', { txid: TEST_TXID, postId: post.id });

      // Verify the post is properly saved
      const savedPost = await prisma.post.findUnique({
        where: { txid: TEST_TXID },
        include: { voteOptions: true }
      });
      
      expect(savedPost).not.toBeNull();
      expect(savedPost?.txid).toBe(TEST_TXID);
      expect(savedPost?.content).toBe(mockTransaction.metadata.content);
      
      logger.info('Post test completed successfully', {
        txid: TEST_TXID,
        post_id: savedPost?.id,
        content: savedPost?.content?.substring(0, 50) + '...',
        has_vote_options: savedPost?.voteOptions && savedPost.voteOptions.length > 0
      });
    } catch (error) {
      logger.error('Failed to create post', { txid: TEST_TXID, error });
      throw error;
    }
  });
  
  it('should update an existing post', async () => {
    // The post should already exist from the previous test
    const existingPost = await prisma.post.findUnique({
      where: { txid: TEST_TXID }
    });
    
    expect(existingPost).not.toBeNull();
    
    // Update the post
    const updatedContent = "Updated content for test post";
    
    await prisma.post.update({
      where: { txid: TEST_TXID },
      data: {
        content: updatedContent
      }
    });
    
    // Verify the update
    const updatedPost = await prisma.post.findUnique({
      where: { txid: TEST_TXID }
    });
    
    expect(updatedPost).not.toBeNull();
    expect(updatedPost?.content).toBe(updatedContent);
  });
  
  it('should create a vote post with options', async () => {
    logger.info(`Testing vote post creation for ${TEST_VOTE_TXID}`);

    try {
      // Create a vote post
      const votePost = await prisma.post.create({
        data: {
          txid: TEST_VOTE_TXID,
          content: mockVoteTransaction.metadata.content,
          authorAddress: mockVoteTransaction.metadata.sender_address,
          blockHeight: mockVoteTransaction.block_height,
          createdAt: new Date(Number(mockVoteTransaction.block_time)),
          tags: mockVoteTransaction.metadata.tags || [],
          metadata: mockVoteTransaction.metadata || {},
          isLocked: false,
          isVote: true
        }
      });
      
      logger.info('Vote post created successfully', { txid: TEST_VOTE_TXID, postId: votePost.id });
      
      // Create vote options
      const voteOptions = mockVoteTransaction.metadata.vote_options || [];
      for (let i = 0; i < voteOptions.length; i++) {
        const optionContent = voteOptions[i];
        const optionTxid = `${TEST_VOTE_TXID}-option-${i}`;
        
        await prisma.voteOption.create({
          data: {
            txid: optionTxid,
            content: optionContent,
            authorAddress: mockVoteTransaction.metadata.sender_address,
            createdAt: new Date(Number(mockVoteTransaction.block_time)),
            tags: mockVoteTransaction.metadata.tags || [],
            postId: votePost.id,
            optionIndex: i
          }
        });
        
        logger.info(`Created vote option`, {
          postId: votePost.id,
          optionIndex: i,
          content: optionContent
        });
      }

      // Verify the vote post is properly saved
      const savedVotePost = await prisma.post.findUnique({
        where: { txid: TEST_VOTE_TXID },
        include: { voteOptions: true }
      });
      
      expect(savedVotePost).not.toBeNull();
      expect(savedVotePost?.txid).toBe(TEST_VOTE_TXID);
      expect(savedVotePost?.content).toBe(mockVoteTransaction.metadata.content);
      expect(savedVotePost?.isVote).toBe(true);
      expect(savedVotePost?.voteOptions.length).toBe(voteOptions.length);
      
      // Verify each vote option
      for (let i = 0; i < voteOptions.length; i++) {
        const option = savedVotePost?.voteOptions.find(o => o.optionIndex === i);
        expect(option).not.toBeUndefined();
        expect(option?.content).toBe(voteOptions[i]);
      }
      
      logger.info('Vote post test completed successfully', {
        txid: TEST_VOTE_TXID,
        post_id: savedVotePost?.id,
        content: savedVotePost?.content?.substring(0, 50) + '...',
        vote_options_count: savedVotePost?.voteOptions.length
      });
    } catch (error) {
      logger.error('Failed to create vote post', { txid: TEST_VOTE_TXID, error });
      throw error;
    }
  });
});
