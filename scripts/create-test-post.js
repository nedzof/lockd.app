import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTestPost() {
  try {
    const post = await prisma.post.create({
      data: {
        txid: 'test-txid-1',
        content: 'This is a test post',
        author_address: 'test-author',
        block_height: 1000,
        tags: ['test', 'development'],
        description: 'A test post to verify the API',
        created_at: new Date(),
        is_locked: false
      }
    });

    console.log('Created test post:', post);
  } catch (error) {
    console.error('Error creating test post:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestPost(); 