import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { logger } from '../../utils/logger.js';
import { TransactionParser } from '../parser.js';
import { DbClient } from '../dbClient.js';
import { JungleBusClient } from '@gorillapool/js-junglebus';

// Define the test output directory
const testOutputDir = path.join(process.cwd(), 'test-output');

describe('Transaction Parser Tests', () => {
  let parser: TransactionParser;
  let dbClient: DbClient;
  let testTransactions: string[] = [];

  beforeAll(async () => {
    // Create test output directory if it doesn't exist
    if (!fs.existsSync(testOutputDir)) {
      await fs.promises.mkdir(testOutputDir, { recursive: true });
    }

    // Initialize the DbClient and TransactionParser
    dbClient = DbClient.getInstance();
    
    // Mock the DbClient methods to avoid database errors
    jest.spyOn(dbClient, 'getTransaction').mockImplementation(() => Promise.resolve(null));
    jest.spyOn(dbClient, 'processTransaction').mockImplementation(() => Promise.resolve({} as any));
    
    parser = new TransactionParser(dbClient);

    // Load test transactions from JSON file
    try {
      const txData = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'src/services/tests/test_tx.json'), 
        'utf8'
      ));
      testTransactions = txData.transactions || [];
      logger.info(`Loaded ${testTransactions.length} test transactions from JSON file`);
    } catch (error) {
      logger.error('Failed to load test transactions from JSON file', { error });
      throw error;
    }
  });

  afterAll(async () => {
    // Clean up
    logger.info('Tests completed, cleaning up...');
    jest.restoreAllMocks();
  });

  // Test each transaction from the JSON file
  it.each(testTransactions)('should fetch and parse transaction %s', async (txid) => {
    logger.info(`Testing transaction ${txid}`);

    // Fetch transaction from JungleBus
    const jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
      useSSL: true,
      protocol: 'json',
      onError: (ctx) => {
        logger.error("❌ JungleBus ERROR", ctx);
      }
    });

    try {
      const tx = await jungleBus.GetTransaction(txid);
      
      if (!tx) {
        logger.warn(`Transaction ${txid} not found`);
        return;
      }
      
      expect(tx).toBeTruthy();
      expect(tx.id).toBe(txid);

      // Save transaction data to file
      const textOutputPath = path.join(testOutputDir, `${txid}_content.txt`);
      const textOutput = `Transaction ID: ${txid}
Block Height: ${tx.block_height || 'Unknown'}
Block Time: ${tx.block_time || 'Unknown'}

Transaction Details:
${JSON.stringify(tx, null, 2)}
`;
      fs.writeFileSync(textOutputPath, textOutput);
      logger.info('Saved transaction data to', { path: textOutputPath });

      // Parse the transaction
      await parser.parseTransaction(txid);
      logger.info('Transaction parsed successfully', { txid });

      // Verify the transaction was processed
      expect(dbClient.processTransaction).toHaveBeenCalled();
      
      logger.info('Transaction test completed successfully', {
        txid
      });
    } catch (error) {
      logger.error('Failed to process transaction', { txid, error });
      throw error;
    }
  });
});
