from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from datetime import datetime
import os
import sqlite3
import time

def create_driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36")
    drv = webdriver.Chrome(options=options)
    wt = WebDriverWait(drv, 15)
    return drv, wt

# RESUME LOGIC: Set these variables to the exact group and commodity to resume from
start_group = "Vegetables"
start_commodity = "Red Gourd"

os.makedirs("data", exist_ok=True)
conn = sqlite3.connect("data/scraped_prices.db")
cursor = conn.cursor()
cursor.execute("""
CREATE TABLE IF NOT EXISTS scraped_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    state TEXT,
    district TEXT,
    market TEXT,
    commodity_group TEXT,
    commodity TEXT,
    variety TEXT,
    grade TEXT,
    min_price REAL,
    max_price REAL,
    modal_price REAL,
    price_unit TEXT,
    price_date TEXT,
    arrival_quantity REAL,
    arrival_unit TEXT,
    arrival_date TEXT,
    UNIQUE(state, district, market, commodity, variety, price_date)
)
""")
conn.commit()
conn.close()

def wait_for_loader(drv):
    try:
        WebDriverWait(drv, 15).until(
            EC.invisibility_of_element_located((By.XPATH, "//div[contains(@class, 'bg-white/60') or contains(@class, 'z-30')]"))
        )
        time.sleep(1)
    except:
        pass

def select_from_dropdown(drv, wt, label_text, option_text=None, exclude_text=None, pick_first=False):
    wait_for_loader(drv)
    xpath_btn = f"//label[contains(text(), '{label_text}')"
    if exclude_text:
        xpath_btn += f" and not(contains(text(), '{exclude_text}'))"
    xpath_btn += "]/preceding-sibling::div[contains(@class, 'peer')]"
    
    btn = wt.until(EC.element_to_be_clickable((By.XPATH, xpath_btn)))
    drv.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
    time.sleep(1)
    drv.execute_script("arguments[0].click();", btn)
    time.sleep(2)

    options = drv.find_elements(By.XPATH, "//div[contains(@class, 'absolute')]//div")
    displayed_options = [opt for opt in options if opt.is_displayed() and opt.text and "\n" not in opt.text]

    if pick_first:
        if displayed_options:
            first_opt = displayed_options[0]
            first_opt_text = first_opt.text
            drv.execute_script("arguments[0].click();", first_opt)
            print(f"Automatically selected option: '{first_opt_text}' in dropdown '{label_text}'")
            time.sleep(2)
            return first_opt_text
        else:
            raise Exception(f"No visible options found in dropdown '{label_text}'")
    else:
        clicked = False
        for opt in displayed_options:
            if opt.text.strip() == option_text or option_text in opt.text:
                drv.execute_script("arguments[0].click();", opt)
                clicked = True
                break
        if clicked:
            print(f"Selected '{option_text}' in dropdown '{label_text}'")
        else:
            raise Exception(f"Could not find option matching '{option_text}' in dropdown '{label_text}'")
    time.sleep(2)

def open_dropdown_and_get_options(drv, wt, label_text, exclude_text=None):
    wait_for_loader(drv)
    xpath_btn = f"//label[contains(text(), '{label_text}')"
    if exclude_text:
        xpath_btn += f" and not(contains(text(), '{exclude_text}'))"
    xpath_btn += "]/preceding-sibling::div[contains(@class, 'peer')]"
    
    btn = wt.until(EC.element_to_be_clickable((By.XPATH, xpath_btn)))
    drv.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn)
    time.sleep(1)
    drv.execute_script("arguments[0].click();", btn)
    time.sleep(2)

    options = drv.find_elements(By.XPATH, "//div[contains(@class, 'absolute')]//div")
    displayed_options = [opt for opt in options if opt.is_displayed() and opt.text and "\n" not in opt.text]
    displayed_texts = [opt.text.strip() for opt in displayed_options]
    return btn, displayed_texts

def select_option_from_open_dropdown(drv, displayed_texts, option_text):
    options = drv.find_elements(By.XPATH, "//div[contains(@class, 'absolute')]//div")
    displayed_options = [opt for opt in options if opt.is_displayed() and opt.text and "\n" not in opt.text]
    for opt in displayed_options:
        if opt.text.strip() == option_text or option_text in opt.text:
            drv.execute_script("arguments[0].click();", opt)
            print(f"Selected '{option_text}' from open dropdown")
            return True
    return False

