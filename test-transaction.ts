/**
 * Test parsing a specific transaction directly
 */

import logger from './src/services/logger.js';
import { tx_parser } from './src/services/tx/tx_parser.js';
import { tx_repository } from './src/services/db/tx_repository.js';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    // Specific transaction ID to test
    const txId = '17c7927c5f014ad1154878e826d66b614bb08f9859611e27ebf9f6b0e570e67e';
    
    console.log(`Testing transaction processing for tx_id: ${txId}`);
    
    // Fetch the transaction data directly
    const url = `https://junglebus.gorillapool.io/v1/transaction/get/${txId}`;
    console.log(`Fetching transaction from: ${url}`);
    
    const response = await axios.get(url);
    const txData = response.data;
    
    console.log('Transaction data received:');
    console.log(JSON.stringify(txData).substring(0, 500) + '...');
    
    // Check if the transaction contains lockd.app data
    if (txData?.data) {
      const lockdAppItems = txData.data.filter((item: string) => 
        typeof item === 'string' && item.toLowerCase().includes('lockd.app')
      );
      
      console.log(`Found ${lockdAppItems.length} lockd.app data items:`, lockdAppItems);
    }
    
    // Parse the transaction
    console.log('\nParsing transaction...');
    const parsedTx = await tx_parser.parse_transaction_data(txData);
    
    console.log(`Parsed transaction has ${parsedTx.outputs?.length || 0} outputs`);
    console.log(`Valid outputs: ${parsedTx.outputs?.filter(o => o.isValid).length || 0}`);
    
    // If we have valid outputs, try to save the transaction
    if (parsedTx.outputs?.some(o => o.isValid)) {
      console.log('\nSaving processed transaction to database...');
      
      // First clear any existing record with this ID
      await prisma.processed_transaction.deleteMany({
        where: { tx_id: txId }
      });
      
      // Save the transaction
      await tx_repository.saveProcessedTransaction(parsedTx);
      
      // Verify it was saved
      const savedTx = await prisma.processed_transaction.findUnique({
        where: { tx_id: txId }
      });
      
      if (savedTx) {
        console.log('Transaction successfully saved to database!');
        console.log('Saved transaction:');
        console.log(JSON.stringify(savedTx).substring(0, 500) + '...');
      } else {
        console.log('Failed to save transaction to database');
      }
    } else {
      console.log('No valid outputs found, not saving transaction');
    }
  } catch (error) {
    console.error('Error processing transaction:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main(); 