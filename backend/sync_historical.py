import sqlite3
import os
from datetime import datetime

print("Syncing all historical records from scraped_prices.db into prices.db...")

scraped_conn = sqlite3.connect("data/scraped_prices.db")
scraped_cursor = scraped_conn.cursor()
scraped_cursor.execute("SELECT state, district, market, commodity, variety, grade, arrival_date, min_price, max_price, modal_price FROM scraped_prices")
rows = scraped_cursor.fetchall()
scraped_conn.close()

main_conn = sqlite3.connect("data/prices.db")
main_cursor = main_conn.cursor()

# Ensure the table and unique constraints exist
main_cursor.execute('''
    CREATE TABLE IF NOT EXISTS variety_prices (
        State TEXT, District TEXT, Market TEXT, Commodity TEXT,
        Variety TEXT, Grade TEXT, Arrival_Date DATE,
        Min_Price REAL, Max_Price REAL, Modal_Price REAL,
        UNIQUE(Market, Commodity, Variety, Arrival_Date)
    )
''')
main_conn.commit()

insert_data = []
for r in rows:
    state, district, market, commodity, variety, grade, arr_date_str, min_p, max_p, modal_p = r
    sql_date = None
    for fmt in ("%d/%m/%Y", "%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y", "%d-%b-%y"):
        try:
            sql_date = datetime.strptime(str(arr_date_str).strip(), fmt).strftime("%Y-%m-%d")
            break
        except ValueError:
            continue
            
    if not sql_date:
        continue

    insert_data.append((state, district, market, commodity, variety, grade, sql_date, min_p, max_p, modal_p))

if insert_data:
    main_cursor.executemany('''
        INSERT OR IGNORE INTO variety_prices 
        (State, District, Market, Commodity, Variety, Grade, Arrival_Date, Min_Price, Max_Price, Modal_Price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', insert_data)
    main_conn.commit()
    print(f"Successfully synced {main_cursor.rowcount} historical scraped records into prices.db!")

main_conn.close()
