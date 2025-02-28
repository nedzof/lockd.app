import { PrismaClient } from '@prisma/client';

async function testPrismaQuery() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing Prisma query...');
    
    // Test with a sample transaction ID
    const tx_id = '1b446b7fe364a132cb7b497b9fe828f6cb1c2fd115d5c9abf15a813c4e9fd183';
    
    // Using the raw query with the corrected column names
    const [transaction] = await prisma.$queryRaw`
      SELECT tx_id, type, protocol, "block_height", "block_time", metadata
      FROM "ProcessedTransaction"
      WHERE tx_id = ${tx_id}
      LIMIT 1
    `;
    
    if (transaction) {
      console.log('Transaction found:', transaction);
    } else {
      console.log('Transaction not found');
    }
  } catch (error) {
    console.error('Error in test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaQuery();
