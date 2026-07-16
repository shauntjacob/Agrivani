import requests
import json
import time

# --- CONFIGURATION ---
SERVER_URL = "http://127.0.0.1:8000/ask"

# AMBARNATH COORDINATES (Simulating a farmer's phone)
SIMULATED_GPS_LAT = 19.2010
SIMULATED_GPS_LON = 73.1764

def chat():
    print("\n" + "="*60)
    print(f"      🌱 AgriVani (Simulating Smartphone GPS)      ")
    print(f"      📍 GPS Signal Locked: {SIMULATED_GPS_LAT}, {SIMULATED_GPS_LON}")
    print("="*60)
    print(" 💡 Testing:")
    print("    1. Ask 'Where am I?' -> Should say 'Ambarnath'")
    print("    2. Ask 'Price of Onion?' -> Should find 'Ulhasnagar' (Nearest) if not Found in Ambarnath")
    print("-" * 60 + "\n")

    while True:
        try:
            user_input = input("You: ").strip()
            
            if user_input.lower() in ["exit", "quit"]:
                print("👋 Bye!")
                break
            
            if not user_input: continue

            # Automatically sending coordinates. No user typing required.
            payload = {
                "prompt": user_input, 
                "user_lat": SIMULATED_GPS_LAT,
                "user_lon": SIMULATED_GPS_LON,
                "user_city": "" # We let the server figure out the name!
            }
            
            print("AgriVani: ", end="", flush=True)
            
            with requests.post(SERVER_URL, json=payload, stream=True) as r:
                if r.status_code == 200:
                    for chunk in r.iter_content(chunk_size=None):
                        if chunk: print(chunk.decode('utf-8'), end="", flush=True)
                    print("\n")
                else:
                    print(f"❌ Error: {r.status_code}\n")

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"\n❌ Connection Error: {e}\n")

if __name__ == "__main__":
    chat()