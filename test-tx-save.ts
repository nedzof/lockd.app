import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  try {
    // Create a test transaction
    const testTxId = `test-tx-${randomUUID().substring(0, 8)}`
    
    console.log(`Creating test transaction with ID: ${testTxId}`)
    
    // Add a test transaction to the processed_transaction table
    const result = await prisma.processed_transaction.create({
      data: {
        tx_id: testTxId,
        block_height: 888888,
        protocol: 'MAP',
        type: 'post',
        metadata: {
          content: 'Test post content',
          author_address: 'test-address',
          content_type: 'text/plain'
        },
        block_time: BigInt(Math.floor(Date.now() / 1000))
      }
    })
    
    console.log('Transaction created successfully:', result)
    
    // Verify it exists
    const count = await prisma.processed_transaction.count()
    console.log(`Total transactions in database now: ${count}`)
    
  } catch (error) {
    console.error('Error saving test transaction:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  }) 