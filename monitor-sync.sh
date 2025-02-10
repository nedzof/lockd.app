#!/bin/bash
while true; do
  clear
  echo "BSV Testnet Node Sync Status:"
  echo "------------------------"
  ./bitcoin-sv-1.0.15/bin/bitcoin-cli -testnet -rpcuser=bsvuser -rpcpassword=bsvpassword getblockchaininfo | grep -E "blocks|headers|verificationprogress|mediantime"
  echo "------------------------"
  date
  sleep 10
done