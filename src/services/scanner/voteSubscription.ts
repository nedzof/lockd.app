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
});

interface JungleBusTransaction extends Transaction {
    hex: string;
    addresses: string[];
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

const onPublish = async function(tx: JungleBusTransaction) {
    try {
        // Extract MAP data from all outputs
        const outputs = parseMapData([tx.hex]) as unknown as MapOutput[];
        if (!outputs || !Array.isArray(outputs)) return;

        // Find the vote question output
        const questionOutput = outputs.find(output => 
            output.type === 'vote' && output.isVoteQuestion === 'true'
        );

        if (!questionOutput) return;

        // Find all vote option outputs
        const optionOutputs = outputs.filter(output => 
            output.type === 'vote_option'
        );

        // Parse vote question data
        const voteData: VoteData = {
            txid: tx.id,
            content: questionOutput.content || '',
            author_address: tx.addresses?.[0] || '',
            created_at: questionOutput.timestamp || new Date().toISOString(),
            tags: Array.isArray(questionOutput.tags) ? questionOutput.tags : [],
            options: optionOutputs.map(opt => ({
                text: opt.content || '',
                lockDuration: parseInt(opt.lockDuration || '0'),
                lockAmount: parseInt(opt.lockAmount || '0')
            }))
        };

        try {
            // Store vote question in database
            const voteQuestion = await prisma.voteQuestion.create({
                data: {
                    txid: voteData.txid,
                    content: voteData.content,
                    author_address: voteData.author_address,
                    created_at: new Date(voteData.created_at),
                    options: voteData.options as Prisma.JsonValue,
                    tags: voteData.tags
                }
            });

            // Store each vote option in database
            if (voteData.options && voteData.options.length > 0) {
                await Promise.all(voteData.options.map((option, index) => 
                    prisma.voteOption.create({
                        data: {
                            txid: `${voteData.txid}_${index}`, // Generate unique txid for each option
                            question_txid: voteData.txid,
                            content: option.text,
                            author_address: voteData.author_address,
                            created_at: new Date(voteData.created_at),
                            lock_amount: option.lockAmount,
                            lock_duration: option.lockDuration,
                            tags: voteData.tags
                        }
                    })
                ));
            }

            console.log('Vote stored:', {
                questionTxid: voteData.txid,
                optionsCount: voteData.options?.length || 0,
                options: voteData.options
            });
        } catch (error) {
            console.error('Error storing vote:', error);
        }
    } catch (error) {
        console.error('Error processing vote transaction:', error);
    }
};

const onStatus = function(message: ControlMessage) {
    console.log("Status:", message);
    if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
        console.log("Block done:", message);
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
        await client.Subscribe(
            subscriptionId,
            0, // fromBlock
            onPublish as unknown as (tx: Transaction) => void,
            onStatus,
            onError,
            onMempool as unknown as (tx: Transaction) => void
        );
        console.log('Vote subscription started successfully');
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