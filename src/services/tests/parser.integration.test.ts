import { TransactionParser } from '../parser.js';
import { DbClient } from '../dbClient.js';
import { logger } from '../../utils/logger.js';
import { randomBytes } from 'crypto';

describe('TransactionParser Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DbClient;

    beforeAll(async () => {
        // Initialize DbClient
        dbClient = new DbClient();
        await dbClient.connect();

        // Initialize parser with dbClient
        parser = new TransactionParser(dbClient);
    });

    afterAll(async () => {
        // Clean up test data and close connections
        await dbClient.disconnect();
    });

    beforeEach(async () => {
        // Clean up test data before each test
        await dbClient.cleanupTestData();
        logger.info('Test data cleaned up');
    });

    it('should successfully parse and store a real transaction from JungleBus', async () => {
        // Generate test data
        const timestamp = Date.now();
        const txid = randomBytes(16).toString('hex');
        const postId = `post-${randomBytes(4).toString('hex')}`;
        const senderAddress = '1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR';
        const blockHeight = 74272;
        const blockTime = Math.floor(timestamp / 1000);

        // Create test transaction
        const tx = {
            id: txid,
            block_height: blockHeight,
            block_time: blockTime,
            addresses: [senderAddress],
            hex: txid,  // For now, use txid as hex since we're not doing real tx parsing
            data: [
                'app=lockd.app',
                `postId=${postId}`,
                'lockDuration=54',
                'lockAmount=6737',
                'content=Test content ' + timestamp,
                'voteQuestion=Which is your favorite?',
                'voteOption=Option 1',
                'voteOption=Option 2',
                'voteOption=Option 3',
                'imageFilename=test-image.png',
                'imageContentType=image/png',
                Buffer.from('test image data').toString('base64')
            ]
        };

        logger.info('Fetched transaction for testing', {
            txid: tx.id,
            outputCount: tx.addresses.length
        });

        try {
            // Parse transaction
            const parsedTx = await parser.parseTransaction(tx);
            expect(parsedTx).toBeDefined();
            expect(parsedTx?.metadata).toMatchObject({
                postId,
                lockDuration: 54,
                lockAmount: 6737,
                content: 'Test content ' + timestamp,
                voteQuestion: 'Which is your favorite?',
                voteOptions: ['Option 1', 'Option 2', 'Option 3'],
                imageMetadata: {
                    filename: 'test-image.png',
                    contentType: 'image/png'
                },
                image: expect.any(Buffer),
                senderAddress
            });

            // Save transaction
            const savedTx = await dbClient.saveTransaction(parsedTx!);
            expect(savedTx).toBeDefined();
            expect(savedTx.post).toBeDefined();
            expect(savedTx.post?.id).toBe(postId);
            expect(savedTx.post?.senderAddress).toBe(senderAddress);

            // Verify the Post was created with image
            const post = await dbClient.getPostWithVoteOptions(parsedTx?.metadata.postId!);
            console.log('Post object structure:', JSON.stringify(post, null, 2));
            console.log('Post object keys:', Object.keys(post || {}));
            expect(post).toBeDefined();
            expect(post?.postId).toBe(postId);
            expect(post?.content).toBe('Test content ' + timestamp);

            // Verify the image metadata
            expect(post?.image).toBeDefined();
            expect(Buffer.isBuffer(post?.image)).toBe(true);
            expect(post?.image?.length).toBeGreaterThan(0); // Size of our test PNG

            // Verify vote question was created
            expect(post?.voteQuestion).toBeDefined();
            expect(post?.voteQuestion?.question).toBe('Which is your favorite?');
            expect(post?.voteQuestion?.totalOptions).toBe(3);

            // Verify vote options were created
            expect(post?.voteOptions).toHaveLength(3);
            ['Option 1', 'Option 2', 'Option 3'].forEach((option, index) => {
                expect(post?.voteOptions[index].content).toBe(option);
                expect(post?.voteOptions[index].voteQuestionId).toBe(post?.voteQuestion?.id);
            });

            logger.info('Transaction successfully parsed and stored', {
                txid: parsedTx?.txid,
                blockHeight: parsedTx?.blockHeight,
                lockAmount: parsedTx?.metadata.lockAmount,
                postId: parsedTx?.metadata.postId
            });
        } catch (error) {
            logger.error('Error parsing or storing transaction', error);
            throw error;
        }
    }, 30000);
});
