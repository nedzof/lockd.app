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
        "answer_options": get_answer_options(market),
        "current_prices": parse_outcome_prices(market),
        "active": market.get("active"),
        "closed": market.get("closed"),
        "url": f"https://polymarket.com/market/{market.get('slug')}"
    }

def get_answer_options(market):
    """Extract human-readable answer options from market data"""
    # Handle stringified JSON outcomes
    if "outcomes" in market:
        if isinstance(market["outcomes"], str):
            try:
                return json.loads(market["outcomes"])
            except json.JSONDecodeError:
                pass
        return market["outcomes"]
    
    # Fallback to token outcomes if available
    token_outcomes = {str(token.get("outcome", "")).strip() for token in market.get("tokens", [])}
    token_outcomes.discard('')  # Remove empty outcomes
    if token_outcomes:
        return sorted(token_outcomes)
    
    # Final fallback based on price count
    prices = market.get("outcomePrices", [])
    if isinstance(prices, str):
        try:
            prices = json.loads(prices)
        except json.JSONDecodeError:
            prices = []
    
    if len(prices) == 2:
        return ["Yes", "No"]
    
    return [f"Option {i+1}" for i in range(len(prices))]

def parse_outcome_prices(market):
    """Parse outcome prices from market data"""
    prices = market.get("outcomePrices", {})
    
    # Normalize price format
    if isinstance(prices, str):
        try:
            prices = json.loads(prices)
        except json.JSONDecodeError:
            prices = []
    
    answer_options = get_answer_options(market)
    
    if isinstance(prices, list):
        return {
            option: float(price)
            for option, price in zip(answer_options, prices)
            if option  # Skip empty options
        }
    
    return prices

def parse_tokens(tokens):
    """Parse token information from market data"""
    return [{
        "token_id": token.get("tokenId"),
        "outcome": token.get("outcome"),
        "clob_token_id": token.get("clobTokenId")
    } for token in tokens]

def format_human_readable(data):
    """Create a simple text summary of the market data"""
    if "error" in data:
        return data["error"]
    
    output = []
    
    if data["type"] == "event":
        output.append(f"Event: {data['title']}")
        output.append(f"Ends: {data['end_date']}")
        output.append("Markets:")
        for market in data["markets"]:
            output.append(format_market_text(market))
    else:
        output.append(format_market_text(data))
    
    return "\n".join(output)

def format_market_text(market):
    """Format individual market data"""
    lines = [
        f"Market: {market['question']}",
        f"Ends: {market['end_date']}",
        "Options:"
    ]
    
    for option in market.get("answer_options", []):
        price = market["current_prices"].get(option, 0.0)
        lines.append(f"> {option} ({price * 100:.1f}%)")
    
    return "\n".join(lines)

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python fetch_polymarket.py <polymarket_url>")
        sys.exit(1)
    
    result = fetch_polymarket_data(sys.argv[1])
    print(json.dumps(result, indent=2, sort_keys=True))
    print("\nHuman-readable format:")
    print(format_human_readable(result))
