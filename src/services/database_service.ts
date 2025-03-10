import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import type { TransactionOutput } from './tx_parser.js';

export class DatabaseService {
  private prisma: PrismaClient;
  private static instance: DatabaseService;
  private static readonly STOP_WORDS = new Set([
    // German articles
    'der', 'die', 'das', 'den', 'dem', 'des',
    // German pronouns
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie',
    'mich', 'dich', 'sich', 'uns', 'euch',
    'mir', 'dir', 'ihm', 'ihr', 'uns', 'euch', 'ihnen',
    'mein', 'dein', 'sein', 'ihr', 'unser', 'euer',
    // German prepositions
    'in', 'auf', 'unter', 'über', 'vor', 'nach', 'bei', 'mit', 'zu', 'zur', 'zum',
    // German conjunctions
    'und', 'oder', 'aber', 'sondern', 'denn', 'weil', 'dass', 'ob',
    // German auxiliary verbs
    'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'hat', 'haben', 'hatte', 'hatten',
    // Common German words
    'dann', 'jetzt', 'hier', 'dort', 'heute', 'morgen', 'schon', 'noch', 'nur', 'sehr',
    // English articles
    'the', 'a', 'an',
    // English pronouns
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their',
    // English prepositions
    'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
    // English conjunctions
    'and', 'or', 'but', 'nor', 'for', 'yet', 'so',
    // English auxiliary verbs
    'is', 'are', 'was', 'were', 'will', 'have', 'has', 'had',
    // Common English words
    'this', 'that', 'these', 'those', 'here', 'there', 'now', 'then', 'just', 'very'
  ]);

