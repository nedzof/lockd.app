import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import axios from 'axios';
import PolymarketService from '../polymarket.service';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PolymarketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractMarketIdFromUrl', () => {
    it('should extract market ID from Putin-Trump meeting URL', () => {
      const url = 'https://polymarket.com/event/will-putin-meet-with-trump-by-first-100-days?tid=1739217291887';
      const marketId = PolymarketService.extractMarketIdFromUrl(url);
      expect(marketId).toBe('1739217291887');
    });

    it('should extract market ID from German election URL', () => {
      const url = 'https://polymarket.com/event/germany-parliamentary-election?tid=1739217408445';
      const marketId = PolymarketService.extractMarketIdFromUrl(url);
      expect(marketId).toBe('1739217408445');
    });

    it('should return null for invalid URLs', () => {
      const invalidUrls = [
        'https://example.com',
        'not-a-url',
        'https://polymarket.com/event/',
        'https://polymarket.com/event/something'
      ];

      invalidUrls.forEach(url => {
        expect(PolymarketService.extractMarketIdFromUrl(url)).toBeNull();
      });
    });
  });

  describe('getMarketData', () => {
    it('should fetch binary market data (Putin-Trump meeting)', async () => {
      const mockBinaryMarketData = {
        data: {
          data: {
            id: '1739217291887',
            attributes: {
              question: 'Will Putin meet with Trump by first 100 days?',
              description: 'Binary market about potential meeting',
              closeTime: '2024-12-31T23:59:59Z',
              volume: '100000',
              probability: 0.35,
              status: 'open',
            }
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockBinaryMarketData);

      const result = await PolymarketService.getMarketData('1739217291887');
      
      expect(result).toEqual({
        id: '1739217291887',
        question: 'Will Putin meet with Trump by first 100 days?',
        description: 'Binary market about potential meeting',
        closeTime: '2024-12-31T23:59:59Z',
        volume: '100000',
        probability: 0.35,
        status: 'open'
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://strapi-matic.poly.market/api/markets/1739217291887'
      );
    });

    it('should fetch multi-option market data (German election)', async () => {
      const mockMultiOptionMarketData = {
        data: {
          data: {
            id: '1739217408445',
            attributes: {
              question: 'Germany Parliamentary Election',
              description: 'Which party will win the most seats?',
              closeTime: '2025-10-31T23:59:59Z',
              volume: '250000',
              probability: 0.28,
              status: 'open',
            }
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMultiOptionMarketData);

      const result = await PolymarketService.getMarketData('1739217408445');
      
      expect(result).toEqual({
        id: '1739217408445',
        question: 'Germany Parliamentary Election',
        description: 'Which party will win the most seats?',
        closeTime: '2025-10-31T23:59:59Z',
        volume: '250000',
        probability: 0.28,
        status: 'open'
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://strapi-matic.poly.market/api/markets/1739217408445'
      );
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('API Error'));
      
      const result = await PolymarketService.getMarketData('invalid-id');
      expect(result).toBeNull();
    });
  });

  describe('validatePolymarketUrl', () => {
    it('should validate and fetch data for binary market URL', async () => {
      const url = 'https://polymarket.com/event/will-putin-meet-with-trump-by-first-100-days?tid=1739217291887';
      const mockMarketData = {
        data: {
          data: {
            id: '1739217291887',
            attributes: {
              question: 'Will Putin meet with Trump by first 100 days?',
              description: 'Binary market about potential meeting',
              closeTime: '2024-12-31T23:59:59Z',
              volume: '100000',
              probability: 0.35,
              status: 'open',
            }
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMarketData);

      const result = await PolymarketService.validatePolymarketUrl(url);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('1739217291887');
    });

    it('should validate and fetch data for multi-option market URL', async () => {
      const url = 'https://polymarket.com/event/germany-parliamentary-election?tid=1739217408445';
      const mockMarketData = {
        data: {
          data: {
            id: '1739217408445',
            attributes: {
              question: 'Germany Parliamentary Election',
              description: 'Which party will win the most seats?',
              closeTime: '2025-10-31T23:59:59Z',
              volume: '250000',
              probability: 0.28,
              status: 'open',
            }
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockMarketData);

      const result = await PolymarketService.validatePolymarketUrl(url);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('1739217408445');
    });

    it('should return null for invalid URLs', async () => {
      const result = await PolymarketService.validatePolymarketUrl('invalid-url');
      expect(result).toBeNull();
    });
  });
}); 