import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "../data", "prices.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Get today's actual date string (e.g., "2026-03-13")
today_str = datetime.now().strftime("%Y-%m-%d")

print(f"🧹 Sweeping the database for time-traveling crops from after {today_str}...")

# Delete the future records!
cursor.execute("DELETE FROM variety_prices WHERE Arrival_Date > ?", (today_str,))
deleted_count = cursor.rowcount

conn.commit()

# Check the new reality
cursor.execute("SELECT MAX(Arrival_Date) FROM variety_prices")
new_max = cursor.fetchone()[0]

conn.close()

print(f"🗑️ Deleted {deleted_count} corrupted future records.")
print(f"📅 Your true latest database date is now: {new_max}")