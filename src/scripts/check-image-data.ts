import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const posts = await prisma.post.findMany({
      where: {
        raw_image_data: {
          not: null
        }
      },
      select: {
        id: true,
        tx_id: true,
        content_type: true,
        media_type: true,
        raw_image_data: true
      }
    });

    console.log('Found', posts.length, 'posts with image data:');
    
    posts.forEach(post => {
      console.log('\nPost:', {
        id: post.id,
        tx_id: post.tx_id,
        content_type: post.content_type,
        media_type: post.media_type,
        raw_image_data: post.raw_image_data ? `Buffer(${post.raw_image_data.length} bytes)` : null
      });
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 