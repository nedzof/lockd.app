import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

// Types for vote options
interface VoteOptionInput {
    text: string;
    index: number;
    lockAmount?: number;
    lockDuration?: number;
    unlockHeight?: number;
    lockPercentage?: number;
}

interface Vote {
    question: string;
    options: VoteOptionInput[];
}

interface Lock {
    isLocked: boolean;
    duration?: number;
    unlockHeight?: number;
}

interface Post {
    txid: string;
    blockHeight: number;
    timestamp: number;
    content?: {
        text?: string;
        description?: string;
    };
    images?: {
        data?: Buffer | null;
        contentType?: string;
        dataURL?: string;
    }[];
    author?: string;
    tags?: string[];
    vote?: Vote;
    metadata: {
        lock?: Lock;
    };
}

interface ParsedPost {
    txid: string;
    blockHeight: number;
    timestamp: number;
    content?: {
        text?: string;
        description?: string;
    };
    images?: {
        data?: Buffer | null;
        contentType?: string;
        dataURL?: string;
    }[];
    author?: string;
    tags?: string[];
    vote?: Vote;
    metadata: {
        lock?: Lock;
    };
}

// Helper function to check if a post has a vote
function hasVote(post: Post): boolean {
    if (!post.vote) return false;
    if (!post.vote.options) return false;
    return post.vote.options.length > 0;
}

// Helper function to convert metadata to JSON
function convertMetadataToJson(metadata: any): Record<string, any> {
    return {
        lock: metadata.lock ? {
            isLocked: metadata.lock.isLocked,
            duration: metadata.lock.duration,
            unlockHeight: metadata.lock.unlockHeight
        } : null
    };
}

// Process a transaction
async function processTransaction(post: ParsedPost) {
    try {
        console.log('\n💾 Processing transaction for database:', post.txid);

        // Validate post data
        if (!post.txid || (!post.content?.text && !post.images?.length)) {
            console.warn('⚠️ Invalid post data:', {
                txid: post.txid,
                hasContent: !!post.content?.text,
                hasImages: post.images?.length > 0
            });
            return;
        }

        // Prepare image data
        const imageData = post.images?.[0]?.data;
        const mediaType = post.images?.[0]?.contentType;

        // Extract metadata
        const metadata = post.metadata || {};
        const postId = metadata.postId || post.txid;
        const isVote = metadata.type === 'vote_question' || metadata.type === 'vote_option';
        const lockDuration = metadata.lock?.duration;
        const unlockHeight = metadata.lock?.unlockHeight;
        const isLocked = !!metadata.lock?.isLocked;

        console.log('📦 Saving post:', {
            txid: post.txid,
            postId,
            contentLength: post.content?.text?.length || 0,
            hasAuthor: !!post.author,
            mediaType: mediaType || 'none',
            imageSize: imageData?.length || 0,
            isVote,
            isLocked
        });

        // Create or update post in database
        const result = await prisma.post.upsert({
            where: { txid: post.txid },
            create: {
                id: post.txid,
                txid: post.txid,
                postId: postId,
                content: post.content?.text || '',
                author_address: post.author || '',
                media_type: mediaType || 'none',
                raw_image_data: imageData || null,
                created_at: new Date(post.timestamp),
                metadata: metadata,
                tags: post.tags || [],
                is_vote: isVote,
                is_locked: isLocked,
                lock_duration: lockDuration,
                unlock_height: unlockHeight,
                block_height: post.blockHeight,
                image_format: mediaType?.split('/')?.[1] || null,
                description: post.content?.description || null
            },
            update: {
                content: post.content?.text || '',
                author_address: post.author || '',
                media_type: mediaType || 'none',
                raw_image_data: imageData || null,
                created_at: new Date(post.timestamp),
                metadata: metadata,
                tags: post.tags || [],
                is_vote: isVote,
                is_locked: isLocked,
                lock_duration: lockDuration,
                unlock_height: unlockHeight,
                block_height: post.blockHeight,
                image_format: mediaType?.split('/')?.[1] || null,
                description: post.content?.description || null
            }
        });

        console.log('✅ Saved post:', {
            id: result.id,
            txid: result.txid,
            postId: result.postId,
            contentLength: result.content?.length || 0,
            mediaType: result.media_type,
            imageSize: result.raw_image_data?.length || 0,
            metadata: result.metadata,
            isVote: result.is_vote,
            isLocked: result.is_locked
        });

        // If this is a vote option, create the vote option record
        if (metadata.type === 'vote_option') {
            const voteOption = await prisma.voteOption.upsert({
                where: { txid: post.txid },
                create: {
                    id: post.txid,
                    txid: post.txid,
                    postId: postId,
                    post_txid: metadata.parentTxid || post.txid,
                    content: post.content?.text || '',
                    author_address: post.author || '',
                    created_at: new Date(post.timestamp),
                    lock_amount: metadata.lockAmount || 0,
                    lock_duration: metadata.lockDuration || 0,
                    unlock_height: metadata.unlockHeight || 0,
                    current_height: post.blockHeight,
                    lock_percentage: metadata.lockPercentage || 0,
                    tags: post.tags || []
                },
                update: {
                    content: post.content?.text || '',
                    author_address: post.author || '',
                    created_at: new Date(post.timestamp),
                    lock_amount: metadata.lockAmount || 0,
                    lock_duration: metadata.lockDuration || 0,
                    unlock_height: metadata.unlockHeight || 0,
                    current_height: post.blockHeight,
                    lock_percentage: metadata.lockPercentage || 0,
                    tags: post.tags || []
                }
            });

            console.log('✅ Saved vote option:', {
                id: voteOption.id,
                txid: voteOption.txid,
                postId: voteOption.postId,
                content: voteOption.content,
                lockAmount: voteOption.lock_amount,
                lockDuration: voteOption.lock_duration
            });
        }

    } catch (error) {
        console.error('❌ Error processing transaction:', error);
    }
}

