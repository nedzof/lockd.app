#!/bin/bash

# This script sets up a cron job to run the BSV price fetcher script every hour

# Get the absolute path to the project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Create the cron job commands
BSV_PRICE_COMMAND="0 * * * * cd $PROJECT_DIR && npx tsx scripts/bsv-price-fetcher.ts >> $PROJECT_DIR/logs/bsv-price-fetcher.log 2>&1"
STATS_UPDATE_COMMAND="5 * * * * cd $PROJECT_DIR && npx tsx scripts/update-stats-bsv-price.ts >> $PROJECT_DIR/logs/update-stats-bsv-price.log 2>&1"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"

# Check if the cron jobs already exist
EXISTING_BSV_CRON=$(crontab -l 2>/dev/null | grep -F "scripts/bsv-price-fetcher.ts")
EXISTING_STATS_CRON=$(crontab -l 2>/dev/null | grep -F "scripts/update-stats-bsv-price.ts")

# Get current crontab
CURRENT_CRONTAB=$(crontab -l 2>/dev/null)

# Add BSV price fetcher cron job if it doesn't exist
if [ -z "$EXISTING_BSV_CRON" ]; then
  CURRENT_CRONTAB="${CURRENT_CRONTAB}${CURRENT_CRONTAB:+$'\n'}${BSV_PRICE_COMMAND}"
  echo "BSV price fetcher cron job has been set up to run every hour"
else
  echo "BSV price fetcher cron job already exists"
fi

# Add stats update cron job if it doesn't exist
if [ -z "$EXISTING_STATS_CRON" ]; then
  CURRENT_CRONTAB="${CURRENT_CRONTAB}${CURRENT_CRONTAB:+$'\n'}${STATS_UPDATE_COMMAND}"
  echo "Stats BSV price update cron job has been set up to run 5 minutes after every hour"
else
  echo "Stats BSV price update cron job already exists"
fi

# Update crontab
echo "$CURRENT_CRONTAB" | crontab -

# Make sure the log files exist and are writable
touch "$PROJECT_DIR/logs/bsv-price-fetcher.log"
chmod 644 "$PROJECT_DIR/logs/bsv-price-fetcher.log"

touch "$PROJECT_DIR/logs/update-stats-bsv-price.log"
chmod 644 "$PROJECT_DIR/logs/update-stats-bsv-price.log"

echo "Setup complete. The BSV price will be updated hourly."
echo "Stats will be updated with the current BSV price 5 minutes after every hour."
echo "Logs will be written to:"
echo "  - $PROJECT_DIR/logs/bsv-price-fetcher.log"
echo "  - $PROJECT_DIR/logs/update-stats-bsv-price.log"
