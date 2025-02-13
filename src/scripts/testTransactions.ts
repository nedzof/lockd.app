import { PrismaClient, Prisma } from '@prisma/client';
import { parseMapTransaction } from '../services/scanner/mapTransactionParser';
import { processTransaction } from '../services/scanner/unifiedDbWorker';
import { JungleBusTransaction } from '../services/scanner/types';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

type Post = Prisma.PostGetPayload<{
  include: { vote_options: true }
}>;

async function testSimplePost() {
  console.log('\nTesting simple post creation...');
  const tx: JungleBusTransaction = {
    id: 'test_simple_post',
    transaction: '',
    addresses: ['test_address'],
    block_height: 1000,
    block_time: Date.now() / 1000,
    outputs: [
      {
        script: {
          asm: 'MAP_TYPE=content|MAP_POST_ID=test123|MAP_SEQUENCE=0|MAP_CONTENT=Test post content|MAP_TAGS=["test","simple"]',
          hex: Buffer.from('Test post content').toString('hex')
        }
      }
    ]
  };

  const parsed = parseMapTransaction(tx);
  if (!parsed) {
    throw new Error('Failed to parse simple post');
  }
  console.log('Parsed simple post:', JSON.stringify(parsed, null, 2));
  await processTransaction(prisma, parsed);
}

async function testImagePost() {
  console.log('\nTesting image post creation...');
  const imageData = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'; // Add sample base64 image
  const tx: JungleBusTransaction = {
    id: 'test_image_post',
    transaction: '',
    addresses: ['test_address'],
    block_height: 1000,
    block_time: Date.now() / 1000,
    outputs: [
      {
        script: {
          asm: 'MAP_TYPE=content|MAP_POST_ID=test456|MAP_SEQUENCE=0|MAP_CONTENT=Test image post',
          hex: Buffer.from('Test image post').toString('hex')
        }
      },
      {
        script: {
          asm: 'MAP_TYPE=image|MAP_POST_ID=test456|MAP_SEQUENCE=1|MAP_PARENT_SEQUENCE=0|MAP_CONTENT_TYPE=image/jpeg',
          hex: Buffer.from(imageData).toString('hex')
        }
      }
    ]
  };

  const parsed = parseMapTransaction(tx);
  if (!parsed) {
    throw new Error('Failed to parse image post');
  }
  console.log('Parsed image post:', JSON.stringify(parsed, null, 2));
  await processTransaction(prisma, parsed);
}

async function testVotePost() {
  console.log('\nTesting vote post creation...');
  const tx: JungleBusTransaction = {
    id: 'test_vote_post',
    transaction: '',
    addresses: ['test_address'],
    block_height: 1000,
    block_time: Date.now() / 1000,
    outputs: [
      {
        script: {
          asm: 'MAP_TYPE=content|MAP_POST_ID=test789|MAP_SEQUENCE=0|MAP_CONTENT=Test vote post',
          hex: Buffer.from('Test vote post').toString('hex')
        }
      },
      {
        script: {
          asm: 'MAP_TYPE=vote_question|MAP_POST_ID=test789|MAP_SEQUENCE=1|MAP_PARENT_SEQUENCE=0|MAP_CONTENT=Which option?|MAP_TOTAL_OPTIONS=2',
          hex: Buffer.from('Which option?').toString('hex')
        }
      },
      {
        script: {
          asm: 'MAP_TYPE=vote_option|MAP_POST_ID=test789|MAP_SEQUENCE=2|MAP_PARENT_SEQUENCE=1|MAP_CONTENT=Option 1|MAP_OPTION_INDEX=0|MAP_LOCK_AMOUNT=1000|MAP_LOCK_DURATION=144',
          hex: Buffer.from('Option 1').toString('hex')
        }
      },
      {
        script: {
          asm: 'MAP_TYPE=vote_option|MAP_POST_ID=test789|MAP_SEQUENCE=3|MAP_PARENT_SEQUENCE=1|MAP_CONTENT=Option 2|MAP_OPTION_INDEX=1|MAP_LOCK_AMOUNT=2000|MAP_LOCK_DURATION=144',
          hex: Buffer.from('Option 2').toString('hex')
        }
      }
    ]
  };

  const parsed = parseMapTransaction(tx);
  if (!parsed) {
    throw new Error('Failed to parse vote post');
  }
  console.log('Parsed vote post:', JSON.stringify(parsed, null, 2));
  await processTransaction(prisma, parsed);
}

async function verifyDatabase() {
  console.log('\nVerifying database entries...');

  // Check posts
  const posts = await prisma.post.findMany({
    where: {
      txid: {
        in: ['test_simple_post', 'test_image_post', 'test_vote_post']
      }
    },
    include: {
      vote_options: true
    }
  }) as Post[];

  console.log('Found posts:', posts.length);
  posts.forEach((post: Post) => {
    console.log('\nPost:', {
      txid: post.txid,
      postId: post.postId,
      content: post.content,
      is_vote: post.is_vote,
      vote_options: post.vote_options.length
    });

    if (post.vote_options.length > 0) {
      console.log('Vote options:', post.vote_options);
    }
  });
}

async function runTests() {
  try {
    await testSimplePost();
    await testImagePost();
    await testVotePost();
    await verifyDatabase();
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests(); 