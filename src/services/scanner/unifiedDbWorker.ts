import { parentPort } from 'worker_threads';
import { PrismaClient, VoteOption } from '@prisma/client';
import { ParsedPost } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

// Set up logging to file
const logFile = path.join(process.cwd(), 'worker.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

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

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

// Explicit connection handling
async function connectDatabase() {
    try {
        await prisma.$connect();
        console.log('🔌 Database worker connected to database successfully');
        
        // Test query to verify connection
        const result = await prisma.$queryRaw`SELECT current_timestamp`;
        console.log('✅ Database connection verified with test query:', result);
    } catch (error) {
        console.error('❌ Database connection error:', error);
        process.exit(1);
    }
}

// Database health check
async function checkDatabaseConnection() {
    try {
        console.log('🔍 Checking database connection...');
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection check passed');
        return true;
    } catch (error) {
        console.error('❌ Database connection lost:', error);
        console.log('🔄 Attempting to reconnect...');
        await prisma.$disconnect();
        await connectDatabase();
        return false;
    }
}

// Initialize database connection
console.log('🚀 Initializing database worker...');
connectDatabase();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📣 Received SIGTERM signal, cleaning up...');
    await prisma.$disconnect();
    console.log('✅ Database disconnected cleanly');
    process.exit(0);
});

async function calculateLockPercentages(tx: any, postTxid: string) {
    console.log(`📊 Calculating lock percentages for post ${postTxid}`);
    
    // Get all vote options for this post
    const options = await tx.voteOption.findMany({
        where: { post_txid: postTxid }
    });
    
    console.log(`📈 Found ${options.length} vote options`);

    // Calculate total locked amount
    const totalLocked = options.reduce((sum: number, opt: VoteOption) => sum + opt.lock_amount, 0);
    console.log(`💰 Total locked amount: ${totalLocked}`);
    
    if (totalLocked === 0) {
        console.log('⚠️ No locked amount found, skipping percentage calculation');
        return;
    }

    // Update lock percentages
    const updates = options.map((option: VoteOption) => {
        const percentage = (option.lock_amount / totalLocked) * 100;
        console.log(`🔢 Option ${option.id}: ${option.lock_amount} / ${totalLocked} = ${percentage}%`);
        return tx.voteOption.update({
            where: { id: option.id },
            data: { lock_percentage: percentage }
        });
    });
    
    await Promise.all(updates);
    console.log('✅ Lock percentages updated successfully');
}

