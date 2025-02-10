import axios from 'axios';
import { PolymarketResponse, PolymarketEvent, PolymarketApiResponse } from '../types/polymarket';

export class PolymarketService {
  private readonly API_BASE = 'https://gamma-api.polymarket.com';

  private cleanUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove query parameters but keep the path
      const cleanPath = urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash if present
      return `${urlObj.origin}${cleanPath}`;
    } catch {
      return url;
    }
  }

  private extractSearchTermFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part);
      // Get the last non-empty part of the path
      const eventSlug = pathParts[pathParts.length - 1];
      return eventSlug || null;
    } catch {
      return null;
    }
  }

  private async findExactMatchingMarket(searchSlug: string): Promise<PolymarketEvent | null> {
    try {
      // Try active markets first, then closed markets
      const endpoints = [
        `${this.API_BASE}/events?closed=false`,
        `${this.API_BASE}/events?closed=true`
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(endpoint);
        if (!response.ok) {
          console.log(`Failed to fetch from ${endpoint}: ${response.status}`);
          continue;
        }
        
        const data = await response.json() as PolymarketApiResponse[];
        
        // First try to find an exact event match
        const eventMatch = data.find(event => {
          // Check both event slug and title for matches
          return event.slug === searchSlug || 
                 event.slug === searchSlug.toLowerCase() ||
                 event.title?.toLowerCase() === searchSlug.toLowerCase();
        });

        if (eventMatch && eventMatch.markets && eventMatch.markets.length > 0) {
          // For grouped markets (GMP), find the specific market that matches
          if (eventMatch.markets.length > 1) {
            const marketMatch = eventMatch.markets.find(m => 
              m.slug === searchSlug || 
              m.question?.toLowerCase().includes(searchSlug.toLowerCase())
            );
            if (marketMatch) {
              return {
                ...marketMatch,
                outcomes: Array.isArray(marketMatch.outcomes) ? marketMatch.outcomes : JSON.parse(marketMatch.outcomes),
                outcomePrices: Array.isArray(marketMatch.outcomePrices) ? marketMatch.outcomePrices : JSON.parse(marketMatch.outcomePrices),
                volume: marketMatch.volumeNum ? marketMatch.volumeNum.toString() : marketMatch.volume
              };
            }
          }
          
          // For single market events (SMP), use the first market
          const market = eventMatch.markets[0];
          return {
            ...market,
            slug: eventMatch.slug,
            outcomes: Array.isArray(market.outcomes) ? market.outcomes : JSON.parse(market.outcomes),
            outcomePrices: Array.isArray(market.outcomePrices) ? market.outcomePrices : JSON.parse(market.outcomePrices),
            volume: market.volumeNum ? market.volumeNum.toString() : market.volume
          };
        }
      }

      console.log(`Market not found: ${searchSlug}`);
      return null;
    } catch (error) {
      console.error('Error fetching market data:', error);
      throw error;
    }
  }

  public async validatePolymarketUrl(url: string): Promise<PolymarketResponse | null> {
    try {
      const cleanedUrl = this.cleanUrl(url);
      const searchSlug = this.extractSearchTermFromUrl(cleanedUrl);
      
      if (!searchSlug) {
        console.log('Could not extract search slug from URL:', url);
        return null;
      }

      const market = await this.findExactMatchingMarket(searchSlug);
      if (!market) {
        console.log('No exact matching market found for slug:', searchSlug);
        return null;
      }

      const outcomes = Array.isArray(market.outcomes) ? market.outcomes : JSON.parse(market.outcomes);
      const prices = Array.isArray(market.outcomePrices) ? market.outcomePrices : JSON.parse(market.outcomePrices);
      
      return {
        url: cleanedUrl,
        probability: parseFloat(prices[0]) * 100, // Use first outcome's probability for binary markets
        volume: market.volumeNum || parseFloat(market.volume),
        outcomes: outcomes.map((outcome: string, index: number) => ({
          name: outcome,
          probability: parseFloat(prices[index]) * 100
        }))
      };
    } catch (error) {
      console.error('Error validating Polymarket URL:', error);
      return null;
    }
  }

  public async searchMarketsByTitle(title: string): Promise<PolymarketResponse[]> {
    try {
      const market = await this.findExactMatchingMarket(title);
      if (!market) {
        return [];
      }

      const outcomes = Array.isArray(market.outcomes) ? market.outcomes : JSON.parse(market.outcomes);
      const prices = Array.isArray(market.outcomePrices) ? market.outcomePrices : JSON.parse(market.outcomePrices);

      return [{
        url: `https://polymarket.com/event/${market.slug}`,
        probability: parseFloat(prices[0]) * 100,
        volume: market.volumeNum || parseFloat(market.volume),
        outcomes: outcomes.map((outcome: string, index: number) => ({
          name: outcome,
          probability: parseFloat(prices[index]) * 100
        }))
      }];
    } catch (error) {
      console.error('Error searching markets by title:', error);
      return [];
    }
  }
} 