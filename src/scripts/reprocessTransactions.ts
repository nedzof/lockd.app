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
            author_address: parsedTx.author || author_address,
            block_height: fullTx.block_height || 0,
            unlock_height: parsedTx.lock?.unlockHeight || 0,
            created_at: new Date(parsedTx.timestamp),
            tags: parsedTx.tags,
            metadata: {
                type: parsedTx.type,
                contentType: parsedTx.image?.mimeType || 'text/plain',
                fileName: parsedTx.image?.fileName || '',
                fileSize: parsedTx.image?.fileSize || 0,
                timestamp: parsedTx.timestamp,
                version: parsedTx.metadata.version,
                description: parsedTx.description,
                postId: parsedTx.postId,
                sequence: parsedTx.metadata.sequence,
                parentSequence: parsedTx.metadata.parentSequence,
                app: parsedTx.metadata.app
            },
            is_locked: !!parsedTx.lock,
            media_type: parsedTx.image?.mimeType || null,
            raw_image_data: parsedTx.image?.base64Data || null,
            image_format: parsedTx.image?.mimeType?.split('/')[1] || null,
            image_source: parsedTx.image?.source || null,
            is_vote: !!parsedTx.vote,
            is_vote_question: parsedTx.type === 'vote' || parsedTx.type === 'mixed',
            question_content: parsedTx.vote?.questionContent || null,
            amount: parsedTx.lock?.amount || null,
            lock_duration: parsedTx.lock?.duration || null,
            description: parsedTx.description || parsedTx.content.substring(0, 255)
        };

        console.log("\nPrepared data:", JSON.stringify(finalData, null, 2));

        // Update database
        await prisma.transaction.update({
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
                        post_txid: txid,
                        content: option.text,
                        author_address: parsedTx.author || author_address,
                        created_at: new Date(parsedTx.timestamp),
                        lock_amount: option.lockAmount,
                        lock_duration: option.lockDuration,
                        unlock_height: option.unlockHeight,
                        current_height: option.currentHeight,
                        lock_percentage: option.lockPercentage,
                        tags: []
                    },
                    update: {
                        content: option.text,
                        author_address: parsedTx.author || author_address,
                        created_at: new Date(parsedTx.timestamp),
                        lock_amount: option.lockAmount,
                        lock_duration: option.lockDuration,
                        unlock_height: option.unlockHeight,
                        current_height: option.currentHeight,
                        lock_percentage: option.lockPercentage
                    }
                });
            }));
        }

        console.log(`Successfully reprocessed transaction ${txid}`);
    } catch (error) {
        console.error(`Error reprocessing transaction ${txid}:`, error);
    }
}

async function main() {
    try {
        // Get all transactions
        const transactions = await prisma.transaction.findMany({
            select: { txid: true }
        });

        console.log(`Found ${transactions.length} transactions to reprocess`);

        // Process each transaction
        for (const tx of transactions) {
            await reprocessTransaction(tx.txid);
        }

        console.log('Finished reprocessing all transactions');
    } catch (error) {
        console.error('Error in main:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();