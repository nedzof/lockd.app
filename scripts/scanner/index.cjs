const BlockchainScanner = require('./blockchainScanner.cjs');

let scanner = null;

function startBlockchainScanner() {
  if (!scanner) {
    const newScanner = new BlockchainScanner();
    scanner = newScanner;
    newScanner.startScanning().catch(error => {
      console.error('Error starting blockchain scanner:', error);
    });
    console.log('Blockchain scanner service started');
  } else {
    console.log('Blockchain scanner is already running');
  }
}

function stopBlockchainScanner() {
  if (scanner) {
    scanner.stopScanning();
    scanner = null;
    console.log('Blockchain scanner service stopped');
  } else {
    console.log('No blockchain scanner is running');
  }
}

module.exports = {
  startBlockchainScanner,
  stopBlockchainScanner
}; 