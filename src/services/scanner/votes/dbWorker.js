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

        // Get author address from transaction outputs
        const fullTx = await fetchTransaction(tx.transaction.id);
        const authorAddress = fullTx.vout[0]?.scriptPubKey?.addresses?.[0];
        if (!authorAddress) {
            parentPort.postMessage({
                type: 'warning',
                message: 'No author address found',
                data: { txid: tx.transaction.id }
            });
            return;
        }

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create vote question if present
            if (parsedTx.vote_question) {
                // Check if question already exists
                const existingQuestion = await prisma.voteQuestion.findUnique({
                    where: { txid: tx.transaction.id }
                });

                if (existingQuestion) {
                    parentPort.postMessage({
                        type: 'info',
                        message: 'Vote question already exists',
                        data: { txid: tx.transaction.id }
                    });
                    return existingQuestion;
                }

                const voteQuestion = await prisma.voteQuestion.create({
                    data: {
                        txid: tx.transaction.id,
                        content: parsedTx.vote_question,
                        author_address: authorAddress,
                        created_at: new Date(parsedTx.timestamp * 1000),
                        options: parsedTx.vote_options || [],
                        tags: parsedTx.metadata.tags || ['vote']
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

                return voteQuestion;
            }

            // Create vote options if present
            if (parsedTx.vote_options && parsedTx.vote_options.length > 0) {
                // Check if any options already exist
                const existingOption = await prisma.voteOption.findUnique({
                    where: { txid: tx.transaction.id }
                });

                if (existingOption) {
                    parentPort.postMessage({
                        type: 'info',
                        message: 'Vote option already exists',
                        data: { txid: tx.transaction.id }
                    });
                    return existingOption;
                }

                const voteOptions = await Promise.all(parsedTx.vote_options.map(option =>
                    prisma.voteOption.create({
                        data: {
                            txid: tx.transaction.id,
                            content: option.option,
                            author_address: authorAddress,
                            created_at: new Date(parsedTx.timestamp * 1000),
                            lock_amount: option.lockAmount,
                            lock_duration: option.lockDuration,
                            tags: parsedTx.metadata.tags || ['vote_option'],
                            question_txid: tx.transaction.id // This should be the question's txid
                        }
                    })
                ));

                parentPort.postMessage({
                    type: 'info',
                    message: 'Created vote options',
                    data: {
                        options: voteOptions.map(opt => ({
                            id: opt.id,
                            content: opt.content,
                            lockAmount: opt.lock_amount,
                            lockDuration: opt.lock_duration
                        }))
                    }
                });

                return voteOptions;
            }

            return null;
        });

        if (result) {
            parentPort.postMessage({
                type: 'success',
                message: 'Transaction processed successfully',
                data: {
                    txid: tx.transaction.id,
                    timestamp: new Date().toISOString(),
                    result
                }
            });
        } else {
            parentPort.postMessage({
                type: 'warning',
                message: 'Transaction was not a vote question or option',
                data: { txid: tx.transaction.id }
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