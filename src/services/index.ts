// src/index.ts
import { BlockchainScanner } from "./scanner";

const scanner = new BlockchainScanner();
scanner.initialize();

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await scanner.shutdown();
  process.exit(0);
});