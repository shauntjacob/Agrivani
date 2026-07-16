import sqlite3
import difflib
from pathlib import Path

# Path to your raw database
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "prices.db"

def get_official_markets():
    """Fetches a list of all official market names directly from the database."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Market FROM variety_prices")
        markets = [row[0] for row in cursor.fetchall()]
        conn.close()
        return markets
    except Exception:
        return []

def standardize_market_name(user_market):
    """
    Auto-corrects typos and matches partial names to the official APMC database name.
    """
    if not user_market:
        return None
        
    official_markets = get_official_markets()
    if not official_markets:
        return user_market.capitalize()
        
    user_clean = str(user_market).strip().lower()
    
    # 1. Try a direct "contains" match first (e.g., "nagpur" inside "Nagpur APMC")
    for market in official_markets:
        if user_clean in market.lower():
            return market
            
    # 2. Fuzzy Matching for typos (e.g., "Poonay" gets matched to "Pune")
    # cutoff=0.6 means it needs to be at least 60% similar to trigger
    closest_matches = difflib.get_close_matches(user_market, official_markets, n=1, cutoff=0.6)
    
    if closest_matches:
        return closest_matches[0]
        
    # 3. Fallback: Return what they typed
    return user_market.capitalize()

# --- TEST IT ---
if __name__ == "__main__":
    # Add this to the bottom of nlp_translator.py to test
    test_cities = ["Nagpur", "Puna", "mumbai", "kalyen"]
    print("🌍 Testing Market Auto-Correct:")
    for city in test_cities:
        print(f"User said: '{city}' -> DB searches for: '{standardize_market_name(city)}'")