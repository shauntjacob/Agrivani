import sqlite3
import json
import os

# --- CONFIG ---
BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "data", "prices.db")
LOCATIONS_FILE = os.path.join(BASE_DIR, "locations.json")
COMMODITIES_FILE = os.path.join(BASE_DIR, "commodities.json")

def extract():
    if not os.path.exists(DB_PATH):
        print("❌ Error: prices.db not found. Run server.py first!")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Get Unique Markets (Locations)
    print("📍 Extracting Locations...")
    cursor.execute("SELECT DISTINCT market FROM prices")
    locations = [row[0] for row in cursor.fetchall() if row[0]]
    
    # 2. Get Unique Commodities (Crops)
    print("🌽 Extracting Crops...")
    cursor.execute("SELECT DISTINCT commodity FROM prices")
    commodities = [row[0] for row in cursor.fetchall() if row[0]]

    conn.close()

    # Save to JSON
    with open(LOCATIONS_FILE, "w") as f: json.dump(locations, f)
    with open(COMMODITIES_FILE, "w") as f: json.dump(commodities, f)

    print(f"✅ Saved {len(locations)} locations to locations.json")
    print(f"✅ Saved {len(commodities)} commodities to commodities.json")

if __name__ == "__main__":
    extract()