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
        const posts = await prisma.post.findMany({
            select: {
                tx_id: true,
                content: true,
                author_address: true,
                media_type: true,
                block_height: true,
                raw_image_data: true,
                is_vote: true,
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

        console.log('Found posts:', posts.length);
        posts.forEach(post => {
            console.log('\nPost:', {
                tx_id: post.tx_id,
                content: post.content?.substring(0, 100) + '...',
                author_address: post.author_address,
                media_type: post.media_type,
                block_height: post.block_height,
                has_image: !!post.raw_image_data,
                is_vote: post.is_vote,
                vote_options: post.vote_options
            });
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main(); 