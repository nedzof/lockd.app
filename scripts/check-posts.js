import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const posts = await prisma.post.findMany({ 
      take: 3,
      include: {
        vote_options: true
      }
    });
    
    console.log('Posts found:', posts.length);
    
    posts.forEach(post => {
      console.log('--------------------------------------');
      console.log('Post ID:', post.id);
      console.log('Content:', post.content);
      console.log('Content length:', post.content ? post.content.length : 0);
      console.log('Is vote:', post.is_vote);
      console.log('Vote options count:', post.vote_options.length);
      if (post.vote_options.length > 0) {
        console.log('First vote option content:', post.vote_options[0].content);
      }
    });
  } catch (error) {
    console.error('Error fetching posts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
