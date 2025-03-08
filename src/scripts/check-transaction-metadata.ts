/**
 * Script to check transaction metadata stored in the database
 * 
 * This script retrieves transactions and displays their metadata
 * to verify that the translated_data field is properly populated.
 */

import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Deep scan a JSON object and print its structure with nested properties
 * @param obj Object to scan
 * @param prefix Prefix for nested properties
 * @param depth Current depth (for indentation)
 * @param maxDepth Maximum depth to scan (to avoid excessive output)
 * @param maxArrayItems Maximum number of array items to display
 */
function deepScan(obj: any, prefix = '', depth = 0, maxDepth = 4, maxArrayItems = 2): void {
  if (depth > maxDepth) {
    console.log(`${' '.repeat(depth * 2)}${prefix}: [Max depth reached]`);
    return;
  }
  
  if (!obj) {
    console.log(`${' '.repeat(depth * 2)}${prefix}: null or undefined`);
    return;
  }

  if (typeof obj !== 'object') {
    const displayValue = typeof obj === 'string' && obj.length > 50 
      ? `${obj.substring(0, 50)}...` 
      : obj;
    console.log(`${' '.repeat(depth * 2)}${prefix}: ${displayValue}`);
    return;
  }

  if (Array.isArray(obj)) {
    console.log(`${' '.repeat(depth * 2)}${prefix}: Array[${obj.length}]`);
    if (obj.length > 0) {
      // Sample first few items
      const samplesToShow = Math.min(obj.length, maxArrayItems);
      for (let i = 0; i < samplesToShow; i++) {
        if (typeof obj[i] === 'object') {
          console.log(`${' '.repeat(depth * 2 + 2)}Item[${i}] keys: ${obj[i] ? Object.keys(obj[i]).join(', ') : 'null'}`);
          // Show contents of item
          deepScan(obj[i], `Item[${i}]`, depth + 2, maxDepth, maxArrayItems);
        } else {
          console.log(`${' '.repeat(depth * 2 + 2)}Item[${i}]: ${obj[i]}`);
        }
      }
      
      if (obj.length > maxArrayItems) {
        console.log(`${' '.repeat(depth * 2 + 2)}... (${obj.length - maxArrayItems} more items)`);
      }
    }
    return;
  }

  // Regular object
  const keys = Object.keys(obj);
  console.log(`${' '.repeat(depth * 2)}${prefix ? prefix + ': ' : ''}Object with ${keys.length} keys: ${keys.join(', ')}`);
  
  // Recursively scan all properties
  for (const key of keys) {
    deepScan(obj[key], key, depth + 1, maxDepth, maxArrayItems);
  }
}

/**
 * Look for Lock protocol data in an object recursively
 * @param obj Object to search in
 * @returns Found Lock protocol data or null
 */
function findLockProtocolData(obj: any): any {
  // If not an object, can't contain Lock protocol data
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  
  // Check if this object itself has Lock protocol indicators
  if (obj.action && 
      (obj.action === 'post' || obj.action === 'like' || 
       obj.action === 'vote' || obj.action === 'comment')) {
    return obj;
  }
  
  // For arrays, search each item
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findLockProtocolData(item);
      if (found) return found;
    }
    return null;
  }
  
  // Search through all properties of the object
  for (const key of Object.keys(obj)) {
    // Skip large binary data or strings to avoid performance issues
    if (typeof obj[key] === 'string' && obj[key].length > 1000) continue;
    
    const found = findLockProtocolData(obj[key]);
    if (found) return found;
  }
  
  return null;
}

/**
 * Check a specific transaction by ID
 */
