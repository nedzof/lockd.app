import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { LockProtocolParser } from '../parser/lock_protocol_parser.js';
import { VoteParser } from '../parser/vote_parser.js';

/**
 * Service for handling BSV vote transactions
 */
export class VoteTransactionService {
  private prisma: PrismaClient;
  private lockParser: LockProtocolParser;
  private voteParser: VoteParser;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.lockParser = new LockProtocolParser();
    this.voteParser = new VoteParser();
  }

  /**
   * Process a BSV vote transaction and insert it into the database
   * 
   * @param tx - The transaction object containing data array and metadata
   * @returns The created post and vote options
   */
  async processVoteTransaction(tx: any) {
    try {
      if (!tx || !tx.id) {
        logger.warn('Invalid transaction', { tx: JSON.stringify(tx).substring(0, 100) });
        return null;
      }
      
      // Log the transaction data for debugging
      logger.debug('Processing transaction data', {
        tx_id: tx.id,
        data_type: Array.isArray(tx.data) ? 'array' : typeof tx.data,
        data_sample: Array.isArray(tx.data) ? 
          tx.data.slice(0, 3).map((d: any) => typeof d === 'string' ? d : JSON.stringify(d)) : 
          'not an array'
      });
      
      // Extract the lock protocol data
      let lockData: any = null;
      let voteData: any = null;
      
      // Process data based on format
      if (Array.isArray(tx.data)) {
        // Check if it's an array of strings or an array of objects
        const firstItem = tx.data.length > 0 ? tx.data[0] : null;
        
        if (typeof firstItem === 'string') {
          // It's an array of strings like ["key=value", ...]
          logger.debug('Processing string array data format', { tx_id: tx.id });
          lockData = this.lockParser.extract_lock_protocol_data(tx);
          
          // Check for vote-specific data in the array
          const isVote = tx.data.some((item: string) => 
            item === 'is_vote=true' || 
            item === 'vote=true' || 
            item.includes('vote_question') || 
            item.includes('vote_option')
          );
          
          if (isVote && !lockData) {
            // Create a basic lockData object for vote transactions
            lockData = {
              is_vote: true,
              vote_options: [],
              author_address: tx.author_address || ''
            };
            
            // Extract vote question and options
            let voteQuestion = '';
            const voteOptions: string[] = [];
            
            for (const item of tx.data) {
              if (item.startsWith('content=') && !voteQuestion) {
                voteQuestion = item.substring('content='.length);
              } else if (item.startsWith('content=') && voteOptions.length < 10) {
                voteOptions.push(item.substring('content='.length));
              }
            }
            
            if (voteQuestion) {
              lockData.vote_question = voteQuestion;
              lockData.content = voteQuestion;
            }
            
            if (voteOptions.length > 0) {
              lockData.vote_options = voteOptions;
              lockData.total_options = voteOptions.length;
            }
          }
        } else if (firstItem && typeof firstItem === 'object') {
          // It's an array of objects like [{ key: "key", value: "value" }, ...]
          logger.debug('Processing object array data format', { tx_id: tx.id });
          
          // Extract vote data from the object format
          voteData = {
            is_vote: false,
            question: '',
            options: [],
            total_options: 0
          };
          
          // Check if this is a vote
          const voteItem = tx.data.find((item: any) => 
            (item.key === 'vote' && item.value === 'true') || 
            (item.key === 'is_vote' && item.value === 'true')
          );
          
          if (voteItem) {
            voteData.is_vote = true;
            
            // Extract question
            const questionItem = tx.data.find((item: any) => 
              item.key === 'question' || item.key === 'vote_question'
            );
            
            if (questionItem) {
              voteData.question = questionItem.value;
            }
            
            // Extract options
            const optionItems = tx.data.filter((item: any) => 
              item.key === 'option' || item.key === 'vote_option'
            );
            
            if (optionItems.length > 0) {
              voteData.options = optionItems.map((item: any) => item.value);
              voteData.total_options = optionItems.length;
            }
            
            // Create lockData from voteData
            lockData = {
              is_vote: true,
              vote_question: voteData.question,
              vote_options: voteData.options,
              total_options: voteData.total_options,
              content: voteData.question,
              author_address: tx.author_address || ''
            };
          }
        }
      } else {
        // It's in the old format or some other format
        logger.debug('Processing non-array data format', { tx_id: tx.id });
        lockData = this.lockParser.extract_lock_protocol_data(tx);
      }
      
      // If we still don't have valid lock data, try one more approach
      if (!lockData || !lockData.is_vote) {
        logger.debug('Attempting alternative vote data extraction', { tx_id: tx.id });
        
        // Check if this is explicitly marked as a vote in the transaction
        const isExplicitVote = tx.type === 'vote' || 
                              (tx.metadata && tx.metadata.is_vote === true) ||
                              (tx.data && typeof tx.data === 'object' && tx.data.is_vote === true);
        
        if (isExplicitVote) {
          // Create a basic vote structure
          lockData = {
            is_vote: true,
            vote_question: tx.metadata?.vote_question || tx.data?.question || '',
            vote_options: tx.metadata?.vote_options || tx.data?.options || [],
            total_options: tx.metadata?.total_options || (tx.data?.options?.length || 0),
            content: tx.metadata?.vote_question || tx.data?.question || '',
            author_address: tx.author_address || ''
          };
        }
      }
      
      // Final check if we have valid vote data
      if (!lockData || !lockData.is_vote) {
        logger.warn('Not a valid vote transaction', { tx_id: tx.id });
        return null;
      }
      
      // Log the extracted vote data
      logger.info('Found vote transaction', { 
        tx_id: tx.id,
        question: lockData.vote_question || 'No question found',
        options_count: lockData.vote_options?.length || 0
      });
      
      // Check if transaction already exists
      const existingTx = await this.prisma.processed_transaction.findUnique({
        where: { tx_id: tx.id }
      });
      
      if (existingTx && existingTx.type === 'vote') {
        logger.info('Transaction already processed as vote', { tx_id: tx.id });
        
        // Check if post exists
        const existingPost = await this.prisma.post.findUnique({
          where: { tx_id: tx.id },
          include: { vote_options: true }
        });
        
        if (existingPost) {
          logger.info('Post already exists for vote', { 
            tx_id: tx.id, 
            post_id: existingPost.id,
            options_count: existingPost.vote_options.length
          });
          
          return {
            post: existingPost,
            voteOptions: existingPost.vote_options
          };
        }
      }
      
      // Determine author address
      const authorAddress = tx.author_address || 
                           (lockData && lockData.author_address) || 
                           (existingTx && existingTx.metadata && existingTx.metadata.author_address) ||
                           '1DefaultVoteAddress';
      
      if (!authorAddress) {
        logger.warn('No author address found for transaction', { tx_id: tx.id });
      }
      
      // Start a transaction to ensure all database operations succeed or fail together
      return await this.prisma.$transaction(async (prisma) => {
        // Create or update the post record
        const postData = {
          tx_id: tx.id,
          content: lockData.vote_question || lockData.content || '',
          author_address: authorAddress,
          created_at: new Date((tx.block_time || Math.floor(Date.now() / 1000)) * 1000),
          is_vote: true,
          is_locked: !!lockData.is_locked,
          tags: lockData.tags || [],
          block_height: tx.block_height || 0,
          metadata: {
            options_hash: lockData.options_hash,
            total_options: lockData.total_options,
            post_txid: tx.id,
            vote_question: lockData.vote_question,
            vote_options: lockData.vote_options
          }
        };
        
        // Upsert the post (create or update)
        const post = await prisma.post.upsert({
          where: { tx_id: tx.id },
          update: postData,
          create: postData
        });
        
        logger.info('Upserted post record', { post_id: post.id, tx_id: tx.id });
        
        // Delete any existing vote options for this post
        await prisma.vote_option.deleteMany({
          where: { post_id: post.id }
        });
        
        // Create vote option records
        const voteOptions = [];
        
        if (lockData.vote_options && lockData.vote_options.length > 0) {
          for (let i = 0; i < lockData.vote_options.length; i++) {
            const option = lockData.vote_options[i];
            
            const voteOption = await prisma.vote_option.create({
              data: {
                content: option || `Option ${i + 1}`,
                post_id: post.id,
                author_address: authorAddress,
                created_at: new Date((tx.block_time || Math.floor(Date.now() / 1000)) * 1000),
                tx_id: `${tx.id}_option_${i}`, // Generate a unique tx_id for each option
                option_index: i,
                tags: []
              }
            });
            
            voteOptions.push(voteOption);
          }
          
          logger.info('Created vote option records', { 
            count: voteOptions.length, 
            post_id: post.id 
          });
        }
        
        // Upsert the processed_transaction record
        if (existingTx) {
          await prisma.processed_transaction.update({
            where: { tx_id: tx.id },
            data: {
              type: 'vote',
              metadata: {
                ...existingTx.metadata,
                vote_question: lockData.vote_question,
                total_options: lockData.total_options,
                is_vote: true
              }
            }
          });
          
          logger.info('Updated processed_transaction record', { tx_id: tx.id });
        } else {
          // Create a new processed_transaction record
          await prisma.processed_transaction.create({
            data: {
              tx_id: tx.id,
              block_height: tx.block_height || 0,
              block_time: BigInt(tx.block_time || Math.floor(Date.now() / 1000)),
              protocol: 'LOCK',
              type: 'vote',
              metadata: {
                vote_question: lockData.vote_question,
                total_options: lockData.total_options,
                is_vote: true,
                author_address: authorAddress
              }
            }
          });
          
          logger.info('Created processed_transaction record', { tx_id: tx.id });
        }
        
        return {
          post,
          voteOptions
        };
      });
    } catch (error) {
      logger.error('Error processing vote transaction', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        tx_id: tx?.id || 'unknown'
      });
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
