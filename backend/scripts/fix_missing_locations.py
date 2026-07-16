import json
import os
import requests
import time

# --- CONFIG ---
BASE_DIR = os.path.dirname(__file__)
FILE_PATH = os.path.join(BASE_DIR, "data", "market_coordinates.json")

def get_lat_lon(query):
    url = "https://nominatim.openstreetmap.org/search"
    headers = {'User-Agent': 'agrivani_patcher'}
    params = {'q': query, 'format': 'json', 'limit': 1}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=5)
        data = resp.json()
        if data:
            return float(data[0]['lat']), float(data[0]['lon'])
    except: pass
    return None, None

def fix_missing():
    if not os.path.exists(FILE_PATH):
        print("❌ File not found!")
        return

    with open(FILE_PATH, "r") as f:
        data = json.load(f)

    print("🔧 Scanning for missing coordinates...")
    
    fixed_count = 0
    
    for market, details in data.items():
        # Check if this market is missing coordinates
        if "lat" not in details or details["lat"] is None:
            print(f"\n⚠️  Fixing: {market}...")
            
            city = details["city"]
            district = details["district"]
            
            # STRATEGY 1: Remove "Station" or specific suffixes from City name
            clean_city = city.replace(" Station", "").replace(" Road", "").strip()
            
            queries_to_try = [
                f"{clean_city}, {district}, Maharashtra",  # Standard Try
                f"{clean_city}, Maharashtra",              # Broader Try
                f"{district}, Maharashtra"                 # Fallback to District HQ
            ]
            
            for q in queries_to_try:
                print(f"   Trying: '{q}'...", end=" ")
                lat, lon = get_lat_lon(q)
                if lat:
                    print("✅ FOUND!")
                    data[market]["lat"] = lat
                    data[market]["lon"] = lon
                    fixed_count += 1
                    break
                else:
                    print("❌")
                time.sleep(1) # Be polite to API

    if fixed_count > 0:
        with open(FILE_PATH, "w") as f:
            json.dump(data, f, indent=2)
        print(f"\n🎉 Successfully fixed {fixed_count} locations!")
    else:
        print("\n✅ No fixable missing locations found.")

if __name__ == "__main__":
    fix_missing()