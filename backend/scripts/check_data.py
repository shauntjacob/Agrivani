import sqlite3
import os

# Connect to the exact database file your scraper uses
BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "../data", "prices.db")

def audit_database():
    print("\n" + "="*40)
    print("🗄️ AGRIVANI DATABASE AUDIT")
    print("="*40)

    if not os.path.exists(DB_PATH):
        print(f"❌ Database file not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 1. Total Records
        cursor.execute("SELECT COUNT(*) FROM variety_prices")
        total_records = cursor.fetchone()[0]
        print(f"📊 Total Records Saved: {total_records}")

        if total_records == 0:
            print("\n⚠️ The database is completely empty.")
            return

        # 2. Date Range
        cursor.execute("SELECT MIN(Arrival_Date), MAX(Arrival_Date) FROM variety_prices")
        min_date, max_date = cursor.fetchone()
        print(f"📅 Date Range: {min_date}  -->  {max_date}")

        # 3. Crop Breakdown
        print("\n🌱 Top 10 Crops in Database:")
        cursor.execute("""
            SELECT Commodity, COUNT(*) 
            FROM variety_prices 
            GROUP BY Commodity 
            ORDER BY COUNT(*) DESC 
            LIMIT 10
        """)
        for crop, count in cursor.fetchall():
            print(f"   - {crop}: {count} records")

        # 4. The 5 Most Recent Entries
        print("\n🔍 5 Most Recent Entries:")
        cursor.execute("""
            SELECT Arrival_Date, Market, Commodity, Modal_Price 
            FROM variety_prices 
            ORDER BY Arrival_Date DESC 
            LIMIT 5
        """)
        for row in cursor.fetchall():
            print(f"   [{row[0]}] {row[1]} APMC | {row[2]} | ₹{row[3]}/quintal")

    except sqlite3.OperationalError as e:
        print(f"\n❌ Error reading database: {e}")
        print("The table 'variety_prices' might not exist yet.")
    finally:
        conn.close()
        print("="*40 + "\n")

if __name__ == "__main__":
    audit_database()