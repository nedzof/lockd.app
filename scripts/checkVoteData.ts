import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Get all vote posts
    const votePosts = await prisma.post.findMany({
      where: {
        OR: [
          { is_vote_question: true },
          { vote_options: { some: {} } }
        ]
      },
      include: {
        vote_options: true
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    console.log(`Found ${votePosts.length} vote posts\n`);

    votePosts.forEach((post) => {
      console.log('\n=== Vote Post ===');
      console.log(`ID: ${post.txid}`);
      console.log(`Content: ${post.content}`);
      console.log(`Question Content: ${post.question_content || 'N/A'}`);
      console.log(`Is Vote Question: ${post.is_vote_question}`);
      console.log(`Author: ${post.author_address}`);
      console.log(`Created At: ${post.created_at}`);
      console.log(`Block Height: ${post.block_height}`);
      console.log(`Tags: ${post.tags.join(', ')}`);
      
      if (post.vote_options.length > 0) {
        console.log('\nVote Options:');
        post.vote_options.forEach((option) => {
          console.log(`\n  Option ${option.id}:`);
          console.log(`    Text: ${option.content}`);
          console.log(`    Author: ${option.author_address}`);
          console.log(`    Lock Amount: ${option.lock_amount}`);
          console.log(`    Lock Duration: ${option.lock_duration}`);
          console.log(`    Unlock Height: ${option.unlock_height}`);
          console.log(`    Current Height: ${option.current_height}`);
          console.log(`    Lock Percentage: ${option.lock_percentage}%`);
          console.log(`    Tags: ${option.tags.join(', ')}`);
        });
      } else {
        console.log('\nNo vote options found');
      }
      
      console.log('\nMetadata:', JSON.stringify(post.metadata, null, 2));
      console.log('=================\n');
    });

    // Also check for any orphaned vote options
    const orphanedOptions = await prisma.voteOption.findMany({
      where: {
        post_txid: {
          notIn: votePosts.map(p => p.txid)
        }
      }
    });

    if (orphanedOptions.length > 0) {
      console.log(`\nFound ${orphanedOptions.length} orphaned vote options:`);
      orphanedOptions.forEach(option => {
        console.log(`\nOrphaned Option ${option.id}:`);
        console.log(`Text: ${option.content}`);
        console.log(`Post TXID: ${option.post_txid}`);
      });
    }

  } catch (error) {
    console.error('Error checking vote data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  }); 