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

async function processTransaction(tx) {
    try {
        parentPort.postMessage({
            type: 'info',
            message: 'Processing transaction',
            data: {
                id: tx.transaction.id,
                timestamp: new Date().toISOString()
            }
        });

        // Get the parsed transaction data
        const parsedTx = tx.parsedTransaction;
        if (!parsedTx) {
            parentPort.postMessage({
                type: 'warning',
                message: 'No parsed transaction data available',
                data: { txid: tx.transaction.id }
            });
            return;
        }

        // Log the parsed transaction for debugging
        parentPort.postMessage({
            type: 'info',
            message: 'Parsed transaction data',
            data: parsedTx
        });

        // Check if transaction already exists
        const existingTx = await prisma.voteQuestion.findUnique({
            where: { txid: parsedTx.transaction_id }
        });

        if (existingTx) {
            parentPort.postMessage({
                type: 'info',
                message: 'Transaction already exists',
                data: { txid: parsedTx.transaction_id }
            });
            return;
        }

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create vote question if present
            if (parsedTx.vote_question) {
                const voteQuestion = await prisma.voteQuestion.create({
                    data: {
                        txid: parsedTx.transaction_id,
                        content: parsedTx.vote_question,
                        author_address: tx.transaction.author_address || 'unknown',
                        created_at: new Date(parsedTx.timestamp * 1000),
                        options: parsedTx.vote_options || [],
                        tags: parsedTx.metadata.tags || []
                    }
                });

                parentPort.postMessage({
                    type: 'info',
                    message: 'Created vote question',
                    data: {
                        id: voteQuestion.id,
                        txid: voteQuestion.txid,
                        content: voteQuestion.content,
                        options: voteQuestion.options
                    }
                });

                // Create vote options if present
                if (parsedTx.vote_options && parsedTx.vote_options.length > 0) {
                    const voteOptions = await Promise.all(parsedTx.vote_options.map(option =>
                        prisma.voteOption.create({
                            data: {
                                txid: parsedTx.transaction_id + '_' + option.option, // Create unique txid for option
                                content: option.option,
                                author_address: tx.transaction.author_address || 'unknown',
                                created_at: new Date(parsedTx.timestamp * 1000),
                                lock_amount: option.lockAmount,
                                lock_duration: option.lockDuration,
                                tags: parsedTx.metadata.tags || [],
                                question_txid: voteQuestion.txid
                            }
                        })
                    ));

                    parentPort.postMessage({
                        type: 'info',
                        message: 'Created vote options',
                        data: {
                            questionId: voteQuestion.id,
                            options: voteOptions.map(opt => ({
                                id: opt.id,
                                content: opt.content,
                                lockAmount: opt.lock_amount,
                                lockDuration: opt.lock_duration
                            }))
                        }
                    });
                }

                return {
                    question: voteQuestion,
                    type: 'vote_question'
                };
            }
            // If no vote question but has options, it might be a vote cast
            else if (parsedTx.vote_options && parsedTx.vote_options.length > 0) {
                const voteOption = parsedTx.vote_options[0]; // Take the first option as the vote
                const voteCast = await prisma.voteOption.create({
                    data: {
                        txid: parsedTx.transaction_id,
                        content: voteOption.option,
                        author_address: tx.transaction.author_address || 'unknown',
                        created_at: new Date(parsedTx.timestamp * 1000),
                        lock_amount: voteOption.lockAmount,
                        lock_duration: voteOption.lockDuration,
                        tags: parsedTx.metadata.tags || [],
                        question_txid: tx.transaction.id // This should be the original question's txid
                    }
                });

                parentPort.postMessage({
                    type: 'info',
                    message: 'Created vote cast',
                    data: {
                        id: voteCast.id,
                        content: voteCast.content,
                        lockAmount: voteCast.lock_amount,
                        lockDuration: voteCast.lock_duration
                    }
                });

                return {
                    voteCast,
                    type: 'vote_cast'
                };
            }

            return null;
        });

        if (result) {
            parentPort.postMessage({
                type: 'success',
                message: 'Transaction processed successfully',
                data: {
                    txid: parsedTx.transaction_id,
                    type: result.type,
                    timestamp: new Date().toISOString(),
                    result
                }
            });
        } else {
            parentPort.postMessage({
                type: 'warning',
                message: 'Transaction did not contain vote data',
                data: {
                    txid: parsedTx.transaction_id
                }
            });
        }

    } catch (error) {
        if (error?.code === 'P2002') {
            parentPort.postMessage({
                type: 'warning',
                message: 'Duplicate transaction',
                data: {
                    txid: tx.transaction.id,
                    error: 'P2002'
                }
            });
        } else {
            parentPort.postMessage({
                type: 'error',
                message: 'Error processing transaction',
                data: {
                    txid: tx.transaction.id,
                    error: error instanceof Error ? error.message : String(error)
                }
            });
        }
    }
}

// Listen for messages from the main thread
parentPort.on('message', async (message) => {
    if (message.type === 'process_transaction') {
        await processTransaction(message.transaction);
    }
}); 