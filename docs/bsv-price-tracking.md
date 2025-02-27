# BSV Price Tracking System

This document describes the BSV price tracking system implemented for the Lockd.app platform.

## Overview

The BSV price tracking system fetches real-time and historical BSV price data from multiple sources, with OKX as the primary source. The system stores this data in the database and provides API endpoints for accessing it.

## Components

### 1. BSV Price Fetcher Script

Located at `scripts/bsv-price-fetcher.ts`, this script:
- Fetches BSV price data from OKX API (primary source)
- Calculates weekly and monthly averages
- Formats data for frontend chart visualization
- Stores data in the database and JSON files for backup

### 2. Stats Update Script

Located at `scripts/update-stats-bsv-price.ts`, this script:
- Fetches the current BSV price
- Updates the `current_bsv_price` field in the `stats` table
- Runs 5 minutes after the price fetcher to ensure latest data is available

### 3. API Endpoints

Located at `src/api/bsv-price.ts`, these endpoints provide:
- Current BSV price: `/api/bsv-price`
- Historical price data with filtering options: `/api/bsv-price/history`
- Weekly and monthly averages: `/api/bsv-price/history?format=weekly` or `?format=monthly`

### 4. Frontend Integration

The BSV price is displayed in the Stats page and integrated into the existing chart.

### 5. Database Storage

The system stores:
- Current BSV price in the `stats` table (column: `current_bsv_price`)
- Historical price data in the `bsv_price_history` table

## Data Sources

1. **Primary Source**: OKX API
   - Endpoint: `https://www.okx.com/api/v5/market/candles`
   - Provides BSV-USDT candlestick data

2. **Fallback Sources** (in order of priority):
   - WhatsOnChain
   - BitTails
   - GorillaPool
   - Local cache (if less than 24 hours old)

## Usage

### Running the Price Fetcher Manually

```bash
npm run fetch-bsv-price
```

### Running the Stats Update Manually

```bash
npx tsx scripts/update-stats-bsv-price.ts
```

### Setting Up Automated Updates

To set up cron jobs that update the BSV price hourly and update the stats table:

```bash
npm run setup-bsv-price-cron
```

This will create two cron jobs:
1. BSV price fetcher: Runs at the start of every hour
2. Stats update: Runs 5 minutes after every hour

### Accessing Price Data via API

- Current price: `GET /api/bsv-price`
- Historical data: `GET /api/bsv-price/history`
  - Parameters:
    - `format`: daily (default), weekly, monthly

### Accessing Stats with BSV Price

- Stats endpoint: `GET /api/stats`
  - Includes `current_bsv_price` field with the latest BSV price

## Files

- `scripts/bsv-price-fetcher.ts`: Main script for fetching and processing BSV price data
- `scripts/update-stats-bsv-price.ts`: Script for updating the stats table with current BSV price
- `scripts/setup-bsv-price-cron.sh`: Script for setting up cron jobs
- `src/utils/bsvPrice.ts`: Utility functions for fetching BSV price from various sources
- `src/controllers/bsvPriceController.ts`: Controllers for BSV price API endpoints
- `src/controllers/statsController.ts`: Controllers for stats API endpoints (includes BSV price)
- `data/bsv_price_history.json`: JSON backup of historical price data
- `data/bsv_price_chart_data.json`: Formatted data for frontend chart

## Error Handling

The system implements robust error handling:
1. Multiple data sources with fallback mechanism
2. Caching of price data to handle API outages
3. Detailed logging for troubleshooting
4. Graceful degradation with sample data when all sources fail

## Troubleshooting

If the price fetcher script fails, check:
1. Network connectivity to OKX API
2. Database connection
3. Logs in `logs/bsv-price-fetcher.log` and `logs/update-stats-bsv-price.log`

## Future Improvements

- Add more data sources for increased reliability
- Implement price alerts
- Add price prediction features
- Enhance visualization options
- Add price change percentage indicators
- Implement real-time price updates via WebSockets
