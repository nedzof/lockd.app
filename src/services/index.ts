// src/services/index.ts
import { BlockchainScanner } from "./scanner.ts";
import { TransactionProcessor } from "./TransactionProcessor.ts";

const scanner = new BlockchainScanner();
scanner.initialize();

const transactionProcessor = new TransactionProcessor('wss://junglebus.gorillapool.io');

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await scanner.shutdown();
  await transactionProcessor.disconnect();
  process.exit(0);
});