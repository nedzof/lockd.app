import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import winston from 'winston';
import { RateLimiter } from 'limiter';
import crypto from 'crypto';
import { ParsedPost, VoteOptionInput, Vote, Lock, BaseMapMetadata } from './types';

// Load environment variables
dotenv.config();

// Constants
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;

// Initialize Prisma client with optimized settings
const prisma = new PrismaClient({
    log: ['warn', 'error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

// Initialize Winston logger
const logger = winston.createLogger({
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ],
});

// Initialize rate limiter
const rateLimiter = new RateLimiter({
    tokensPerInterval: 100,
    interval: 'minute',
});

// Transaction queue and processing state
let transactionQueue: ParsedPost[] = [];
const parentPostCache = new Map<string, any>();
const processedTxids = new Set<string>();

// Custom error class
class ProcessingError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly context?: Record<string, unknown>,
        public readonly recoverable: boolean = true
    ) {
        super(message);
        this.name = 'ProcessingError';
    }
}

// Validation functions
function validatePost(post: ParsedPost): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!post.txid || !/^[a-f0-9]{64}$/.test(post.txid)) {
        errors.push('Invalid TXID format');
    }

    if (post.blockHeight && !Number.isInteger(post.blockHeight)) {
        errors.push('Invalid block height');
    }

    if (post.vote?.options) {
        const indexes = new Set<number>();
        post.vote.options.forEach(option => {
            if (indexes.has(option.optionIndex)) {
                errors.push(`Duplicate option index: ${option.optionIndex}`);
            }
            indexes.add(option.optionIndex);
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// Sanitization function
function sanitizePostContent(post: ParsedPost): ParsedPost {
    const sanitizedPost = { ...post };
    
    if (sanitizedPost.content?.text) {
        sanitizedPost.content.text = sanitizedPost.content.text
            .replace(/<script.*?>.*?<\/script>/gis, '')
            .substring(0, 5000);
    }

    if (sanitizedPost.images) {
        sanitizedPost.images = sanitizedPost.images.filter(img =>
            ['image/png', 'image/jpeg'].includes(img.contentType || '')
        );
    }

    return sanitizedPost;
}

// Enhanced transaction processing with circuit breaker
class CircuitBreaker {
    private failures = 0;
    private lastFailure: number | null = null;
    private readonly threshold = 5;
    private readonly resetTimeout = 30000; // 30 seconds

    isOpen(): boolean {
        if (this.lastFailure && Date.now() - this.lastFailure > this.resetTimeout) {
            this.reset();
            return false;
        }
        return this.failures >= this.threshold;
    }

    recordFailure(): void {
        this.failures++;
        this.lastFailure = Date.now();
    }

    reset(): void {
        this.failures = 0;
        this.lastFailure = null;
    }
}

const circuitBreaker = new CircuitBreaker();

// Enhanced retry wrapper with exponential backoff
async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = MAX_RETRIES,
    initialDelay = INITIAL_RETRY_DELAY
): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (circuitBreaker.isOpen()) {
                throw new ProcessingError('CIRCUIT_OPEN', 'Circuit breaker is open');
            }
            
            const result = await operation();
            circuitBreaker.reset();
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            if (error instanceof ProcessingError && !error.recoverable) {
                throw error;
            }
            
            circuitBreaker.recordFailure();
            
            if (attempt < maxRetries - 1) {
                const delay = initialDelay * Math.pow(2, attempt);
                logger.warn('Operation failed, retrying', {
                    attempt: attempt + 1,
                    delay,
                    error: lastError.message
                });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
}

// Enhanced transaction processing with dependency tracking
class TransactionProcessor {
    private pendingVoteOptions = new Map<string, ParsedPost[]>();
    private processedPosts = new Set<string>();
    private readonly maxRetries = 3;

    constructor(private prisma: PrismaClient) {}

    async processBatch(batch: ParsedPost[]): Promise<void> {
        return this.prisma.$transaction(async (tx) => {
            // First pass: Process all non-dependent posts
            for (const post of batch) {
                if (!post.metadata.parentTxid) {
                    await this.processSingleTransaction(post, tx);
                } else {
                    this.queueDependentPost(post);
                }
            }

            // Second pass: Try to process pending vote options
            await this.processPendingVoteOptions(tx);
        }, {
            isolationLevel: 'Serializable',
            maxWait: 5000,
            timeout: 10000
        });
    }

    private queueDependentPost(post: ParsedPost): void {
        const parentTxid = post.metadata.parentTxid!;
        if (!this.pendingVoteOptions.has(parentTxid)) {
            this.pendingVoteOptions.set(parentTxid, []);
        }
        this.pendingVoteOptions.get(parentTxid)!.push(post);
    }

    private async processPendingVoteOptions(tx: any): Promise<void> {
        const processedThisRound = new Set<string>();

        for (const [parentTxid, options] of this.pendingVoteOptions.entries()) {
            if (this.processedPosts.has(parentTxid)) {
                try {
                    const parent = await this.getParentQuestion(parentTxid, tx);
                    if (parent) {
                        await Promise.all(
                            options.map(option => this.processVoteOption(option, parent, tx))
                        );
                        processedThisRound.add(parentTxid);
                    }
                } catch (error) {
                    logger.error('Failed to process vote options:', {
                        parentTxid,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }

        // Clean up processed options
        processedThisRound.forEach(txid => {
            this.pendingVoteOptions.delete(txid);
        });
    }

    private async getParentQuestion(txid: string, tx: any): Promise<any> {
        return tx.post.findUnique({
            where: { txid },
            include: {
                metadata: true,
                voteOptions: true
            }
        });
    }

    private async processVoteOption(
        option: ParsedPost,
        parent: any,
        tx: any
    ): Promise<void> {
        try {
            this.validateVoteOption(option, parent);
            await this.createVoteOption(option, tx);
        } catch (error) {
            logger.error('Vote option processing failed:', {
                txid: option.txid,
                parentTxid: option.metadata.parentTxid,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private validateVoteOption(option: ParsedPost, parent: any): void {
        if (!option.metadata.lockAmount || option.metadata.lockAmount < 0) {
            throw new ProcessingError(
                'INVALID_LOCK_AMOUNT',
                'Lock amount must be positive',
                { amount: option.metadata.lockAmount }
            );
        }

        if (!option.metadata.lockDuration || option.metadata.lockDuration < 0) {
            throw new ProcessingError(
                'INVALID_LOCK_DURATION',
                'Lock duration must be positive',
                { duration: option.metadata.lockDuration }
            );
        }

        if (!option.metadata.optionIndex || option.metadata.optionIndex < 0) {
            throw new ProcessingError(
                'INVALID_OPTION_INDEX',
                'Invalid option index',
                { optionIndex: option.metadata.optionIndex },
                false
            );
        }

        if (parent.metadata.lockType !== option.metadata.lockType) {
            throw new ProcessingError(
                'LOCK_TYPE_MISMATCH',
                'Lock type mismatch with parent question',
                {
                    expected: parent.metadata.lockType,
                    received: option.metadata.lockType
                },
                false
            );
        }
    }

    private async createVoteOption(option: ParsedPost, tx: any): Promise<void> {
        await this.prisma.post.create({
            data: {
                id: option.txid,
                txid: option.txid,
                postId: option.postId,
                content: option.content.text,
                author_address: option.author,
                created_at: new Date(option.timestamp * 1000),
                tags: option.tags,
                metadata: JSON.stringify(option.metadata),
                block_height: option.blockHeight,
                is_vote: true
            }
        });
    }

    private async processSingleTransaction(post: ParsedPost, tx: any): Promise<void> {
        const startTime = Date.now();
        
        try {
            const { valid, errors } = validatePost(post);
            if (!valid) {
                throw new ProcessingError(
                    'VALIDATION_FAILED',
                    'Post validation failed',
                    { errors },
                    false
                );
            }

            const sanitizedPost = sanitizePostContent(post);
            
            switch (sanitizedPost.metadata.type) {
                case 'vote_question':
                    await this.processVoteQuestion(sanitizedPost, tx);
                    break;
                case 'vote_option':
                    this.queueDependentPost(sanitizedPost);
                    break;
                default:
                    await this.processStandardPost(sanitizedPost, tx);
            }
            
            this.processedPosts.add(post.txid);
            
            logger.info('Transaction processed successfully', {
                txid: post.txid,
                type: post.metadata.type,
                duration: Date.now() - startTime
            });
        } catch (error) {
            logger.error('Transaction processing failed', {
                txid: post.txid,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            });
            throw error;
        }
    }

    private async processStandardPost(post: ParsedPost, tx: any): Promise<void> {
        // Create post record
        await this.prisma.post.create({
            data: {
                id: post.txid,
                txid: post.txid,
                postId: post.postId,
                content: post.content.text,
                author_address: post.author,
                block_height: post.blockHeight,
                created_at: new Date(post.timestamp * 1000),
                tags: post.tags,
                metadata: JSON.stringify(post.metadata)
            }
        });
    }

    private async processVoteQuestion(post: ParsedPost, tx: any): Promise<void> {
        // Verify vote options hash
        await this.verifyOptionsHash(post);

        // Create vote question
        await this.prisma.post.create({
            data: {
                id: post.txid,
                txid: post.txid,
                postId: post.postId,
                content: post.content.text,
                author_address: post.author,
                created_at: new Date(post.timestamp * 1000),
                tags: post.tags,
                metadata: JSON.stringify(post.metadata),
                block_height: post.blockHeight,
                is_vote: true
            }
        });
    }

    private async verifyOptionsHash(post: ParsedPost): Promise<void> {
        const options = post.metadata.voteOptions || [];
        const optionsHash = options
            .sort((a: { optionIndex: number }, b: { optionIndex: number }) => a.optionIndex - b.optionIndex)
            .map((opt: { optionIndex: number; content: string }) => `${opt.optionIndex}:${opt.content}`)
            .join('|');

        const calculatedHash = crypto
            .createHash('sha256')
            .update(optionsHash)
            .digest('hex');

        if (calculatedHash !== post.metadata.optionsHash) {
            throw new ProcessingError(
                'INVALID_OPTIONS_HASH',
                'Vote options hash mismatch',
                {
                    expected: post.metadata.optionsHash,
                    calculated: calculatedHash
                }
            );
        }
    }
}

// Export the processor
export const transactionProcessor = new TransactionProcessor(prisma);

// Enhanced queue processing with batching and error recovery
async function processQueue(): Promise<void> {
    if (transactionQueue.length === 0) return;
    
    const batch = transactionQueue.splice(0, BATCH_SIZE);
    const results = await Promise.allSettled(
        batch.map(post => withRetry(() => 
            transactionProcessor.processBatch([post])
        ))
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        logger.error('Batch processing completed with errors', {
            total: batch.length,
            failed: failed.length,
            errors: failed.map(f => 
                f.status === 'rejected' ? f.reason.message : 'Unknown error'
            )
        });
    }
    
    if (transactionQueue.length > 0) {
        setImmediate(processQueue);
    }
}

// Handle incoming messages
process.on('message', async (message: any) => {
    try {
        if (!message || !message.type) {
            logger.error('Invalid message received');
            return;
        }

        switch (message.type) {
            case 'transaction':
                if (!processedTxids.has(message.data.txid)) {
                    transactionQueue.push(message.data);
                    processedTxids.add(message.data.txid);
                    processQueue().catch(error => 
                        logger.error('Queue processing error:', error)
                    );
                }
                break;
            case 'error':
                logger.error('Error received:', message.error);
                break;
            default:
                logger.warn('Unknown message type:', message.type);
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            process?.send?.({ type: 'error', error: error.message });
            logger.error('Error processing message:', error);
        }
    }
});

// Cleanup on exit
process.on('SIGINT', async () => {
    logger.info('Worker shutting down');
    await prisma.$disconnect();
    process.exit(0);
});

// Initialize worker
async function initializeWorker() {
    try {
        await checkDatabaseConnection();
        logger.info('Worker initialization complete');
        if (process.send) {
            process.send({ type: 'initialized' });
        }
    } catch (error) {
        logger.error('Worker initialization failed:', error);
        process.exit(1);
    }
}

// Database health check
async function checkDatabaseConnection(): Promise<void> {
    try {
        const result = await prisma.$queryRaw`SELECT current_timestamp, current_database(), version()`;
        logger.info('Database connection verified:', result);
    } catch (error) {
        logger.error('Database connection failed:', error);
        process.exit(1);
    }
}

initializeWorker();