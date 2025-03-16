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
        const tx_id = tx.id;
        const block_height = tx.block_height;
        const block_time = tx.block_time;
        const addresses = tx.addresses || [];
        const author_address = addresses[0] || null;
        
        // Parse outputs to extract data
        const data: Record<string, any> = {
            content: '',
            tags: [],
            vote_options: [],
            isVote: false,
            content_type: null
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
                
                // Extract vote options
                if (script.includes('MAP_TYPE=vote') && script.includes('MAP_OPTIONS=')) {
                    data.isVote = true;
                    data.content_type = 'vote';
                    
                    const optionsMatch = script.match(/MAP_OPTIONS=(\[[^\]]+\])/);
                    if (optionsMatch && optionsMatch[1]) {
                        try {
                            const options = JSON.parse(optionsMatch[1]);
                            data.vote_options = options.map((opt: string, index: number) => ({
                                content: opt,
                                index
                            }));
                        } catch (e) {
                            console.error('Failed to parse vote options:', e);
                        }
                    }
                }
            });
        }
        
        // Return the parsed transaction
        return {
            tx_id,
            block_height,
            block_time,
            author_address,
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
            where: { tx_id: parsedTx.tx_id },
            create: {
                tx_id: parsedTx.tx_id,
                content: parsedTx.metadata.content,
                author_address: parsedTx.author_address,
                block_height: parsedTx.block_height,
                created_at: parsedTx.block_time ? new Date(parsedTx.block_time * 1000) : new Date(),
                tags: parsedTx.metadata.tags,
                isVote: parsedTx.metadata.isVote,
                media_type: parsedTx.metadata.content_type
            },
            update: {
                content: parsedTx.metadata.content,
                author_address: parsedTx.author_address,
                block_height: parsedTx.block_height,
                tags: parsedTx.metadata.tags,
                isVote: parsedTx.metadata.isVote,
                media_type: parsedTx.metadata.content_type
            }
        });
        
        // Create vote options if this is a vote post
        if (parsedTx.metadata.isVote && parsedTx.metadata.vote_options.length > 0) {
            for (const option of parsedTx.metadata.vote_options) {
                const optiontx_id = `${parsedTx.tx_id}-option-${option.index}`;
                
                await prisma.vote_option.upsert({
                    where: { tx_id: optiontx_id },
                    create: {
                        tx_id: optiontx_id,
                        content: option.content,
                        author_address: parsedTx.author_address,
                        created_at: parsedTx.block_time ? new Date(parsedTx.block_time * 1000) : new Date(),
                        post_id: post.id,
                        optionIndex: option.index
                    },
                    update: {
                        content: option.content,
                        author_address: parsedTx.author_address,
                        post_id: post.id,
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
            block_height: 885675,
            block_time: 1707831498,
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