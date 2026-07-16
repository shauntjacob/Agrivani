import sqlite3
import os
import requests
import json
import time
import re
import difflib
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
import pandas as pd
from prophet import Prophet

# --- 1. SETUP & PATHS ---
BASE_DIR = os.path.dirname(__file__)
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)

DB_FOLDER = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DB_FOLDER, "prices.db")
CHAT_DB_PATH = os.path.join(DB_FOLDER, "chat_history.db") 
ANALYSIS_DB_PATH = os.path.join(DB_FOLDER, "market_analysis.db")
NEWS_DB_PATH = os.path.join(DB_FOLDER, "market_news.db")

API_KEY = os.getenv("MARKET_PRICE")
API_URL = "https://api.data.gov.in/resource/35985678-0d79-46b4-9ed6-6f13308a1d24"
ALT_API_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
ALT_DB_PATH = os.path.join(DB_FOLDER, "fallback_prices.db")
SYNC_DB_PATH = os.path.join(DB_FOLDER, "sync_history.db")


# --- 2. NLP TRANSLATION DICTIONARY ---
AGRI_DICTIONARY = {
    "कांदा": "Onion", "कांद्याची": "Onion", "kanda": "Onion", "kaandya": "Onion", "pyaz": "Onion", "onion": "Onion",
    "सोयाबीन": "Soybean", "सोयाबीनची": "Soybean", "soyabean": "Soybean", "soya": "Soybean", "soybean": "Soybean",
    "कापूस": "Cotton", "कापसाची": "Cotton", "kapus": "Cotton", "kapas": "Cotton", "cotton": "Cotton",
    "तांदूळ": "Rice", "तांदळाची": "Rice", "tandul": "Rice", "dhan": "Paddy", "rice": "Rice",
    "गहू": "Wheat", "गव्हाची": "Wheat", "gahu": "Wheat", "gehu": "Wheat", "wheat": "Wheat",
    "टोमॅटो": "Tomato", "टोमॅटोची": "Tomato", "tameta": "Tomato", "tomato": "Tomato"
}

def standardize_crop_name(extracted_word):
    if not extracted_word: return ""
    raw_word = str(extracted_word).strip()
    if raw_word in AGRI_DICTIONARY: return AGRI_DICTIONARY[raw_word]
    clean_word = raw_word.lower()
    clean_word = re.sub(r'[^\w\s]', '', clean_word)
    if clean_word in AGRI_DICTIONARY: return AGRI_DICTIONARY[clean_word]
    for local_term, official_term in AGRI_DICTIONARY.items():
        if local_term in clean_word or local_term in raw_word: return official_term
    return raw_word.capitalize()

def standardize_market_name(user_market):
    if not user_market: return ""
    raw_market = str(user_market).strip()
    CITY_OVERRIDES = {"puna": "Pune", "poona": "Pune", "bombay": "Mumbai", "mumbai": "Mumbai"}
    if raw_market.lower() in CITY_OVERRIDES: return CITY_OVERRIDES[raw_market.lower()]
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT Market FROM variety_prices")
        official_markets = [row[0] for row in cursor.fetchall()]
        conn.close()
    except Exception: return raw_market.capitalize()
    user_clean = raw_market.lower()
    for market in official_markets:
        if user_clean == market.lower() or user_clean + " apmc" == market.lower(): return market
    closest_matches = difflib.get_close_matches(raw_market, official_markets, n=1, cutoff=0.6)
    if closest_matches: return closest_matches[0]
    return raw_market.capitalize()

