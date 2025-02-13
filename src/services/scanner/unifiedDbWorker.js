import { parentPort } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error']
});

// Test database connection
async function testConnection() {
    try {
        await prisma.$connect();
        console.log('Database worker connected to database');
    } catch (error) {
        console.error('Database worker failed to connect:', error);
        process.exit(1);
    }
}

// Handle messages from main thread
parentPort?.on('message', async (message) => {
    try {
        console.log('Database worker received message:', message);

        if (message.type === 'process_transaction') {
            const tx = message.transaction;
            
            await processTransaction(tx);
        }
    } catch (error) {
        console.error('Database worker error:', error);
        parentPort?.postMessage({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            txid: message.transaction?.txid
        });
    }
});

async function processTransaction(tx) {
    try {
        // Create or update the post
        const post = await prisma.post.upsert({
            where: {
                txid: tx.txid
            },
            update: {
                content: tx.content,
                author_address: tx.author_address,
                block_height: tx.block_height,
                created_at: tx.created_at,
                tags: tx.tags || [],
                is_locked: false,
                media_type: tx.media_type,
                raw_image_data: tx.raw_image_data,
                image_format: tx.image_format,
                image_source: tx.image_source,
                metadata: tx.metadata || {},
                is_vote: tx.is_vote || false
            },
            create: {
                txid: tx.txid,
                content: tx.content,
                author_address: tx.author_address,
                block_height: tx.block_height,
                created_at: tx.created_at,
                tags: tx.tags || [],
                is_locked: false,
                media_type: tx.media_type,
                raw_image_data: tx.raw_image_data,
                image_format: tx.image_format,
                image_source: tx.image_source,
                metadata: tx.metadata || {},
                is_vote: tx.is_vote || false
            }
        });

        // If it's a vote post, create or update vote options
        if (tx.is_vote && tx.vote_options) {
            await Promise.all(tx.vote_options.map(option =>
                prisma.voteOption.upsert({
                    where: {
                        txid: `${tx.txid}-${option.content}`
                    },
                    update: {
                        content: option.content,
                        author_address: tx.author_address,
                        created_at: tx.created_at,
                        lock_amount: option.lock_amount,
                        lock_duration: option.lock_duration,
                        tags: []
                    },
                    create: {
                        txid: `${tx.txid}-${option.content}`,
                        post_txid: tx.txid,
                        content: option.content,
                        author_address: tx.author_address,
                        created_at: tx.created_at,
                        lock_amount: option.lock_amount,
                        lock_duration: option.lock_duration,
                        tags: []
                    }
                })
            ));
        }

        parentPort?.postMessage({
            type: 'transaction_processed',
            txid: tx.txid,
            success: true
        });
    } catch (error) {
        console.error('Database worker error:', error);
        parentPort?.postMessage({
            type: 'error',
            error: error.message,
            txid: tx.txid
        });
    }
}

// Initialize connection
testConnection(); 