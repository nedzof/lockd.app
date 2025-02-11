import { parentPort } from 'worker_threads';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

// Initialize Prisma client
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    }
});

// Test database connection
prisma.$connect()
    .then(() => {
        parentPort.postMessage({ type: 'info', message: 'Database connected successfully' });
    })
    .catch((error) => {
        parentPort.postMessage({ type: 'error', message: 'Database connection failed', error: String(error) });
    });

async function fetchTransaction(txId) {
    const url = `https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txId}`;
    const response = await axios.get(url);
    return response.data;
}

async function processTransaction(message) {
    try {
        console.log('========== Processing New Transaction ==========');
        console.log('Transaction ID:', message.transaction.id);
        
        // Get the parsed transaction data
        const parsedTx = message.parsedTransaction;
        if (!parsedTx) {
            console.error('No parsed transaction data available');
            return;
        }
        
        console.log('Parsed Transaction:', JSON.stringify(parsedTx, null, 2));

        // Get author address
        const authorAddress = parsedTx.metadata.authorAddress;
        if (!authorAddress) {
            console.error('No author address found in transaction');
            return;
        }
        
        console.log('Author Address:', authorAddress);

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create vote question record if this is a vote question
            if (parsedTx.voteQuestion) {
                console.log('Creating Vote Question:', parsedTx.voteQuestion);

                try {
                    // Create the vote question
                    const voteQuestion = await prisma.voteQuestion.create({
                        data: {
                            txid: parsedTx.voteQuestion.txid,
                            content: parsedTx.voteQuestion.content,
                            author_address: parsedTx.voteQuestion.author_address,
                            created_at: parsedTx.voteQuestion.created_at,
                            options: parsedTx.voteQuestion.options,
                            tags: parsedTx.voteQuestion.tags
                        }
                    });
                    
                    console.log('Vote Question Created:', voteQuestion);

                    // Create all associated vote options
                    if (parsedTx.voteOptions.length > 0) {
                        console.log('Creating Vote Options:', parsedTx.voteOptions);
                        
                        const voteOptionsPromises = parsedTx.voteOptions.map(option =>
                            prisma.voteOption.create({
                                data: {
                                    txid: option.txid,
                                    question_txid: option.question_txid,
                                    content: option.content,
                                    author_address: option.author_address,
                                    created_at: option.created_at,
                                    lock_amount: option.lock_amount,
                                    lock_duration: option.lock_duration,
                                    tags: option.tags
                                }
                            })
                        );

                        const createdOptions = await Promise.all(voteOptionsPromises);
                        console.log('Vote Options Created:', createdOptions);

                        return { voteQuestion, options: createdOptions };
                    }

                    return { voteQuestion };
                } catch (error) {
                    console.error('Error creating vote question or options:', error);
                    throw error;
                }
            }

            // If this is just a vote option (not part of a question creation)
            else if (parsedTx.voteOptions.length > 0) {
                console.log('Creating Standalone Vote Options:', parsedTx.voteOptions);

                try {
                    const voteOptionsPromises = parsedTx.voteOptions.map(option =>
                        prisma.voteOption.create({
                            data: {
                                txid: option.txid,
                                question_txid: option.question_txid,
                                content: option.content,
                                author_address: option.author_address,
                                created_at: option.created_at,
                                lock_amount: option.lock_amount,
                                lock_duration: option.lock_duration,
                                tags: option.tags
                            }
                        })
                    );

                    const createdOptions = await Promise.all(voteOptionsPromises);
                    console.log('Standalone Vote Options Created:', createdOptions);

                    return { options: createdOptions };
                } catch (error) {
                    console.error('Error creating standalone vote options:', error);
                    throw error;
                }
            }

            console.log('No vote question or options found to process');
            return null;
        });

        if (result) {
            console.log('Transaction processed successfully:', result);
        }

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