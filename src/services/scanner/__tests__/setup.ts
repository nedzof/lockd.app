import { PrismaClient } from '@prisma/client';

// Extend Jest matchers
expect.extend({
    toBeValidImage(received: Buffer) {
        const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);
        const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
        
        const isJPEG = received.slice(0, 3).equals(JPEG_MAGIC);
        const isPNG = received.slice(0, 4).equals(PNG_MAGIC);
        
        if (isJPEG || isPNG) {
            return {
                message: () => 'Expected buffer not to be a valid image',
                pass: true
            };
        } else {
            return {
                message: () => 'Expected buffer to be a valid image',
                pass: false
            };
        }
    }
});

// Global setup
beforeAll(async () => {
    try {
        // Initialize Prisma client
        const prisma = new PrismaClient();
        await prisma.$connect();
        
        // Clean up any test data that might have been left from previous runs
        const txid = '429ee4f826afe16269cfdcadec56bc82e49983660ec063a8235c981167f5e660';
        
        // Delete vote options first to handle foreign key constraint
        await prisma.voteOption.deleteMany({
            where: {
                post_txid: txid
            }
        });
        
        // Then delete the post
        await prisma.post.deleteMany({
            where: {
                txid
            }
        });
    } catch (error) {
        console.error('Error during setup:', error);
    } finally {
        // Ensure Prisma client is disconnected
        const prisma = new PrismaClient();
        await prisma.$disconnect();
    }
});
