const { parentPort } = require('worker_threads');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

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
                id: tx.id,
                timestamp: new Date().toISOString()
            }
        });

        // Fetch full transaction data
        const fullTx = await fetchTransaction(tx.id);
        if (!fullTx) {
            parentPort.postMessage({
                type: 'warning',
                message: 'Could not fetch transaction details',
                data: { txid: tx.id }
            });
            return;
        }

        parentPort.postMessage({
            type: 'info',
            message: 'Raw transaction data',
            data: {
                txid: fullTx.txid,
                version: fullTx.version,
                size: fullTx.size,
                blockheight: fullTx.blockheight
            }
        });

        // Get author address from transaction outputs
        const authorAddress = fullTx.vout[0]?.scriptPubKey?.addresses?.[0];
        if (!authorAddress) {
            parentPort.postMessage({
                type: 'warning',
                message: 'No author address found',
                data: { txid: tx.id }
            });
            return;
        }

        // Check if transaction already exists
        const existingTx = await prisma.voteQuestion.findUnique({
            where: { txid: tx.id }
        });

        if (existingTx) {
            parentPort.postMessage({
                type: 'info',
                message: 'Transaction already exists',
                data: { txid: tx.id }
            });
            return;
        }

        // Process the transaction in a database transaction
        const result = await prisma.$transaction(async (prisma) => {
            // Create vote question record
            const voteQuestion = await prisma.voteQuestion.create({
                data: {
                    txid: tx.id,
                    content: 'Vote Question', // You'll need to extract this from the transaction
                    author_address: authorAddress,
                    created_at: new Date(),
                    options: [],
                    tags: ['vote']
                }
            });

            parentPort.postMessage({
                type: 'info',
                message: 'Created vote question',
                data: {
                    id: voteQuestion.id,
                    txid: voteQuestion.txid
                }
            });

            return voteQuestion;
        });

        parentPort.postMessage({
            type: 'success',
            message: 'Transaction processed successfully',
            data: {
                questionId: result.id,
                txid: result.txid,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        if (error?.code === 'P2002') {
            parentPort.postMessage({
                type: 'warning',
                message: 'Duplicate transaction',
                data: {
                    txid: tx.id,
                    error: 'P2002'
                }
            });
        } else {
            parentPort.postMessage({
                type: 'error',
                message: 'Error processing transaction',
                data: {
                    txid: tx.id,
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