def extract_and_save_data(drv, page_num=1):
    wait_for_loader(drv)
    time.sleep(2)
    table_rows = drv.find_elements(By.XPATH, "//table//tr")
    if len(table_rows) > 2:
        conn = sqlite3.connect("data/scraped_prices.db")
        cursor = conn.cursor()
        inserted_count = 0
        for row in table_rows[2:]:
            cells = row.find_elements(By.XPATH, "./td")
            if len(cells) >= 15:
                row_data = [c.text.strip() for c in cells]
                try:
                    cursor.execute("""
                        SELECT 1 FROM scraped_prices 
                        WHERE state=? AND district=? AND market=? AND commodity=? AND variety=? AND price_date=?
                    """, (row_data[0], row_data[1], row_data[2], row_data[4], row_data[5], row_data[11]))
                    if cursor.fetchone() is None:
                        min_p = float(row_data[7].replace(",", "")) if row_data[7] else 0.0
                        max_p = float(row_data[8].replace(",", "")) if row_data[8] else 0.0
                        modal_p = float(row_data[9].replace(",", "")) if row_data[9] else 0.0
                        arr_q = float(row_data[12].replace(",", "")) if row_data[12] else 0.0

                        cursor.execute("""
                        INSERT OR IGNORE INTO scraped_prices (
                            state, district, market, commodity_group, commodity, variety, grade, 
                            min_price, max_price, modal_price, price_unit, price_date, 
                            arrival_quantity, arrival_unit, arrival_date
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            row_data[0], row_data[1], row_data[2], row_data[3], row_data[4], 
                            row_data[5], row_data[6], min_p, max_p, modal_p, row_data[10], 
                            row_data[11], arr_q, row_data[13], row_data[14]
                        ))
                        inserted_count += 1
                except Exception as ex:
                    print(f"Error parsing row: {ex}")
        conn.commit()
        conn.close()
        total_rows_found = len(table_rows) - 2
        print(f"Page {page_num} contains {total_rows_found} total rows. Successfully saved {inserted_count} new rows (skipped {total_rows_found - inserted_count} duplicates).")
    else:
        print(f"No valid table data found on page {page_num}.")

groups_to_scrape = ['Cereals', 'Dry Fruits', 'Fibre Crops', 'Fruits', 'Oil Seeds', 'Pulses', 'Vegetables', 'Spices']

start_processing_group = False
start_processing_comm = False

for group_name in groups_to_scrape:
    if group_name == start_group:
        start_processing_group = True
    if not start_processing_group:
        continue

    print(f"\n===== Processing Group: {group_name} =====")
    driver = None
    original_commodities = []
    try:
        # Create fresh driver to get the list of commodities for the group
        driver, wait = create_driver()
        print("Navigating to AGMARKNET report page...")
        driver.get("https://www.agmarknet.gov.in/daily-price-and-arrival-report")
        time.sleep(5)

        select_from_dropdown(driver, wait, "Price/Arrivals", "Both")
        select_from_dropdown(driver, wait, "Commodity Group", group_name)

        btn, original_commodities = open_dropdown_and_get_options(driver, wait, "Commodity", exclude_text="Group")
        print(f"Found {len(original_commodities)} commodities under group '{group_name}'")

    except Exception as e:
        print(f"Skipping group {group_name} due to error: {e}")
        continue
    finally:
        if driver:
            driver.quit()

    # Process each commodity with a completely fresh driver!
    for idx, comm in enumerate(original_commodities):
        if group_name == start_group and comm == start_commodity:
            start_processing_comm = True
        elif group_name != start_group:
            start_processing_comm = True

        if not start_processing_comm:
            continue

        print(f"\n--- Scraping Commodity {idx+1}/{len(original_commodities)}: {comm} ---")
        driver_comm = None
        try:
            # Re-create fresh driver for each commodity!
            driver_comm, wait_comm = create_driver()
            driver_comm.get("https://www.agmarknet.gov.in/daily-price-and-arrival-report")
            time.sleep(5)

            select_from_dropdown(driver_comm, wait_comm, "Price/Arrivals", "Both")
            select_from_dropdown(driver_comm, wait_comm, "Commodity Group", group_name)
            select_from_dropdown(driver_comm, wait_comm, "Commodity", comm, exclude_text="Group")

            # Select State (Maharashtra)
            try:
                select_from_dropdown(driver_comm, wait_comm, "State", "Maharashtra")
            except Exception as ex_state:
                print(f"Commodity '{comm}' is not available in Maharashtra. Skipping.")
                continue

            # From Date (01-Jan-2026)
            from_date_div = wait_comm.until(EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'From Date')]/parent::div")))
            driver_comm.execute_script("arguments[0].click();", from_date_div)
            time.sleep(1)

            month_select = Select(wait_comm.until(EC.presence_of_element_located((By.XPATH, "//select[option[text()='January']]"))))
            month_select.select_by_visible_text("January")
            time.sleep(1)

            year_select = Select(wait_comm.until(EC.presence_of_element_located((By.XPATH, "//select[option[text()='2026']]"))))
            year_select.select_by_visible_text("2026")
            time.sleep(1)

            day_1 = wait_comm.until(EC.element_to_be_clickable((By.XPATH, "//div[contains(@class, 'grid-cols-7')]//div[text()='1' and not(contains(@class, 'opacity-40'))]")))
            driver_comm.execute_script("arguments[0].click();", day_1)
            time.sleep(1)

            # To Date (Today)
            to_date_div = wait_comm.until(EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'To Date')]/parent::div")))
            driver_comm.execute_script("arguments[0].click();", to_date_div)
            time.sleep(1)

            now = datetime.now()
            month_name = now.strftime("%B")
            day_str = str(now.day)
            year_str = str(now.year)

            month_select_to = Select(wait_comm.until(EC.presence_of_element_located((By.XPATH, f"//select[option[text()='{month_name}']]"))))
            month_select_to.select_by_visible_text(month_name)
            time.sleep(1)

            year_select_to = Select(wait_comm.until(EC.presence_of_element_located((By.XPATH, f"//select[option[text()='{year_str}']]"))))
            year_select_to.select_by_visible_text(year_str)
            time.sleep(1)

            day_el = wait_comm.until(EC.element_to_be_clickable((By.XPATH, f"//div[contains(@class, 'grid-cols-7')]//div[text()='{day_str}' and not(contains(@class, 'opacity-40'))]")))
            driver_comm.execute_script("arguments[0].click();", day_el)
            time.sleep(2)

            # Click Go
            go_btn = wait_comm.until(EC.presence_of_element_located((By.XPATH, "//button[normalize-space(.)='Go']")))
            driver_comm.execute_script("arguments[0].click();", go_btn)
            time.sleep(5)
            wait_for_loader(driver_comm)
            time.sleep(5)

            # Set rows per page to 100
            try:
                rows_select = Select(wait_comm.until(EC.presence_of_element_located((By.XPATH, "//select[option[text()='100']]"))))
                rows_select.select_by_visible_text("100")
                time.sleep(2)
                wait_for_loader(driver_comm)
                time.sleep(3)
            except Exception:
                pass

            # Extract and Save Data from page 1
            extract_and_save_data(driver_comm, page_num=1)

            # Detect total number of pages
            all_num_buttons = driver_comm.find_elements(By.XPATH, "//button[string-length(normalize-space(text())) <= 3 and translate(normalize-space(text()), '0123456789', '')='']")
            page_numbers = []
            for pb in all_num_buttons:
                txt = pb.text.strip()
                if txt.isdigit():
                    page_numbers.append(int(txt))
            max_page = max(page_numbers) if page_numbers else 1
            print(f"Total pages detected: {max_page}")

            # Paginate and extract data from remaining pages
            for page in range(2, max_page + 1):
                print(f"Navigating to page {page} of {max_page}...")
                try:
                    next_btn = driver_comm.find_elements(By.XPATH, f"//button[normalize-space(text())='{page}']")
                    if next_btn:
                        driver_comm.execute_script("arguments[0].click();", next_btn[0])
                    else:
                        next_btn = driver_comm.find_element(By.XPATH, "(//div[contains(@class, 'flex')]//button[not(text())])[last()]")
                        driver_comm.execute_script("arguments[0].click();", next_btn)
                    
                    time.sleep(2)
                    wait_for_loader(driver_comm)
                    time.sleep(4)

                    extract_and_save_data(driver_comm, page_num=page)
                except Exception as e:
                    print(f"Failed to navigate to page {page}: {e}")
                    break

        except Exception as ex:
            print(f"Error processing commodity '{comm}': {ex}")
            continue
        finally:
            if driver_comm:
                driver_comm.quit()

print("Scraping workflow completed successfully.")
