import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { parseMapTransaction } from '../services/scanner/mapTransactionParser.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DIRECT_URL
        }
    },
    log: ['query', 'info', 'warn', 'error']
});

async function fetchTransaction(txid: string): Promise<any> {
    try {
        const response = await axios.get(`https://junglebus.gorillapool.io/v1/transaction/get/${txid}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching transaction:', error);
        throw error;
    }
}

async function reprocessTransaction(txid: string) {
    try {
        console.log(`\nReprocessing transaction ${txid}...`);
        
        // Fetch full transaction data
        const fullTx = await fetchTransaction(txid);
        console.log("Full transaction data:", JSON.stringify(fullTx, null, 2));
        
        // Get author address
        const author_address = fullTx.addresses?.[0];
        if (!author_address) {
            console.error('Could not extract author address');
            return;
        }

        // Extract MAP data
        const mapData: string[] = [];
        console.log("\nProcessing outputs for MAP data...");
        for (const output of fullTx.outputs || []) {
            if (!output.script?.asm) {
                console.log("Skipping output without script ASM");
                continue;
            }
            const scriptData = output.script.asm;
            console.log("\nProcessing script ASM:", scriptData);
            
            // Extract MAP fields
            const mapFields = scriptData.matchAll(/MAP_([A-Z_]+)=([^|]+)/gi);
            for (const match of mapFields) {
                const [_, key, value] = match;
                const mapEntry = `map_${key.toLowerCase()}=${value}`;
                console.log("Found MAP field:", mapEntry);
                mapData.push(mapEntry);
            }

            // Extract content
            const contentMatch = scriptData.match(/content=([^|]+)/i);
            if (contentMatch) {
                console.log("Found content:", contentMatch[1]);
                mapData.push(`content=${contentMatch[1]}`);
            }
        }

        console.log("\nFinal MAP data:", mapData);

        // Parse MAP data
        const parsedTx = parseMapTransaction(mapData);
        console.log("\nParsed transaction:", JSON.stringify(parsedTx, null, 2));
        
        // Prepare final data
        const finalData = {
            id: txid,
            txid: txid,
            content: parsedTx.content,
            authorAddress: parsedTx.author || author_address,
            blockHeight: fullTx.block_height || 0,
            unlockHeight: parsedTx.lock?.unlock_height || 0,
            createdAt: new Date(parsedTx.timestamp),
            tags: parsedTx.tags,
            metadata: {
                type: parsedTx.type,
                contentType: parsedTx.image?.mime_type || 'text/plain',
                fileName: parsedTx.image?.file_name || '',
                fileSize: parsedTx.image?.file_size || 0,
                timestamp: parsedTx.timestamp,
                version: parsedTx.metadata.version,
                description: parsedTx.description,
                postId: parsedTx.post_id,
                sequence: parsedTx.metadata.sequence,
                parentSequence: parsedTx.metadata.parent_sequence,
                app: parsedTx.metadata.app
            },
            isLocked: !!parsedTx.lock,
            mediaType: parsedTx.image?.mime_type || null,
            rawImageData: parsedTx.image?.base64_data || null,
            imageFormat: parsedTx.image?.mime_type?.split('/')[1] || null,
            imageSource: parsedTx.image?.source || null,
            isVote: !!parsedTx.vote,
            description: parsedTx.description || parsedTx.content.substring(0, 255)
        };

        console.log("\nPrepared data:", JSON.stringify(finalData, null, 2));

        // Update database
        await prisma.post.update({
            where: { txid },
            data: finalData
        });

        // Process vote options if present
        const voteOptions = parsedTx.vote?.options;
        if (voteOptions && voteOptions.length > 0) {
            console.log("\nProcessing vote options:", voteOptions);
            await Promise.all(voteOptions.map(async (option) => {
                const optionId = `${txid}-${option.index}`;
                return prisma.voteOption.upsert({
                    where: { txid: optionId },
                    create: {
                        id: optionId,
                        txid: optionId,
                        postTxid: txid,
                        content: option.text,
                        authorAddress: parsedTx.author || author_address,
                        createdAt: new Date(parsedTx.timestamp),
                        lockAmount: option.lock_amount,
                        lockDuration: option.lock_duration,
                        unlockHeight: option.unlock_height,
                        currentHeight: option.current_height,
                        lockPercentage: option.lock_percentage,
                        tags: []
                    },
                    update: {
                        content: option.text,
                        authorAddress: parsedTx.author || author_address,
                        createdAt: new Date(parsedTx.timestamp),
                        lockAmount: option.lock_amount,
                        lockDuration: option.lock_duration,
                        unlockHeight: option.unlock_height,
                        currentHeight: option.current_height,
                        lockPercentage: option.lock_percentage
                    }
                });
            }));
        }

        console.log(`Successfully reprocessed post ${txid}`);
    } catch (error) {
        console.error(`Error reprocessing transaction ${txid}:`, error);
    }
}

async function main() {
    try {
        // Get all posts
        const posts = await prisma.post.findMany({
            select: { txid: true }
        });

        console.log(`Found ${posts.length} posts to reprocess`);

        // Process each post
        for (const post of posts) {
            await reprocessTransaction(post.txid);
        }

        console.log('Finished reprocessing all posts');
    } catch (error) {
        console.error('Error in main:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();