export async function processTransaction(prisma: PrismaClient, post: ParsedPost) {
    console.log('\n🔄 Starting transaction processing:', {
        txid: post.txid,
        postId: post.postId,
        hasVote: !!post.vote,
        hasImages: post.images?.length > 0
    });

    const MAX_RETRIES = 3;
    let retryCount = 0;

    while (retryCount < MAX_RETRIES) {
        try {
            console.log(`\n📝 Processing attempt ${retryCount + 1}/${MAX_RETRIES}`);
            
            // Check database connection before proceeding
            const isConnected = await checkDatabaseConnection();
            if (!isConnected) {
                throw new Error('Database connection unavailable');
            }

            // Set up transaction timeout
            console.log('⏱️ Setting up transaction timeout (30s)');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Transaction timeout')), 30000)
            );

            console.log('🏁 Starting database transaction');
            const result = await Promise.race([
                prisma.$transaction(async (tx: any) => {
                    console.log('📥 Creating/updating post record');
                    const dbPost = await tx.post.upsert({
                        where: { txid: post.txid },
                        create: {
                            id: post.txid,
                            txid: post.txid,
                            postId: post.postId,
                            content: post.content?.text || '',
                            author_address: post.author,
                            block_height: post.blockHeight,
                            created_at: new Date(post.timestamp),
                            is_vote: !!post.vote,
                            is_locked: !!post.metadata.lock?.isLocked,
                            media_type: post.images[0]?.contentType,
                            description: post.content?.description,
                            tags: post.tags,
                            metadata: {
                                title: post.content?.title,
                                app: post.metadata.app,
                                version: post.metadata.version,
                                lock: post.metadata.lock
                            },
                            raw_image_data: post.images[0]?.data,
                            image_format: post.images[0]?.contentType?.split('/')[1],
                            image_encoding: post.images[0]?.encoding,
                            image_data_url: post.images[0]?.dataURL,
                            lock_duration: post.metadata.lock?.duration,
                            unlock_height: post.metadata.lock?.unlockHeight
                        },
                        update: {
                            block_height: post.blockHeight,
                            is_vote: !!post.vote,
                            is_locked: !!post.metadata.lock?.isLocked,
                            media_type: post.images[0]?.contentType,
                            description: post.content?.description,
                            tags: post.tags,
                            metadata: {
                                title: post.content?.title,
                                app: post.metadata.app,
                                version: post.metadata.version,
                                lock: post.metadata.lock
                            },
                            raw_image_data: post.images[0]?.data,
                            image_format: post.images[0]?.contentType?.split('/')[1],
                            image_encoding: post.images[0]?.encoding,
                            image_data_url: post.images[0]?.dataURL,
                            lock_duration: post.metadata.lock?.duration,
                            unlock_height: post.metadata.lock?.unlockHeight
                        }
                    });
                    console.log('✅ Post record created/updated:', dbPost.id);

                    // If this is a vote post, create or update the vote options
                    if (post.vote?.options) {
                        console.log(`🗳️ Processing ${post.vote.options.length} vote options`);
                        
                        console.log('🗑️ Deleting existing vote options');
                        await tx.voteOption.deleteMany({
                            where: { post_txid: post.txid }
                        });

                        console.log('📝 Creating new vote options');
                        const voteOptions = await tx.voteOption.createMany({
                            data: post.vote.options.map((option, index) => ({
                                id: `${post.txid}:vote_option:${option.index}`,
                                txid: `${post.txid}:vote_option:${option.index}`,
                                post_txid: post.txid,
                                postId: post.postId,
                                content: option.text,
                                author_address: post.author,
                                created_at: new Date(post.timestamp),
                                lock_amount: option.lockAmount || 0,
                                lock_duration: option.lockDuration || 0,
                                unlock_height: option.unlockHeight || 0,
                                current_height: option.currentHeight || post.blockHeight,
                                lock_percentage: option.lockPercentage || 0,
                                tags: []
                            })),
                            skipDuplicates: true
                        });
                        console.log(`✅ Created ${voteOptions.count} vote options`);

                        // Calculate and update lock percentages
                        await calculateLockPercentages(tx, post.txid);
                    }

                    return dbPost;
                }),
                timeoutPromise
            ]);

            console.log('✅ Transaction completed successfully');
            
            // Send success message
            parentPort?.postMessage({ 
                type: 'transaction_processed', 
                txid: post.txid,
                data: result 
            });
            console.log('📤 Success message sent to scanner');

            break; // Exit retry loop on success

        } catch (error: any) {
            console.error(`❌ Error processing transaction:`, {
                attempt: retryCount + 1,
                error: {
                    message: error.message,
                    code: error.code,
                    name: error.name
                }
            });

            if (error.code === 'P2021' && retryCount < MAX_RETRIES - 1) {
                retryCount++;
                const delay = 2000 * retryCount;
                console.log(`🔄 Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error('❌ Fatal error or max retries reached');
                // Send error message with enhanced details
                parentPort?.postMessage({
                    type: 'error',
                    error: {
                        message: error.message,
                        stack: error.stack,
                        code: error.code,
                        txid: post.txid
                    }
                });
                console.log('📤 Error message sent to scanner');
                throw error;
            }
        }
    }
}

// Handle incoming messages
parentPort?.on('message', async (message: any) => {
    console.log('\n📥 Received message from scanner:', {
        type: message?.type,
        hasTransaction: !!message?.transaction
    });

    if (!message || !message.type) {
        console.error('❌ Received invalid message:', message);
        return;
    }

    if (message.type === 'process_transaction') {
        try {
            console.log('🎯 Starting transaction processing');
            await processTransaction(prisma, message.transaction);
        } catch (error: any) {
            console.error('❌ Error in message handler:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            console.error('Error processing transaction:', error);
        }
    }
}); 