# --- 3. DATABASE CONNECTIONS ---
def get_db_connection():
    if not os.path.exists(DB_FOLDER): os.makedirs(DB_FOLDER)
    conn = sqlite3.connect(DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL;')
    conn.row_factory = sqlite3.Row 
    return conn

def get_chat_db_connection():
    if not os.path.exists(DB_FOLDER): os.makedirs(DB_FOLDER)
    conn = sqlite3.connect(CHAT_DB_PATH)
    conn.row_factory = sqlite3.Row 
    return conn

def setup_database():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS variety_prices (
            State TEXT, District TEXT, Market TEXT, Commodity TEXT,
            Variety TEXT, Grade TEXT, Arrival_Date DATE,
            Min_Price REAL, Max_Price REAL, Modal_Price REAL,
            UNIQUE(Market, Commodity, Variety, Arrival_Date)
        )
    ''')
    # 🌟 THE NEW VAULT: Stores the heavy math overnight!
    conn.execute('''
        CREATE TABLE IF NOT EXISTS prophet_cache (
            Market TEXT, Commodity TEXT, Forecast_Date DATE, 
            Forecast_Text TEXT,
            UNIQUE(Market, Commodity, Forecast_Date)
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_arrival_date ON variety_prices (Arrival_Date)')
    conn.commit()
    conn.close()

def setup_sync_database():
    conn = sqlite3.connect(SYNC_DB_PATH)
    conn.execute('PRAGMA journal_mode=WAL;')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS sync_history (
            Sync_Date DATE PRIMARY KEY,
            Last_Attempt DATETIME,
            Status TEXT
        )
    ''')
    conn.commit()
    conn.close()


    chat_conn = get_chat_db_connection()
    chat_conn.execute('''
        CREATE TABLE IF NOT EXISTS chat_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, content TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    chat_conn.execute("CREATE TABLE IF NOT EXISTS user_settings (key TEXT PRIMARY KEY, value TEXT)")
    chat_conn.commit()
    chat_conn.close()

def save_chat_memory(role, content): pass
def get_chat_history_text(limit=6): return ""

# Old fallback API logic removed

def clean_old_data():
    five_years_ago = (datetime.now() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
    one_year_ago = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    print(f"🧹 [Auto Cleaner] Purging data older than {five_years_ago} in main DB...")
    if os.path.exists(DB_PATH):
        try:
            conn = get_db_connection()
            conn.execute("DELETE FROM variety_prices WHERE Arrival_Date < ?", (five_years_ago,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Main DB cleanup error: {e}")
    print(f"🧹 [Auto Cleaner] Purging data older than {one_year_ago} in fallback DB...")
    if os.path.exists(ALT_DB_PATH):
        try:
            conn = sqlite3.connect(ALT_DB_PATH)
            conn.execute("DELETE FROM variety_prices WHERE Arrival_Date < ?", (one_year_ago,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Fallback DB cleanup error: {e}")


def copy_prices_to_fallback():
    print("🔄 [Auto Fallback Population] Ensuring fallback_prices.db has at least 2 months of data...")
    if os.path.exists(DB_PATH):
        try:
            main_conn = get_db_connection()
            cursor = main_conn.cursor()
            start_two_months = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")
            cursor.execute("SELECT State, District, Market, Commodity, Variety, Grade, Arrival_Date, Min_Price, Max_Price, Modal_Price FROM variety_prices WHERE Arrival_Date >= ?", (start_two_months,))
            rows = cursor.fetchall()
            main_conn.close()

            if rows:
                fallback_conn = get_fallback_db_connection()
                fallback_cursor = fallback_conn.cursor()
                fallback_cursor.executemany('''
                    INSERT OR IGNORE INTO variety_prices 
                    (State, District, Market, Commodity, Variety, Grade, Arrival_Date, Min_Price, Max_Price, Modal_Price)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', rows)
                fallback_conn.commit()
                fallback_conn.close()
                print(f"✅ Successfully copied/synced {len(rows)} recent records from main DB to fallback DB.")
        except Exception as e:
            print(f"Fallback sync error: {e}")

# --- 5. DATA UPDATER ---
def update_daily_prices():
    setup_database()
    clean_old_data()
    copy_prices_to_fallback()
    print("\n[Connecting] Fetching complete daily data from Govt Server...")
    if not API_KEY: 
        print("[Error] No API Key found.")
        return

    setup_sync_database()
    conn = get_db_connection()
    cursor = conn.cursor()


    # 🌟 SYNC MEMORY LOGIC: Look for the earliest "Healthy" day or the first "Missing" day
    # that hasn't been scanned in the last 6 hours.
    cursor.execute("SELECT MAX(Arrival_Date) FROM variety_prices")
    last_db_date_row = cursor.fetchone()
    latest_db_date = datetime.strptime(last_db_date_row[0], "%Y-%m-%d") if last_db_date_row and last_db_date_row[0] else datetime.now() - timedelta(days=7)


    sync_conn = sqlite3.connect(SYNC_DB_PATH)
    sync_cursor = sync_conn.cursor()
    sync_cursor.execute("SELECT MAX(Sync_Date) FROM sync_history WHERE Status = 'Checked'")
    last_sync_row = sync_cursor.fetchone()
    last_sync_date = datetime.strptime(last_sync_row[0], "%Y-%m-%d") if last_sync_row and last_sync_row[0] else latest_db_date
    sync_conn.close()

    # We start from the further of the two to be safe
    start_date = max(latest_db_date, last_sync_date) + timedelta(days=1)

    # But never go back more than 7 days
    if start_date < datetime.now() - timedelta(days=7):
        start_date = datetime.now() - timedelta(days=7)

    end_date = datetime.now()
    if start_date <= end_date:
        print(f"📅 Fetching missing days from {start_date.strftime('%d/%m/%Y')} to {end_date.strftime('%d/%m/%Y')}")

        total_new_count = 0
        current_date = start_date
        batch_size = 1000  # 🌟 LOAD REDUCTION: Smaller chunks (1000 instead of 2000) are less likely to timeout.

        while current_date <= end_date:
            target_date_str = current_date.strftime("%d/%m/%Y")
            target_sql_date = current_date.strftime("%Y-%m-%d")
            print(f"   📡 Fetching complete data for {target_date_str}...")
            
            day_count = 0
            offset = 0
            
            while True:
                params = { 
                    "api-key": API_KEY, "format": "json", "limit": batch_size, 
                    "offset": offset, "filters[State]": "Maharashtra", "filters[Arrival_Date]": target_date_str 
                }

                headers = { "User-Agent": "Mozilla/5.0" }
                data = {}
                for attempt in range(1, 4):
                    try:
                        response = requests.get(API_URL, params=params, headers=headers, timeout=30)
                        response.raise_for_status()
                        data = response.json()
                        break 
                    except Exception as e:
                        if attempt == 3: print(f"      ⚠️ Failed to fetch chunk at offset {offset} for {target_date_str}: {e}")
                        time.sleep(2)

                records = data.get("records", [])
                total_for_day = data.get("total", 0)
                
                # 🌟 PROGRESS DISCOVERY: On the first chunk, tell the user exactly how much data is coming!
                if offset == 0:
                    est_chunks = (total_for_day // batch_size) + 1
                    print(f"      📊 DATA SCAN: Found {total_for_day:,} total records for {target_date_str} (~{est_chunks} chunks).")

                if not records: 
                    break
                
                print(f"      📦 Processing chunk (Offset: {offset}, Records: {len(records)})...")
                
                # 🌟 PROPHET PROTECTION: If we've fetched more than 200,000 records for one day, 
                # something is definitely wrong, but we'll keep going to ensure the model 
                # doesn't miss a single data point!
                if offset > 200000:
                    print(f"      🚨 SAFETY BREAK: Exceeded 200,000 records for {target_date_str}. Moving to next day.")
                    break
                
                processed_chunk_count = 0
                date_mismatch_count = 0
                state_mismatch_count = 0

                for item in records:
                    try:
                        norm_item = {k.lower(): v for k, v in item.items()}
                        raw_date = norm_item.get("arrival_date", "")
                        if not raw_date: continue
                        
                        try: record_date = datetime.strptime(raw_date, "%d/%m/%Y")
                        except ValueError:
                            try: record_date = datetime.strptime(raw_date, "%Y-%m-%d")
                            except ValueError: continue
                                
                        sql_date = record_date.strftime("%Y-%m-%d")
                        target_sql_date = current_date.strftime("%Y-%m-%d")
                        record_state = str(norm_item.get("state", "")).strip().capitalize()

                        # 🌟 DATA INTEGRITY CHECKS
                        if sql_date != target_sql_date:
                            date_mismatch_count += 1
                            continue
                        if record_state != "Maharashtra":
                            state_mismatch_count += 1
                            continue

                        market = str(norm_item.get("market", "")).strip().capitalize()
                        commodity = standardize_crop_name(norm_item.get("commodity", ""))
                        variety = str(norm_item.get("variety", "")).strip()
                        grade = str(norm_item.get("grade", "")).strip()

                        cursor.execute('''
                            INSERT OR IGNORE INTO variety_prices 
                            (State, District, Market, Commodity, Variety, Grade, Arrival_Date, Min_Price, Max_Price, Modal_Price)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            record_state, 
                            str(norm_item.get("district", "")).capitalize(), 
                            market, commodity, variety, grade, sql_date,
                            float(norm_item.get("min_price", 0) or 0), 
                            float(norm_item.get("max_price", 0) or 0), 
                            float(norm_item.get("modal_price", 0) or 0)
                        ))
                        if cursor.rowcount > 0:
                            day_count += 1
                            total_new_count += 1
                        
                        processed_chunk_count += 1
                    except Exception:
                        continue

                if len(records) < batch_size: break
                offset += batch_size
                time.sleep(2) # 🌟 THE BREATHER: Give the Govt server 2 seconds to rest before the next chunk.

            conn.commit()
            # 🌟 MARK AS CHECKED: Even if we found 0 records, we remember we tried this day in a separate DB!
            sync_conn = sqlite3.connect(SYNC_DB_PATH)
            sync_cursor = sync_conn.cursor()
            sync_cursor.execute("INSERT OR REPLACE INTO sync_history (Sync_Date, Last_Attempt, Status) VALUES (?, CURRENT_TIMESTAMP, 'Checked')", (target_sql_date,))
            sync_conn.commit()
            sync_conn.close()


            if day_count > 0: 
                print(f"      ✅ Saved the TRUE total of {day_count} new records for {target_date_str}.")
            else: 
                print(f"      ⚡ No new data found for {target_date_str}. Day marked as checked.")

            current_date += timedelta(days=1)

        print("-" * 40)
        if total_new_count > 0: print(f"[Success] Database populated with {total_new_count} NEW records!")
        else: print(f"[Success] Database is fully up-to-date. No new records found.")

    else:
        print("   [Success] Database is already up-to-date (0 new records).")

    conn.close()

    # 🌟 NEW FALLBACK CHECKER: Scan dates from latest stored record up to today
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(Arrival_Date) FROM variety_prices")
    latest_rec_row = cursor.fetchone()
    
    if latest_rec_row and latest_rec_row[0]:
        latest_rec_date = datetime.strptime(latest_rec_row[0], "%Y-%m-%d")
    else:
        latest_rec_date = datetime.now() - timedelta(days=7)

    today = datetime.now()
    
    if (today - latest_rec_date).days >= 1:
        print(f"   [Fallback Checker] Primary data is behind (Last record: {latest_rec_date.strftime('%Y-%m-%d')}). Invoking Fallback Web Scraper...")
        try:
            import sys
            import subprocess
            subprocess.run([sys.executable, "scrape_fallback.py"], check=True)
            print("   [Fallback Checker] Scraper completed. Syncing data via sync_historical.py...")
            subprocess.run([sys.executable, "sync_historical.py"], check=True)
        except Exception as e:
            print(f"   [Fallback Checker] Error running fallback scraper: {e}")
        
    conn.close()

def get_price_by_nl(user_query, crop=None, location=None):
    if crop: crop = standardize_crop_name(crop)
    if location: location = standardize_market_name(location)
    conn = get_db_connection()
    cursor = conn.cursor()
    query = """
        SELECT Arrival_Date, Min_Price, Max_Price, Modal_Price 
        FROM variety_prices 
        WHERE Market LIKE ? AND Commodity LIKE ? AND Arrival_Date >= date('now', '-30 days') 
        ORDER BY Arrival_Date DESC LIMIT 1
    """
    cursor.execute(query, (f'%{location}%', f'%{crop}%'))
    row = cursor.fetchone()
    conn.close()
    if not row: return f"Database result: No recent price data found for {crop} in {location}."
    return (f"Database result for {crop} in {location} on {row['Arrival_Date']}: "
            f"Min ₹{row['Min_Price']}, Max ₹{row['Max_Price']}, Average/Modal ₹{row['Modal_Price']} per quintal.")


# =====================================================================
# --- THE HEAVY MATH ENGINE (RUNS AT MIDNIGHT) ---
# =====================================================================
def _run_heavy_prophet_math(city, crop, days_ahead=7):
    """The full-accuracy engine. Uses 365 days of data. Slow but highly accurate."""
    logging.getLogger('cmdstanpy').setLevel(logging.WARNING)
    logging.getLogger('prophet').setLevel(logging.WARNING)

    conn = get_db_connection()
    # 🌟 UPGRADE: Fetch 365 days to allow yearly seasonality!
    query = """
        SELECT Arrival_Date as ds, Modal_Price as y 
        FROM variety_prices 
        WHERE Market LIKE ? AND Commodity LIKE ? 
          AND Arrival_Date >= date('now', '-365 days')
          AND Arrival_Date IS NOT NULL 
          AND Modal_Price IS NOT NULL
        ORDER BY Arrival_Date ASC
    """
    df = pd.read_sql_query(query, conn, params=(f'%{city}%', f'%{crop}%'))
    
    if len(df) < 5:
        conn.close()
        return f"⚠️ Not enough recent market data to forecast future dates for {crop} in {city}."

    df['ds'] = pd.to_datetime(df['ds'])
    hub_city = "Mumbai" if "pune" in city.lower() else "Pune"
    
    # 🌟 FIX: Explicitly name the column 'hub_price' so Pandas doesn't crash!
    hub_query = """
        SELECT Arrival_Date as ds, Modal_Price as hub_price 
        FROM variety_prices 
        WHERE Market LIKE ? AND Commodity LIKE ? 
          AND Arrival_Date >= date('now', '-365 days')
          AND Modal_Price IS NOT NULL
    """
    df_hub = pd.read_sql_query(hub_query, conn, params=(f'%{hub_city}%', f'%{crop}%'))
    conn.close()
    df_hub['ds'] = pd.to_datetime(df_hub['ds'])

    # 🌟 FULL ACCURACY MODE RESTORED
    m = Prophet(
        daily_seasonality=False,   # type: ignore
        yearly_seasonality=True,   # type: ignore
        weekly_seasonality=True,   # type: ignore
        changepoint_prior_scale=0.05
    )

    if not df_hub.empty and len(df_hub) > 5:
        df = df.merge(df_hub, on='ds', how='left')
        df['hub_lag_1'] = df['hub_price'].shift(1).ffill().bfill()
        m.add_regressor('hub_lag_1')
    
    m.fit(df)

    last_db_date = df['ds'].max()
    today = pd.Timestamp(datetime.now().date())
    gap_days = max(0, (today - last_db_date).days)
    future = m.make_future_dataframe(periods=gap_days + days_ahead)
    
    if 'hub_lag_1' in df.columns:
        raw_avg = df['hub_price'].dropna().tail(3).mean()
        last_hub_avg = float(raw_avg) if pd.notna(raw_avg) else 0.0
        
        # 🌟 THE BULLETPROOF FIX: Map values by the exact date, completely ignoring lengths!
        lag_mapping = df.drop_duplicates(subset=['ds']).set_index('ds')['hub_lag_1']
        future['hub_lag_1'] = future['ds'].map(lag_mapping).fillna(last_hub_avg)

    forecast = m.predict(future)
    future_forecast = forecast[forecast['ds'] > today].head(days_ahead)

    # Calculate a sensible price floor (e.g. 75% of last recorded price) to prevent extrapolations going to zero
    last_price = float(df['y'].iloc[-1]) if not df.empty else 0.0
    floor_price = max(last_price * 0.75, 10.0)

    forecast_data = []
    if future_forecast.empty:
        return "⚠️ Not enough recent market data to forecast future dates."
    else:
        for index, row in future_forecast.iterrows():
            future_date_str = row['ds'].strftime("%d %b")
            future_price = max(round(floor_price), round(row['yhat'])) 
            forecast_data.append(f"• {future_date_str}: ₹{future_price}")
            
    return "\n".join(forecast_data)


# =====================================================================
# --- THE CHATBOT FETCH ENGINE (INSTANT & CACHED) ---
# =====================================================================
def predict_price(city, crop, days_ahead=7):
    """The instant fetcher. Looks in the DB first. If missing, runs math live as fallback."""
    crop = str(standardize_crop_name(crop) or "")
    city = str(standardize_market_name(city) or "")
    today_str = datetime.now().strftime("%Y-%m-%d")

    # 1. Check the Vault (Zero Math!)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT Forecast_Text FROM prophet_cache 
        WHERE Market LIKE ? AND Commodity LIKE ? AND Forecast_Date = ?
    ''', (f'%{city}%', f'%{crop}%', today_str))
    
    cached_row = cursor.fetchone()
    if cached_row:
        print(f"⚡ FAST CACHE HIT: Retrieved pre-calculated Prophet data for {crop} in {city}!")
        forecast_text = cached_row['Forecast_Text']
    else:
        # 2. Fallback: If it's a rare crop not calculated at midnight, do it live now!
        print(f"⚙️ CACHE MISS: Running live Facebook Prophet Engine for {crop} in {city}...")
        forecast_text = _run_heavy_prophet_math(city, crop, days_ahead)
        
        # Save it to cache so the next request is instant!
        cursor.execute('''
            INSERT OR REPLACE INTO prophet_cache (Market, Commodity, Forecast_Date, Forecast_Text)
            VALUES (?, ?, ?, ?)
        ''', (city, crop, today_str, forecast_text))
        conn.commit()

    # Add Algorithmic & News Context (Always instant)
    algo_text = "- No advanced algorithmic data found for this market."
    try:
        a_conn = sqlite3.connect(ANALYSIS_DB_PATH)
        a_conn.row_factory = sqlite3.Row
        a_cur = a_conn.cursor()
        a_cur.execute('''
            SELECT MACD_Value, RSI_14, Dynamic_Momentum, Market_Condition, Signal_Strength
            FROM market_analysis WHERE Market LIKE ? AND Commodity LIKE ? ORDER BY Analysis_Date DESC LIMIT 1
        ''', (f'%{city}%', f'%{crop}%'))
        algo_row = a_cur.fetchone()
        if algo_row:
            algo_text = (
                f"- Market Condition: {algo_row['Market_Condition']}\n"
                f"- Momentum (Trend): {algo_row['Dynamic_Momentum']}\n"
                f"- RSI (14-Day Overbought/Oversold): {algo_row['RSI_14']}\n"
                f"- MACD (Trend Reversal Indicator): {algo_row['MACD_Value']}\n"
                f"- Overall Signal Strength: {algo_row['Signal_Strength']}/100"
            )
        a_conn.close()
    except Exception: pass

    news_text = "- No recent market-moving news detected."
    try:
        n_conn = sqlite3.connect(NEWS_DB_PATH)
        n_conn.row_factory = sqlite3.Row
        n_cur = n_conn.cursor()
        n_cur.execute('''
            SELECT title, sentiment FROM news 
            WHERE title LIKE ? COLLATE NOCASE AND scraped_at >= datetime('now', '-14 days')
            ORDER BY scraped_at DESC LIMIT 3
        ''', (f'%{crop}%',))
        news_rows = n_cur.fetchall()
        if news_rows: news_text = "\n".join([f"- {r['title']} ({r['sentiment']})" for r in news_rows])
        n_conn.close()
    except Exception: pass

    conn.close()
    
    return (
        f"--- AI PROPHET FORECAST FOR {crop} IN {city} ---\n"
        f"1. 7-Day Cyclical Forecast:\n{forecast_text}\n\n"
        f"2. Quantitative Market Indicators:\n{algo_text}\n\n"
        f"3. Recent News Sentiment:\n{news_text}\n"
        f"Instruct the user based on this advanced data."
    )

# =====================================================================
# --- THE BATCH GENERATOR (TRIGGERED BY SERVER.PY AT 1 AM) ---
# =====================================================================
def batch_generate_forecasts(user_pairs=None):
    """Runs at midnight to pre-calculate everything!"""
    print("\n" + "="*50)
    print("🌙 INITIATING MIDNIGHT BATCH FORECAST GENERATOR...")
    print("="*50)
    
    setup_database() # Ensure cache table exists
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    # 1. The Core Essential Markets & Crops
    core_crops = ["Tomato", "Onion", "Cotton", "Soybean", "Wheat", "Maize", "Tur", "Gram", "Brinjal"]
    core_markets = ["Pune", "Mumbai", "Kalyan", "Panvel", "Nashik", "Nagpur", "Lasalgaon"]
    
    pairs_to_run = set()
    for m in core_markets:
        for c in core_crops:
            pairs_to_run.add((m, c))
            
    # 2. Add custom user locations/crops pulled from Firebase
    if user_pairs:
        for m, c in user_pairs:
            pairs_to_run.add((standardize_market_name(m), standardize_crop_name(c)))

    conn = get_db_connection()
    cursor = conn.cursor()
    
    success_count = 0
    total = len(pairs_to_run)
    
    print(f"📊 Preparing to pre-calculate {total} market combinations. This may take a while...")
    
    for idx, (market, crop) in enumerate(pairs_to_run):
        try:
            print(f"   [{idx+1}/{total}] Processing {crop} in {market}...")
            forecast_text = _run_heavy_prophet_math(market, crop, days_ahead=7)
            
            cursor.execute('''
                INSERT OR REPLACE INTO prophet_cache (Market, Commodity, Forecast_Date, Forecast_Text)
                VALUES (?, ?, ?, ?)
            ''', (market, crop, today_str, forecast_text))
            conn.commit()
            success_count += 1
        except Exception as e:
            print(f"      ⚠️ Failed batch calculation for {crop}/{market}: {e}")

    conn.close()
    print("="*50)
    print(f"✅ MIDNIGHT BATCH COMPLETE: Successfully cached {success_count}/{total} forecasts.")
    print("="*50)