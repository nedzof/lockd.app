import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

/**
 * Vote Transaction Service
 * Handles processing of vote transactions with embedded options
 */
export class VoteTransactionService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Process a transaction that contains vote data
   */
  async processVoteTransaction(tx: any) {
    try {
      logger.info(`Processing vote transaction ${tx.id || tx.tx_id}`);
      // Extract basic data
      const txId = tx.id || tx.tx_id || tx.hash;
      const authorAddress = tx.author_address || tx.addresses?.[0] || '';
      
      // Check if this transaction has already been processed
      const existingTx = await this.prisma.processed_transaction.findUnique({
        where: { tx_id: txId }
      });
      
      if (existingTx) {
        logger.info(`Transaction ${txId} already processed, skipping`);
        return null;
      }
      
      // Initialize vote data structure
      let voteData: any = null;
      
      // Process direct vote_data field if present
      if (tx.vote_data || tx.data?.vote_data) {
        const rawVoteData = tx.vote_data || tx.data?.vote_data;
        try {
          const voteDataObj = typeof rawVoteData === 'string' ? JSON.parse(rawVoteData) : rawVoteData;
          logger.debug('Found vote_data field in transaction', voteDataObj);
          
          voteData = {
            is_vote: true,
            vote_question: voteDataObj.question || '',
            content: voteDataObj.question || '',
            author_address: authorAddress,
            vote_options: voteDataObj.options?.map((o: any) => o.text || '') || [],
            total_options: voteDataObj.options?.length || 0
          };
          
          logger.info(`Processed vote_data with ${voteData.vote_options.length} options`);
          return voteData;
        } catch (e) {
          logger.error('Error parsing vote_data', e);
        }
      }
      
      // Check for option fields directly in the data
      if (tx.data && Array.isArray(tx.data)) {
        const optionEntries = tx.data.filter((item: any) => {
          if (typeof item === 'string') {
            return item.startsWith('option') && !item.includes('_lock_');
          }
          return false;
        });
        
        if (optionEntries.length > 0) {
          logger.debug(`Found ${optionEntries.length} direct option entries in transaction data`);
          
          // Extract options
          const options: string[] = [];
          
          for (const entry of optionEntries) {
            if (typeof entry === 'string') {
              const parts = entry.split('=');
              if (parts.length === 2) {
                options.push(parts[1]);
              }
            }
          }
          
          if (options.length > 0) {
            // Find the vote question
            let question = '';
            const questionEntry = tx.data.find((item: any) => 
              typeof item === 'string' && (
                item.startsWith('vote_question=') || 
                item.startsWith('content=')
              )
            );
            
            if (questionEntry && typeof questionEntry === 'string') {
              const parts = questionEntry.split('=');
              if (parts.length >= 2) {
                question = parts.slice(1).join('=');
              }
            }
            
            voteData = {
              is_vote: true,
              vote_question: question,
              content: question,
              author_address: authorAddress,
              vote_options: options,
              total_options: options.length
            };
            
            logger.info(`Processed direct option fields with ${options.length} options`);
            return voteData;
          }
        }
      }
      
      // Check for vote flag in metadata
      if (tx.is_vote === true || (tx.metadata && tx.metadata.is_vote === true)) {
        logger.debug('Found vote flag in transaction metadata');
        
        // Extract question and options from metadata
        const question = tx.content || (tx.metadata && tx.metadata.content) || '';
        const options = tx.metadata?.vote_options || [];
        
        voteData = {
          is_vote: true,
          vote_question: question,
          content: question,
          author_address: authorAddress,
          vote_options: options,
          total_options: options.length
        };
        
        logger.info(`Processed vote from metadata with ${options.length} options`);
        return voteData;
      }
      
      // If we couldn't extract vote data, return null
      logger.warn('Not a valid vote transaction', { tx_id: txId });
      return null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error processing vote transaction: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Process multiple BSV vote transactions in bulk
   * 
   * @param transactions - Array of transaction objects
   * @returns Summary of processed transactions
   */
  async processBulkVoteTransactions(transactions: any[]) {
    const results = {
      total: transactions.length,
      processed: 0,
      failed: 0,
      skipped: 0
    };
    
    for (const tx of transactions) {
      try {
        const result = await this.processVoteTransaction(tx);
        
        if (result) {
          results.processed++;
        } else {
          results.skipped++;
        }
      } catch (error) {
        logger.error('Error processing transaction in bulk', {
          error: error instanceof Error ? error.message : String(error),
          tx_id: tx?.id || 'unknown'
        });
        results.failed++;
      }
    }
    
    return results;
  }

  /**
   * Get vote details from the database
   * 
   * @param postId - The post ID
   * @returns The post and its vote options
   */
  async getVoteDetails(postId: string) {
    try {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        include: {
          vote_options: {
            orderBy: { option_index: 'asc' }
          }
        }
      });
      
      if (!post) {
        logger.warn('Vote post not found', { post_id: postId });
        return null;
      }
      
      return post;
    } catch (error) {
      logger.error('Error getting vote details', {
        error: error instanceof Error ? error.message : String(error),
        post_id: postId
      });
      return null;
    }
  }
  
  /**
   * Get all vote posts
   * 
   * @param limit - Maximum number of posts to return
   * @param offset - Number of posts to skip
   * @returns Array of vote posts with their options
   */
  async getAllVotePosts(limit = 100, offset = 0) {
    try {
      const posts = await this.prisma.post.findMany({
        where: { is_vote: true },
        include: {
          vote_options: {
            orderBy: { option_index: 'asc' }
          }
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset
      });
      
      return posts;
    } catch (error) {
      logger.error('Error getting all vote posts', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
}
