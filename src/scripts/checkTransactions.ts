import { PrismaClient } from '@prisma/client';
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

async function main() {
    try {
        const transactions = await prisma.transaction.findMany({
            select: {
                txid: true,
                content: true,
                author_address: true,
                media_type: true,
                block_height: true,
                raw_image_data: true,
                is_vote: true,
                is_vote_question: true,
                vote_options: {
                    select: {
                        content: true,
                        lock_amount: true,
                        lock_duration: true,
                        unlock_height: true
                    }
                }
            }
        });

        console.log('Found transactions:', transactions.length);
        transactions.forEach(tx => {
            console.log('\nTransaction:', {
                txid: tx.txid,
                content: tx.content?.substring(0, 100) + '...',
                author_address: tx.author_address,
                media_type: tx.media_type,
                block_height: tx.block_height,
                has_image: !!tx.raw_image_data,
                is_vote: tx.is_vote,
                is_vote_question: tx.is_vote_question,
                vote_options: tx.vote_options
            });
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main(); 