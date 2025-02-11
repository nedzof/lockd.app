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
        parentPort.postMessage({
            type: 'info',
            message: 'Processing transaction',
            data: {
                id: message.transaction.id,
                timestamp: new Date().toISOString()
            }
        });

        // Get the parsed transaction data
        const parsedTx = message.parsedTransaction;
        if (!parsedTx) {
            parentPort.postMessage({
                type: 'warning',
                message: 'No parsed transaction data available',
                data: { txid: message.transaction.id }
            });
            return;
        }

        // Get author address
        const authorAddress = parsedTx.metadata.authorAddress;
        if (!authorAddress) {
            parentPort.postMessage({
                type: 'warning',
                message: 'No author address found',
                data: { txid: parsedTx.transaction_id }
            });
            return;
        }

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create vote question record if this is a vote question
            if (parsedTx.voteQuestion) {
                parentPort.postMessage({
                    type: 'debug',
                    message: 'Creating vote question',
                    data: parsedTx.voteQuestion
                });

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

                // Create all associated vote options
                if (parsedTx.voteOptions.length > 0) {
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

                    parentPort.postMessage({
                        type: 'info',
                        message: 'Created vote question with options',
                        data: {
                            question: {
                                id: voteQuestion.id,
                                content: voteQuestion.content
                            },
                            options: createdOptions.map(opt => ({
                                id: opt.id,
                                content: opt.content,
                                lockAmount: opt.lock_amount,
                                lockDuration: opt.lock_duration
                            }))
                        }
                    });

                    return { voteQuestion, options: createdOptions };
                }

                return { voteQuestion };
            }

            // If this is just a vote option (not part of a question creation)
            else if (parsedTx.voteOptions.length > 0) {
                parentPort.postMessage({
                    type: 'debug',
                    message: 'Creating standalone vote options',
                    data: parsedTx.voteOptions
                });

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

                parentPort.postMessage({
                    type: 'info',
                    message: 'Created standalone vote options',
                    data: {
                        options: createdOptions.map(opt => ({
                            id: opt.id,
                            content: opt.content,
                            lockAmount: opt.lock_amount,
                            lockDuration: opt.lock_duration
                        }))
                    }
                });

                return { options: createdOptions };
            }

            parentPort.postMessage({
                type: 'warning',
                message: 'No vote question or options found to process',
                data: { txid: parsedTx.transaction_id }
            });
            return null;
        });

        if (result) {
            parentPort.postMessage({
                type: 'success',
                message: 'Transaction processed successfully',
                data: {
                    txid: parsedTx.transaction_id,
                    timestamp: new Date().toISOString(),
                    result
                }
            });
        }

    } catch (error) {
        if (error?.code === 'P2002') {
            parentPort.postMessage({
                type: 'warning',
                message: 'Duplicate transaction',
                data: {
                    txid: parsedTx.transaction_id,
                    error: 'P2002'
                }
            });
        } else {
            parentPort.postMessage({
                type: 'error',
                message: 'Error processing transaction',
                data: {
                    txid: parsedTx.transaction_id,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                }
            });
        }
    }
}

// Listen for messages from the main thread
parentPort.on('message', async (message) => {
    if (message.type === 'process_transaction') {
        await processTransaction(message);
    }
}); 