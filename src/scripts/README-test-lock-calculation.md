# Post Lock Calculation Test Script

This script tests the lock calculation logic for a specific post to verify if it's correctly calculated. It replicates the logic used in the frontend and provides detailed diagnostics about each step of the calculation.

## Purpose

The primary purpose of this script is to:

1. Fetch the post data from the API for a specific post ID
2. Analyze the lock_likes array and its properties
3. Calculate the active locked amount using the same logic as in the frontend
4. Compare the calculated amount with the total_locked value from the API
5. Provide detailed diagnostics about each step of the calculation

This helps diagnose issues with lock calculation discrepancies between what's displayed in the UI and what's stored in the database.

## Usage

To run the test script, execute:

```bash
# Using the bash script (recommended)
./test-lock-calculation.sh

# Or run directly with tsx
npx tsx src/scripts/test-post-lock-calculation.ts

# Or with ts-node
npx ts-node src/scripts/test-post-lock-calculation.ts
```

## Configuration

The script has two main configuration parameters at the top:

```typescript
const API_URL = 'https://lockd.app'; // API URL to fetch post data from
const POST_ID = '17c7927c5f014ad1154878e826d66b614bb08f9859611e27ebf9f6b0e570e67e'; // Post ID to test
```

You can modify these values to test different posts or use different API endpoints.

## Interpreting Results

The script provides detailed output for each stage of the calculation process:

1. **Current Block Height**: Shows the current block height fetched from WhatsOnChain API.
2. **Post Information**: Displays basic information about the post.
3. **Lock Likes Information**: Shows details about each lock, including:
   - Amount in satoshis and BSV
   - Unlock height
   - Author address
   - Current status (LOCKED or UNLOCKED)
   - Time until unlock or time since unlock
4. **Calculation Process**: Shows step-by-step how the active locked amount is calculated:
   - Input validation
   - Processing each lock
   - Lock status checks
   - Amount validation and type conversion
   - Final calculation
5. **Results**: Compares the calculated amount with the total_locked value from the API.

## Common Issues

If the calculation differs from the API value, check for:

1. **Invalid Amount Types**: Look for amounts stored as strings or with invalid values.
2. **Missing Unlock Heights**: Locks without unlock heights are excluded from calculation.
3. **Expired Locks**: Locks with unlock heights less than the current block height are considered unlocked.
4. **API Data Inconsistency**: The API might return different data than what's displayed in the UI.

## Output Files

The script saves the post data to a JSON file named `post-{first-8-chars-of-post-id}.json` in the current directory. This file contains the raw post data fetched from the API and can be used for offline analysis.

## Debugging

To add more detailed logging, modify the `calculate_active_locked_amount` function in the script. The function already includes extensive logging, but you can add more specific checks if needed.

---

Created for diagnosing post lock calculation issues in the lockd.app project. 