import { TransactionParser } from '../parser.js';
import { DbClient } from '../dbClient.js';
import { logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';

describe('TransactionParser Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DbClient;

    beforeAll(async () => {
        parser = new TransactionParser();
        dbClient = new DbClient();
        await dbClient.connect();
    });

    afterAll(async () => {
        await dbClient.disconnect();
    });

    beforeEach(async () => {
        await dbClient.cleanupTestData();
    });

    it('should successfully parse and store a real transaction from JungleBus', async () => {
        // Generate test data
        const timestamp = Date.now();
        const txid = randomUUID().replace(/-/g, '');
        const postId = `post-${randomUUID().substring(0, 8)}`;
        const senderAddress = '1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR';
        const blockHeight = Math.floor(Math.random() * 1000000);
        const blockTime = Math.floor(timestamp / 1000);
        const lockAmount = Math.floor(Math.random() * 10000);
        const lockDuration = Math.floor(Math.random() * 100);
        const content = `Test content ${timestamp}`;
        const voteQuestion = 'Which is your favorite?';
        const voteOptions = ['Option 1', 'Option 2', 'Option 3'];
        const imageFilename = 'test-image.png';
        const imageContentType = 'image/png';
        // 1x1 transparent PNG
        const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        // Create test transaction
        const tx = {
            id: txid,
            block_height: blockHeight,
            block_time: blockTime,
            addresses: [senderAddress],
            data: [
                'app=lockd.app',
                `postId=${postId}`,
                `lockDuration=${lockDuration}`,
                `lockAmount=${lockAmount}`,
                `content=${content}`,
                ...voteOptions.map(opt => `voteOption=${opt}`),
                `voteQuestion=${voteQuestion}`,
                `imageFilename=${imageFilename}`,
                `imageContentType=${imageContentType}`,
                imageBase64
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
            expect(parsedTx?.txid).toBe(txid);
            expect(parsedTx?.metadata.postId).toBe(postId);
            expect(parsedTx?.blockHeight).toBe(blockHeight);
            expect(parsedTx?.blockTime).toBe(blockTime);
            expect(parsedTx?.metadata.lockAmount).toBe(lockAmount);
            expect(parsedTx?.metadata.lockDuration).toBe(lockDuration);
            expect(parsedTx?.metadata.content).toBe(content);
            expect(parsedTx?.metadata.senderAddress).toBe(senderAddress);

            // Save transaction
            const savedTx = await dbClient.saveTransaction(parsedTx!);
            expect(savedTx).toBeDefined();
            expect(savedTx.txid).toBe(txid);
            expect(savedTx.post).toBeDefined();
            expect(savedTx.post?.id).toBe(postId);
            expect(savedTx.post?.senderAddress).toBe(senderAddress);

            // Verify the Post was created with image
            const post = await dbClient.getPostWithVoteOptions(parsedTx?.metadata.postId!);
            expect(post).toBeDefined();
            expect(post?.postId).toBe(postId);
            expect(post?.content).toBe(content);

            // Verify the image metadata
            expect(post?.image).toBeDefined();
            expect(Buffer.isBuffer(post?.image)).toBe(true);
            expect(post?.image?.length).toBe(70); // Size of our test PNG

            // Verify vote question was created
            expect(post?.voteQuestion).toBeDefined();
            expect(post?.voteQuestion?.question).toBe(voteQuestion);
            expect(post?.voteQuestion?.totalOptions).toBe(voteOptions.length);

            // Verify vote options were created
            expect(post?.voteOptions).toHaveLength(voteOptions.length);
            voteOptions.forEach((option, index) => {
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
