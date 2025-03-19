import Fuse from 'fuse.js';
import { API_URL } from '../config';
import type { Post } from '../types';

// Cache for search results to avoid duplicate requests
const searchCache: Record<string, { timestamp: number, results: any }> = {};
// Reduce the cache expiry to just 100 milliseconds to ensure responsive real-time updates
const CACHE_EXPIRY = 100; // 100 milliseconds instead of 500 milliseconds

// Configure Fuse.js options
const fuseOptions = {
  includeScore: true,
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true,
  keys: [
    { name: 'content', weight: 2 },
    { name: 'author_address', weight: 1.5 },
    { name: 'tags', weight: 1.5 },
    { name: 'tx_id', weight: 1.5 },
    { name: 'vote_options.content', weight: 1.8 }
  ]
};

// Client-side search enhancer
export async function enhanceSearch(
  query: string, 
  type: string = 'all', 
  filters: Record<string, any> = {},
  forceRefresh: boolean = false
): Promise<Post[]> {
  // Validation check
  if (!query || query.trim() === '') {
    console.warn('Empty search query provided to enhanceSearch');
    return [];
  }

  // First, check cache
  const cacheKey = `${query}:${type}:${JSON.stringify(filters)}`;
  const now = Date.now();
  
  if (!forceRefresh && searchCache[cacheKey] && now - searchCache[cacheKey].timestamp < CACHE_EXPIRY) {
    console.log('Using cached search results for:', query, 'Age:', now - searchCache[cacheKey].timestamp, 'ms');
    return searchCache[cacheKey].results;
  } else if (searchCache[cacheKey]) {
    console.log('Cache expired for:', query, 'Age:', now - searchCache[cacheKey].timestamp, 'ms');
    delete searchCache[cacheKey]; // Clear expired cache entry
  }
  
  try {
    console.log(`Enhancing search for "${query}" with type "${type}" and filters:`, filters);
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('q', query);
    queryParams.append('type', type);
    
    // Add all filters to the query parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // Handle arrays like tags
        if (value.length > 0) {
          value.forEach(item => {
            queryParams.append(key, item);
          });
          console.log(`Added array filter ${key} with ${value.length} values:`, value);
        }
      } else if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
        console.log(`Added filter ${key}=${value}`);
      }
    });
    
    // Log the full request URL for debugging
    const requestUrl = `${API_URL}/api/posts/search?${queryParams.toString()}`;
    console.log(`Making search request to: ${requestUrl}`);
    
    // Fetch from server with all filters
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    try {
      const response = await fetch(requestUrl, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      // Log detailed response info for debugging
      console.log(`Search response status: ${response.status} ${response.statusText}`);
      const contentType = response.headers.get('content-type') || 'unknown';
      console.log(`Response content type: ${contentType}`);
      
      if (!response.ok) {
        // Handle common error codes with informative messages
        let errorMessage = `Search failed with status: ${response.status}`;
        
        if (response.status === 400) {
          errorMessage = 'Invalid search query parameters';
        } else if (response.status === 401) {
          errorMessage = 'Authentication required for this search';
        } else if (response.status === 403) {
          errorMessage = 'You don\'t have permission to access these results';
        } else if (response.status === 404) {
          errorMessage = 'Search endpoint not found';
        } else if (response.status === 429) {
          errorMessage = 'Too many search requests, please try again later';
        } else if (response.status === 500) {
          errorMessage = 'Server error during search, please try again later';
        }
        
        // Try to get error details from response if possible
        try {
          if (contentType.includes('application/json')) {
            const errorData = await response.json();
            console.error('Error details:', errorData);
            
            if (errorData && errorData.message) {
              errorMessage = errorData.message;
            }
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }
        
        throw new Error(errorMessage);
      }
      
      // Verify we received JSON before trying to parse
      if (!contentType.includes('application/json')) {
        console.error(`Expected JSON response but got ${contentType}`);
        throw new Error(`Unexpected content type: ${contentType}`);
      }
      
      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        throw new Error('Invalid response format from server');
      }
      
      console.log(`Received search response: ${typeof data}`, {
        hasPosts: Boolean(data.posts),
        postCount: data.posts ? data.posts.length : 0,
        hasCount: typeof data.count === 'number',
        count: data.count,
        firstPost: data.posts && data.posts.length > 0 ? {
          id: data.posts[0].id,
          hasLockLikes: Boolean(data.posts[0].lock_likes),
          hasImage: Boolean(data.posts[0].has_image),
          hasMediaUrl: Boolean(data.posts[0].media_url),
          contentPreview: data.posts[0].content ? data.posts[0].content.substring(0, 30) + '...' : 'No content'
        } : null
      });
      
      const posts = data.posts || [];
      
      // If we have posts and we're not searching for a specific transaction, enhance with Fuse.js
      if (posts.length > 0 && type !== 'tx') {
        // Make sure each post has the required properties for Fuse.js
        const preparedPosts = posts.map((post: any) => {
          // Ensure post has all required properties
          return {
            id: post.id || post.tx_id || '',
            content: post.content || '',
            tx_id: post.tx_id || '',
            author_address: post.author_address || '',
            tags: Array.isArray(post.tags) ? post.tags : [],
            vote_options: Array.isArray(post.vote_options) ? post.vote_options : [],
            lock_likes: Array.isArray(post.lock_likes) ? post.lock_likes : [],
            created_at: post.created_at || new Date().toISOString(),
            has_image: Boolean(post.has_image),
            media_url: post.media_url || '',
            ...post  // Keep all other properties
          };
        });
        
        // Set up Fuse with our prepared data
        const fuse = new Fuse(preparedPosts, fuseOptions);
        
        // Get enhanced results
        const results = fuse.search(query);
        
        // Extract the items and sort by score (but don't add score to content)
        const enhancedResults = results
          .map(result => {
            // Get the original item
            const item = result.item as Record<string, any>;
            
            // Create a simple copy with all properties, preserving the original structure
            // This ensures we don't lose any important data like images
            const enhancedItem = { ...item };
            
            // Store score as a separate property for sorting only
            enhancedItem._score = result.score;
            
            // Track where the match was found
            enhancedItem._matchedFields = result.matches?.map(match => match.key) || [];
            
            // Store information about where the match was found for debugging and highlighting
            enhancedItem._searchInfo = {
              score: result.score,
              matchedInFields: result.matches?.map(match => match.key) || [],
              query: query
            };
            
            // Make sure media_url is preserved
            if (item.media_url) {
              enhancedItem.media_url = item.media_url;
            }
            
            // Ensure has_image flag is preserved
            enhancedItem.has_image = Boolean(item.has_image);
            
            return enhancedItem as unknown as Post;
          })
          .sort((a: any, b: any) => (a._score || 1) - (b._score || 1));
        
        console.log(`Enhanced ${posts.length} results with Fuse.js to ${enhancedResults.length} matches`);
        
        // Cache the results
        searchCache[cacheKey] = {
          timestamp: now,
          results: enhancedResults
        };
        
        return enhancedResults;
      }
      
      // For cases where we don't enhance with Fuse.js
      console.log(`Returning ${posts.length} unenhanced search results`);
      
      // Make sure each post has the required core properties
      const formattedPosts = posts.map((post: any) => {
        return {
          id: post.id || post.tx_id || '',
          content: post.content || '',
          tx_id: post.tx_id || '',
          author_address: post.author_address || '',
          tags: Array.isArray(post.tags) ? post.tags : [],
          vote_options: Array.isArray(post.vote_options) ? post.vote_options : [],
          lock_likes: Array.isArray(post.lock_likes) ? post.lock_likes : [],
          created_at: post.created_at || new Date().toISOString(),
          has_image: Boolean(post.has_image),
          media_url: post.media_url || '',
          ...post  // Keep all other properties
        } as unknown as Post;
      });
      
      // Cache the original results
      searchCache[cacheKey] = {
        timestamp: now,
        results: formattedPosts
      };
      
      return formattedPosts;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        console.error('Search request timed out after 8 seconds');
        throw new Error('Search request timed out. Please try again.');
      }
      
      console.error('Fetch error during search:', fetchError);
      throw fetchError;
    }
  } catch (error) {
    console.error('Error enhancing search:', error);
    
    // More detailed error handling
    if (error instanceof TypeError && error.message.includes('JSON')) {
      console.error('JSON parsing error - possible binary response');
      throw new Error('The server returned an invalid response format. Please try again later.');
    } else if (error instanceof DOMException && error.name === 'AbortError') {
      console.error('Search request timed out');
      throw new Error('Search request timed out. Please try again.');
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('Network error during search');
      throw new Error('Network error. Please check your connection and try again.');
    }
    
    // Clear cache entry for this failed search
    delete searchCache[cacheKey];
    throw error;
  }
}

