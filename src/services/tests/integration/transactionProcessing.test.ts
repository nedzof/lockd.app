import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import { TransactionParser } from '../../parser';
import { DBClient } from '../../dbClient';
import { Transaction } from '../../types';

describe('Transaction Processing Integration Tests', () => {
    let parser: TransactionParser;
    let dbClient: DBClient;

    beforeAll(async () => {
        parser = new TransactionParser();
        dbClient = new DBClient();
    });

    afterAll(async () => {
        await dbClient.disconnect();
    });

    test('should process MAP transaction with content and tags', async () => {
        const tx: Transaction = {
            id: 'test-tx-1',
            inputs: [],
            outputs: [{
                script: '6a4c6d7b226170706c69636174696f6e223a226c6f636b642e617070222c2274797065223a22636f6e74656e74222c22636f6e74656e74223a227765647722' +
                        '2c22706f73744964223a226d373367386269702d63656568336e307832222c2274696d657374616d70223a22323032352d30322d31335431343a34323a32372e3032355a222c' +
                        '2274616773223a5b2253706f727473225d7d'
            }],
            blockHeight: 1000,
            blockTime: new Date('2025-02-13T14:42:27.025Z')
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        expect(parsedTx?.protocol).toBe('MAP');
        expect(parsedTx?.type).toBe('content');
        expect(parsedTx?.postId).toBe('m73g8bip-ceeh3n0x2');
        expect(parsedTx?.content).toBe('wedw');
        expect(parsedTx?.tags).toEqual(['Sports']);
    });

    test('should process transaction with vote and lock data', async () => {
        const tx: Transaction = {
            id: 'test-tx-2',
            inputs: [],
            outputs: [{
                script: '6a4c6d7b226170706c69636174696f6e223a226c6f636b642e617070222c2274797065223a22766f74655f7175657374696f6e222c226f7074696f6e7348617368223a22' +
                        '336337616234353233363763313733313634346435323235363230376534646633633738313965343336343530366232323237653163666539363963386365382c226c6f636b416d6f756e74223a2231303030227d'
            }],
            blockHeight: 1001,
            blockTime: new Date('2025-02-13T14:43:27.025Z')
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        expect(parsedTx?.protocol).toBe('MAP');
        expect(parsedTx?.type).toBe('vote_question');
        expect(parsedTx?.vote?.optionsHash).toBe('3c7ab452367c1731644d52256207e4df3c7819e4364506b2227e1cfe969c8ce8');
        expect(parsedTx?.lock?.amount).toBe(1000);
    });

    test('should handle image content correctly', async () => {
        // Create a simple PNG buffer
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const imageData = Buffer.concat([pngSignature, Buffer.from('test image data')]);
        
        const tx: Transaction = {
            id: 'test-tx-3',
            inputs: [],
            outputs: [{
                script: Buffer.concat([
                    Buffer.from('6a', 'hex'), // OP_RETURN
                    Buffer.from([imageData.length]), // PUSHDATA
                    imageData
                ]).toString('hex')
            }],
            blockHeight: 1002,
            blockTime: new Date('2025-02-13T14:44:27.025Z')
        };

        const parsedTx = await parser.parseTransaction(tx);
        expect(parsedTx).toBeTruthy();
        expect(parsedTx?.protocols).toContain('ORD');
        expect(parsedTx?.contentType).toBe('image/png');
        expect(parsedTx?.data).toBeTruthy();
    });
});