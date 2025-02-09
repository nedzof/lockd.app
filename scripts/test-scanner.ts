import { BlockchainScanner } from '../src/services/scanner/blockchainScanner.js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

interface ChainInfo {
  blocks: number;
  headers: number;
  bestblockhash: string;
  difficulty: number;
}

interface TxScriptPubKey {
  hex: string;
  type: string;
}

interface TxOutput {
  scriptPubKey: TxScriptPubKey;
}

interface TransactionData {
  txid: string;
  vout: TxOutput[];
}

async function testScanner() {
  try {
    // Get current block height from testnet
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/test/chain/info');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json() as ChainInfo;
    const currentHeight = data.blocks;
    
    // Create scanner instance starting 10 blocks back
    const startHeight = currentHeight - 10;
    const scanner = new BlockchainScanner(startHeight, 1000);
    
    console.log(`Starting scan from block ${startHeight} to ${currentHeight}`);
    
    // Add debug logging for image detection
    const originalProcessTransactions = scanner['processTransactions'];
    scanner['processTransactions'] = async (transactions) => {
      console.log('\nFound transactions:', transactions.length);
      
      for (const tx of transactions) {
        console.log('\nTransaction details:');
        console.log('TXID:', tx.txid);
        console.log('Content:', tx.content);
        console.log('Media URL:', tx.media_url);
        console.log('Media Type:', tx.media_type);
        console.log('Description:', tx.description);
        
        // Additional debug info for transaction script
        if (tx.media_url || tx.media_type) {
          console.log('\nFound media transaction!');
          console.log('Transaction script analysis:');
          try {
            const txResponse = await fetch(`https://api.whatsonchain.com/v1/bsv/test/tx/hash/${tx.txid}`);
            if (!txResponse.ok) {
              throw new Error(`HTTP error! status: ${txResponse.status}`);
            }
            const txData = await txResponse.json() as TransactionData;
            console.log('Script hex:', txData.vout[0].scriptPubKey.hex);
            console.log('Script type:', txData.vout[0].scriptPubKey.type);
          } catch (error) {
            console.error('Error analyzing transaction script:', error);
          }
        }
      }
      
      await originalProcessTransactions.call(scanner, transactions);
    };

    // Start scanning
    await scanner.startScanning();
    
    // Stop after processing current height
    setTimeout(() => {
      scanner.stopScanning();
      console.log('Scan completed');
    }, 30000); // Give it 30 seconds to complete
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testScanner().catch(console.error); 