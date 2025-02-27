import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Checking for vote posts...');
    
    const votePosts = await prisma.post.findMany({
      where: {
        is_vote: true
      },
      include: {
        vote_options: true
      }
    });
    
    console.log(`Found ${votePosts.length} vote posts`);
    
    for (const post of votePosts) {
      console.log(`\nPost ID: ${post.id}`);
      console.log(`TXID: ${post.txid}`);
      console.log(`Content: ${post.content}`);
      console.log(`Created at: ${post.created_at}`);
      console.log(`Vote options: ${post.vote_options.length}`);
      
      if (post.vote_options.length > 0) {
        console.log('\nVote options:');
        for (const option of post.vote_options) {
          console.log(`- ${option.content} (ID: ${option.id}, TXID: ${option.txid})`);
        }
      }
    }
    
    // Also check for the specific transaction we're interested in
    const specificTxid = '4402d7fc3b74562f37c6f0aa2c3b5294c3a1225d8009cbb20081599d0901dc72';
    console.log(`\nChecking for specific transaction: ${specificTxid}`);
    
    const specificPost = await prisma.post.findUnique({
      where: {
        txid: specificTxid
      },
      include: {
        vote_options: true
      }
    });
    
    if (specificPost) {
      console.log('Found specific post:');
      console.log(`ID: ${specificPost.id}`);
      console.log(`TXID: ${specificPost.txid}`);
      console.log(`Content: ${specificPost.content}`);
      console.log(`Is vote: ${specificPost.is_vote}`);
      console.log(`Vote options: ${specificPost.vote_options.length}`);
    } else {
      console.log('Specific post not found');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
