import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

// Simple implementation of parseMapTransaction
function parseMapTransaction(tx: any) {
    try {
        // Extract basic transaction data
        const txid = tx.id;
        const blockHeight = tx.blockHeight;
        const blockTime = tx.blockTime;
        const addresses = tx.addresses || [];
        const authorAddress = addresses[0] || null;
        
        // Parse outputs to extract data
        const data: Record<string, any> = {
            content: '',
            tags: [],
            voteOptions: [],
            isVote: false,
            contentType: null
        };
        
        // Process each output to extract MAP data
        if (tx.outputs && tx.outputs.length > 0) {
            tx.outputs.forEach((output: any) => {
                const script = output.script?.asm || '';
                
                // Extract content
                if (script.includes('MAP_TYPE=content') && script.includes('MAP_CONTENT=')) {
                    const contentMatch = script.match(/MAP_CONTENT=([^|]+)/);
                    if (contentMatch && contentMatch[1]) {
                        data.content = contentMatch[1];
                    }
                }
                
                // Extract tags
                if (script.includes('MAP_TAGS=')) {
                    const tagsMatch = script.match(/MAP_TAGS=(\[[^\]]+\])/);
                    if (tagsMatch && tagsMatch[1]) {
                        try {
                            data.tags = JSON.parse(tagsMatch[1]);
                        } catch (e) {
                            console.error('Failed to parse tags:', e);
                        }
                    }
                }
                
                // Extract vote data
                if (script.includes('MAP_TYPE=vote_question')) {
                    data.isVote = true;
                    data.contentType = 'vote';
                    
                    // Extract question content
                    const contentMatch = script.match(/MAP_CONTENT=([^|]+)/);
                    if (contentMatch && contentMatch[1]) {
                        data.content = contentMatch[1];
                    }
                }
                
                // Extract vote options
                if (script.includes('MAP_TYPE=vote_option')) {
                    const contentMatch = script.match(/MAP_CONTENT=([^|]+)/);
                    const indexMatch = script.match(/MAP_OPTION_INDEX=(\d+)/);
                    
                    if (contentMatch && contentMatch[1] && indexMatch && indexMatch[1]) {
                        const optionContent = contentMatch[1];
                        const optionIndex = parseInt(indexMatch[1], 10);
                        
                        data.voteOptions.push({
                            content: optionContent,
                            index: optionIndex
                        });
                    }
                }
            });
        }
        
        return {
            txid,
            blockHeight,
            blockTime: blockTime ? blockTime * 1000 : null,
            authorAddress,
            metadata: data
        };
    } catch (error) {
        console.error('Error parsing transaction:', error);
        return null;
    }
}

// Simple implementation of processTransaction
async function processTransaction(prisma: PrismaClient, parsedTx: any) {
    try {
        // Create or update the post
        const post = await prisma.post.upsert({
            where: { txid: parsedTx.txid },
            create: {
                txid: parsedTx.txid,
                content: parsedTx.metadata.content,
                authorAddress: parsedTx.authorAddress,
                blockHeight: parsedTx.blockHeight,
                createdAt: parsedTx.blockTime ? new Date(parsedTx.blockTime) : new Date(),
                tags: parsedTx.metadata.tags,
                isVote: parsedTx.metadata.isVote,
                mediaType: parsedTx.metadata.contentType
            },
            update: {
                content: parsedTx.metadata.content,
                authorAddress: parsedTx.authorAddress,
                blockHeight: parsedTx.blockHeight,
                tags: parsedTx.metadata.tags,
                isVote: parsedTx.metadata.isVote,
                mediaType: parsedTx.metadata.contentType
            }
        });
        
        // Create vote options if this is a vote post
        if (parsedTx.metadata.isVote && parsedTx.metadata.voteOptions.length > 0) {
            for (const option of parsedTx.metadata.voteOptions) {
                const optionTxid = `${parsedTx.txid}-option-${option.index}`;
                
                await prisma.voteOption.upsert({
                    where: { txid: optionTxid },
                    create: {
                        txid: optionTxid,
                        content: option.content,
                        authorAddress: parsedTx.authorAddress,
                        createdAt: parsedTx.blockTime ? new Date(parsedTx.blockTime) : new Date(),
                        postId: post.id,
                        optionIndex: option.index
                    },
                    update: {
                        content: option.content,
                        authorAddress: parsedTx.authorAddress,
                        postId: post.id,
                        optionIndex: option.index
                    }
                });
            }
        }
        
        return post;
    } catch (error) {
        console.error('Error processing transaction:', error);
        throw error;
    }
}

