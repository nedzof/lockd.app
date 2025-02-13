import { PrismaClient } from '@prisma/client';
import { parseMapTransaction } from '../services/scanner/mapTransactionParser.js';
import { processTransaction } from '../services/scanner/unifiedDbWorker.js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    try {
        // The transaction data from GorillaPool
        const tx = {
            id: "d8985709fb522609da66d91dab7483b8bad4447a33c9feabc25d6dac295e53ee",
            transaction: "...", // Truncated for brevity
            addresses: ["1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5"],
            block_height: 883800,
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