import feedparser
import sqlite3
from pathlib import Path
from datetime import datetime

# Setup paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
NEWS_DB_PATH = DATA_DIR / "market_news.db"

# The top 3 Agri-News Feeds
NEWS_SOURCES = {
    "Business Line (Agri)": "https://www.thehindubusinessline.com/economy/agri-business/feeder/default.rss",
    "Krishi Jagran": "https://krishijagran.com/feeds/?cat=agriculture",
    # Note: Agrowon changes its RSS structure frequently, so we can use Google News' Agrowon RSS feed as a highly stable fallback
    "Agrowon (via Google)": "https://news.google.com/rss/search?q=agriculture+site:agrowon.esakal.com&hl=mr&gl=IN&ceid=IN:mr"
}

def build_news_db():
    conn = sqlite3.connect(NEWS_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT,
            title TEXT,
            summary TEXT,
            link TEXT UNIQUE,
            published_date TEXT,
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    return conn

def scrape_news():
    print("🌍 Starting Multi-Source News Extraction...")
    conn = build_news_db()
    cursor = conn.cursor()
    
    new_articles_count = 0
    
    for source_name, feed_url in NEWS_SOURCES.items():
        print(f"Scraping {source_name}...")
        feed = feedparser.parse(feed_url)
        
        for entry in feed.entries[:15]: # Get the top 15 latest news items from each
            title = entry.get("title", "")
            summary = entry.get("summary", "")
            link = entry.get("link", "")
            published = entry.get("published", datetime.now().strftime("%Y-%m-%d"))
            
            try:
                cursor.execute("""
                    INSERT INTO news (source, title, summary, link, published_date)
                    VALUES (?, ?, ?, ?, ?)
                """, (source_name, title, summary, link, published))
                new_articles_count += 1
            except sqlite3.IntegrityError:
                # Link already exists in DB, skip it
                pass
                
    conn.commit()
    conn.close()
    print(f"✅ Extracted {new_articles_count} new market updates into market_news.db!")

if __name__ == "__main__":
    scrape_news()