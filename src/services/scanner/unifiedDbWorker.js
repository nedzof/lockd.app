import { parentPort } from 'worker_threads';
import { PrismaClient } from '@prisma/client';

// Initialize Prisma client with direct connection
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    }
});

async function processTransaction(message) {
    try {
        console.log('========== Processing New Transaction ==========');
        console.log('Transaction ID:', message.transaction.txid);
        
        const tx = message.transaction;
        if (!tx) {
            console.error('No transaction data available');
            return;
        }
        
        console.log('Processing Transaction:', JSON.stringify(tx, null, 2));

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            try {
                // Create the post
                const post = await prisma.post.create({
                    data: {
                        txid: tx.txid,
                        content: tx.content,
                        author_address: tx.author_address,
                        block_height: tx.block_height,
                        created_at: tx.created_at,
                        tags: tx.tags,
                        metadata: tx.metadata || {},
                        is_vote: tx.is_vote,
                        media_type: tx.media_type,
                        raw_image_data: tx.raw_image_data,
                        image_format: tx.image_format,
                        image_source: tx.image_source
                    }
                });
                
                console.log('Created post:', post);

                // If this is a vote post, create the vote options
                if (tx.is_vote && tx.vote_options?.length > 0) {
                    console.log('Creating vote options:', tx.vote_options);
                    
                    const voteOptionsPromises = tx.vote_options.map(option =>
                        prisma.voteOption.create({
                            data: {
                                txid: `${tx.txid}_${option.content}`, // Create unique txid for each option
                                post_txid: tx.txid,
                                content: option.content,
                                author_address: tx.author_address,
                                created_at: tx.created_at,
                                lock_amount: option.lock_amount,
                                lock_duration: option.lock_duration,
                                tags: tx.tags
                            }
                        })
                    );

                    const createdOptions = await Promise.all(voteOptionsPromises);
                    console.log('Created vote options:', createdOptions);

                    return { post, options: createdOptions };
                }

                return { post };
            } catch (error) {
                console.error('Error in database transaction:', error);
                throw error;
            }
        });

        console.log('Transaction processed successfully:', result);

    } catch (error) {
        console.error('Error processing transaction:', error);
        if (error?.code === 'P2002') {
            console.log('Duplicate transaction detected');
        }
    }
}

// Listen for messages from the main thread
parentPort.on('message', async (message) => {
    if (message.type === 'process_transaction') {
        await processTransaction(message);
    }
}); 