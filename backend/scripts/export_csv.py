import sqlite3
import csv
import os

# --- Configuration ---
BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "data", "prices.db")
CSV_PATH = os.path.join(BASE_DIR, "prices_export.csv")

def export_db_to_csv():
    if not os.path.exists(DB_PATH):
        print(f"❌ ERROR: Could not find database at {DB_PATH}")
        return

    print("📂 Connecting to the database...")
    
    # Initialize conn to None to prevent "unbound" errors
    conn = None
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM prices")
        column_headers = [description[0] for description in cursor.description]

        print(f"📝 Writing to {CSV_PATH}...")
        print("⏳ Please wait, processing 1.3 million records in chunks...")

        with open(CSV_PATH, mode='w', newline='', encoding='utf-8') as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(column_headers)
            
            rows_written = 0
            while True:
                chunk = cursor.fetchmany(10000)
                if not chunk:
                    break 
                
                writer.writerows(chunk)
                rows_written += len(chunk)
                
                if rows_written % 100000 == 0:
                    print(f"   -> Successfully exported {rows_written:,} rows...")

        print(f"\n✅ DONE! Successfully exported a total of {rows_written:,} records.")
        print(f"📁 File saved at: {CSV_PATH}")

    except Exception as e:
        print(f"❌ FAILED: {e}")
    finally:
        # Now it is safe to check because conn definitely exists
        if conn is not None:
            conn.close()

if __name__ == "__main__":
    export_db_to_csv()