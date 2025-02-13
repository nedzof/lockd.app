import { parentPort } from 'worker_threads';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Log database connection
console.log('Database worker connected to database');

async function processTransaction(prisma: PrismaClient, transactionData: any) {
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      // Create or update the post
      const post = await tx.post.upsert({
        where: { txid: transactionData.txid },
        create: {
          id: transactionData.txid,
          txid: transactionData.txid,
          content: transactionData.content,
          author_address: transactionData.author_address,
          block_height: transactionData.block_height,
          created_at: transactionData.created_at,
          is_vote: transactionData.is_vote || false,
          is_locked: transactionData.is_locked || false,
          media_type: transactionData.media_type,
          amount: transactionData.amount,
          unlock_height: transactionData.unlock_height,
          description: transactionData.description,
          tags: transactionData.tags || [],
          metadata: transactionData.metadata || null,
          lock_duration: transactionData.lock_duration,
          raw_image_data: transactionData.raw_image_data,
          image_format: transactionData.image_format,
          image_source: transactionData.image_source
        },
        update: {
          content: transactionData.content,
          author_address: transactionData.author_address,
          block_height: transactionData.block_height,
          created_at: transactionData.created_at,
          is_vote: transactionData.is_vote || false,
          is_locked: transactionData.is_locked || false,
          media_type: transactionData.media_type,
          amount: transactionData.amount,
          unlock_height: transactionData.unlock_height,
          description: transactionData.description,
          tags: transactionData.tags || [],
          metadata: transactionData.metadata || null,
          lock_duration: transactionData.lock_duration,
          raw_image_data: transactionData.raw_image_data,
          image_format: transactionData.image_format,
          image_source: transactionData.image_source
        }
      });

      // If this is a vote post, create the vote options
      if (transactionData.is_vote && transactionData.vote_options) {
        await tx.voteOption.createMany({
          data: transactionData.vote_options.map((option: any) => ({
            id: option.txid,
            txid: option.txid,
            post_txid: transactionData.txid,
            content: option.content,
            author_address: option.author_address,
            created_at: option.created_at,
            lock_amount: option.lock_amount,
            lock_duration: option.lock_duration,
            unlock_height: option.unlock_height,
            current_height: option.current_height,
            lock_percentage: option.lock_percentage,
            tags: option.tags || []
          })),
          skipDuplicates: true
        });
      }

      return post;
    });

    parentPort?.postMessage({ type: 'success', data: result });
  } catch (error) {
    parentPort?.postMessage({ type: 'error', error: error });
  }
}

// Handle messages from the main thread
parentPort?.on('message', async (message) => {
  if (message.type === 'process_transaction') {
    await processTransaction(prisma, message.transaction);
  } else if (message.type === 'shutdown') {
    // Clean up database connection
    await prisma.$disconnect();
    process.exit(0);
  }
}); 