import sqlite3
from pathlib import Path

# Connect to your newly built database
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "prices.db"
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Ask SQL for the oldest and newest dates
cursor.execute("SELECT MIN(Arrival_Date), MAX(Arrival_Date), COUNT(*) FROM variety_prices")
result = cursor.fetchone()

print(f"📊 Total Records: {result[2]}")
print(f"📅 Oldest Record: {result[0]}")
print(f"📅 Newest Record: {result[1]}")

conn.close()