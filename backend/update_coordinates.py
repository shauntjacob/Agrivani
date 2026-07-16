import json
import time
import requests

print("📂 Loading market_coordinates.json...")
with open('data/market_coordinates.json', 'r', encoding='utf-8') as f:
    mandi_data = json.load(f)

updated_mandi_data = {}

print("🔍 Starting completely FREE APMC coordinate extraction...")

for market_key, info in mandi_data.items():
    city = info['city']
    district = info['district']
    
    # We ask OSM to find the APMC market in that city
    search_query = f"APMC Market, {city}, {district}, Maharashtra, India"
    
    # 1. Setup the OpenStreetMap REST API URL and Headers
    url = "https://nominatim.openstreetmap.org/search"
    headers = {'User-Agent': 'AgriVani_Market_Locator'}
    
    try:
        # 2. Make the free search request
        response = requests.get(url, headers=headers, params={'q': search_query, 'format': 'json', 'limit': 1})
        data = response.json()
        
        # 3. Fallback: If it can't find the APMC, try searching just the city
        if not data:
            fallback_query = f"{city}, {district}, Maharashtra, India"
            response = requests.get(url, headers=headers, params={'q': fallback_query, 'format': 'json', 'limit': 1})
            data = response.json()

        if data:
            # 4. Extract exact Lat/Lon (OSM returns strings, so we wrap them in float() for React)
            info['lat'] = float(data[0]['lat'])
            info['lon'] = float(data[0]['lon'])
            print(f"✅ Found: {city} -> ({info['lat']}, {info['lon']})")
        else:
            print(f"⚠️ Not Found: {city}. Keeping original coordinates.")
            
    except Exception as e:
        print(f"❌ Error searching for {city}: {e}")
        
    updated_mandi_data[market_key] = info
    
    # 🌟 CRITICAL: 1.5-second pause to respect OpenStreetMap's free server rules!
    time.sleep(1.5)

# Save the new database!
output_file = 'apmc_precise_coordinates.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(updated_mandi_data, f, indent=2)

print(f"\n🎉 Done! All precise coordinates saved to {output_file}")