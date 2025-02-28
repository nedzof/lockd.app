import { TransactionParser } from '../parser';
import { DbClient } from '../dbClient';
import { jest } from '@jest/globals';

// Mock the DbClient
jest.mock('../dbClient');

describe('TransactionParser', () => {
  let parser: TransactionParser;
  let mockDbClient: jest.Mocked<DbClient>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock DbClient
    mockDbClient = {
      getTransaction: jest.fn(),
      processTransaction: jest.fn(),
    } as unknown as jest.Mocked<DbClient>;
    
    // Create parser instance with mock DbClient
    parser = new TransactionParser(mockDbClient);
  });

  describe('extractLockProtocolData', () => {
    it('should return null for non-array data', () => {
      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(null, {});
      expect(result).toBeNull();
    });

    it('should return null for non-lockd.app transactions', () => {
      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(['app=other.app'], {});
      expect(result).toBeNull();
    });

    it('should extract basic post data', () => {
      const data = [
        'app=lockd.app',
        'postid=test123',
        'content=Test post content',
        'lockamount=1000',
        'lockduration=144'
      ];

      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(data, {});
      
      expect(result).not.toBeNull();
      expect(result?.post_id).toBe('test123');
      expect(result?.content).toBe('Test post content');
      expect(result?.lock_amount).toBe(1000);
      expect(result?.lock_duration).toBe(144);
      expect(result?.is_vote).toBeUndefined();
    });

    it('should extract vote post data', () => {
      const data = [
        'app=lockd.app',
        'postid=vote123',
        'content=What is your favorite color?',
        'type=vote_question',
        'totaloptions=3',
        'optionshash=abc123',
        'content=Red',
        'content=Blue',
        'content=Green'
      ];

      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(data, {});
      
      expect(result).not.toBeNull();
      expect(result?.post_id).toBe('vote123');
      expect(result?.content).toBe('Green');
      expect(result?.is_vote).toBe(true);
      expect(result?.content_type).toBe('vote');
      expect(result?.total_options).toBe(3);
      expect(result?.options_hash).toBe('abc123');
      expect(result?.vote_options).toEqual(['Red', 'Blue', 'Green']);
    });

    it('should extract vote post data with content_type=vote', () => {
      const data = [
        'app=lockd.app',
        'postid=vote456',
        'content=Which framework do you prefer?',
        'content_type=vote',
        'type=vote_question', 
        'content=React',
        'content=Vue',
        'content=Angular'
      ];

      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(data, {});
      
      expect(result).not.toBeNull();
      expect(result?.post_id).toBe('vote456');
      expect(result?.content).toBe('Angular');
      expect(result?.is_vote).toBe(true);
      expect(result?.content_type).toBe('vote');
      expect(result?.vote_options).toEqual(['React', 'Vue', 'Angular']);
    });

    it('should extract image metadata', () => {
      const data = [
        'app=lockd.app',
        'postid=image123',
        'content=Post with image',
        'contenttype=image/jpeg',
        'filename=test.jpg',
        'imagewidth=800',
        'imageheight=600',
        'imagesize=12345',
        'type=image'
      ];

      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(data, {});
      
      expect(result).not.toBeNull();
      expect(result?.post_id).toBe('image123');
      expect(result?.content).toBe('Post with image');
      expect(result?.image_metadata).toEqual({
        content_type: 'image/jpeg',
        filename: 'test.jpg',
        width: 800,
        height: 600,
        size: 12345,
        encoding: undefined,
        format: undefined
      });
    });

    it('should return null for missing content and image', () => {
      const data = [
        'app=lockd.app',
        'postid=empty123',
        'lockamount=1000',
        'lockduration=144'
      ];

      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(data, {});
      
      expect(result).toBeNull();
    });

    it('should extract tags from transaction data', () => {
      const data = [
        'app=lockd.app',
        'postid=tags123',
        'content=Post with tags',
        'tags=bitcoin',
        'tags=bsv',
        'tags=lockd'
      ];

      // @ts-ignore - Access private method for testing
      const result = parser.extractLockProtocolData(data, {});
      
      expect(result).not.toBeNull();
      expect(result?.post_id).toBe('tags123');
      expect(result?.content).toBe('Post with tags');
      expect(result?.tags).toEqual(['bitcoin', 'bsv', 'lockd']);
    });
  });
});
