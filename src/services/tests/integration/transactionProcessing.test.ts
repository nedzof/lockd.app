import { PrismaClient } from '@prisma/client';
import { Scanner } from '../../scanner';
import { DBClient } from '../../dbClient';
import { TransactionParser } from '../../parser';
import { Transaction, ParsedTransaction } from '../../types';
import fetch from 'node-fetch';

describe('Transaction Processing Integration Tests', () => {
    let prisma: PrismaClient;
    let scanner: Scanner;

    beforeAll(() => {
        console.log('Test suite starting...');
        jest.setTimeout(30000); // Increase timeout to 30 seconds
    });

    beforeEach(async () => {
        console.log('Creating Prisma client');
        
        // Ensure any existing connection is closed
        if (prisma) {
            await prisma.$disconnect();
        }
        
        // Get database URL from environment and ensure it's a test database
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            throw new Error('DATABASE_URL environment variable is not set');
        }
        
        const testDbUrl = dbUrl.includes('?') 
            ? dbUrl.replace('lockd?', 'lockd_test?')
            : dbUrl.replace('lockd', 'lockd_test');
            
        console.log('Using test database URL:', testDbUrl);
        
        prisma = new PrismaClient({
            datasources: {
                db: {
                    url: testDbUrl
                }
            }
        });
        
        console.log('Clearing database...');
        try {
            await prisma.$connect();
            
            // Clean up database one table at a time with error handling
            try {
                await prisma.voteOption.deleteMany();
                console.log('Cleared VoteOption table');
            } catch (error) {
                console.warn('Error clearing VoteOption table:', error);
            }
            
            try {
                await prisma.voteQuestion.deleteMany();
                console.log('Cleared VoteQuestion table');
            } catch (error) {
                console.warn('Error clearing VoteQuestion table:', error);
            }
            
            try {
                await prisma.post.deleteMany();
                console.log('Cleared Post table');
            } catch (error) {
                console.warn('Error clearing Post table:', error);
            }
            
            console.log('Database cleanup completed');
            console.log('Database connection established');
        } catch (error) {
            console.error('Error during database setup:', error);
            throw error;
        }
    });

    afterEach(async () => {
        console.log('Cleaning up Prisma client');
        if (prisma) {
            await prisma.$disconnect();
            console.log('Prisma client disconnected successfully');
        }
    });

    afterAll(async () => {
        console.log('Test suite finished');
        if (prisma) {
            await prisma.$disconnect();
        }
    });

    beforeEach(() => {
        console.log('Creating scanner instance');
        scanner = new Scanner();
    });

    it('should process a real transaction from GorillaPool', async () => {
        console.log('Starting transaction processing test');

        // Fetch and parse real transaction from GorillaPool
        const response = await fetch('https://junglebus.gorillapool.io/v1/transaction/get/a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598');
        if (!response.ok) {
            throw new Error(`Failed to fetch transaction: ${response.statusText}`);
        }
        const txData = await response.json();
        
        console.log('Raw GorillaPool transaction:', {
            id: txData.id,
            outputCount: txData.outputs?.length,
            firstOutput: txData.outputs?.[0]?.slice(0, 32),
            addresses: txData.addresses
        });
        
        // Convert GorillaPool format to our Transaction type
        const tx: Transaction = {
            tx: { h: txData.id },
            in: txData.inputs.map((input: any, index: number) => ({
                i: index,
                e: {
                    h: input.hash || 'input_tx_hash',
                    i: input.index || 0,
                    a: txData.addresses[0]
                }
            })),
            out: txData.outputs.map((output: any, index: number) => {
                // Only prefix OP_RETURN outputs
                const isOpReturn = output.startsWith('0063036f7264') || output.startsWith('006a');
                let script;
                if (isOpReturn) {
                    // Create a properly encoded OP_RETURN output with our test data
                    const testData = {
                        app: 'lockd.app',
                        type: 'content',
                        postId: `m73g8bip_${index}`,
                        content: `test content ${index + 1}`
                    };
                    const encoded = Buffer.from(JSON.stringify(testData)).toString('hex');
                    script = `OP_FALSE OP_RETURN ${encoded}`;
                } else {
                    script = output;
                }
                console.log(`Output ${index}:`, {
                    isOpReturn,
                    originalOutput: output.slice(0, 32),
                    transformedScript: script.slice(0, 32),
                    fullLength: script.length,
                    isOrd: output.startsWith('0063036f7264'),
                    is6a: output.startsWith('006a')
                });
                return {
                    i: index,
                    s: script,
                    e: {
                        v: 0,
                        i: index,
                        a: txData.addresses[0]
                    }
                };
            }),
            blk: {
                i: txData.block_height,
                t: txData.block_time
            },
            metadata: {
                postId: 'm73g8bip_0',
                type: 'content',
                content: 'test content 1'
            }
        };

        console.log('Transformed transaction:', {
            txid: tx.tx.h,
            inputCount: tx.in?.length,
            outputCount: tx.out?.length,
            firstOutput: tx.out?.[0]?.s?.slice(0, 32)
        });

        const parser = new TransactionParser();
        const parsedTx = await parser.parseTransaction(tx);
        
        expect(parsedTx).not.toBeNull();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }

        const dbClient = new DBClient();
        await dbClient.processTransaction(parsedTx);

        // Verify the transaction was processed
        const postClient = new PrismaClient({
            datasources: {
                db: {
                    url: process.env.DATABASE_URL?.replace('lockd', 'lockd_test')
                }
            }
        });
        await postClient.$connect();
        const post = await postClient.post.findFirst({
            where: {
                postId: 'm73g8bip_0'
            }
        });
        await postClient.$disconnect();
        
        console.log('Found post:', post);

        expect(post).toBeDefined();
        expect(post?.type).toBe('content');
        expect(post?.content).toBe('test content 1');
    });

    it('should process multiple outputs from the same transaction', async () => {
        // Fetch and parse real transaction from GorillaPool
        const response = await fetch('https://junglebus.gorillapool.io/v1/transaction/get/a043fbcdc79628136708f88fad1e33f367037aa3d1bb0bff4bfffe818ec4b598');
        if (!response.ok) {
            throw new Error(`Failed to fetch transaction: ${response.statusText}`);
        }
        const txData = await response.json();
        
        // Convert GorillaPool format to our Transaction type
        const tx: Transaction = {
            tx: { h: txData.id },
            in: txData.inputs.map((input: any, index: number) => ({
                i: index,
                e: {
                    h: input.hash || 'input_tx_hash',
                    i: input.index || 0,
                    a: txData.addresses[0]
                }
            })),
            out: txData.outputs.map((output: any, index: number) => {
                // Only prefix OP_RETURN outputs
                const isOpReturn = output.startsWith('0063036f7264') || output.startsWith('006a');
                let script;
                if (isOpReturn) {
                    // Create a properly encoded OP_RETURN output with our test data
                    const testData = {
                        app: 'lockd.app',
                        type: 'content',
                        postId: `m73g8bip_${index}`,
                        content: `test content ${index + 1}`
                    };
                    const encoded = Buffer.from(JSON.stringify(testData)).toString('hex');
                    script = `OP_FALSE OP_RETURN ${encoded}`;
                } else {
                    script = output;
                }
                console.log(`Output ${index}:`, {
                    isOpReturn,
                    originalOutput: output.slice(0, 32),
                    transformedScript: script.slice(0, 32),
                    fullLength: script.length,
                    isOrd: output.startsWith('0063036f7264'),
                    is6a: output.startsWith('006a')
                });
                return {
                    i: index,
                    s: script,
                    e: {
                        v: 0,
                        i: index,
                        a: txData.addresses[0]
                    }
                };
            }),
            blk: {
                i: txData.block_height,
                t: txData.block_time
            },
            metadata: {
                postId: 'm73g8bip_0',
                type: 'content',
                content: 'test content 1'
            }
        };

        const parser = new TransactionParser();
        const parsedTx = await parser.parseTransaction(tx);
        
        expect(parsedTx).not.toBeNull();
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }

        const dbClient = new DBClient();
        await dbClient.processTransaction(parsedTx);

        // Verify that multiple outputs were processed
        const postsClient = new PrismaClient({
            datasources: {
                db: {
                    url: process.env.DATABASE_URL?.replace('lockd', 'lockd_test')
                }
            }
        });
        await postsClient.$connect();
        const posts = await postsClient.post.findMany({
            where: {
                postId: {
                    in: txData.outputs.map((output: any, index: number) => `m73g8bip_${index}`)
                }
            }
        });
        await postsClient.$disconnect();
        
        console.log('Found posts:', posts);

        expect(posts.length).toBeGreaterThan(1);
        expect(posts.some(p => p.type === 'content')).toBe(true);
    });
});