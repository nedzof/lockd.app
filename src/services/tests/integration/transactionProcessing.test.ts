import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Scanner } from '../../scanner';
import { TransactionParser } from '../../parser';
import { DBClient } from '../../dbClient';
import { PrismaClient } from '@prisma/client';
import bmap from 'bmapjs';
import axios from 'axios';

describe('Transaction Processing Integration Tests', () => {
    let prisma: PrismaClient;
    let scanner: Scanner;

    beforeAll(async () => {
        console.log('Test suite starting...');
    });

    beforeEach(async () => {
        console.log('Creating Prisma client');
        // Configure Prisma to use a new connection for each query
        prisma = new PrismaClient({
            log: ['query', 'error', 'warn'],
            datasources: {
                db: {
                    url: process.env.DATABASE_URL + '?pgbouncer=true'
                }
            }
        });
        
        try {
            console.log('Clearing database...');
            await prisma.$connect();
            console.log('Database connection established');
            
            // Use individual queries instead of a transaction
            await prisma.voteOption.deleteMany();
            await prisma.voteQuestion.deleteMany();
            await prisma.post.deleteMany();
            console.log('Database cleanup completed');
        } catch (error) {
            console.error('Error during database cleanup:', error);
            throw error;
        }
        
        console.log('Creating scanner instance');
        scanner = new Scanner();
    });

    afterEach(async () => {
        console.log('Cleaning up Prisma client');
        try {
            await prisma.$disconnect();
            console.log('Prisma client disconnected successfully');
        } catch (error) {
            console.error('Error disconnecting Prisma client:', error);
        }
    });

    afterAll(async () => {
        console.log('Test suite finished');
    });

    test('should process a real transaction from GorillaPool', async () => {
        console.log('Starting transaction processing test');
        const txid = "a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598";
        
        // Create transaction object with script
        const metadata = {
            app: "lockd.app",
            type: "content",
            postId: "m73g8bip",
            content: { text: "test" },
            tags: ["test"]
        };
        
        // Format script for bmap
        const hexData = Buffer.from(JSON.stringify(metadata)).toString('hex');
        const script = `OP_FALSE OP_RETURN ${hexData}`; // Standard OP_RETURN format
        console.log('Created script:', script);
        
        const realTx = {
            tx: {
                h: txid
            },
            in: [],  // BOB format requires 'in' array
            out: [{
                i: 0,  // Output index
                s: script,
                e: {   // BOB format extension data
                    v: 0,  // Value in satoshis
                    a: "1HrpGiZxAh9QMfuqM6PfqEzttPP1SFHhKx"  // Example address
                }
            }],
            blk: {
                i: 883850,
                t: 1739458216
            }
        };

        // Use the parser directly instead of the scanner
        const parser = new TransactionParser();
        const parsedTransaction = await parser.parseTransaction(realTx);
        console.log('Parsed transaction:', parsedTransaction);

        // Process the transaction
        if (parsedTransaction) {
            const dbClient = new DBClient();
            await dbClient.processTransaction(parsedTransaction);
            await dbClient.disconnect();
        } else {
            console.error('Failed to parse transaction');
        }

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify database state
        const post = await prisma.post.findUnique({
            where: {
                postId: metadata.postId
            }
        });
        console.log('Found post:', post);

        expect(post).toBeTruthy();
        expect(post?.type).toBe('content');
        expect((post?.content as any).text).toBe('test');
    });

    test('should process multiple outputs from the same transaction', async () => {
        console.log('Starting multiple outputs test');
        const txid = "a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598";
        
        // Create multiple metadata objects
        const metadata1 = {
            app: "lockd.app",
            type: "content",
            postId: "m73g8bip",
            content: { text: "test content 1" },
            tags: ["test", "multiple"]
        };
        
        const metadata2 = {
            app: "lockd.app",
            type: "content",
            postId: "n84h9cjq",
            content: { text: "test content 2" },
            tags: ["test", "multiple"]
        };
        
        // Format scripts for bmap
        const script1 = `OP_FALSE OP_RETURN ${Buffer.from(JSON.stringify(metadata1)).toString('hex')}`;
        const script2 = `OP_FALSE OP_RETURN ${Buffer.from(JSON.stringify(metadata2)).toString('hex')}`;
        console.log('Created scripts:', { script1, script2 });
        
        const realTx = {
            tx: {
                h: txid
            },
            in: [],
            out: [
                {
                    i: 0,
                    s: script1,
                    e: {
                        v: 0,
                        a: "1HrpGiZxAh9QMfuqM6PfqEzttPP1SFHhKx"
                    }
                },
                {
                    i: 1,
                    s: script2,
                    e: {
                        v: 0,
                        a: "1HrpGiZxAh9QMfuqM6PfqEzttPP1SFHhKx"
                    }
                }
            ],
            blk: {
                i: 883850,
                t: 1739458216
            }
        };

        // Use the parser directly
        const parser = new TransactionParser();
        const parsedTransactions = await parser.parseTransaction(realTx);
        console.log('Parsed transactions:', parsedTransactions);

        // Process each parsed transaction
        if (parsedTransactions) {
            const dbClient = new DBClient();
            await dbClient.processTransaction(parsedTransactions);
            await dbClient.disconnect();
        } else {
            console.error('Failed to parse transactions');
        }

        // Verify database state for both posts
        const post1 = await prisma.post.findUnique({
            where: {
                postId: metadata1.postId
            }
        });
        console.log('Found post 1:', post1);

        const post2 = await prisma.post.findUnique({
            where: {
                postId: metadata2.postId
            }
        });
        console.log('Found post 2:', post2);

        expect(post1).toBeTruthy();
        expect(post1?.type).toBe('content');
        expect((post1?.content as any).text).toBe('test content 1');
        expect(post1?.blockTime).toEqual(new Date(realTx.blk.t * 1000));

        expect(post2).toBeTruthy();
        expect(post2?.type).toBe('content');
        expect((post2?.content as any).text).toBe('test content 2');
        expect(post2?.blockTime).toEqual(new Date(realTx.blk.t * 1000));
    });
});