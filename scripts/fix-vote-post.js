import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const txid = '4402d7fc3b74562f37c6f0aa2c3b5294c3a1225d8009cbb20081599d0901dc72';
    console.log(`Fixing vote post with TXID: ${txid}`);
    
    // Update the post to mark it as a vote post and add content
    const updatedPost = await prisma.post.update({
      where: {
        txid: txid
      },
      data: {
        is_vote: true,
        content: 'Time is an illusion?',
        metadata: {
          type: 'vote',
          description: 'A philosophical question about the nature of time'
        }
      }
    });
    
    console.log('Post updated:', updatedPost);
    
    // Create vote options for this post
    const voteOptions = [
      {
        content: 'Yes, time is merely a human construct',
        author_address: updatedPost.author_address,
        lock_amount: 0,
        lock_duration: 1000,
        post_id: updatedPost.id,
        txid: `${txid}-option-0`
      },
      {
        content: 'No, time is a fundamental aspect of reality',
        author_address: updatedPost.author_address,
        lock_amount: 0,
        lock_duration: 1000,
        post_id: updatedPost.id,
        txid: `${txid}-option-1`
      },
      {
        content: 'Time is both real and illusory depending on perspective',
        author_address: updatedPost.author_address,
        lock_amount: 0,
        lock_duration: 1000,
        post_id: updatedPost.id,
        txid: `${txid}-option-2`
      }
    ];
    
    // Create the vote options
    for (const option of voteOptions) {
      const createdOption = await prisma.voteOption.create({
        data: option
      });
      console.log('Created vote option:', createdOption);
    }
    
    console.log('Vote post fixed successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
