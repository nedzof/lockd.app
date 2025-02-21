import { TransactionParser } from '../parser.js';
import { DbClient } from '../dbClient.js';
import { logger } from '../../utils/logger.js';

describe('TransactionParser Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DbClient;

    beforeAll(async () => {
        parser = new TransactionParser();
        dbClient = new DbClient();
        await dbClient.connect();
    });

    beforeEach(async () => {
        await dbClient.cleanupTestData();
    });

    afterAll(async () => {
        await dbClient.disconnect();
    });

    it('should successfully parse and store a real transaction from JungleBus', async () => {
        // Mock transaction data with real image
        const tx = {
            id: 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598',
            block_height: 883850,
            block_time: 1739458216,
            addresses: ['1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR'],
            data: [
                'app=lockd.app',
                'lockamount=1000',
                'lockduration=1',
                'postid=m73g8bip-ceeh3n0x2',
                'content=dwedwedd wedw wedwd',
                'voteoption=Option 1',
                'voteoption=Option 2',
                'voteoption=Option 3',
                'votequestion=Which is your favorite?',
                'filename=Screenshot from 2025-02-08 11-05-14.png',
                'contenttype=image/png',
                'image=iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='  // Actual base64 image data
            ],
            outputs: []
        };

        logger.info('Fetched transaction for testing', {
            txid: tx.id,
            outputCount: tx.outputs.length
        });

        try {
            // Parse the transaction
            const parsedTx = await parser.parseTransaction(tx);
            expect(parsedTx).toBeTruthy();
            expect(parsedTx?.txid).toBe(tx.id);
            expect(parsedTx?.metadata.postId).toBe('m73g8bip-ceeh3n0x2');

            // Save the transaction
            const savedTx = await dbClient.saveTransaction(parsedTx!);
            expect(savedTx).toBeTruthy();
            expect(savedTx.txid).toBe(tx.id);

            // Verify the Post was created with image
            const post = await dbClient.getPostWithVoteOptions(parsedTx?.metadata.postId!);
            expect(post).toBeTruthy();
            expect(post?.postId).toBe(parsedTx?.metadata.postId);
            expect(post?.content).toBe('dwedwedd wedw wedwd');

            // Verify the image metadata
            expect(post?.image).toBeTruthy();
            expect(Buffer.isBuffer(post?.image)).toBe(true);
            expect(post?.image?.length).toBe(70);

            // Verify vote question was created
            expect(post?.voteQuestion).toBeTruthy();
            expect(post?.voteQuestion?.question).toBe('Which is your favorite?');
            expect(post?.voteQuestion?.totalOptions).toBe(3);

            // Verify vote options were created
            expect(post?.voteOptions).toHaveLength(3);
            expect(post?.voteOptions[0].content).toBe('Option 1');
            expect(post?.voteOptions[1].content).toBe('Option 2');
            expect(post?.voteOptions[2].content).toBe('Option 3');

            // Verify vote options are properly linked
            expect(post?.voteOptions[0].voteQuestionId).toBe(post?.voteQuestion?.id);
            expect(post?.voteOptions[1].voteQuestionId).toBe(post?.voteQuestion?.id);
            expect(post?.voteOptions[2].voteQuestionId).toBe(post?.voteQuestion?.id);

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
