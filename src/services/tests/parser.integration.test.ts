import { TransactionParser } from '../parser.js';
import { DbClient } from '../dbClient.js';
import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';

describe('TransactionParser Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DbClient;

    beforeAll(async () => {
        parser = new TransactionParser();
        dbClient = new DbClient();

        try {
            // Ensure database is connected
            const isConnected = await dbClient.connect();
            if (!isConnected) {
                throw new Error('Failed to connect to database');
            }

            // Clean up test data
            await dbClient.cleanupTestData();
        } catch (error) {
            logger.error('Test setup failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }, 30000); // 30 second timeout

    afterAll(async () => {
        await dbClient.disconnect();
    }, 10000); // 10 second timeout

    it('should successfully parse and store a real transaction from JungleBus', async () => {
        // Test transaction ID
        const txid = 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598';
        
        try {
            // Fetch transaction from JungleBus API
            const response = await fetch(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}`);
            const tx = await response.json();

            logger.info('Fetched transaction for testing', {
                txid,
                outputCount: tx.outputs?.length
            });

            // Parse the transaction
            const parsedTx = await parser.parseTransaction(tx);
            expect(parsedTx).toBeTruthy();
            expect(parsedTx?.txid).toBe(txid);

            // Verify LOCK protocol data
            expect(parsedTx?.type).toBe('lock');
            expect(parsedTx?.protocol).toBe('LOCK');
            expect(parsedTx?.metadata).toBeTruthy();
            expect(parsedTx?.metadata.postId).toBe('m73g8bip-ceeh3n0x2');
            expect(parsedTx?.metadata.lockAmount).toBe(1000);
            expect(parsedTx?.metadata.lockDuration).toBe(1);

            // Store in database
            const result = await dbClient.saveTransaction(parsedTx!);
            expect(result).toBeTruthy();
            expect(result.txid).toBe(txid);

            // Verify storage
            const stored = await dbClient.getTransaction(txid);
            expect(stored).toBeTruthy();
            expect(stored?.txid).toBe(txid);
            expect(stored?.metadata.postId).toBe('m73g8bip-ceeh3n0x2');
            expect(stored?.metadata.lockAmount).toBe(1000);

            logger.info('Transaction successfully parsed and stored', {
                txid,
                postId: stored?.metadata.postId,
                lockAmount: stored?.metadata.lockAmount,
                blockHeight: stored?.blockHeight
            });

        } catch (error) {
            logger.error('Integration test failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }, 30000); // 30 second timeout
});
