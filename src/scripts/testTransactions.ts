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
    tx_id: 'test_simple_post',
    block_hash: 'test_block_hash',
    block_height: 1000,
    timestamp: '2025-02-16T05:37:14.259Z',
    addresses: ['test_address'],
    inputs: [],
    outputs: [
      {
        output_script: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
          app: 'lockd.app',
          type: 'post',
          content: 'Test post content',
          tags: ['test', 'simple']
        })).toString('hex'), 'hex'),
        value: 0
      }
    ]
  };

  const parsed = await parseMapTransaction(tx);
  if (!parsed) {
    throw new Error('Failed to parse simple post');
  }
  console.log('Parsed simple post:', JSON.stringify(parsed, null, 2));
  await processTransaction(parsed);
}

async function testVotePost() {
  console.log('\nTesting vote post creation...');
  const tx: JungleBusTransaction = {
    tx_id: 'test_vote_post',
    block_hash: 'test_block_hash',
    block_height: 1000,
    timestamp: '2025-02-16T05:37:14.259Z',
    addresses: ['test_address'],
    inputs: [],
    outputs: [
      {
        output_script: Buffer.from('006a6d01' + Buffer.from(JSON.stringify({
          app: 'lockd.app',
          type: 'vote_question',
          content: 'Which option do you prefer?',
          vote_options: [
            {
              text: 'Option 1',
              lock_amount: 1000,
              lock_duration: 720,
              lock_percentage: 30,
              option_index: 0
            },
            {
              text: 'Option 2',
              lock_amount: 2000,
              lock_duration: 1440,
              lock_percentage: 70,
              option_index: 1
            }
          ]
        })).toString('hex'), 'hex'),
        value: 0
      }
    ]
  };

  const parsed = await parseMapTransaction(tx);
  if (!parsed) {
    throw new Error('Failed to parse vote post');
  }
  console.log('Parsed vote post:', JSON.stringify(parsed, null, 2));
  await processTransaction(parsed);
}

async function verifyDatabase() {
  console.log('\nVerifying database entries...');

  // Check posts
  const posts = await prisma.post.findMany({
    where: {
      tx_id: {
        in: ['test_simple_post', 'test_vote_post']
      }
    },
    include: {
      vote_options: true
    }
  }) as Post[];

  console.log('Found posts:', posts.length);
  posts.forEach((post: Post) => {
    console.log('\nPost:', {
      tx_id: post.tx_id,
      post_id: post.post_id,
      content: post.content,
      is_vote: post.is_vote,
      vote_options: post.vote_options.length
    });

    if (post.vote_options.length > 0) {
      console.log('Vote options:', post.vote_options);
    }
  });

  // Check vote options
  const vote_options = await prisma.vote_option.findMany({
    where: {
      post_tx_id: 'test_vote_post'
    }
  });

  console.log('\nVote options:', vote_options);
}

async function runTests() {
  try {
    await testSimplePost();
    await testVotePost();
    await verifyDatabase();
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();