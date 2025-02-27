import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const post = await prisma.post.findFirst({
      where: { is_vote: true },
      include: { vote_options: true }
    });
    
    if (post) {
      console.log('Vote Post Found:');
      console.log('ID:', post.id);
      console.log('TXID:', post.txid);
      console.log('Content:', post.content);
      console.log('Vote Options Count:', post.vote_options.length);
      
      if (post.vote_options.length > 0) {
        console.log('\nFirst Vote Option:');
        console.log('ID:', post.vote_options[0].id);
        console.log('Content:', post.vote_options[0].content);
      }
    } else {
      console.log('No vote posts found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
