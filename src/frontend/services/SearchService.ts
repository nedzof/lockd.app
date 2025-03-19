import Fuse from 'fuse.js';
import { API_URL } from '../config';
import type { Post } from '../types';

// Cache for search results to avoid duplicate requests
const searchCache: Record<string, { timestamp: number, results: any }> = {};
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Configure Fuse.js options
const fuseOptions = {
  includeScore: true,
  threshold: 0.3,
  keys: [
    { name: 'content', weight: 2 },
    { name: 'author_address', weight: 1 },
    { name: 'tags', weight: 1.5 }
  ]
};

// Client-side search enhancer
export async function enhanceSearch(query: string, type: string = 'all'): Promise<Post[]> {
  // First, check cache
  const cacheKey = `${query}:${type}`;
  const now = Date.now();
  
  if (searchCache[cacheKey] && now - searchCache[cacheKey].timestamp < CACHE_EXPIRY) {
    console.log('Using cached search results for:', query);
    return searchCache[cacheKey].results;
  }
  
  try {
    console.log(`Enhancing search for "${query}" with type "${type}"`);
    
    // Fetch from server
    const response = await fetch(`${API_URL}/api/posts/search?q=${encodeURIComponent(query)}&type=${type}`);
    
    if (!response.ok) {
      throw new Error(`Search failed with status: ${response.status}`);
    }
    
    const data = await response.json();
    const posts = data.posts || [];
    
    // If we have posts and we're not searching for a specific transaction, enhance with Fuse.js
    if (posts.length > 0 && type !== 'tx') {
      // Set up Fuse with our data
      const fuse = new Fuse(posts, fuseOptions);
      
      // Get enhanced results
      const results = fuse.search(query);
      
      // Extract the items and sort by score
      const enhancedResults = results
        .map(result => {
          // Create a new object by copying properties instead of using spread
          const item = result.item as Record<string, any>;
          const enhancedItem: Record<string, any> = {};
          
          // Copy properties manually
          Object.keys(item).forEach(key => {
            enhancedItem[key] = item[key];
          });
          
          // Add score property
          enhancedItem.score = result.score;
          
          return enhancedItem as unknown as Post;
        })
        .sort((a: any, b: any) => (a.score || 1) - (b.score || 1));
      
      // Cache the results
      searchCache[cacheKey] = {
        timestamp: now,
        results: enhancedResults
      };
      
      return enhancedResults;
    }
    
    // Cache the original results
    searchCache[cacheKey] = {
      timestamp: now,
      results: posts
    };
    
    return posts;
  } catch (error) {
    console.error('Error enhancing search:', error);
    throw error;
  }
}

// Direct TX ID lookup
export async function lookupTransaction(txId: string): Promise<any> {
  try {
    const response = await fetch(`${API_URL}/api/posts/tx/${txId}`);
    
    if (!response.ok) {
      throw new Error(`Transaction lookup failed with status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Transaction lookup error:', error);
    throw error;
  }
}

// Clear search cache
export function clearSearchCache(): void {
  Object.keys(searchCache).forEach(key => {
    delete searchCache[key];
  });
} 