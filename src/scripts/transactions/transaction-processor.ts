import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';
import { VoteTransactionService } from '../../services/vote-transaction-service.js';
import { tx_parser } from '../../services/tx_parser.js';

interface TransactionProcessorOptions {
  reprocess?: boolean;
  updateContent?: boolean;
  skipExisting?: boolean;
}

/**
 * Main transaction processor class that handles all transaction-related operations
 */
export class TransactionProcessor {
  private prisma: PrismaClient;
  private voteService: VoteTransactionService;

  constructor() {
    this.prisma = new PrismaClient();
    this.voteService = new VoteTransactionService(this.prisma);
  }

  /**
   * Process a list of transactions
   */
  async processTransactions(transactions: string[], options: TransactionProcessorOptions = {}) {
    try {
      logger.info(`Starting to process ${transactions.length} transactions`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (const txId of transactions) {
        try {
          // Skip if already processed and not reprocessing
          if (!options.reprocess) {
            const existingTx = await this.prisma.processed_transaction.findUnique({
              where: { tx_id: txId }
            });
            
            if (existingTx && options.skipExisting) {
              logger.info(`Skipping existing transaction: ${txId}`);
              continue;
            }
          }
          
          // Fetch and process transaction
          const result = await this.processTransaction(txId);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
          logger.error(`Error processing transaction ${txId}`, {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      logger.info('Finished processing transactions', {
        total: transactions.length,
        success: successCount,
        fail: failCount
      });
      
      return { successCount, failCount };
    } finally {
      await this.prisma.$disconnect();
    }
  }

  /**
   * Process a single transaction
   */
  private async processTransaction(txId: string) {
    logger.info(`Processing transaction: ${txId}`);
    
    // Fetch transaction data
    const txData = await tx_parser.fetch_transaction(txId);
    if (!txData) {
      logger.warn(`Transaction data not found for ${txId}`);
      return { success: false };
    }
    
    // Extract data
    const data = tx_parser.extract_data_from_transaction(txData);
    if (data.length === 0) {
      logger.warn(`No data extracted from transaction ${txId}`);
      return { success: false };
    }
    
    // Format transaction
    const formattedTx = {
      id: txId,
      block_hash: txData.block_hash,
      block_height: txData.block_height,
      block_time: txData.block_time,
      data: data,
      author_address: txData.author_address
    };
    
    // Determine if it's a vote transaction
    const isVote = data.some(item => 
      item === 'is_vote=true' || 
      item === 'vote=true' || 
      item.includes('vote_question') || 
      item.includes('vote_option')
    );
    
    // Record in processed_transaction table
    await this.prisma.processed_transaction.upsert({
      where: { tx_id: txId },
      create: {
        tx_id: txId,
        block_height: txData.block_height || 0,
        block_time: BigInt(txData.block_time || 0),
        protocol: 'LOCKD',
        type: isVote ? 'vote' : 'content',
        metadata: {
          is_vote: isVote,
          author_address: txData.author_address,
          block_hash: txData.block_hash
        }
      },
      update: {
        block_height: txData.block_height || 0,
        block_time: BigInt(txData.block_time || 0),
        type: isVote ? 'vote' : 'content',
        metadata: {
          is_vote: isVote,
          author_address: txData.author_address,
          block_hash: txData.block_hash
        }
      }
    });
    
    // Process based on type
    if (isVote) {
      const result = await this.voteService.processVoteTransaction(formattedTx);
      if (result) {
        logger.info(`Successfully processed vote transaction: ${txId}`, {
          post_id: result.post.id,
          options_count: result.voteOptions.length
        });
        return { success: true, result };
      }
    } else {
      const { content, tags } = this.extractContentAndTags(data);
      if (content) {
        const post = await this.prisma.post.upsert({
          where: { tx_id: txId },
          create: {
            tx_id: txId,
            content: content,
            author_address: txData.author_address,
            created_at: txData.block_time ? new Date(txData.block_time * 1000) : new Date(),
            tags: tags,
            is_vote: false,
            block_height: txData.block_height
          },
          update: {
            content: content,
            tags: tags,
            block_height: txData.block_height
          }
        });
        
        logger.info(`Successfully processed content transaction: ${txId}`, {
          post_id: post.id
        });
        return { success: true, result: { post } };
      }
    }
    
    return { success: false };
  }

  /**
   * Extract content and tags from transaction data
   */
  private extractContentAndTags(data: string[]): { content: string, tags: string[] } {
    let content = '';
    let tags: string[] = [];
    
    for (const item of data) {
      if (item.startsWith('content=')) {
        content = item.substring('content='.length);
      } else if (item.startsWith('tags=')) {
        try {
          const tagsStr = item.substring('tags='.length);
          if (tagsStr.startsWith('[') && tagsStr.endsWith(']')) {
            tags = JSON.parse(tagsStr);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }
    }
    
    return { content, tags };
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const postCount = await this.prisma.post.count();
    const voteOptionCount = await this.prisma.vote_option.count();
    const processedTxCount = await this.prisma.processed_transaction.count();
    
    const votePosts = await this.prisma.post.findMany({
      where: { is_vote: true },
      include: { vote_options: true }
    });
    
    return {
      posts: postCount,
      vote_options: voteOptionCount,
      processed_transactions: processedTxCount,
      vote_posts: votePosts.length,
      total_vote_options: votePosts.reduce((sum, post) => sum + post.vote_options.length, 0)
    };
  }
} 