async function main() {
    try {
        // The transaction data from GorillaPool
        const tx = {
            id: "d8985709fb522609da66d91dab7483b8bad4447a33c9feabc25d6dac295e53ee",
            transaction: "...", // Truncated for brevity
            addresses: ["1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5"],
            blockHeight: 885675,
            blockTime: 1707831498,
            outputs: [
                {
                    script: {
                        asm: "MAP_TYPE=content|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=0|MAP_CONTENT=wasssup schiolz|MAP_TAGS=[\"Politics\",\"Crypto\"]|MAP_TIMESTAMP=2025-02-13T13:18:18.236Z|MAP_TYPE=content|MAP_VERSION=1.0.0",
                        hex: "..."
                    }
                },
                {
                    script: {
                        asm: "MAP_TYPE=image|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=1|MAP_PARENT_SEQUENCE=0|MAP_CONTENT_TYPE=image/jpeg",
                        hex: "..."
                    }
                },
                {
                    script: {
                        asm: "MAP_TYPE=vote_question|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=2|MAP_PARENT_SEQUENCE=0|MAP_CONTENT=Which option?|MAP_TOTAL_OPTIONS=3|MAP_OPTIONS_HASH=8a987fab274909475044766fe9f014e01f92874a1c9a10ea78cca571323054cf",
                        hex: "..."
                    }
                },
                {
                    script: {
                        asm: "MAP_TYPE=vote_option|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=3|MAP_PARENT_SEQUENCE=2|MAP_CONTENT=steuern erhöhen|MAP_OPTION_INDEX=0|MAP_LOCK_AMOUNT=1000|MAP_LOCK_DURATION=1",
                        hex: "..."
                    }
                },
                {
                    script: {
                        asm: "MAP_TYPE=vote_option|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=4|MAP_PARENT_SEQUENCE=2|MAP_CONTENT=leute ausrauben|MAP_OPTION_INDEX=1|MAP_LOCK_AMOUNT=1000|MAP_LOCK_DURATION=1",
                        hex: "..."
                    }
                },
                {
                    script: {
                        asm: "MAP_TYPE=vote_option|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=5|MAP_PARENT_SEQUENCE=2|MAP_CONTENT=brooooooooo|MAP_OPTION_INDEX=2|MAP_LOCK_AMOUNT=1000|MAP_LOCK_DURATION=1",
                        hex: "..."
                    }
                },
                {
                    script: {
                        asm: "MAP_TYPE=tags|MAP_POST_ID=m73d83uk-ld2w2k5wz|MAP_SEQUENCE=6|MAP_PARENT_SEQUENCE=0|MAP_CONTENT=|MAP_TAGS=[\"Politics\",\"Crypto\"]|MAP_COUNT=2",
                        hex: "..."
                    }
                }
            ]
        };

        console.log('Parsing transaction...');
        const parsedTx = parseMapTransaction(tx);
        
        if (!parsedTx) {
            throw new Error('Failed to parse transaction');
        }

        console.log('Parsed transaction:', JSON.stringify(parsedTx, null, 2));

        console.log('Processing transaction...');
        await processTransaction(prisma, parsedTx);
        
        console.log('Transaction processed successfully');
    } catch (error) {
        console.error('Error processing transaction:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();