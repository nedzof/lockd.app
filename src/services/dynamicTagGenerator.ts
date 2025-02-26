import axios from 'axios';
import natural from 'natural';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

export class DynamicTagGenerator {
  private gnewsApiKey: string;
  private newsdataApiKey: string;
  
  constructor() {
    this.gnewsApiKey = process.env.GNEWS_API_KEY || '';
    this.newsdataApiKey = process.env.NEWSDATA_API_KEY || '';
    
    if (!this.gnewsApiKey && !this.newsdataApiKey) {
      logger.warn('No news API keys provided. Dynamic tag generation may not work properly.');
    }
  }
  
  /**
   * Generates tags from current news and stores them in the database
   * @returns Array of generated tag names
   */
  async generateTags(): Promise<string[]> {
    try {
      logger.info('Starting tag generation process');
      
      // Fetch news articles from multiple sources
      const articles = await this.fetchNewsArticles();
      
      if (articles.length === 0) {
        logger.warn('No articles found for tag generation');
        return [];
      }
      
      logger.info(`Processing ${articles.length} articles for tag extraction`);
      
      // Extract keywords using TF-IDF
      const keywords = this.extractKeywords(articles);
      
      // Extract named entities (people, organizations, places)
      const namedEntities = this.extractNamedEntities(articles);
      
      // Combine and filter tags
      const combinedTags = [...keywords, ...namedEntities];
      const uniqueTags = this.filterAndNormalizeTags(combinedTags);
      
      // Store tags in database
      await this.storeTags(uniqueTags);
      
      logger.info(`Generated ${uniqueTags.length} tags from news articles`);
      return uniqueTags;
    } catch (error) {
      logger.error('Error generating tags:', error);
      return [];
    }
  }
  
  /**
   * Fetches news articles from multiple APIs
   */
  private async fetchNewsArticles(): Promise<any[]> {
    const articles: any[] = [];
    
    try {
      // Try GNews API first
      if (this.gnewsApiKey) {
        const gnewsArticles = await this.fetchFromGnews();
        if (gnewsArticles.length > 0) {
          articles.push(...gnewsArticles);
        }
      }
      
      // Try NewsData.io API as fallback or additional source
      if (this.newsdataApiKey) {
        const newsdataArticles = await this.fetchFromNewsdata();
        if (newsdataArticles.length > 0) {
          articles.push(...newsdataArticles);
        }
      }
      
      return articles;
    } catch (error) {
      logger.error('Error fetching news articles:', error);
      return [];
    }
  }
  
  /**
   * Fetches articles from GNews API
   */
  private async fetchFromGnews(): Promise<any[]> {
    try {
      const response = await axios.get('https://gnews.io/api/v4/top-headlines', {
        params: {
          token: this.gnewsApiKey,
          lang: 'en',
          max: 20
        },
        timeout: 10000
      });
      
      if (response.data && response.data.articles) {
        logger.info(`Fetched ${response.data.articles.length} articles from GNews`);
        return response.data.articles.map((article: any) => ({
          title: article.title,
          description: article.description,
          content: article.content,
          source: 'gnews'
        }));
      }
      
      return [];
    } catch (error) {
      logger.error('Error fetching from GNews:', error);
      return [];
    }
  }
  
  /**
   * Fetches articles from NewsData.io API
   */
  private async fetchFromNewsdata(): Promise<any[]> {
    try {
      const response = await axios.get('https://newsdata.io/api/1/news', {
        params: {
          apikey: this.newsdataApiKey,
          language: 'en',
          size: 20
        },
        timeout: 10000
      });
      
      if (response.data && response.data.results) {
        logger.info(`Fetched ${response.data.results.length} articles from NewsData.io`);
        return response.data.results.map((article: any) => ({
          title: article.title,
          description: article.description,
          content: article.content,
          source: 'newsdata'
        }));
      }
      
      return [];
    } catch (error) {
      logger.error('Error fetching from NewsData.io:', error);
      return [];
    }
  }
  
  /**
   * Extracts keywords using TF-IDF algorithm
   */
  private extractKeywords(articles: any[]): string[] {
    const tfidf = new TfIdf();
    
    // Add documents to the corpus
    articles.forEach(article => {
      const text = `${article.title} ${article.description || ''} ${article.content || ''}`;
      tfidf.addDocument(text);
    });
    
    const keywords: string[] = [];
    
    // Extract top keywords from each document
    for (let i = 0; i < articles.length; i++) {
      const topTerms = tfidf.listTerms(i).slice(0, 5);
      topTerms.forEach(term => {
        if (term.term.length > 3 && /^[a-zA-Z]+$/.test(term.term)) {
          keywords.push(term.term);
        }
      });
    }
    
    return keywords;
  }
  
  /**
   * Extracts named entities from articles
   * This is a simple implementation - in a production environment,
   * you might want to use a more sophisticated NER library
   */
  private extractNamedEntities(articles: any[]): string[] {
    const entities: string[] = [];
    const potentialEntities: Record<string, number> = {};
    
    articles.forEach(article => {
      const text = `${article.title} ${article.description || ''} ${article.content || ''}`;
      
      // Simple capitalized multi-word extraction
      const words = text.split(/\s+/);
      
      for (let i = 0; i < words.length - 1; i++) {
        const word = words[i].replace(/[^\w\s]/g, '');
        const nextWord = words[i + 1].replace(/[^\w\s]/g, '');
        
        // Check for capitalized words that might be named entities
        if (word.length > 1 && nextWord.length > 1 && 
            word[0] === word[0].toUpperCase() && 
            nextWord[0] === nextWord[0].toUpperCase()) {
          const entity = `${word} ${nextWord}`;
          potentialEntities[entity] = (potentialEntities[entity] || 0) + 1;
        }
      }
    });
    
    // Filter entities that appear more than once
    Object.entries(potentialEntities)
      .filter(([_, count]) => count > 1)
      .forEach(([entity]) => entities.push(entity));
    
    return entities;
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
    return [...new Set(normalizedTags)];
  }
  
  /**
   * Stores tags in the database
   */
  private async storeTags(tags: string[]): Promise<void> {
    try {
      // Process tags in batches to avoid overwhelming the database
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < tags.length; i += batchSize) {
        batches.push(tags.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        await Promise.all(batch.map(async (tagName) => {
          // Check if tag already exists
          const existingTag = await prisma.tag.findFirst({
            where: { name: tagName }
          });
          
          if (existingTag) {
            // Update existing tag
            await prisma.tag.update({
              where: { id: existingTag.id },
              data: {
                updatedAt: new Date(),
                usageCount: existingTag.usageCount // Keep the same usage count
              }
            });
          } else {
            // Create new tag
            await prisma.tag.create({
              data: {
                name: tagName,
                type: 'current_event',
                usageCount: 0
              }
            });
          }
        }));
      }
      
      logger.info(`Successfully stored ${tags.length} tags in the database`);
    } catch (error) {
      logger.error('Error storing tags in database:', error);
    }
  }
}
