import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Count transactions
  const transactionCount = await prisma.processed_transaction.count()
  console.log(`Total processed transactions: ${transactionCount}`)
  
  // Get the most recent transactions
  const recentTransactions = await prisma.processed_transaction.findMany({
    take: 5,
    orderBy: {
      created_at: 'desc'
    },
    select: {
      tx_id: true,
      type: true,
      block_height: true,
      created_at: true
    }
  })
  
  console.log('\nMost recent transactions:')
  if (recentTransactions.length === 0) {
    console.log('No transactions found')
  } else {
    recentTransactions.forEach(tx => {
      console.log(`- ${tx.tx_id} (${tx.type}) at block ${tx.block_height}, created at ${tx.created_at}`)
    })
  }
  
  // Count posts
  const postCount = await prisma.post.count()
  console.log(`\nTotal posts: ${postCount}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  }) 