  private constructor() {
    this.prisma = new PrismaClient();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private extract_tags(content: string): string[] {
    const tags: Set<string> = new Set();
    
    // Extract hashtags (including German umlauts)
    const hashtagRegex = /#([\w\u00C0-\u00FF]+)/g;
    const hashtagMatches = content.match(hashtagRegex);
    if (hashtagMatches) {
      hashtagMatches.forEach(tag => {
        const cleanTag = tag.slice(1).toLowerCase(); // Remove # and convert to lowercase
        if (cleanTag.length >= 3 && !DatabaseService.STOP_WORDS.has(cleanTag)) {
          tags.add(cleanTag);
        }
      });
    }

    // Extract keywords (including German umlauts)
    const wordRegex = /[\w\u00C0-\u00FF]+/g;
    const words = content.match(wordRegex) || [];
    
    words.forEach(word => {
      const cleanWord = word.toLowerCase()
        .replace(/[^a-z0-9äöüß]/g, ''); // Keep German umlauts and ß
      
      if (cleanWord.length >= 3 && !DatabaseService.STOP_WORDS.has(cleanWord)) {
        // Additional filters for better tag quality
        const isNumeric = /^\d+$/.test(cleanWord);
        const hasRepeatingChars = /(.)\1{2,}/.test(cleanWord); // e.g., 'aaa', 'ooooo'
        
        if (!isNumeric && !hasRepeatingChars) {
          tags.add(cleanWord);
        }
      }
    });

    return Array.from(tags);
  }

  private async update_tags(tags: string[]): Promise<void> {
    try {
      // Update each tag in the database
      await Promise.all(tags.map(async (tag) => {
        await this.prisma.tag.upsert({
          where: { name: tag },
          create: {
            name: tag,
            usage_count: 1
          },
          update: {
            usage_count: {
              increment: 1
            }
          }
        });
      }));
    } catch (error) {
      logger.error('Error updating tags:', {
        tags,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async insert_transaction(
    tx_id: string,
    block_height: number,
    block_time: Date,
    outputs: TransactionOutput[]
  ): Promise<void> {
    try {
      // Check if transaction already exists
      const existing_tx = await this.prisma.processed_transaction.findUnique({
        where: { tx_id }
      });

      if (existing_tx) {
        logger.info('Transaction already processed, skipping:', { tx_id });
        return;
      }

      // First, insert the transaction
      await this.prisma.processed_transaction.create({
        data: {
          tx_id,
          block_height,
          block_time: BigInt(Math.floor(block_time.getTime() / 1000)), // Convert to Unix timestamp as BigInt
          type: outputs.some(o => o.metadata?.is_vote) ? 'vote' : 'post',
          metadata: {
            outputs: outputs.map(output => ({
              ...output.metadata,
              content: output.metadata?.content || '',
              is_vote: output.metadata?.is_vote || false,
              is_locked: output.metadata?.is_locked || false,
              tags: output.metadata?.tags || [],
              timestamp: output.metadata?.timestamp || block_time.toISOString()
            }))
          }
        }
      });

      // Group outputs by post_id for vote processing
      const outputsByPostId = new Map<string, TransactionOutput[]>();
      outputs.forEach(output => {
        if (!output.isValid || !output.metadata) return;
        
        const post_id = output.metadata.post_id || `${tx_id}-${Date.now()}`;
        const existingOutputs = outputsByPostId.get(post_id) || [];
        outputsByPostId.set(post_id, [...existingOutputs, output]);
      });

      // Process each group of outputs
      for (const [post_id, groupedOutputs] of outputsByPostId) {
        // Check if post already exists
        const existing_post = await this.prisma.post.findUnique({
          where: { tx_id }
        });

        if (existing_post) {
          logger.info('Post already exists, skipping:', { tx_id, post_id });
          continue;
        }

        const mainOutput = groupedOutputs.find(o => 
          o.metadata?.is_vote && o.metadata?.option_index === undefined
        );
        const optionOutputs = groupedOutputs.filter(o => 
          o.metadata?.is_vote && o.metadata?.option_index !== undefined
        );

        if (mainOutput) {
          // Create vote post
          await this.process_vote_output(tx_id, mainOutput, post_id);
          
          // Create vote options
          for (const optionOutput of optionOutputs) {
            try {
              await this.process_vote_option(tx_id, optionOutput, post_id);
            } catch (error) {
              if (error instanceof Error && error.message.includes('Unique constraint')) {
                logger.info('Vote option already exists, skipping:', { tx_id, post_id });
                continue;
              }
              throw error;
            }
          }
        } else {
          // Process as regular post
          const output = groupedOutputs[0];
          if (output) {
            try {
              await this.process_post_output(tx_id, output, post_id);
            } catch (error) {
              if (error instanceof Error && error.message.includes('Unique constraint')) {
                logger.info('Post already exists, skipping:', { tx_id, post_id });
                continue;
              }
              throw error;
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        logger.info('Transaction already exists, skipping:', { tx_id });
        return;
      }
      logger.error('Error inserting transaction:', {
        tx_id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error; // Re-throw other errors
    }
  }

  private async process_post_output(
    tx_id: string, 
    output: TransactionOutput,
    post_id: string
  ): Promise<void> {
    if (!output.metadata?.content) return;

    try {
      // Extract tags from content
      const extracted_tags = this.extract_tags(output.metadata.content);
      const all_tags = [...new Set([...extracted_tags, ...(output.metadata.tags || [])])];

      // Update tags in tag database
      await this.update_tags(all_tags);

      // Create post with tags
      await this.prisma.post.create({
        data: {
          id: post_id,
          tx_id,
          content: output.metadata.content,
          is_vote: false,
          is_locked: output.metadata.is_locked || false,
          created_at: output.metadata.timestamp ? new Date(output.metadata.timestamp) : new Date(),
          tags: all_tags,
          metadata: {
            ...output.metadata,
            extracted_tags,
            original_tags: output.metadata.tags || []
          }
        }
      });
    } catch (error) {
      logger.error('Error creating post:', {
        tx_id,
        post_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async process_vote_output(
    tx_id: string, 
    output: TransactionOutput,
    post_id: string
  ): Promise<void> {
    if (!output.metadata) return;

    try {
      // Extract tags from content if exists
      const content = output.metadata.content || '';
      const extracted_tags = this.extract_tags(content);
      const all_tags = [...new Set([...extracted_tags, ...(output.metadata.tags || [])])];

      // Update tags in tag database
      await this.update_tags(all_tags);

      // Create vote post with tags
      await this.prisma.post.create({
        data: {
          id: post_id,
          tx_id,
          content: content,
          is_vote: true,
          is_locked: output.metadata.is_locked || false,
          created_at: output.metadata.timestamp ? new Date(output.metadata.timestamp) : new Date(),
          tags: all_tags,
          metadata: {
            ...output.metadata,
            extracted_tags,
            original_tags: output.metadata.tags || []
          }
        }
      });
    } catch (error) {
      logger.error('Error creating vote post:', {
        tx_id,
        post_id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async process_vote_option(
    tx_id: string,
    output: TransactionOutput,
    post_id: string
  ): Promise<void> {
    if (!output.metadata?.content || output.metadata.option_index === undefined) return;

    try {
      // Extract tags from option content
      const extracted_tags = this.extract_tags(output.metadata.content);
      const all_tags = [...new Set([...extracted_tags, ...(output.metadata.tags || [])])];

      // Update tags in tag database
      await this.update_tags(all_tags);

      await this.prisma.vote_option.create({
        data: {
          post_id,
          tx_id: `${tx_id}-option-${output.metadata.option_index}`,
          content: output.metadata.content,
          option_index: output.metadata.option_index,
          created_at: output.metadata.timestamp ? new Date(output.metadata.timestamp) : new Date(),
          tags: all_tags
        }
      });
    } catch (error) {
      logger.error('Error creating vote option:', {
        tx_id,
        post_id,
        option_index: output.metadata.option_index,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export const database_service = DatabaseService.getInstance(); 