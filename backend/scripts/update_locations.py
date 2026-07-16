import json
import time
import os
import requests # <--- Swapped geopy for requests
from geopy.distance import geodesic 

# --- CONFIG ---
BASE_DIR = os.path.dirname(__file__)
INPUT_FILE = os.path.join(BASE_DIR, "data", "market_mapping.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "data", "market_coordinates.json")

def get_coordinates(query):
    """
    Manual geocoding using OpenStreetMap API to avoid Pylance errors.
    """
    url = "https://nominatim.openstreetmap.org/search"
    headers = {'User-Agent': 'agrivani_bot_updater_v2'}
    params = {
        'q': query,
        'format': 'json',
        'limit': 1
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        data = response.json()
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except:
        return None, None
    return None, None

def add_coordinates():
    if not os.path.exists(INPUT_FILE):
        print("❌ Error: market_mapping.json not found. Create it first!")
        return

    # Load existing mapping
    with open(INPUT_FILE, "r") as f:
        data = json.load(f)

    updated_data = {}
    print(f"🌍 Starting Geocoding for {len(data)} markets...")

    count = 0
    for market, details in data.items():
        city = details["city"]
        district = details["district"]
        query = f"{city}, {district}, Maharashtra"
        
        # USE NEW FUNCTION
        lat, lon = get_coordinates(query)
            
        if lat and lon:
            updated_data[market] = {
                "city": city,
                "district": district,
                "lat": lat,
                "lon": lon
            }
            print(f"✅ [{count+1}] Found: {market} -> {city}")
        else:
            print(f"⚠️ [{count+1}] Not Found: {market}")
            updated_data[market] = details

        count += 1
        time.sleep(1.2) # Polite delay

    # Save to file
    with open(OUTPUT_FILE, "w") as f:
        json.dump(updated_data, f, indent=2)

    print(f"🎉 Done! Coordinates saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    add_coordinates()