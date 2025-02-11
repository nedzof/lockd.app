# Polymarket Data Fetcher

A simple Python script to fetch market data from Polymarket URLs.

## Setup

1. Make sure you have Python 3.7+ installed
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

You can run the script directly:

```bash
python fetch_polymarket.py
```

The script includes sample URLs by default, but you can also import and use the `PolymarketFetcher` class in your own code:

```python
from fetch_polymarket import PolymarketFetcher

fetcher = PolymarketFetcher()
market_data = fetcher.fetch_market_data('https://polymarket.com/event/your-event?tid=your-tid')
print(market_data)
```

## Features

- Extracts TID (Transaction ID) from Polymarket URLs
- Fetches market data using Polymarket's API
- Handles both single and grouped betting markets
- Proper error handling and logging

## Error Handling

The script includes error handling for:
- Invalid URLs
- Network request failures
- Invalid API responses

## Sample URLs

The script comes with these sample URLs that are known to work:
- US Recession bet
- Germany Parliamentary Election (grouped bet)
- Putin-Trump meeting bet 