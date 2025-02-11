import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { Transaction, ControlMessage } from './junglebus.types';
import { PrismaClient, Prisma } from '@prisma/client';
import { parseMapData } from '../../shared/utils/mapProtocol';

// Initialize Prisma client with direct connection
const prisma = new PrismaClient({
    log: ['error'],
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    }
}) as unknown as PrismaClient & {
    VoteQuestion: {
        create: (data: any) => Promise<any>;
        count: () => Promise<number>;
    };
    VoteOption: {
        create: (data: any) => Promise<any>;
    };
};

// Test database connection
prisma.$connect()
    .then(() => {
        console.log('Successfully connected to the database');
    })
    .catch((error) => {
        console.error('Failed to connect to the database:', error);
    });

interface JungleBusTransaction {
    id: string;
    transaction: string;
    addresses?: string[];
    outputs?: string[];
    data?: string[];
    outputTypes?: string[];
    contexts?: string[];
    subContexts?: string[];
}

interface VoteData {
    txid: string;
    content: string;
    author_address: string;
    created_at: string;
    tags: string[];
    options?: Array<{
        text: string;
        lockDuration: number;
        lockAmount: number;
    }>;
}

interface MapOutput {
    type: string;
    content?: string;
    isVoteQuestion?: string;
    timestamp?: string;
    tags?: string[];
    lockDuration?: string;
    lockAmount?: string;
}

let currentBlock: number = 0;

interface ExtendedTransaction extends Transaction {
    outputs?: string[];
    output_types?: string[];
    contexts?: string[];
    sub_contexts?: string[];
    data?: string[];
    addresses?: string[];
}

interface VoteMapData {
    type: string;
    content: string;
    isVoteQuestion?: boolean;
    questionTxid?: string;
    lockAmount?: number;
    lockDuration?: number;
    timestamp?: string;
    tags?: string[];
    txid?: string;
}

