import { PrismaClient, Prisma } from '@prisma/client';
import { Post, ParsedTransaction, DbError } from '../shared/types.js';
import { logger } from '../utils/logger.js';

export class DbClient {
    private prisma: PrismaClient;
    private static instanceCount = 0;
    private instanceId: number;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000; // 1 second

    constructor() {
        DbClient.instanceCount++;
        this.instanceId = DbClient.instanceCount;
        logger.info(`Creating new DbClient instance`, { instanceId: this.instanceId });

        this.prisma = new PrismaClient({
            log: [
                { level: 'warn', emit: 'event' },
                { level: 'error', emit: 'event' }
            ],
            datasourceUrl: process.env.DATABASE_URL + "?pgbouncer=true&connection_limit=1"
        });

        // Set up Prisma error logging
        (this.prisma as any).$on('error', (e: { message: string; target?: string }) => {
            logger.error('Prisma client error:', {
                error: e.message,
                target: e.target
            });
        });

        logger.info(`PrismaClient initialized`, { instanceId: this.instanceId });
    }

    private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (this.shouldRetry(error)) {
                    logger.warn('Database operation failed, retrying', {
                        attempt,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * attempt));
                    continue;
                }
                throw error;
            }
        }
        throw lastError || new Error('Operation failed after retries');
    }

    private shouldRetry(error: unknown): boolean {
        const dbError = error as DbError;
        // Retry on connection errors or deadlocks
        return dbError.code === '40001' || // serialization failure
               dbError.code === '40P01' || // deadlock
               dbError.code === '57P01';   // connection lost
    }

    async connect(): Promise<boolean> {
        logger.info(`Connecting to database`, { instanceId: this.instanceId });
        try {
            await this.prisma.$connect();
            logger.info(`Successfully connected to database`, { instanceId: this.instanceId });
            return true;
        } catch (error) {
            logger.error(`Failed to connect to database`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            return false;
        }
    }

    async disconnect(): Promise<void> {
        logger.info(`Disconnecting from database`, { instanceId: this.instanceId });
        try {
            await this.prisma.$disconnect();
            logger.info(`Successfully disconnected from database`, { instanceId: this.instanceId });
        } catch (error) {
            logger.error(`Error disconnecting from database`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async isConnected(): Promise<boolean> {
        logger.debug(`Checking database connection`, { instanceId: this.instanceId });
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            logger.debug(`Database connection is active`, { instanceId: this.instanceId });
            return true;
        } catch (error) {
            logger.warn(`Database connection is inactive`, {
                instanceId: this.instanceId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    private createBlockTimeDate(blockTime?: number | bigint): Date {
        const now = new Date();
        if (!blockTime) {
            return now;
        }

        try {
            // Convert to milliseconds
            const timestampMs = Number(BigInt(blockTime) * BigInt(1000));
            
            // Check if timestamp is reasonable (between 2020 and 2050)
            const minTimestamp = new Date('2020-01-01').getTime();
            const maxTimestamp = new Date('2050-01-01').getTime();
            
            if (timestampMs < minTimestamp || timestampMs > maxTimestamp) {
                logger.warn('Invalid block time detected, using current time', {
                    blockTime,
                    timestampMs
                });
                return now;
            }

            return new Date(timestampMs);
        } catch (error) {
            logger.error('Error converting block time', {
                blockTime,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return now;
        }
    }

    async processTransaction(tx: ParsedTransaction | ParsedTransaction[]): Promise<void> {
        try {
            const transactions = Array.isArray(tx) ? tx : [tx];
            logger.info('Processing transactions', {
                count: transactions.length,
                types: transactions.map(t => t.type),
                txids: transactions.map(t => t.txid)
            });

            // Handle single transaction
            if (!Array.isArray(tx)) {
                await this.saveTransaction(tx);
                return;
            }

            // Handle transaction array in chunks
            const chunks = this.chunk(tx, 10);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(t => this.saveTransaction(t)));
            }
        } catch (error) {
            logger.error('Error in processTransaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    async saveTransaction(transaction: ParsedTransaction): Promise<{ txid: string; postId: string }> {
        return await this.withRetry(async () => {
            try {
                // Create the processed transaction
                await this.prisma.processedTransaction.create({
                    data: {
                        txid: transaction.txid,
                        type: transaction.type,
                        protocol: transaction.protocol || 'unknown',
                        blockHeight: transaction.blockHeight || 0,
                        blockTime: BigInt(transaction.blockTime || Math.floor(Date.now() / 1000)),
                        metadata: transaction.metadata as any
                    }
                });

                // Create the post
                const blockTimeDate = this.createBlockTimeDate(transaction.blockTime);

                const post = await this.prisma.post.create({
                    data: {
                        postId: transaction.metadata.postId,
                        type: transaction.type,
                        content: transaction.metadata.content,
                        blockTime: blockTimeDate,
                        sequence: transaction.metadata.sequence || 0,
                        parentSequence: transaction.metadata.parentSequence || 0,
                        txid: transaction.txid,
                        protocol: transaction.protocol
                    }
                });

                // Handle lock/unlock actions
                if (transaction.type === 'lock' && transaction.metadata.lockAmount && transaction.metadata.lockDuration) {
                    await this.prisma.lockLike.create({
                        data: {
                            txid: transaction.txid,
                            lockAmount: transaction.metadata.lockAmount,
                            lockDuration: transaction.metadata.lockDuration,
                            postId: post.id
                        }
                    });
                }

                logger.debug('Transaction saved successfully', {
                    txid: transaction.txid
                });

                return {
                    txid: transaction.txid,
                    postId: post.id
                };
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                    logger.warn('Duplicate transaction detected', { txid: transaction.txid });
                    return {
                        txid: transaction.txid,
                        postId: transaction.metadata.postId
                    }; // Return basic info for duplicates
                }
                logger.error('Error saving transaction', {
                    error,
                    txid: transaction.txid,
                    type: transaction.type,
                    protocol: transaction.protocol
                });
                throw error;
            }
        });
    }

    async getTransaction(txid: string): Promise<ParsedTransaction | null> {
        try {
            const transaction = await this.prisma.processedTransaction.findUnique({
                where: { txid }
            });

            if (!transaction) return null;

            return {
                txid: transaction.txid,
                type: transaction.type,
                protocol: transaction.protocol,
                blockHeight: transaction.blockHeight,
                blockTime: transaction.blockTime,
                metadata: transaction.metadata as any
            };
        } catch (error) {
            logger.error('Error fetching transaction', {
                txid,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    async cleanupTestData(): Promise<void> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('Cleanup can only be run in test environment');
        }
        await this.withRetry(async () => {
            await this.prisma.lockLike.deleteMany();
            await this.prisma.post.deleteMany();
            await this.prisma.processedTransaction.deleteMany();
            logger.info('Test data cleaned up');
        });
    }

    private chunk<T>(arr: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, (i + 1) * size)
        );
    }
}