// Handle incoming messages
process.on('message', async (message: any) => {
    console.log('\n📥 Received message from scanner:', {
        type: message?.type,
        timestamp: new Date().toISOString()
    });

    if (!message || !message.type) {
        console.error('❌ Invalid message received:', message);
        return;
    }

    switch (message.type) {
        case 'init':
            console.log('🌟 Initializing worker...');
            await initializeWorker();
            break;
        case 'transaction':
            if (!message.data) {
                console.error('❌ No transaction data provided');
                return;
            }
            await processTransaction(message.data);
            break;
        default:
            console.error('❌ Unknown message type:', message.type);
    }
});

// Database health check
async function checkDatabaseConnection(): Promise<void> {
    try {
        const result = await prisma.$queryRaw`SELECT current_timestamp, current_database(), version()`;
        console.log('✅ Database connection verified:', result);
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        process.exit(1);
    }
}

// Initialize worker
async function initializeWorker(): Promise<void> {
    try {
        await checkDatabaseConnection();
        console.log('✅ Worker initialization complete');
        if (process.send) {
            process.send({ type: 'initialized' });
        }
    } catch (error) {
        console.error('❌ Worker initialization failed:', error);
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('🧹 Worker received SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🧹 Worker received SIGTERM');
    process.exit(0);
});

process.on('exit', (code) => {
    console.log(`🧹 Worker exiting with code ${code}`);
    prisma.$disconnect();
});

// Start worker
console.log('🌟 Worker process starting...');

// Set up logging to file
const logFile = 'worker.log';
const logStream = process.stdout;

// Override console.log and console.error to write to both console and file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ')}`;
    
    logStream.write(message + '\n');
    originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ERROR: ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ')}`;
    
    logStream.write(message + '\n');
    originalConsoleError.apply(console, args);
};

// Clean up logging on process exit
process.on('exit', () => {
    logStream.end();
});