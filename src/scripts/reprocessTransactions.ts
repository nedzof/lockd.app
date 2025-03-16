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

async function fetchTransaction(tx_id: string): Promise<any> {
    try {
        const response = await axios.get(`https://junglebus.gorillapool.io/v1/transaction/get/${tx_id}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching transaction:', error);
        throw error;
    }
}

async function reprocessTransaction(tx_id: string) {
    try {
        console.log(`\nReprocessing transaction ${tx_id}...`);
        
        // Fetch full transaction data
        const fullTx = await fetchTransaction(tx_id);
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
            id: tx_id,
            tx_id: tx_id,
            content: parsedTx.content,
            author_address: parsedTx.author || author_address,
            block_height: fullTx.block_height || 0,
            unlock_height: parsedTx.lock?.unlock_height || 0,
            created_at: new Date(parsedTx.timestamp),
            tags: parsedTx.tags,
            metadata: {
                type: parsedTx.type,
                content_type: parsedTx.image?.mime_type || 'text/plain',
                fileName: parsedTx.image?.file_name || '',
                fileSize: parsedTx.image?.file_size || 0,
                timestamp: parsedTx.timestamp,
                version: parsedTx.metadata.version,
                description: parsedTx.description,
                post_id: parsedTx.post_id,
                sequence: parsedTx.metadata.sequence,
                parentSequence: parsedTx.metadata.parent_sequence,
                app: parsedTx.metadata.app
            },
            is_locked: !!parsedTx.lock,
            media_type: parsedTx.image?.mime_type || null,
            raw_image_data: parsedTx.image?.base64_data || null,
            imageFormat: parsedTx.image?.mime_type?.split('/')[1] || null,
            imageSource: parsedTx.image?.source || null,
            isVote: !!parsedTx.vote,
            description: parsedTx.description || parsedTx.content.substring(0, 255)
        };

        console.log("\nPrepared data:", JSON.stringify(finalData, null, 2));

        // Update database
        await prisma.post.update({
            where: { tx_id },
            data: finalData
        });

        // Process vote options if present
        const vote_options = parsedTx.vote?.options;
        if (vote_options && vote_options.length > 0) {
            console.log("\nProcessing vote options:", vote_options);
            await Promise.all(vote_options.map(async (option) => {
                const optionId = `${tx_id}-${option.index}`;
                return prisma.vote_option.upsert({
                    where: { tx_id: optionId },
                    create: {
                        id: optionId,
                        tx_id: optionId,
                        posttx_id: tx_id,
                        content: option.text,
                        author_address: parsedTx.author || author_address,
                        created_at: new Date(parsedTx.timestamp),
                        lock_amount: option.lock_amount,
                        lock_duration: option.lock_duration,
                        unlock_height: option.unlock_height,
                        currentHeight: option.current_height,
                        lockPercentage: option.lock_percentage,
                        tags: []
                    },
                    update: {
                        content: option.text,
                        author_address: parsedTx.author || author_address,
                        created_at: new Date(parsedTx.timestamp),
                        lock_amount: option.lock_amount,
                        lock_duration: option.lock_duration,
                        unlock_height: option.unlock_height,
                        currentHeight: option.current_height,
                        lockPercentage: option.lock_percentage
                    }
                });
            }));
        }

        console.log(`Successfully reprocessed post ${tx_id}`);
    } catch (error) {
        console.error(`Error reprocessing transaction ${tx_id}:`, error);
    }
}

async function main() {
    try {
        // Get all posts
        const posts = await prisma.post.findMany({
            select: { tx_id: true }
        });

        console.log(`Found ${posts.length} posts to reprocess`);

        // Process each post
        for (const post of posts) {
            await reprocessTransaction(post.tx_id);
        }

        console.log('Finished reprocessing all posts');
    } catch (error) {
        console.error('Error in main:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();