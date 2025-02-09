#!/usr/bin/env node
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const scanner = require('./scanner/index.cjs');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down scanner...');
  scanner.stopBlockchainScanner();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down scanner...');
  scanner.stopBlockchainScanner();
  process.exit(0);
});

// Start the scanner
console.log('Starting blockchain scanner service...');
scanner.startBlockchainScanner(); 