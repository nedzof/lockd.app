#!/bin/bash

echo "Installing required dependencies..."
npm install chalk@4.1.2 node-fetch@2.7.0

echo "Running post lock calculation test..."
npx tsx src/scripts/test-post-lock-calculation.ts

echo "Test completed." 