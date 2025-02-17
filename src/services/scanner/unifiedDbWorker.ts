import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import winston from 'winston';
import { RateLimiter } from 'limiter';
import { ParsedPost, VoteOptionInput, Vote, Lock } from './types';

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
            if (indexes.has(option.index)) {
                errors.push(`Duplicate option index: ${option.index}`);
            }
            indexes.add(option.index);
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

// Enhanced transaction processing with validation and error handling
async function processSingleTransaction(post: ParsedPost, tx: any): Promise<void> {
    const startTime = Date.now();
    
    try {
        const { valid, errors } = validatePost(post);
        if (!valid) {
            throw new ProcessingError('VALIDATION_FAILED', 'Post validation failed', 
                { errors }, false);
        }

        const sanitizedPost = sanitizePostContent(post);
        
        await rateLimiter.removeTokens(1);
        
        switch (sanitizedPost.metadata.type) {
            case 'vote_option':
                await processVoteOption(sanitizedPost, tx);
                break;
            case 'vote_question':
                await processVoteQuestion(sanitizedPost, tx);
                break;
            default:
                await processStandardPost(sanitizedPost, tx);
        }
        
        processedTxids.add(post.txid);
        
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

// Enhanced queue processing with batching and error recovery
async function processQueue(): Promise<void> {
    if (transactionQueue.length === 0) return;
    
    const batch = transactionQueue.splice(0, BATCH_SIZE);
    const results = await Promise.allSettled(
        batch.map(post => withRetry(() => 
            processSingleTransaction(post, null)
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

// Process vote option
async function processVoteOption(post: ParsedPost, tx: any) {
    // First ensure the parent post exists
    const parentTxid = post.metadata.parentTxid || post.txid;
    const parentPost = await prisma.post.upsert({
        where: { txid: parentTxid },
        create: {
            id: parentTxid,
            txid: parentTxid,
            postId: post.metadata.postId,
            content: '',  // Will be updated when we process the actual vote question
            author_address: post.author || '',
            created_at: new Date(post.timestamp),
            metadata: {},
            tags: [],
            is_vote: true
        },
        update: {} // No update needed, we'll update when processing the vote question
    });

    // Now create/update the vote option
    const voteOption = await prisma.voteOption.upsert({
        where: { txid: post.txid },
        create: {
            id: post.txid,
            txid: post.txid,
            postId: post.metadata.postId,
            post_txid: parentTxid,
            content: post.content?.text || '',
            description: post.metadata.description || '',
            author_address: post.author || '',
            created_at: new Date(post.timestamp),
            lock_amount: post.metadata.lockAmount || 0,
            lock_duration: post.metadata.lockDuration || 0,
            unlock_height: post.metadata.unlockHeight || 0,
            current_height: post.blockHeight,
            lock_percentage: post.metadata.lockPercentage || 0,
            option_index: post.metadata.optionIndex || 0,
            tags: post.tags || []
        },
        update: {
            content: post.content?.text || '',
            description: post.metadata.description || '',
            author_address: post.author || '',
            created_at: new Date(post.timestamp),
            lock_amount: post.metadata.lockAmount || 0,
            lock_duration: post.metadata.lockDuration || 0,
            unlock_height: post.metadata.unlockHeight || 0,
            current_height: post.blockHeight,
            lock_percentage: post.metadata.lockPercentage || 0,
            option_index: post.metadata.optionIndex || 0,
            tags: post.tags || []
        }
    });
}

// Process vote question
async function processVoteQuestion(post: ParsedPost, tx: any) {
    // Create the vote question post first
    const questionPost = await prisma.post.upsert({
        where: { txid: post.txid },
        create: {
            id: post.txid,
            txid: post.txid,
            postId: post.metadata.postId,
            content: post.content?.text || '',
            author_address: post.author || '',
            created_at: new Date(post.timestamp),
            metadata: post.metadata,
            tags: post.tags || [],
            is_vote: true,
            is_locked: post.metadata.lock?.isLocked,
            lock_duration: post.metadata.lock?.duration,
            unlock_height: post.metadata.lock?.unlockHeight,
            current_height: post.blockHeight,
            image_data: post.images?.[0]?.data,
            media_type: post.images?.[0]?.contentType
        },
        update: {
            content: post.content?.text || '',
            author_address: post.author || '',
            created_at: new Date(post.timestamp),
            metadata: post.metadata,
            tags: post.tags || [],
            is_vote: true,
            is_locked: post.metadata.lock?.isLocked,
            lock_duration: post.metadata.lock?.duration,
            unlock_height: post.metadata.lock?.unlockHeight,
            current_height: post.blockHeight,
            image_data: post.images?.[0]?.data,
            media_type: post.images?.[0]?.contentType
        }
    });

    // Process vote options if present
    if (post.metadata.voteOptions) {
        // Parse options if they're in string format
        const parsedOptions = typeof post.metadata.voteOptions === 'string'
            ? post.metadata.voteOptions.split(/[,;\s]+/).map(text => ({ text: text.trim() }))
            : Array.isArray(post.metadata.voteOptions) ? post.metadata.voteOptions : [post.metadata.voteOptions];

        // Create vote options
        const savedOptions = await Promise.all(parsedOptions.map(async (option: any, index: number) => {
            // Generate a deterministic txid for embedded options
            const optionTxid = `${post.txid}_option_${index}`;
            
            // Extract option data
            const optionData = typeof option === 'string' 
                ? { text: option } 
                : option;

            // Create vote option
            const voteOption = await prisma.voteOption.upsert({
                where: { txid: optionTxid },
                create: {
                    id: optionTxid,
                    txid: optionTxid,
                    postId: post.metadata.postId,
                    post_txid: post.txid,
                    content: optionData.text || optionData.content || optionData.label || '',
                    description: optionData.description || '',
                    author_address: post.author || '',
                    created_at: new Date(post.timestamp),
                    lock_amount: parseInt(optionData.lockAmount) || 0,
                    lock_duration: parseInt(optionData.lockDuration) || 0,
                    unlock_height: parseInt(optionData.unlockHeight) || 0,
                    current_height: post.blockHeight,
                    lock_percentage: parseInt(optionData.lockPercentage) || 0,
                    option_index: parseInt(optionData.optionIndex) || index,
                    tags: post.tags || []
                },
                update: {
                    content: optionData.text || optionData.content || optionData.label || '',
                    description: optionData.description || '',
                    author_address: post.author || '',
                    created_at: new Date(post.timestamp),
                    lock_amount: parseInt(optionData.lockAmount) || 0,
                    lock_duration: parseInt(optionData.lockDuration) || 0,
                    unlock_height: parseInt(optionData.unlockHeight) || 0,
                    current_height: post.blockHeight,
                    lock_percentage: parseInt(optionData.lockPercentage) || 0,
                    option_index: parseInt(optionData.optionIndex) || index,
                    tags: post.tags || []
                }
            });

            return voteOption;
        }));

        logger.info('Created vote options:', {
            questionTxid: questionPost.txid,
            optionCount: savedOptions.length,
            options: savedOptions.map(opt => ({
                txid: opt.txid,
                content: opt.content,
                description: opt.description,
                lockAmount: opt.lock_amount,
                lockDuration: opt.lock_duration,
                optionIndex: opt.option_index,
                lockPercentage: opt.lock_percentage
            }))
        });
    }
}

// Process standard post
async function processStandardPost(post: ParsedPost, tx: any) {
    // Create or update post in database
    const result = await prisma.post.upsert({
        where: { txid: post.txid },
        create: {
            id: post.txid,
            txid: post.txid,
            postId: post.metadata.postId,
            content: post.content?.text || '',
            author_address: post.author || '',
            media_type: post.images?.[0]?.contentType || 'none',
            raw_image_data: post.images?.[0]?.data || null,
            created_at: new Date(post.timestamp),
            metadata: post.metadata,
            tags: post.tags || [],
            is_vote: false,
            is_locked: post.metadata.lock?.isLocked,
            lock_duration: post.metadata.lock?.duration,
            unlock_height: post.metadata.lock?.unlockHeight,
            block_height: post.blockHeight,
            image_format: post.images?.[0]?.contentType?.split('/')?.[1] || null,
            description: post.content?.description || null
        },
        update: {
            content: post.content?.text || '',
            author_address: post.author || '',
            media_type: post.images?.[0]?.contentType || 'none',
            raw_image_data: post.images?.[0]?.data || null,
            created_at: new Date(post.timestamp),
            metadata: post.metadata,
            tags: post.tags || [],
            is_vote: false,
            is_locked: post.metadata.lock?.isLocked,
            lock_duration: post.metadata.lock?.duration,
            unlock_height: post.metadata.lock?.unlockHeight,
            block_height: post.blockHeight,
            image_format: post.images?.[0]?.contentType?.split('/')?.[1] || null,
            description: post.content?.description || null
        }
    });

    logger.info('Post processed:', {
        txid: result.txid,
        postId: result.postId,
        contentLength: result.content?.length || 0,
        mediaType: result.media_type,
        imageSize: result.raw_image_data?.length || 0,
        metadata: result.metadata,
        isVoteQuestion: result.is_vote,
        isLocked: result.is_locked
    });
}

// Handle incoming messages
process.on('message', async (message: any) => {
    if (!message || !message.type) {
        logger.error('Invalid message received');
        return;
    }

    try {
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
            case 'healthcheck':
                await checkDatabaseConnection();
                process?.send?.({ type: 'health', status: 'ok' });
                break;
            default:
                logger.warn('Unknown message type:', message.type);
        }
    } catch (error) {
        logger.error('Message handling error:', error);
        process?.send?.({ type: 'error', error: error.message });
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