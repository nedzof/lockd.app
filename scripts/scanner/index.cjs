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

function stopBlockchainScanner(scanner) {
  if (scanner) {
    scanner.stop();
    console.log('Scanner stopped gracefully.');
  } else {
    console.log('No blockchain scanner is running');
  }
}

module.exports = {
  startBlockchainScanner,
  stopBlockchainScanner
}; 