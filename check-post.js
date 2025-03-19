import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// The ID of the post we published
const postId = '60db0dcf-3c2c-4f0c-adbf-ac14af775223';

async function checkPost() {
  try {
    // Find the post
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });
    
    if (!post) {
      console.log(`Post with ID ${postId} not found`);
      return;
    }
    
    console.log('Published post:');
    console.log(`ID: ${post.id}`);
    console.log(`Content: ${post.content}`);
    console.log(`Created at: ${post.created_at}`);
    console.log(`Scheduled at: ${post.scheduled_at || 'None (published)'}`);
    console.log(`Metadata: ${JSON.stringify(post.metadata, null, 2)}`);
  } catch (error) {
    console.error('Error checking post:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPost(); 