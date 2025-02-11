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

        // Log raw transaction data for debugging
        console.log('Raw transaction data:', {
            id: message.transaction.id,
            inputs: message.transaction.vin,
            outputs: message.transaction.vout,
            parsedTransaction: message.parsedTransaction
        });

        // Log parsed transaction data
        console.log('Database worker message:', {
            type: 'debug',
            message: 'Parsed transaction data',
            data: message.parsedTransaction
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

        // Get author address from transaction outputs
        const authorAddress = message.transaction.vout?.[0]?.scriptPubKey?.addresses?.[0];
        if (!authorAddress) {
            parentPort.postMessage({
                type: 'warning',
                message: 'No author address found',
                data: { txid: message.transaction.id }
            });
            return;
        }

        // Log attempt to check for existing transaction
        parentPort.postMessage({
            type: 'debug',
            message: 'Checking for existing transaction',
            data: { txid: message.transaction.id }
        });

        // Check if transaction already exists
        const existingTx = await prisma.voteQuestion.findUnique({
            where: { txid: message.transaction.id }
        });

        if (existingTx) {
            parentPort.postMessage({
                type: 'info',
                message: 'Transaction already exists',
                data: { txid: message.transaction.id }
            });
            return;
        }

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create vote question record if this is a vote question
            if (parsedTx.vote_question) {
                parentPort.postMessage({
                    type: 'debug',
                    message: 'Creating vote question',
                    data: {
                        txid: message.transaction.id,
                        content: parsedTx.vote_question,
                        options: parsedTx.vote_options
                    }
                });

                const voteQuestion = await prisma.voteQuestion.create({
                    data: {
                        txid: message.transaction.id,
                        content: parsedTx.vote_question,
                        author_address: authorAddress,
                        created_at: new Date(parsedTx.timestamp * 1000),
                        options: parsedTx.vote_options,
                        tags: parsedTx.metadata.tags
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
                parentPort.postMessage({
                    type: 'debug',
                    message: 'Creating vote options',
                    data: {
                        txid: message.transaction.id,
                        options: parsedTx.vote_options
                    }
                });

                const voteOptions = await Promise.all(parsedTx.vote_options.map(option =>
                    prisma.voteOption.create({
                        data: {
                            txid: message.transaction.id,
                            content: option.option,
                            author_address: authorAddress,
                            created_at: new Date(parsedTx.timestamp * 1000),
                            lock_amount: option.lockAmount,
                            lock_duration: option.lockDuration,
                            tags: parsedTx.metadata.tags,
                            question_txid: message.transaction.id // This should be the question's txid
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

            parentPort.postMessage({
                type: 'warning',
                message: 'No vote question or options found to process',
                data: { txid: message.transaction.id }
            });
            return null;
        });

        if (result) {
            parentPort.postMessage({
                type: 'success',
                message: 'Transaction processed successfully',
                data: {
                    txid: message.transaction.id,
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
                    txid: message.transaction.id,
                    error: 'P2002'
                }
            });
        } else {
            parentPort.postMessage({
                type: 'error',
                message: 'Error processing transaction',
                data: {
                    txid: message.transaction.id,
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                }
            });
        }
    }
}

// Listen for messages from the main thread
parentPort.on('message', async (message) => {
    console.log('Database worker message:', {
        type: 'info',
        message: 'Processing transaction',
        data: {
            id: message.transaction.id,
            timestamp: new Date().toISOString()
        }
    });

    // Log raw transaction data for debugging
    console.log('Raw transaction data:', {
        id: message.transaction.id,
        inputs: message.transaction.vin,
        outputs: message.transaction.vout,
        parsedTransaction: message.parsedTransaction
    });

    if (message.type === 'process_transaction') {
        try {
            const parsedTx = message.parsedTransaction;
            
            // Log the parsed transaction data
            console.log('Database worker message:', {
                type: 'debug',
                message: 'Parsed transaction data',
                data: parsedTx
            });

            // Check if we have an author address
            if (!parsedTx.metadata.authorAddress) {
                console.log('Database worker message:', {
                    type: 'warning',
                    message: 'No author address found',
                    data: {
                        txid: parsedTx.transaction_id
                    }
                });
                return;
            }

            // Create author address record if it doesn't exist
            const authorAddress = await prisma.authorAddress.upsert({
                where: { address: parsedTx.metadata.authorAddress },
                update: {},
                create: { address: parsedTx.metadata.authorAddress }
            });

            // Create vote question record
            if (parsedTx.vote_question) {
                const voteQuestion = await prisma.voteQuestion.create({
                    data: {
                        transaction_id: parsedTx.transaction_id,
                        block_height: parsedTx.block_height,
                        block_hash: parsedTx.block_hash,
                        created_at: new Date(parsedTx.timestamp * 1000),
                        question: parsedTx.vote_question,
                        author_address_id: authorAddress.id,
                        options: parsedTx.vote_options,
                        tags: parsedTx.metadata.tags
                    }
                });

                console.log('Database worker message:', {
                    type: 'info',
                    message: 'Created vote question',
                    data: {
                        id: voteQuestion.id,
                        question: voteQuestion.question
                    }
                });
            }

            // Create vote options if present
            if (parsedTx.vote_options && parsedTx.vote_options.length > 0) {
                for (const option of parsedTx.vote_options) {
                    const voteOption = await prisma.voteOption.create({
                        data: {
                            transaction_id: parsedTx.transaction_id,
                            block_height: parsedTx.block_height,
                            block_hash: parsedTx.block_hash,
                            created_at: new Date(parsedTx.timestamp * 1000),
                            option: option.option,
                            lock_amount: option.lockAmount,
                            lock_duration: option.lockDuration,
                            author_address_id: authorAddress.id
                        }
                    });

                    console.log('Database worker message:', {
                        type: 'info',
                        message: 'Created vote option',
                        data: {
                            id: voteOption.id,
                            option: voteOption.option
                        }
                    });
                }
            }

            console.log('Database worker message:', {
                type: 'info',
                message: 'Successfully processed transaction',
                data: {
                    txid: parsedTx.transaction_id
                }
            });
        } catch (error) {
            console.error('Database worker message:', {
                type: 'error',
                message: 'Error processing transaction',
                data: {
                    error: error.message,
                    stack: error.stack
                }
            });
        }
    }
}); 