import { BlockchainScanner } from './blockchainScanner';

let scanner: BlockchainScanner | null = null;

export function startBlockchainScanner() {
  if (!scanner) {
    scanner = new BlockchainScanner();
    scanner.startScanning().catch(error => {
      console.error('Error starting blockchain scanner:', error);
    });
    console.log('Blockchain scanner service started');
  } else {
    console.log('Blockchain scanner is already running');
  }
}

export function stopBlockchainScanner() {
  if (scanner) {
    scanner.stopScanning();
    scanner = null;
    console.log('Blockchain scanner service stopped');
  } else {
    console.log('No blockchain scanner is running');
  }
}

// Start the scanner automatically when the service is imported
startBlockchainScanner(); 