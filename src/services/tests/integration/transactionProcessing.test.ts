import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { TransactionParser } from '../../parser';
import { DBClient } from '../../dbClient';
import { Transaction } from '../../types';
import { cleanupDatabase, closeConnection, getTestClient } from './db';

describe('Transaction Processing Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DBClient;

    beforeAll(async () => {
        await cleanupDatabase();
    });

    beforeEach(async () => {
        parser = new TransactionParser();
        dbClient = new DBClient();
    });

    afterAll(async () => {
        await closeConnection();
    });

    test('should process specific transaction a043fbcd', async () => {
        const tx: Transaction = {
            id: 'a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598',
            inputs: [],
            outputs: [{
                script: '6a4c8e7b226170706c69636174696f6e223a226c6f636b642e617070222c22706f73744964223a226d373367386269702d63656568336e307832222c2274616773223a5b2253706f727473225d7d'
            }],
            blockHeight: 1000,
            blockTime: new Date('2025-02-13T14:42:27.025Z')
        };

        const parsedTx = await parser.parseTransaction(tx);
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        };
        expect(parsedTx).toBeTruthy();
        expect(parsedTx).toMatchObject({
            txid: tx.id,
            postId: 'm73g8bip-ceeh3n0x2',
            protocol: 'MAP',
            blockHeight: 1000,
            contents: expect.arrayContaining([
                expect.objectContaining({
                    type: 'text/plain',
                    data: 'wedw'
                })
            ]),
            vote: expect.objectContaining({
                optionsHash: '3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8',
                options: expect.arrayContaining([
                    expect.objectContaining({
                        lockAmount: 1000,
                        lockDuration: 1
                    })
                ])
            })
        });

        // Save to database
        await dbClient.saveTransaction(parsedTx);

        // Verify database state using raw SQL
        const client = await getTestClient();
        try {
            // Check ProcessedTransaction
            const processedTx = await client.query(
                'SELECT * FROM "ProcessedTransaction" WHERE txid = $1',
                [parsedTx.txid]
            );
            expect(processedTx.rows.length).toBe(1);
            expect(processedTx.rows[0].txid).toBe(parsedTx.txid);

            // Check Post
            const post = await client.query(
                'SELECT * FROM "Post" WHERE "postId" = $1',
                [parsedTx.postId]
            );
            expect(post.rows.length).toBe(1);
            expect(post.rows[0].postId).toBe(parsedTx.postId);
            expect(post.rows[0].protocol).toBe('MAP');
        } finally {
            client.release();
        }
    });

    test('should handle binary image data correctly', async () => {
        // Create a PNG buffer
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const imageData = Buffer.concat([pngSignature, Buffer.from('test image data')]);
        
        const tx: Transaction = {
            id: 'test-image-tx',
            inputs: [],
            outputs: [{
                script: Buffer.concat([
                    Buffer.from('6a', 'hex'), // OP_RETURN
                    Buffer.from('4c', 'hex'), // PUSHDATA1
                    Buffer.from([imageData.length]), // Length
                    imageData
                ]).toString('hex')
            }],
            blockHeight: 1001,
            blockTime: new Date()
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        expect(parsedTx.contents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'image/png',
                    encoding: 'base64',
                    data: expect.any(String)
                })
            ])
        );
    });

    test('should handle sequence and parent sequence', async () => {
        const tx: Transaction = {
            id: 'test-sequence-tx',
            inputs: [],
            outputs: [{
                script: '6a4c6d7b226170706c69636174696f6e223a226c6f636b642e617070222c2274797065223a22766f74655f6f7074696f6e222c22706f73744964223a226d373367386269702d63656568336e307832222c2273657175656e6365223a2231222c22706172656e7453657175656e6365223a2230227d'
            }],
            blockHeight: 1002,
            blockTime: new Date()
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }
        // Check the parsed transaction
        expect(parsedTx).toMatchObject({
            txid: tx.id,
            protocol: 'MAP',
            postId: 'm73g8bip-ceeh3n0x2',
            sequence: 1,
            parentSequence: 0
        });
    });
});