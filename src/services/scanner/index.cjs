const { BlockchainScanner } = require('./blockchainScanner.cjs');

let scanner = null;

function startBlockchainScanner() {
  if (!scanner) {
    scanner = new BlockchainScanner();
    scanner.start();
    console.log('Blockchain scanner started');
  }
}

function stopBlockchainScanner() {
  if (scanner) {
    scanner.stop();
    scanner = null;
    console.log('Blockchain scanner stopped');
  }
}

module.exports = {
  startBlockchainScanner,
  stopBlockchainScanner
}; 