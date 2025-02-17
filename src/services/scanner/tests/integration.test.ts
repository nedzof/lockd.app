import { EventEmitter } from 'events';
import { TransactionScanner } from '../transactionScanner';
import { TransactionParser } from '../../parser/transactionParser';
import { MAPProtocolHandler } from '../../parser/map/mapProtocolHandler';
import { DBTransactionProcessor } from '../../dbworker/transactionProcessor';
import { VotePost, BasePost, VoteOption } from '../../common/types';
import { ScannerConfig } from '../scannerTypes';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class VerifyingMockDBProcessor extends DBTransactionProcessor {
    receivedOptions: VoteOption[] = [];
    receivedPosts: BasePost[] = [];

    constructor() {
        super();
    }

    async processPost(post: BasePost): Promise<any> {
        this.receivedPosts.push(post);
        if (post.type === 'vote_question') {
            const votePost = post as VotePost;
            this.receivedOptions = votePost.votingData?.options || [];
        }
        const result = {
            id: post.id,
            type: post.type,
            content: post.content,
            metadata: post.metadata
        };

        this.emit('transaction', {
            type: 'POST_PROCESSED',
            data: { post: result },
            timestamp: new Date()
        });

        return result;
    }

    async processBatch(posts: BasePost[]): Promise<any[]> {
        const results = [];
        for (const post of posts) {
            const result = await this.processPost(post);
            results.push(result);
        }
        return results;
    }

    clear() {
        this.receivedOptions = [];
        this.receivedPosts = [];
    }
}

const TEST_TX_DATA = {
    id: 'test_tx_id',
    transaction: 'dummy_tx_data',
    sub_contexts: ['SET'],
    data: [
        'app=lockd.app',
        'type=vote_question',
        'content=Test Vote Question',
        'totaloptions=2',
        'postid=test_post_id',
        'sequence=0',
        'timestamp=2025-02-17T16:49:28Z',
        'version=1.0.0',
        'tags=["test"]',
        'optionindex=0',
        'content=Option 1',
        'lockamount=1000',
        'lockduration=1',
        'optionindex=1',
        'content=Option 2',
        'lockamount=2000',
        'lockduration=2'
    ],
    merkle_proof: null
};

describe('Integration Tests', () => {
    let scanner: TransactionScanner;
    let parser: TransactionParser;
    let mapHandler: MAPProtocolHandler;
    let mockDB: VerifyingMockDBProcessor;
    let events: { [key: string]: any[] };

    const config: ScannerConfig = {
        jungleBusUrl: 'test-endpoint',
        startHeight: 0,
        batchSize: 100
    };

    beforeEach(async () => {
        // Reset events tracking
        events = {
            'TRANSACTION_SCANNED': [],
            'POST_PARSED': [],
            'POST_PROCESSED': []
        };

        // Initialize components
        mapHandler = new MAPProtocolHandler();
        parser = new TransactionParser();
        parser.addProtocolHandler(mapHandler);
        mockDB = new VerifyingMockDBProcessor();

        scanner = new TransactionScanner(config);
        scanner.setParser(parser);
        scanner.setDBProcessor(mockDB);

        // Set up event listeners
        scanner.on('TRANSACTION_SCANNED', (data: any) => {
            events['TRANSACTION_SCANNED'].push(data);
        });
        scanner.on('POST_PARSED', (data: any) => {
            events['POST_PARSED'].push(data);
        });
        mockDB.on('transaction', (event: any) => {
            if (event.type === 'POST_PROCESSED') {
                events['POST_PROCESSED'].push(event);
            }
        });

        // Clear mock data
        mockDB.clear();

        // Clean database
        await prisma.voteOption.deleteMany();
        await prisma.voteQuestion.deleteMany();
        await prisma.post.deleteMany();
    });

    afterEach(() => {
        scanner.removeAllListeners();
    });

    it('should process MAP protocol vote transaction with proper validation', async () => {
        // Mock the fetch call
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(TEST_TX_DATA)
        });

        // Process transaction
        const result = await scanner.scanTransaction('test_tx_id');

        // 1. Verify basic transaction processing
        expect(result).toBeDefined();
        expect(result?.type).toBe('vote_question');
        expect(result?.content).toBe('Test Vote Question');
        expect(result?.metadata).toBeDefined();

        // 2. Verify events were emitted
        expect(events['TRANSACTION_SCANNED'].length).toBe(1);
        expect(events['POST_PARSED'].length).toBe(1);
        expect(events['POST_PROCESSED'].length).toBe(1);

        // 3. Verify vote options were properly processed
        expect(mockDB.receivedOptions.length).toBe(2);
        
        // 4. Verify first option
        expect(mockDB.receivedOptions[0]).toMatchObject({
            index: 0,
            content: 'Option 1',
            lockAmount: 1000,
            lockDuration: 1
        });

        // 5. Verify second option
        expect(mockDB.receivedOptions[1]).toMatchObject({
            index: 1,
            content: 'Option 2',
            lockAmount: 2000,
            lockDuration: 2
        });

        // 6. Verify post metadata
        const post = mockDB.receivedPosts[0] as VotePost;
        expect(post).toBeDefined();
        expect(post.metadata?.postId).toBe('test_post_id');
        expect(post.metadata?.timestamp).toBe('2025-02-17T16:49:28Z');
        expect(post.metadata?.tags).toEqual(['test']);
        expect(post.votingData?.totalOptions).toBe(2);

        // Clean up
        (global.fetch as jest.Mock).mockRestore();
    });
});
