/**
 * Scanner Monitor
 * 
 * Script to monitor the progress of the scanner in real-time
 */

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// Transaction ID of the specific transaction we want to confirm
const TARGET_TX_ID = '17c7927c5f014ad1154878e826d66b614bb08f9859611e27ebf9f6b0e570e67e';
const BLOCK_HEIGHT = 888694; // Block height of our target transaction

async function main() {
  console.log('🔍 Scanner Monitor Started');
  console.log(`Target transaction: ${TARGET_TX_ID} (Block ${BLOCK_HEIGHT})`);
  
  try {
    // Check if scanner is running
    const { stdout: psOutput } = await execAsync('ps aux | grep -i "startScanner.ts" | grep -v grep');
    if (psOutput) {
      console.log('✅ Scanner is running');
      console.log(psOutput.split('\n')[0]);
    } else {
      console.log('❌ Scanner does not appear to be running');
    }
    
    // Check the initial state of the database
    const initialCount = await prisma.processed_transaction.count();
    console.log(`\nCurrent processed transactions count: ${initialCount}`);
    
    // Check for our target transaction
    const targetTx = await prisma.processed_transaction.findUnique({ 
      where: { tx_id: TARGET_TX_ID } 
    });
    
    if (targetTx) {
      console.log(`✅ Target transaction ${TARGET_TX_ID} found in database!`);
      console.log(`   Block height: ${targetTx.block_height}`);
      console.log(`   Type: ${targetTx.type}`);
      console.log(`   Created at: ${targetTx.created_at}`);
    } else {
      console.log(`❌ Target transaction ${TARGET_TX_ID} not found in database yet`);
    }
    
    // Start monitoring
    console.log('\n🔄 Starting real-time monitoring...');
    console.log('   Checking every 5 seconds for new transactions...');
    
    let lastCount = initialCount;
    let intervalId = setInterval(async () => {
      try {
        // Check the current count
        const currentCount = await prisma.processed_transaction.count();
        
        // If count has changed, show the new transactions
        if (currentCount > lastCount) {
          console.log(`📈 Processed transactions increased from ${lastCount} to ${currentCount} (+${currentCount - lastCount})`);
          
          // Show newest transactions
          const newTransactions = await prisma.processed_transaction.findMany({
            orderBy: { created_at: 'desc' },
            take: 5
          });
          
          console.log('Latest transactions:');
          for (const tx of newTransactions) {
            console.log(`- ${tx.tx_id} (${tx.type}) at block ${tx.block_height}`);
          }
          
          // Check if our target is found
          const targetTx = await prisma.processed_transaction.findUnique({ 
            where: { tx_id: TARGET_TX_ID } 
          });
          
          if (targetTx) {
            console.log(`✅ Target transaction ${TARGET_TX_ID} found!`);
            // Monitor complete, can exit
            clearInterval(intervalId);
            await prisma.$disconnect();
            console.log('\n🎉 Monitoring completed! Scanner is working correctly.');
            process.exit(0);
          }
        }
        
        lastCount = currentCount;
      } catch (error) {
        console.error('Error during monitoring:', error);
      }
    }, 5000);
    
    // Set a timeout to stop monitoring after 5 minutes
    setTimeout(() => {
      clearInterval(intervalId);
      console.log('\n⏱️ Monitoring timed out after 5 minutes.');
      
      prisma.$disconnect().then(() => {
        process.exit(0);
      });
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main(); 