// Direct TX ID lookup
export async function lookupTransaction(txId: string): Promise<any> {
  if (!txId || typeof txId !== 'string' || txId.trim() === '') {
    throw new Error('Invalid transaction ID');
  }
  
  try {
    const response = await fetch(`${API_URL}/api/posts/tx/${txId.trim()}`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    const contentType = response.headers.get('content-type') || 'unknown';
    console.log(`TX lookup response type: ${contentType}, status: ${response.status}`);
    
    if (!response.ok) {
      let errorMessage = `Transaction lookup failed with status: ${response.status}`;
      
      if (response.status === 404) {
        errorMessage = 'Transaction not found';
      } else if (response.status === 500) {
        errorMessage = 'Server error processing transaction lookup';
      }
      
      throw new Error(errorMessage);
    }
    
    // Verify content type before parsing
    if (!contentType.includes('application/json')) {
      console.error(`Expected JSON but got ${contentType}`);
      throw new Error('Unexpected response format from server');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Transaction lookup error:', error);
    throw error;
  }
}

// Clear search cache
export function clearSearchCache(): void {
  console.log('Clearing entire search cache');
  Object.keys(searchCache).forEach(key => {
    delete searchCache[key];
  });
}

// Clear cache for a specific query
export function clearSearchCacheForQuery(query: string): void {
  console.log('Clearing cache for query:', query);
  Object.keys(searchCache).forEach(key => {
    if (key.startsWith(`${query}:`)) {
      delete searchCache[key];
    }
  });
} 