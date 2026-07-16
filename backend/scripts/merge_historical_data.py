import os
import sqlite3
import pandas as pd
from pathlib import Path

# 1. SETUP PATHS
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
RAW_DIR = DATA_DIR / "raw_downloads"
DB_PATH = DATA_DIR / "prices.db"

def merge_and_build_db():
    # Make sure the raw_downloads folder exists
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    
    # Find all CSV and Excel files in the folder
    files = list(RAW_DIR.glob("*.csv")) + list(RAW_DIR.glob("*.xlsx")) + list(RAW_DIR.glob("*.xls"))
    
    if not files:
        print(f"❌ No files found in {RAW_DIR}")
        print("Please place your downloaded historical files there and run again.")
        return

    print(f"📂 Found {len(files)} files to merge.")
    all_dataframes = []

    for file in files:
        print(f"📄 Reading {file.name}...")
        try:
            # Read CSV or Excel
            if file.suffix.lower() == '.csv':
                df = pd.read_csv(file)
            else:
                # Some government 'xls' files are actually HTML tables. 
                # If read_excel fails, pandas read_html can catch it.
                try:
                    df = pd.read_excel(file)
                except ValueError:
                    df = pd.read_html(file)[0]

            # Standardize Agmarknet column names to match our DB schema
            rename_map = {
                'District Name': 'District',
                'Market Name': 'Market',
                'Price Date': 'Arrival_Date',
                'Reported Date': 'Arrival_Date',
                'Min Price (Rs./Quintal)': 'Min_Price',
                'Max Price (Rs./Quintal)': 'Max_Price',
                'Modal Price (Rs./Quintal)': 'Modal_Price',
            }
            df = df.rename(columns=rename_map)

            # Clean up column spaces and casing
            df.columns = [str(c).strip().replace(' ', '_').capitalize() for c in df.columns]
            
            # Fix specific case issues after capitalization
            if 'Arrival_date' in df.columns: df.rename(columns={'Arrival_date': 'Arrival_Date'}, inplace=True)
            if 'Min_price' in df.columns: df.rename(columns={'Min_price': 'Min_Price'}, inplace=True)
            if 'Max_price' in df.columns: df.rename(columns={'Max_price': 'Max_Price'}, inplace=True)
            if 'Modal_price' in df.columns: df.rename(columns={'Modal_price': 'Modal_Price'}, inplace=True)

            # Ensure State column exists
            if 'State' not in df.columns:
                df['State'] = 'Maharashtra'

            all_dataframes.append(df)
            
        except Exception as e:
            print(f"⚠️ Could not process {file.name}: {e}")

    if not all_dataframes:
        print("❌ No data could be extracted.")
        return

    # 2. MERGE EVERYTHING
    print("🔄 Merging all historical data into one master table...")
    merged_df = pd.concat(all_dataframes, ignore_index=True)

    # 3. PARSE DATES AND SORT
    print("📅 Formatting dates and sorting chronologically...")
    if 'Arrival_Date' in merged_df.columns:
        # Convert to actual datetime objects, sort, then format to YYYY-MM-DD
        merged_df['Arrival_Date'] = pd.to_datetime(merged_df['Arrival_Date'], errors='coerce')
        merged_df = merged_df.sort_values(by='Arrival_Date')
        merged_df['Arrival_Date'] = merged_df['Arrival_Date'].dt.date 
    else:
        print("⚠️ Warning: Could not find 'Arrival_Date' column. Sorting skipped.")

    # 4. FILTER EXACT DB COLUMNS
    db_columns = ['State', 'District', 'Market', 'Commodity', 'Variety', 'Grade', 'Arrival_Date', 'Min_Price', 'Max_Price', 'Modal_Price']
    
    # Fill in missing columns with None so the database doesn't crash
    for col in db_columns:
        if col not in merged_df.columns:
            merged_df[col] = None

    final_df = merged_df[db_columns]

    # Drop rows where there is no actual price or market data (cleaning garbage data)
    final_df = final_df.dropna(subset=['Market', 'Commodity', 'Modal_Price'])

    # 5. SAVE TO SQLITE DATABASE
    print(f"💾 Saving {len(final_df)} clean, sorted records to prices.db...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create the table structure
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS variety_prices (
            State TEXT, District TEXT, Market TEXT, Commodity TEXT,
            Variety TEXT, Grade TEXT, Arrival_Date DATE,
            Min_Price REAL, Max_Price REAL, Modal_Price REAL
        )
    ''')
    
    # Create the AI search indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_market ON variety_prices(Market)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_commodity ON variety_prices(Commodity)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_date ON variety_prices(Arrival_Date)")

    # We use if_exists='replace' to wipe out the old 49k test table and replace it with this master 3-year table
    final_df.to_sql('variety_prices', conn, if_exists='replace', index=False)
    
    conn.commit()
    conn.close()
    
    print("🎉 SUCCESS! Your 3-5 year predictive AI database is perfectly built!")

if __name__ == "__main__":
    merge_and_build_db()