import os
import sys
import requests
import sqlite3
import pandas as pd
import time
from pathlib import Path
from dotenv import load_dotenv

# 1. SETUP PATHS
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

PRICES_DB_PATH = DATA_DIR / "prices.db"
ENV_PATH = BACKEND_DIR / ".env"

# 2. LOAD ENVIRONMENT
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    print(f"❌ Error: Could not find .env file at {ENV_PATH}")
    sys.exit(1)

# Fetch the key and satisfy Pylance type-checking
raw_key = os.getenv("MARKET_PRICE")
if raw_key is None:
    print(f"❌ Error: 'MARKET_PRICE' not found in {ENV_PATH}")
    sys.exit(1)
API_KEY: str = raw_key

# 3. UPDATED RESOURCE ID FROM YOUR SCREENSHOT
RESOURCE_ID = "35985678-0d79-46b4-9ed6-6f13308a1d24" 

def setup_db():
    conn = sqlite3.connect(PRICES_DB_PATH)
    cursor = conn.cursor()
    # Using IF NOT EXISTS to prevent errors if table already exists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS variety_prices (
            State TEXT, District TEXT, Market TEXT, Commodity TEXT,
            Variety TEXT, Grade TEXT, Arrival_Date DATE,
            Min_Price REAL, Max_Price REAL, Modal_Price REAL
        )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_market ON variety_prices(Market)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_commodity ON variety_prices(Commodity)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_date ON variety_prices(Arrival_Date)")
    conn.commit()
    return conn

def fetch_historical_prices():
    print("🚜 Starting Multi-Year Variety-Wise Data Extraction...")
    print(f"🔑 API Key Loaded: {API_KEY[:4]}********")
    
    conn = setup_db()
    offset = 0
    limit = 1000 
    total_saved = 0
    
    while True:
        # Build the URL with the state filter
        url = (
            f"https://api.data.gov.in/resource/{RESOURCE_ID}"
            f"?api-key={API_KEY}&format=json"
            f"&offset={offset}&limit={limit}"
            f"&filters[state]=Maharashtra"
        )
        
        try:
            print(f"📡 Fetching records {offset} to {offset + limit}...")
            response = requests.get(url, timeout=30)
            
            if response.status_code != 200:
                print(f"❌ API Error {response.status_code}: {response.text}")
                time.sleep(10)
                continue

            data = response.json()
            records = data.get('records', [])
            
            if not records:
                print("🏁 Extraction finished or no data found for this range.")
                break
                
            df = pd.DataFrame(records)
            
            # --- ROBUST COLUMN MAPPING ---
            # The API might return 'arrival_date' or 'Arrival_Date'. 
            # We convert all to lowercase first to find them, then rename for our DB.
            df.columns = [c.lower() for c in df.columns]
            
            if 'arrival_date' in df.columns:
                df['arrival_date'] = pd.to_datetime(df['arrival_date'], format='%d/%m/%Y', errors='coerce').dt.date
            
            # Rename columns to match the SQL table exactly
            column_map = {
                'state': 'State', 'district': 'District', 'market': 'Market',
                'commodity': 'Commodity', 'variety': 'Variety', 'grade': 'Grade',
                'arrival_date': 'Arrival_Date', 'min_price': 'Min_Price',
                'max_price': 'Max_Price', 'modal_price': 'Modal_Price'
            }
            df = df.rename(columns=column_map)
            
            # Only keep columns that exist in our database schema
            final_columns = [col for col in column_map.values() if col in df.columns]
            df = df[final_columns]
            
            # Save to SQLite
            df.to_sql('variety_prices', conn, if_exists='append', index=False)
            
            count = len(df)
            total_saved += count
            offset += limit
            print(f"   ✅ Saved {count} records (Total: {total_saved})")
            
            # Respect API limits
            time.sleep(1) 
            
        except Exception as e:
            print(f"❌ Error during processing: {e}")
            # This will print the exact reason for 'Execution failed'
            time.sleep(5)
            
    conn.close()
    print(f"🎉 SUCCESS! Total Records Saved: {total_saved}")

if __name__ == "__main__":
    fetch_historical_prices()