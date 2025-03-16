import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { LocalDeepseekService } from '../services/localDeepseekService';

const prisma = new PrismaClient();
const deepseekService = new LocalDeepseekService();

async function updateContentSources() {
  try {
    logger.info('Updating content sources for tag generation');
    
    // Define content source paths
    const contentDir = path.join(process.cwd(), 'data/content_sources');
    const recentPostsPath = path.join(contentDir, 'recent_posts.txt');
    const trendingTopicsPath = path.join(contentDir, 'trending_topics.txt');
    const generatedTagsPath = path.join(contentDir, 'generated_tags.json');
    
    // Ensure directory exists
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }
    
    let recentPosts = [];
    let trendingTags = [];
    
    try {
      // Get recent posts from database
      recentPosts = await prisma.post.findMany({
        orderBy: {
          created_at: 'desc'
        },
        take: 100,
        select: {
          content: true,
          description: true,
          tags: true,
          created_at: true
        }
      });
      
      // Get trending tags
      trendingTags = await prisma.tag.findMany({
        orderBy: {
          usageCount: 'desc'
        },
        take: 50,
        select: {
          name: true,
          usageCount: true
        }
      });
    } catch (dbError) {
      logger.error('Database access failed, using fallback content:', dbError);
      
      // Use fallback content if database access fails
      const fallbackContent = `
Bitcoin reaches new all-time high as institutional adoption increases.
Tech giants announce new AI initiatives at annual developer conference.
Global climate summit concludes with new emissions targets.
Sports league announces expansion teams in three new cities.
Political tensions rise as negotiations stall on key legislation.
Healthcare innovations promise breakthrough treatments for chronic conditions.
Financial markets react to central bank policy announcements.
Entertainment industry adapts to streaming-first distribution models.

Cryptocurrency regulation has become a major focus for governments worldwide.
Artificial intelligence ethics frameworks are being developed by leading tech companies.
Climate change mitigation efforts are accelerating in response to extreme weather events.
Sports league expansion into new markets is driving record revenue growth.
Political polarization continues to impact legislative progress on key issues.
Healthcare innovation is transforming patient care and treatment outcomes.
Financial market volatility has increased due to geopolitical uncertainties.
Streaming media competition has intensified with new platform launches.
      `;
      
      // Generate tags from fallback content
      const generatedTags = await deepseekService.generateTags(fallbackContent);
      
      // Save generated tags
      fs.writeFileSync(
        generatedTagsPath, 
        JSON.stringify({
          timestamp: new Date().toISOString(),
          mode: deepseekService.isUsingFallback() ? 'fallback' : 'ai',
          tags: generatedTags,
          source: 'fallback_content'
        }, null, 2)
      );
      
      logger.info(`Generated ${generatedTags.length} tags using fallback content`);
      return;
    }
    
    // Format posts for content source
    const formattedPosts = recentPosts.map(post => {
      const date = post.created_at.toISOString().split('T')[0];
      return `[${date}] ${post.content}\nTags: ${post.tags.join(', ')}\n`;
    }).join('\n');
    
    // Write to recent posts file
    fs.writeFileSync(recentPostsPath, formattedPosts);
    logger.info(`Updated recent posts content source with ${recentPosts.length} posts`);
    
    // Format trending tags
    const formattedTags = trendingTags.map(tag => 
      `${tag.name} (${tag.usageCount} uses)`
    ).join('\n');
    
    // Write to trending topics file
    fs.writeFileSync(trendingTopicsPath, formattedTags);
    logger.info(`Updated trending topics content source with ${trendingTags.length} tags`);
    
    // Generate tags from combined content
    const combinedContent = formattedPosts + '\n\n' + formattedTags;
    const generatedTags = await deepseekService.generateTags(combinedContent);
    
    // Save generated tags
    fs.writeFileSync(
      generatedTagsPath, 
      JSON.stringify({
        timestamp: new Date().toISOString(),
        mode: deepseekService.isUsingFallback() ? 'fallback' : 'ai',
        tags: generatedTags,
        source: 'database_content'
      }, null, 2)
    );
    
    logger.info(`Generated ${generatedTags.length} tags using database content`);
    logger.info('Content sources updated successfully');
  } catch (error) {
    logger.error('Error updating content sources:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateContentSources()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
