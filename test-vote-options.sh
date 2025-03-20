#!/bin/bash

echo "Testing vote option percentages for post 17c7927c..."

# Install dependencies if needed
if [ ! -d "node_modules/node-fetch" ]; then
  echo "Installing dependencies..."
  npm install node-fetch
fi

# Run the JavaScript test
echo "Running test..."
node test-vote-options.cjs

echo "Test complete." 