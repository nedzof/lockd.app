import { parentPort } from 'worker_threads';
import { PrismaClient, VoteOption, Post } from '@prisma/client';
import { ParsedPost } from './types';

const prisma = new PrismaClient();

// Log database connection
console.log('Database worker connected to database');

async function calculateLockPercentages(tx: any, postTxid: string) {
  // Get all vote options for this post
  const options = await tx.voteOption.findMany({
    where: { post_txid: postTxid }
  });

  // Calculate total locked amount
  const totalLocked = options.reduce((sum: number, opt: VoteOption) => sum + opt.lock_amount, 0);
  if (totalLocked === 0) return;

  // Update lock percentages
  await Promise.all(options.map((option: VoteOption) =>
    tx.voteOption.update({
      where: { id: option.id },
      data: {
        lock_percentage: (option.lock_amount / totalLocked) * 100
      }
    })
  ));
}

export async function processTransaction(prisma: PrismaClient, post: ParsedPost) {
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      // Create or update the post
      const dbPost = await tx.post.upsert({
        where: { txid: post.txid },
        create: {
          id: post.txid,
          txid: post.txid,
          postId: post.postId,
          content: post.content?.text || '',
          author_address: post.author,
          block_height: post.blockHeight,
          created_at: new Date(post.timestamp),
          is_vote: !!post.vote,
          is_locked: !!post.metadata.lock?.isLocked,
          media_type: post.images[0]?.contentType,
          description: post.content?.description,
          tags: post.tags,
          metadata: {
            title: post.content?.title,
            app: post.metadata.app,
            version: post.metadata.version,
            lock: post.metadata.lock
          },
          raw_image_data: post.images[0]?.data,
          image_format: post.images[0]?.contentType?.split('/')[1],
          lock_duration: post.metadata.lock?.duration,
          unlock_height: post.metadata.lock?.unlockHeight
        },
        update: {
          postId: post.postId,
          content: post.content?.text || '',
          author_address: post.author,
          block_height: post.blockHeight,
          created_at: new Date(post.timestamp),
          is_vote: !!post.vote,
          is_locked: !!post.metadata.lock?.isLocked,
          media_type: post.images[0]?.contentType,
          description: post.content?.description,
          tags: post.tags,
          metadata: {
            title: post.content?.title,
            app: post.metadata.app,
            version: post.metadata.version,
            lock: post.metadata.lock
          },
          raw_image_data: post.images[0]?.data,
          image_format: post.images[0]?.contentType?.split('/')[1],
          lock_duration: post.metadata.lock?.duration,
          unlock_height: post.metadata.lock?.unlockHeight
        }
      });

      // If this is a vote post, create the vote options
      if (post.vote?.options) {
        // Delete existing vote options first to handle updates
        await tx.voteOption.deleteMany({
          where: { post_txid: post.txid }
        });

        // Create new vote options
        await tx.voteOption.createMany({
          data: post.vote.options.map((option, index) => ({
            id: `${post.txid}:vote_option:${option.index}`,
            txid: `${post.txid}:vote_option:${option.index}`,
            post_txid: post.txid,
            postId: post.postId,
            content: option.text,
            author_address: post.author,
            created_at: new Date(post.timestamp),
            lock_amount: option.lockAmount || 0,
            lock_duration: option.lockDuration || 0,
            unlock_height: option.unlockHeight || 0,
            current_height: option.currentHeight || post.blockHeight,
            lock_percentage: option.lockPercentage || 0,
            tags: []
          })),
          skipDuplicates: true
        });

        // Calculate and update lock percentages
        await calculateLockPercentages(tx, post.txid);
      }

      return dbPost;
    });

    if (parentPort) {
      parentPort.postMessage({ type: 'success', data: result });
    }
    return result;
  } catch (error) {
    console.error('Error processing transaction:', error);
    if (parentPort) {
      parentPort.postMessage({ type: 'error', error: error });
    }
    throw error;
  }
}

// Handle messages from the main thread
if (parentPort) {
  parentPort.on('message', async (message) => {
    if (message.type === 'process_transaction') {
      await processTransaction(prisma, message.transaction);
    } else if (message.type === 'shutdown') {
      // Clean up database connection
      await prisma.$disconnect();
      process.exit(0);
    }
  });
} 