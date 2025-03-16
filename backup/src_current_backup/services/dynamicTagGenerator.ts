import natural from 'natural';
import prisma from '../db';
import { logger } from '../utils/logger';
import { LocalDeepseekService } from './localDeepseekService';
import fs from 'fs';
import path from 'path';

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

export class DynamicTagGenerator {
  private deepseekService: LocalDeepseekService;
  private contentSources: string[];
  
  constructor() {
    this.deepseekService = new LocalDeepseekService();
    
    // Define content sources to analyze for tags
    // These could be local files, database content, etc.
    this.contentSources = [
      path.join(process.cwd(), 'data/content_sources/recent_posts.txt'),
      path.join(process.cwd(), 'data/content_sources/trending_topics.txt')
    ];
    
    // Ensure content source directories exist
    this.ensureContentSources();
  }
  
  /**
   * Ensures content source directories and files exist
   */
  private ensureContentSources(): void {
    const contentDir = path.join(process.cwd(), 'data/content_sources');
    
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }
    
    // Create sample content files if they don't exist
    const samplePosts = `
Bitcoin reaches new all-time high as institutional adoption increases.
Tech giants announce new AI initiatives at annual developer conference.
Global climate summit concludes with new emissions targets.
Sports league announces expansion teams in three new cities.
Political tensions rise as negotiations stall on key legislation.
Healthcare innovations promise breakthrough treatments for chronic conditions.
Financial markets react to central bank policy announcements.
Entertainment industry adapts to streaming-first distribution models.
`;
    
    const sampleTrending = `
Cryptocurrency regulation
Artificial intelligence ethics
Climate change mitigation
Sports league expansion
Political polarization
Healthcare innovation
Financial market volatility
Streaming media competition
`;
    
    if (!fs.existsSync(this.contentSources[0])) {
      fs.writeFileSync(this.contentSources[0], samplePosts);
    }
    
    if (!fs.existsSync(this.contentSources[1])) {
      fs.writeFileSync(this.contentSources[1], sampleTrending);
    }
  }
  
  /**
   * Generates tags from local content and DeepSeek V3
   * @returns Array of generated tag names
   */
  async generateTags(): Promise<string[]> {
    try {
      logger.info('Starting tag generation process with DeepSeek V3');
      
      // Get content from local sources
      const content = await this.getLocalContent();
      
      if (!content) {
        logger.warn('No content found for tag generation');
        return [];
      }
      
      logger.info(`Processing content for tag extraction with DeepSeek V3`);
      
      // Get recent posts from database to add context
      const recentPosts = await this.getRecentPostsFromDb();
      const combinedContent = `${content}\n\n${recentPosts}`;
      
      // Generate tags using DeepSeek V3
      const deepseekTags = await this.deepseekService.generateTags(combinedContent);
      
      // Also extract keywords using TF-IDF as a fallback/supplement
      const keywords = this.extractKeywords(combinedContent);
      
      // Combine and filter tags
      const combinedTags = [...deepseekTags, ...keywords];
      const uniqueTags = this.filterAndNormalizeTags(combinedTags);
      
      // Store tags in database
      await this.storeTags(uniqueTags);
      
      logger.info(`Generated ${uniqueTags.length} tags using DeepSeek V3`);
      return uniqueTags;
    } catch (error) {
      logger.error('Error generating tags:', error);
      return [];
    }
  }
  
  /**
   * Gets content from local sources
   */
  private async getLocalContent(): Promise<string> {
    try {
      let combinedContent = '';
      
      // Read content from files
      for (const source of this.contentSources) {
        if (fs.existsSync(source)) {
          const content = fs.readFileSync(source, 'utf-8');
          combinedContent += content + '\n\n';
        }
      }
      
      return combinedContent;
    } catch (error) {
      logger.error('Error reading local content:', error);
      return '';
    }
  }
  
  /**
   * Gets recent posts from the database
   */
  private async getRecentPostsFromDb(): Promise<string> {
    try {
      const posts = await prisma.post.findMany({
        orderBy: {
          created_at: 'desc'
        },
        take: 50,
        select: {
          content: true,
          tags: true
        }
      });
      
      return posts.map(post => `${post.content} ${post.tags.join(' ')}`).join('\n');
    } catch (error) {
      logger.error('Error fetching recent posts:', error);
      return '';
    }
  }
  
  /**
   * Extracts keywords using TF-IDF algorithm
   */
  private extractKeywords(text: string): string[] {
    const tfidf = new TfIdf();
    
    // Add document to the corpus
    tfidf.addDocument(text);
    
    // Get top terms
    const terms = tfidf.listTerms(0).slice(0, 20);
    
    return terms.map(term => term.term);
  }
  
  /**
   * Filters and normalizes tags
   */
  private filterAndNormalizeTags(tags: string[]): string[] {
    // Common words to exclude
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'has', 'had',
      'not', 'are', 'were', 'was', 'been', 'being', 'what', 'when', 'where', 'which',
      'who', 'whom', 'how', 'why', 'their', 'they', 'them', 'these', 'those', 'then',
      'than', 'some', 'such', 'said', 'says', 'will', 'would', 'could', 'should'
    ]);
    
    // Filter, normalize, and deduplicate tags
    const normalizedTags = tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 3)
      .filter(tag => !stopWords.has(tag.toLowerCase()))
      .map(tag => {
        // Capitalize first letter of each word
        return tag.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      });
    
    // Remove duplicates
    return [...new Set(normalizedTags)].slice(0, 30);
  }
  
  /**
   * Stores tags in the database
   */
  private async storeTags(tags: string[]): Promise<void> {
    try {
      // Get existing tags to avoid duplicates
      const existingTags = await prisma.tag.findMany({
        where: {
          name: {
            in: tags
          }
        },
        select: {
          name: true
        }
      });
      
      const existingTagNames = new Set(existingTags.map(tag => tag.name));
      
      // Filter out tags that already exist
      const newTags = tags.filter(tag => !existingTagNames.has(tag));
      
      // Create new tags
      if (newTags.length > 0) {
        await prisma.tag.createMany({
          data: newTags.map(name => ({
            name,
            type: 'current_event',
            usageCount: 1,
            created_at: new Date(),
            updated_at: new Date()
          })),
          skipDuplicates: true
        });
      }
      
      // Update usage count for all tags (both new and existing)
      for (const tag of tags) {
        await prisma.tag.update({
          where: { name: tag },
          data: { 
            usageCount: { increment: 1 },
            updated_at: new Date()
          }
        });
      }
      
      logger.info(`Stored ${newTags.length} new tags, updated ${tags.length} tags total`);
    } catch (error) {
      logger.error('Error storing tags:', error);
    }
  }
}
