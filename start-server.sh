#!/bin/bash

# Navigate to the project directory
cd "$(dirname "$0")"

# Build the TypeScript code for the server
echo "Building TypeScript for server..."
npx tsc -p tsconfig.server.json

# Start the server
echo "Starting server on port 3003..."
node dist/server.js