function parseVoteMapData(outputs: string[]): VoteMapData[] {
    const voteData: VoteMapData[] = [];
    let currentData: Partial<VoteMapData> = {};
    let currentOptions: Array<{text: string; lockAmount: number; lockDuration: number}> = [];

    for (const output of outputs) {
        try {
            // Split by MAP protocol separator
            const [key, value] = output.split('=').map(s => s.trim());
            
            if (!key || !value) continue;

            switch (key.toLowerCase()) {
                case 'app':
                    if (currentData.type) {
                        if (currentOptions.length > 0) {
                            // Add options as separate vote data entries
                            currentOptions.forEach(opt => {
                                voteData.push({
                                    type: 'vote_option',
                                    content: opt.text,
                                    lockAmount: opt.lockAmount,
                                    lockDuration: opt.lockDuration,
                                    timestamp: currentData.timestamp,
                                    tags: currentData.tags,
                                    questionTxid: currentData.txid
                                } as VoteMapData);
                            });
                            currentOptions = [];
                        }
                        voteData.push(currentData as VoteMapData);
                        currentData = {};
                    }
                    if (value === 'lockd.app') {
                        currentData = {};
                    }
                    break;
                case 'type':
                    currentData.type = value;
                    break;
                case 'content':
                    currentData.content = value;
                    break;
                case 'isvotequestion':
                    currentData.isVoteQuestion = value.toLowerCase() === 'true';
                    break;
                case 'questiontxid':
                    currentData.questionTxid = value;
                    break;
                case 'lockamount':
                    currentData.lockAmount = parseInt(value);
                    break;
                case 'lockduration':
                    currentData.lockDuration = parseInt(value);
                    break;
                case 'timestamp':
                    currentData.timestamp = value;
                    break;
                case 'tags':
                    try {
                        currentData.tags = JSON.parse(value);
                    } catch {
                        currentData.tags = value.split(',').map(t => t.trim());
                    }
                    break;
                case 'voteoptions':
                    try {
                        const options = JSON.parse(value);
                        currentOptions = options.map((opt: any) => ({
                            text: opt.text,
                            lockAmount: parseInt(opt.lockAmount) || 0,
                            lockDuration: parseInt(opt.lockDuration) || 0
                        }));
                    } catch (error) {
                        console.error('Error parsing vote options:', error);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error parsing vote output:', error);
        }
    }

    // Add the last data object and its options if they exist
    if (currentData.type) {
        if (currentOptions.length > 0) {
            currentOptions.forEach(opt => {
                voteData.push({
                    type: 'vote_option',
                    content: opt.text,
                    lockAmount: opt.lockAmount,
                    lockDuration: opt.lockDuration,
                    timestamp: currentData.timestamp,
                    tags: currentData.tags,
                    questionTxid: currentData.txid
                } as VoteMapData);
            });
        }
        voteData.push(currentData as VoteMapData);
    }

    return voteData;
}

const onPublish = async function(tx: JungleBusTransaction) {
    try {
        console.log('Processing transaction:', {
            id: tx.id,
            outputsCount: tx.outputs?.length || 0,
            dataCount: tx.data?.length || 0,
            addresses: tx.addresses,
            transaction: tx.transaction ? tx.transaction.substring(0, 100) + '...' : undefined
        });

        // Get the full transaction data from JungleBus
        const fullTx = await client.GetTransaction(tx.id) as ExtendedTransaction;
        if (!fullTx) {
            console.log('Could not fetch transaction details:', tx.id);
            return;
        }

        console.log('Full transaction data:', {
            id: fullTx.id,
            outputCount: fullTx.outputs?.length,
            outputTypes: fullTx.output_types,
            data: fullTx.data?.map((d: string) => d.substring(0, 100) + '...'),
        });

        // Parse MAP data from outputs
        const outputs = fullTx.data || [];
        const voteData = parseVoteMapData(outputs).map(data => ({
            ...data,
            txid: tx.id
        }));

        if (voteData.length === 0) {
            console.log('No vote data found in transaction:', tx.id);
            return;
        }

        // Find vote question and options
        const question = voteData.find(d => d.isVoteQuestion && d.type === 'vote');
        const options = voteData.filter(d => d.type === 'vote_option');

        if (!question) {
            console.log('No vote question found in transaction:', tx.id);
            return;
        }

        // Get author address from transaction outputs
        const authorAddress = fullTx.addresses?.[0] || tx.addresses?.[0] || '';
        if (!authorAddress) {
            console.log('No author address found in transaction:', tx.id);
            return;
        }

        // First create the vote question
        const voteQuestion = await prisma.VoteQuestion.create({
            data: {
                txid: tx.id,
                content: question.content,
                author_address: authorAddress,
                created_at: new Date(question.timestamp || Date.now()),
                options: [], // Empty array since we'll create separate VoteOption records
                tags: question.tags || []
            }
        });

        // Then create the vote options
        for (const option of options) {
            await prisma.VoteOption.create({
                data: {
                    txid: `${tx.id}_${option.content}`, // Create unique txid for each option
                    question_txid: tx.id,
                    content: option.content,
                    author_address: authorAddress,
                    created_at: new Date(option.timestamp || Date.now()),
                    lock_amount: option.lockAmount || 0,
                    lock_duration: option.lockDuration || 0,
                    tags: option.tags || []
                }
            });
        }

        console.log('Successfully stored vote question and options');
    } catch (error) {
        console.error('Error processing transaction:', error);
    }
};

const onStatus = function(status: any) {
    if (status.block) {
        currentBlock = status.block;
    }
    console.log('Status:', status);
    if (status.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
        console.log("Block done:", status);
    }
};

const onError = function(error: any) {
    console.error("Error in vote subscription:", error);
};

const onMempool = async function(tx: JungleBusTransaction) {
    await onPublish(tx);
};

// Create JungleBus client for votes
const client = new JungleBusClient("junglebus.gorillapool.io", {
    useSSL: true,
    protocol: "json",
    onConnected(ctx) {
        console.log("Vote subscription connected:", ctx);
    },
    onConnecting(ctx) {
        console.log("Vote subscription connecting:", ctx);
    },
    onDisconnected(ctx) {
        console.log("Vote subscription disconnected:", ctx);
    },
    onError(ctx) {
        console.error("Vote subscription error:", ctx);
    }
});

// Subscribe to vote transactions
const subscriptionId = "436d4681e23186b369291cf3e494285724964e92f319de5f56b6509d32627693";

export async function startVoteSubscription() {
    try {
        // Verify database connection
        try {
            const voteCount = await prisma.VoteQuestion.count();
            console.log('Database connection verified. Current vote count:', voteCount);
        } catch (dbError) {
            console.error('Database connection error:', dbError);
            throw dbError;
        }

        await client.Subscribe(
            subscriptionId,
            883556, // Start from block 883556
            onPublish as unknown as (tx: Transaction) => void,
            onStatus,
            onError,
            onMempool as unknown as (tx: Transaction) => void
        );
        console.log('Vote subscription started successfully from block 883556');
    } catch (error) {
        console.error('Failed to start vote subscription:', error);
        throw error;
    }
}

export async function stopVoteSubscription() {
    try {
        await client.Disconnect();
        console.log('Vote subscription stopped successfully');
    } catch (error) {
        console.error('Failed to stop vote subscription:', error);
        throw error;
    }
} 