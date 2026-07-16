import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime, date
from pathlib import Path
from firebase_engine import get_user_profile

# 1. SETUP PATHS
BACKEND_DIR = Path(__file__).resolve().parent.parent
PRICES_DB_PATH = BACKEND_DIR / "data" / "prices.db"          # Read-Only History
ANALYSIS_DB_PATH = BACKEND_DIR / "data" / "market_analysis.db" # New Write Destination

def setup_advanced_analysis_table(cursor):
    """Creates a robust table for algorithmic analysis in the new database."""
    cursor.execute('DROP TABLE IF EXISTS market_analysis')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS market_analysis (
            Market TEXT,
            Commodity TEXT,
            Analysis_Date DATE,
            Current_Price REAL,
            MACD_Value REAL,
            RSI_14 REAL,
            Volatility_Band_Upper REAL,
            Volatility_Band_Lower REAL,
            Dynamic_Momentum TEXT,
            Market_Condition TEXT,
            Signal_Strength INTEGER, 
            PRIMARY KEY (Market, Commodity, Analysis_Date)
        )
    ''')

def calculate_rsi(series, period=14):
    """Calculates Relative Strength Index dynamically."""
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).ewm(alpha=1/period, adjust=False).mean()
    loss = (-delta.where(delta < 0, 0)).ewm(alpha=1/period, adjust=False).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def run_market_analysis(force_run=False):
    print("📈 Initiating Algorithmic Trading Engine for Agri-Commodities...")
    today_str = date.today().strftime("%Y-%m-%d")
    
    # 2. CONNECT TO THE NEW ANALYSIS DB
    analysis_conn = sqlite3.connect(ANALYSIS_DB_PATH)
    analysis_cursor = analysis_conn.cursor()
    setup_advanced_analysis_table(analysis_cursor)
    
    if not force_run:
        analysis_cursor.execute("SELECT COUNT(*) FROM market_analysis WHERE Analysis_Date = ?", (today_str,))
        if analysis_cursor.fetchone()[0] > 0:
            print(f"✅ Dynamic Analysis for {today_str} already cached. Skipping.")
            analysis_conn.close()
            return

    print("🔬 Reading from prices.db to calculate MACD, RSI, and Bollinger Volatility...")
    
    # 3. CONNECT TO THE RAW PRICES DB (Read-Only)
    try:
        prices_conn = sqlite3.connect(PRICES_DB_PATH)
        query = """
            SELECT Market, Commodity, Arrival_Date, Modal_Price 
            FROM variety_prices 
            WHERE Arrival_Date >= date('now', '-120 days')
            ORDER BY Arrival_Date ASC
        """
        df_main = pd.read_sql_query(query, prices_conn)
        prices_conn.close() # Close immediately to keep your raw data safe
    except Exception as e:
        print(f"Error reading prices.db: {e}")
        df_main = pd.DataFrame()

    df_fallback = pd.DataFrame()
    try:
        fallback_db_path = BACKEND_DIR / "data" / "fallback_prices.db"
        if fallback_db_path.exists():
            fallback_conn = sqlite3.connect(fallback_db_path)
            df_fallback = pd.read_sql_query(query, fallback_conn)
            fallback_conn.close()
    except Exception as e:
        pass

    df = pd.concat([df_main, df_fallback], ignore_index=True)
    if not df.empty:
        df = df.drop_duplicates(subset=['Market', 'Commodity', 'Arrival_Date'], keep='last')
        df = df.sort_values(by='Arrival_Date').reset_index(drop=True)

    if df.empty:
        print("Not enough data to perform advanced analysis.")
        analysis_conn.close()
        return


    df['Arrival_Date'] = pd.to_datetime(df['Arrival_Date'])
    results = []
    
    grouped = df.groupby(['Market', 'Commodity'])
    
    for (market, commodity), group in grouped:
        group = group.sort_values('Arrival_Date').copy()
        
        if len(group) < 10:
            continue
            
        prices = group['Modal_Price']
        
        # MACD
        ema_12 = prices.ewm(span=12, adjust=False).mean()
        ema_26 = prices.ewm(span=26, adjust=False).mean()
        macd = ema_12 - ema_26
        macd_signal = macd.ewm(span=9, adjust=False).mean()
        macd_histogram = macd - macd_signal
        
        # RSI
        rsi = calculate_rsi(prices, 14)
        
        # Bollinger Bands
        sma_20 = prices.rolling(window=20).mean()
        std_20 = prices.rolling(window=20).std()
        upper_band = sma_20 + (std_20 * 2)
        lower_band = sma_20 - (std_20 * 2)
        
        latest_price = prices.iloc[-1]
        curr_macd = macd.iloc[-1]
        curr_hist = macd_histogram.iloc[-1]
        curr_rsi = rsi.iloc[-1]
        curr_upper = upper_band.iloc[-1]
        curr_lower = lower_band.iloc[-1]
        
        signal_strength = 0
        momentum = "Neutral"
        condition = "Normal Volume"
        
        if curr_hist > 0 and curr_macd > 0:
            momentum = "Strong Bullish Uptrend"
            signal_strength += 40
        elif curr_hist < 0 and curr_macd < 0:
            momentum = "Strong Bearish Downtrend"
            signal_strength -= 40
            
        if curr_rsi > 70:
            condition = "Overbought (Market Flooded - Price Drop Risk)"
            signal_strength -= 30
        elif curr_rsi < 30:
            condition = "Oversold (Supply Shortage - Price Spike Likely)"
            signal_strength += 30
            
        if latest_price >= curr_upper:
            condition = "Extreme Bullish Breakout (Above Upper Band)"
            signal_strength += 30
        elif latest_price <= curr_lower:
            condition = "Extreme Bearish Crash (Below Lower Band)"
            signal_strength -= 30

        signal_strength = max(-100, min(100, signal_strength))
            
        results.append((
            market, commodity, today_str, 
            latest_price, round(curr_macd, 2), round(curr_rsi, 2), 
            round(curr_upper, 2), round(curr_lower, 2), 
            momentum, condition, signal_strength
        ))
        
    # 4. SAVE TO THE NEW ANALYSIS DB
    analysis_cursor.executemany('''
        INSERT OR REPLACE INTO market_analysis 
        (Market, Commodity, Analysis_Date, Current_Price, MACD_Value, RSI_14, 
         Volatility_Band_Upper, Volatility_Band_Lower, Dynamic_Momentum, Market_Condition, Signal_Strength)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', results)
    
    analysis_conn.commit()
    analysis_conn.close()
    print(f"🎉 Success! Generated dynamic algorithmic profiles for {len(results)} markets in market_analysis.db.")

if __name__ == "__main__":
    run_market_analysis(force_run=True)