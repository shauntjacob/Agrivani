import sqlite3
import os

# Connect to your existing database
db_path = os.path.join(os.path.dirname(__file__), "data", "prices.db")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- 🔍 DIAGNOSTIC REPORT ---")

# 1. CHECK MARKET NAMES (that sound like 'Ulhasnagar' or 'Kalyan')
print("\n📍 MARKETS IN DB (Matches for 'Ulhas' or 'Kalyan'):")
rows = cursor.execute("SELECT DISTINCT market FROM prices WHERE market LIKE '%Ulhas%' OR market LIKE '%Kalyan%'").fetchall()
for row in rows:
    print(f"   - '{row[0]}'")

if not rows:
    print("   ⚠️ NO MATCHES FOUND! (This is the problem)")

# 2. CHECK CROP NAMES (for 'Onion' or 'Rice')
print("\n🌾 CROPS IN DB (Matches for 'Onion' or 'Rice'):")
rows = cursor.execute("SELECT DISTINCT commodity FROM prices WHERE commodity LIKE '%Onion%' OR commodity LIKE '%Rice%' LIMIT 10").fetchall()
for row in rows:
    print(f"   - '{row[0]}'")

# 3. CHECK A SPECIFIC COMBINATION (To see if data links up)
print("\n🔗 CHECKING LINK (Ulhasnagar + Rice):")
# We use a very broad search to see if ANY record exists
rows = cursor.execute("SELECT * FROM prices WHERE market LIKE '%Ulhasnagar%' AND commodity LIKE '%Rice%' LIMIT 1").fetchall()
if rows:
    print(f"   ✅ SUCCESS! Found record: {rows[0]}")
else:
    print("   ❌ FAILURE! No record connects Ulhasnagar and Rice.")

conn.close()