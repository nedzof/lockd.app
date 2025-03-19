import { PrismaClient } from '@prisma/client'
import { CONFIG } from './src/services/config.js'
import logger from './src/services/logger.js'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('Current config values:')
    console.log('DEFAULT_START_BLOCK:', CONFIG.DEFAULT_START_BLOCK)
    
    // Delete all processed transactions to start fresh
    const deleteCount = await prisma.processed_transaction.deleteMany({
      where: {
        tx_id: {
          not: 'test-tx-768028b5' // keep our test transaction
        }
      }
    })
    console.log(`Deleted ${deleteCount.count} transactions from processed_transaction table`)
    
    // Get the current block height from the database
    const latestPost = await prisma.post.findFirst({
      orderBy: {
        block_height: 'desc'
      },
      select: {
        block_height: true
      }
    })
    
    const latestBlockHeight = latestPost?.block_height || 0
    
    if (latestBlockHeight > 0) {
      // Set the scanner to start at a more recent block height
      const targetBlock = Math.max(888600, latestBlockHeight - 5000)
      console.log(`Setting scanner to start from block ${targetBlock} (going back 5000 blocks from latest post)`)
      
      // Note: Since CONFIG might be read-only, we need to use the scanner.start() method
      // with the custom block height, so we're just providing information here
      console.log('To restart the scanner with this block height, run:')
      console.log(`npm run scanner -- --start-block ${targetBlock}`)
    } else {
      console.log('No posts found in the database with block height, using default start block')
    }
    
    // Check current transactions count
    const currentCount = await prisma.processed_transaction.count()
    console.log(`Current processed_transaction count: ${currentCount}`)
    
    // Check which tables have data
    const tables = ['processed_transaction', 'post', 'vote_option', 'lock_like', 'tag']
    for (const table of tables) {
      const count = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${table}"`)
      console.log(`Table ${table} has ${count[0].count} rows`)
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  }) 