async function checkTransactionById(txId: string, prisma: PrismaClient): Promise<void> {
  console.log(`\nChecking specific transaction: ${txId}`);
  
  const tx = await prisma.processed_transaction.findUnique({
    where: { tx_id: txId }
  });
  
  if (!tx) {
    console.log(`❌ Transaction ${txId} not found in database`);
    return;
  }
  
  console.log(`✅ Found transaction ${txId}`);
  console.log(`Type: ${tx.type}`);
  console.log(`Block Height: ${tx.block_height}`);
  console.log(`Block Time: ${new Date(Number(tx.block_time) * 1000).toISOString()}`);
  
  if (!tx.metadata) {
    console.log('❌ Metadata is missing!');
    return;
  }
  
  const metadata = tx.metadata as Prisma.JsonObject;
  console.log('\n[METADATA STRUCTURE]');
  deepScan(metadata);
  
  // Check for Lock protocol data in the original transaction
  if (metadata.original_transaction) {
    console.log('\n[CHECKING ORIGINAL TRANSACTION FOR LOCK PROTOCOL DATA]');
    const lockData = findLockProtocolData(metadata.original_transaction);
    if (lockData) {
      console.log('✅ Found Lock protocol data in original_transaction:');
      console.log(JSON.stringify(lockData, null, 2));
    } else {
      console.log('❌ No Lock protocol data found in original_transaction');
    }
  }
  
  // Check translated_data content and structure
  if (metadata.translated_data) {
    console.log('\n[CHECKING TRANSLATED_DATA]');
    const lockData = findLockProtocolData(metadata.translated_data);
    if (lockData) {
      console.log('✅ Found Lock protocol data in translated_data:');
      console.log(JSON.stringify(lockData, null, 2));
    } else {
      console.log('❌ No Lock protocol data found in translated_data');
    }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Checking transaction metadata...');
  
  // Create a direct Prisma client for this script
  const prisma = new PrismaClient();
  
  try {
    // Check if a specific transaction ID was provided
    const specificTxId = process.argv[2];
    if (specificTxId) {
      await checkTransactionById(specificTxId, prisma);
      return;
    }
    
    // Directly query the processed_transaction table to get recent transactions
    const transactions = await prisma.processed_transaction.findMany({
      take: 5,
      orderBy: {
        created_at: 'desc'
      }
    });
    
    if (transactions.length === 0) {
      console.log('No transactions found in the database.');
      return;
    }
    
    console.log(`Found ${transactions.length} transactions.`);
    
    // Check each transaction
    for (const tx of transactions) {
      console.log('\n------------------------------------------------------');
      console.log(`Transaction ID: ${tx.tx_id}`);
      console.log(`Type: ${tx.type}`);
      console.log(`Block Height: ${tx.block_height}`);
      console.log(`Block Time: ${new Date(Number(tx.block_time) * 1000).toISOString()}`);
      
      // Check if metadata exists
      if (!tx.metadata) {
        console.log('❌ Metadata is missing!');
        continue;
      }
      
      // Cast metadata to the correct type for TypeScript
      const metadata = tx.metadata as Prisma.JsonObject;
      console.log('Metadata Keys:', Object.keys(metadata));
      
      // Check if original_transaction exists
      if (metadata.original_transaction) {
        console.log('✅ original_transaction exists');
        
        // Look for Lock protocol data in original transaction
        const origLockData = findLockProtocolData(metadata.original_transaction);
        if (origLockData) {
          console.log('✅ Original transaction contains Lock protocol data');
        }
      } else {
        console.log('❌ original_transaction is missing!');
      }
      
      // Check if translated_data exists and is properly populated
      if (metadata.translated_data) {
        console.log('✅ translated_data exists');
        console.log('translated_data Keys:', Object.keys(metadata.translated_data as Prisma.JsonObject));

        // Look for Lock protocol data in translated_data
        const translatedLockData = findLockProtocolData(metadata.translated_data);
        if (translatedLockData) {
          console.log('✅ translated_data contains Lock protocol data');
        } else {
          console.log('❌ translated_data does not contain Lock protocol data');
        }

        // Do a deep scan on the first transaction
        if (tx === transactions[0]) {
          console.log('\n[DEEP SCAN OF FIRST TRANSACTION\'S TRANSLATED_DATA]');
          deepScan(metadata.translated_data, 'translated_data');
          
          console.log('\n[DEEP SCAN OF FIRST TRANSACTION\'S ORIGINAL TRANSACTION]');
          deepScan(metadata.original_transaction, 'original_transaction');
        }
      } else {
        console.log('❌ translated_data is null or missing!');
      }
    }
    
    console.log('\n------------------------------------------------------');
    console.log('Metadata check complete!');
    
  } catch (error) {
    console.error('Error checking transaction metadata:', error);
  } finally {
    // Close the Prisma client
    await prisma.$disconnect();
  }
}

// Run the main function
main().catch(console.error);
