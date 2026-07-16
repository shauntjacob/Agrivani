import sqlite3
import feedparser
from datetime import datetime
from pathlib import Path

# 1. SETUP PATHS
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
NEWS_DB_PATH = DATA_DIR / "market_news.db"

# 2. AGRICULTURAL RSS FEEDS
# We use Google News as a proxy for Agrowon to ensure a highly stable Marathi feed
# Updated NEWS_FEEDS for news_analyzer.py
NEWS_FEEDS = {
    "Krishi Jagran India": "https://krishijagran.com/feed/",
    "Agrowon (Marathi)": "https://news.google.com/rss/search?q=agriculture+maharashtra+OR+india+site:agrowon.esakal.com&hl=mr&gl=IN&ceid=IN:mr",
    "Business Line (Agri)": "https://www.thehindubusinessline.com/economy/agri-business/feeder/default.rss",
    "Economic Times (Agri)": "https://economictimes.indiatimes.com/news/economy/agriculture/rssfeeds/1202099874.cms",
    "Google News India (Agri)": "https://news.google.com/rss/search?q=agriculture+commodity+prices+India&hl=en-IN&gl=IN&ceid=IN:en"
}

# 3. THE AGRI-SENTIMENT ENGINE
# Standard sentiment analyzers (like TextBlob) fail on agriculture. 
# "Rain" is good for crops but bad for harvested onions. We use a custom dictionary.
BULLISH_KEYWORDS = ['shortage', 'export ban', 'drought', 'damaged', 'loss', 'unseasonal rain', 'strike', 'hike', 'रोग', 'नुकसान', 'टंचाई', 'पाऊस']
BEARISH_KEYWORDS = ['bumper', 'surplus', 'lifted ban', 'import', 'record harvest', 'subsidy', 'drop', 'घसरण', 'आयात', 'बंपर']

def analyze_sentiment(text):
    """
    Scores text: Positive score means Bullish (Prices Up), 
    Negative score means Bearish (Prices Down).
    """
    text = text.lower()
    score = 0
    
    for word in BULLISH_KEYWORDS:
        if word in text:
            score += 1
            
    for word in BEARISH_KEYWORDS:
        if word in text:
            score -= 1
            
    if score > 0:
        return "Bullish (Prices likely to rise)", score
    elif score < 0:
        return "Bearish (Prices likely to drop)", score
    else:
        return "Neutral / Informational", score

def setup_news_db():
    conn = sqlite3.connect(NEWS_DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT,
            title TEXT,
            link TEXT UNIQUE,
            published_date TEXT,
            sentiment TEXT,
            sentiment_score INTEGER,
            scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    return conn

def run_news_analyzer():
    print("📰 Initiating Global Agri-News & Sentiment Analyzer...")
    conn = setup_news_db()
    cursor = conn.cursor()
    
    new_articles_count = 0
    
    for source, url in NEWS_FEEDS.items():
        print(f"📡 Scanning {source}...")
        try:
            feed = feedparser.parse(url)
            
            # Grab the top 15 most recent articles from each source
            for entry in feed.entries[:15]:
                title = entry.title
                link = entry.link
                published = entry.get('published', datetime.now().strftime("%Y-%m-%d"))
                
                # Analyze the title to determine market impact
                sentiment, score = analyze_sentiment(title)
                
                try:
                    cursor.execute('''
                        INSERT INTO news (source, title, link, published_date, sentiment, sentiment_score)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (source, title, link, published, sentiment, score))
                    new_articles_count += 1
                except sqlite3.IntegrityError:
                    # The UNIQUE constraint on the link column prevents duplicate news
                    pass
                    
        except Exception as e:
            print(f"⚠️ Could not fetch from {source}: {e}")
            
    conn.commit()
    conn.close()
    print(f"✅ Success! {new_articles_count} new market-moving headlines analyzed and stored.")

if __name__ == "__main__":
    run_news_analyzer()