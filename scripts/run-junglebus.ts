import { JungleBusService } from '../src/services/scanner/jungleBusService.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const jungleBusService = new JungleBusService();
  
  // Start from 10 blocks before the target transaction in block 1660547
  const startBlock = 1660537;
  
  console.log(`Starting JungleBus subscription from block ${startBlock}...`);
  
  try {
    await jungleBusService.subscribe(startBlock);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Received SIGINT. Cleaning up...');
      await jungleBusService.unsubscribe();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM. Cleaning up...');
      await jungleBusService.unsubscribe();
      process.exit(0);
    });

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    console.error('Error running JungleBus service:', error);
    process.exit(1);
  }
}

main().catch(console.error); 