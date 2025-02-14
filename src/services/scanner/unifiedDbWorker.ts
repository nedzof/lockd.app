import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

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
        description?: string;
    };
    imageData?: Buffer | null;
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
async function processTransaction(prisma: PrismaClient, post: Post) {
    try {
        console.log('🔄 Processing transaction:', {
            txid: post.txid,
            timestamp: new Date().toISOString()
        });

        // Check if post already exists
        const existingPost = await prisma.post.findUnique({
            where: { txid: post.txid }
        });

        if (existingPost) {
            console.log('⚠️ Post already exists:', {
                txid: post.txid,
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Create post
        const dbPost = await prisma.post.create({
            data: {
                id: post.txid,
                txid: post.txid,
                postId: post.txid,
                content: post.content?.description || '',
                author_address: '',
                block_height: post.blockHeight,
                created_at: new Date(post.timestamp),
                is_vote: hasVote(post),
                media_type: '',
                description: post.content?.description || '',
                tags: [],
                metadata: convertMetadataToJson(post.metadata),
                raw_image_data: post.imageData?.toString('base64') || null,
                is_locked: !!post.metadata.lock?.isLocked,
                lock_duration: post.metadata.lock?.duration || null,
                unlock_height: post.metadata.lock?.unlockHeight || null
            }
        });

        // Create vote options if present
        if (hasVote(post) && post.vote?.options) {
            const options = post.vote.options.map((option: VoteOptionInput, index: number) => ({
                id: `${post.txid}:vote_option:${index}`,
                txid: `${post.txid}:vote_option:${index}`,
                postId: post.txid,
                post_txid: post.txid,
                content: option.text,
                author_address: '',
                created_at: new Date(post.timestamp),
                lock_amount: 0,
                lock_duration: 0,
                unlock_height: 0,
                current_height: post.blockHeight,
                lock_percentage: 0,
                tags: []
            }));

            await prisma.voteOption.createMany({
                data: options,
                skipDuplicates: true
            });
        }

        console.log('✅ Transaction processed successfully:', {
            txid: post.txid,
            timestamp: new Date().toISOString()
        });

        // Send success message to parent
        process.send?.({
            type: 'transaction_processed',
            txid: post.txid
        });
    } catch (error: any) {
        console.error('❌ Error processing transaction:', {
            txid: post.txid,
            error: error.message,
            timestamp: new Date().toISOString()
        });

        // Send error message to parent
        process.send?.({
            type: 'error',
            error: {
                txid: post.txid,
                message: error.message
            }
        });
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
        case 'process_transaction':
            if (!message.data) {
                console.error('❌ No transaction data provided');
                return;
            }
            await processTransaction(prisma, message.data);
            break;
        default:
            console.error('❌ Unknown message type:', message.type);
    }
});

// Database health check
async function checkDatabaseConnection() {
    try {
        const result = await prisma.$queryRaw`SELECT current_timestamp, current_database(), version()`;
        console.log('✅ Database connection verified:', result);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}

// Initialize worker
async function initializeWorker() {
    try {
        // Check database connection
        const isConnected = await checkDatabaseConnection();
        if (!isConnected) {
            throw new Error('Database connection failed');
        }

        console.log('✅ Worker initialization complete');
    } catch (error) {
        console.error('❌ Worker initialization failed:', error);
        process.exit(1);
    }
}

// Start worker initialization
console.log('🌟 Worker process starting...');
initializeWorker().catch(error => {
    console.error('❌ Fatal error during worker initialization:', {
        error: error.message,
        timestamp: new Date().toISOString()
    });
    process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📣 Received SIGTERM signal, cleaning up...');
    await prisma.$disconnect();
    console.log('✅ Database disconnected cleanly');
    process.exit(0);
});

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