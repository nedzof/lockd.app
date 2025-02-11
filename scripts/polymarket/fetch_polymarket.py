import requests
import re
from urllib.parse import urlparse
import json

GAMMA_API = "https://gamma-api.polymarket.com"

def extract_slug(url):
    """Extract event/market slug from Polymarket URL"""
    path = urlparse(url).path
    match = re.search(r'/event/([^/?]+)', path) or re.search(r'/market/([^/?]+)', path)
    return match.group(1) if match else None

def fetch_polymarket_data(url):
    """Fetch market/event data from Gamma API based on Polymarket URL"""
    slug = extract_slug(url)
    if not slug:
        return {"error": "Invalid Polymarket URL format"}

    # Try to find matching event first
    event_response = requests.get(
        f"{GAMMA_API}/events",
        params={"slug": slug, "closed": "false", "archived": "false"}
    )
    
    if event_response.status_code == 200 and event_response.json():
        event = event_response.json()[0]
        return format_event_data(event)

    # If no event found, try markets endpoint
    market_response = requests.get(
        f"{GAMMA_API}/markets",
        params={"slug": slug, "closed": "false", "archived": "false"}
    )
    
    if market_response.status_code == 200 and market_response.json():
        market = market_response.json()[0]
        return format_market_data(market)

    return {"error": "No matching event or market found"}

def format_event_data(event):
    """Structure event data from Gamma API response"""
    return {
        "type": "event",
        "id": event["id"],
        "title": event["title"],
        "description": event.get("description", ""),
        "end_date": event.get("endDate"),
        "liquidity": event.get("liquidityUSD"),
        "volume": event.get("volumeUSD"),
        "markets": [format_market_data(m) for m in event.get("markets", [])],
        "url": f"https://polymarket.com/event/{event.get('slug')}",
        "image": event.get("imageUrl")
    }

def format_market_data(market):
    """Structure market data from Gamma API response"""
    return {
        "type": "market",
        "id": market["id"],
        "question": market["question"],
        "end_date": market.get("endDate"),
        "liquidity": market.get("liquidityUSD"),
        "volume": market.get("volumeUSD"),
        "prices": parse_outcome_prices(market),
        "tokens": parse_tokens(market.get("tokens", [])),
        "url": f"https://polymarket.com/market/{market.get('slug')}",
        "active": market.get("active"),
        "closed": market.get("closed")
    }

def parse_outcome_prices(market):
    """Parse outcome prices from market data"""
    prices = market.get("outcomePrices", {})
    
    # Handle stringified JSON arrays
    if isinstance(prices, str):
        try:
            prices = json.loads(prices)
        except json.JSONDecodeError:
            return {}

    # Handle numeric arrays with outcome labels
    if isinstance(prices, list):
        # Get outcome labels from market data or generate defaults
        outcomes = market.get("outcomes", [f"Outcome {i+1}" for i in range(len(prices))])
        return {outcomes[i]: float(prices[i]) for i in range(len(prices))}
    
    return prices

def parse_tokens(tokens):
    """Parse token information from market data"""
    return [{
        "token_id": token.get("tokenId"),
        "outcome": token.get("outcome"),
        "clob_token_id": token.get("clobTokenId")
    } for token in tokens]

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python fetch_polymarket.py <polymarket_url>")
        sys.exit(1)
    
    result = fetch_polymarket_data(sys.argv[1])
    print(json.dumps(result, indent=2, sort_keys=True))
