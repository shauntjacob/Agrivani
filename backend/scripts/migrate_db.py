import sqlite3
import os
from datetime import datetime

# Path to your existing database
BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "data", "prices.db")

def fix_date_format():
    if not os.path.exists(DB_PATH):
        print("❌ Error: prices.db not found at", DB_PATH)
        return

    print(f"🔄 Opening database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Get all records
    try:
        cursor.execute("SELECT id, arrival_date FROM prices")
        rows = cursor.fetchall()
    except Exception as e:
        print(f"❌ Error reading DB: {e}")
        return

    print(f"📊 Found {len(rows)} records. Checking formats...")
    
    updated_count = 0
    error_count = 0

    # 2. Loop through every single record
    for row_id, old_date in rows:
        new_date = None
        
        # Check if it's already correct (YYYY-MM-DD)
        try:
            datetime.strptime(old_date, "%Y-%m-%d")
            continue # Skip if already good
        except ValueError:
            pass # It's not YYYY-MM-DD, so we need to fix it

        # Try to parse the old format (DD/MM/YYYY)
        try:
            dt_obj = datetime.strptime(old_date, "%d/%m/%Y")
            new_date = dt_obj.strftime("%Y-%m-%d") # Convert to YYYY-MM-DD
        except ValueError:
            # If it's some other weird format, just ignore or print error
            # print(f"⚠️ skipped weird date: {old_date}")
            error_count += 1
            continue

        # 3. Update the record
        if new_date:
            cursor.execute("UPDATE prices SET arrival_date = ? WHERE id = ?", (new_date, row_id))
            updated_count += 1
            
            # Show progress every 1000 items
            if updated_count % 1000 == 0:
                print(f"   ...fixed {updated_count} records...")

    conn.commit()
    conn.close()
    
    print("-" * 40)
    print(f"✅ MIGRATION COMPLETE!")
    print(f"   - Fixed records: {updated_count}")
    print(f"   - Errors/Skipped: {error_count}")
    print(f"   - Total Scanned: {len(rows)}")
    print("🚀 You can now restart server.py safely.")

if __name__ == "__main__":
    fix_date_format()