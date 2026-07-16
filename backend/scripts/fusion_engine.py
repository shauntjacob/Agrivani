import sqlite3
from pathlib import Path
from firebase_engine import get_user_profile

# 1. SETUP PATHS
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"

# Define all three of our database microservices
PRICES_DB_PATH = DATA_DIR / "prices.db" 
ANALYSIS_DB_PATH = DATA_DIR / "market_analysis.db"
NEWS_DB_PATH = DATA_DIR / "market_news.db"

def fetch_math_brain(market, commodity):
    """Retrieves the latest algorithmic analysis using fuzzy SQL matching."""
    try:
        conn = sqlite3.connect(ANALYSIS_DB_PATH)
        conn.row_factory = sqlite3.Row  
        cursor = conn.cursor()
        
        # CHANGED: We now use LIKE with % wildcards for both Market and Commodity
        cursor.execute('''
            SELECT Current_Price, Dynamic_Momentum, Market_Condition, Signal_Strength
            FROM market_analysis
            WHERE Market LIKE ? COLLATE NOCASE AND Commodity LIKE ? COLLATE NOCASE
            ORDER BY Analysis_Date DESC LIMIT 1
        ''', (f'%{market}%', f'%{commodity}%')) 
        
        result = cursor.fetchone()
        conn.close()
        
        return dict(result) if result else None
    except Exception as e:
        print(f"⚠️ Math Brain Error: {e}")
        return None

def fetch_news_brain(commodity):
    """Retrieves the latest 3 news headlines, strictly ignoring anything older than 14 days."""
    try:
        # Connect strictly to the NEWS database
        conn = sqlite3.connect(NEWS_DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Use LIKE to find the commodity anywhere in the headline
        cursor.execute('''
            SELECT title, sentiment 
            FROM news 
            WHERE title LIKE ? COLLATE NOCASE
            AND scraped_at >= datetime('now', '-14 days')
            ORDER BY scraped_at DESC LIMIT 3
        ''', (f'%{commodity}%',))
        
        results = cursor.fetchall()
        conn.close()
        
        # Return as a list of dictionaries
        return [dict(r) for r in results]
    except Exception as e:
        print(f"⚠️ News Brain Error: {e}")
        return []

def generate_agrivani_prompt(user_question, market, commodity):
    """
    Fuses the Math and News data into a master prompt for the LLM.
    """
    print(f"🧬 Fusing data for {commodity} in {market}...")
    
    # 1. Gather Data from both brains
    math_data = fetch_math_brain(market, commodity)
    news_data = fetch_news_brain(commodity)
    
    # 2. Format the Math Section
    if math_data:
        current_price = math_data.get('Current_Price', 'N/A')
        momentum = math_data.get('Dynamic_Momentum', 'N/A')
        condition = math_data.get('Market_Condition', 'N/A')
        signal = math_data.get('Signal_Strength', 'N/A')
        
        math_text = (
            f"- Current Price: ₹{current_price} per quintal\n"
            f"- Market Momentum: {momentum}\n"
            f"- Technical Condition: {condition}\n"
            f"- Algorithmic Signal Strength: {signal}/100 (-100 is Crash, +100 is Spike)\n"
        )
    else:
        math_text = "- No recent mathematical analysis available for this specific market.\n"

    # 3. Format the News Section
    if news_data:
        news_text = ""
        for item in news_data:
            title = item.get('title', '')
            sentiment = item.get('sentiment', '')
            news_text += f"- Headline: '{title}' (Market Impact: {sentiment})\n"
    else:
        news_text = "- No recent market-moving news detected for this commodity.\n"

    # 4. Construct the Final Super Prompt
    super_prompt = f"""You are AgriVani, an expert agricultural economist and highly empathetic assistant for farmers in Maharashtra. 
A farmer has asked you a question. You must use the real-time proprietary data provided below to answer them accurately, professionally, and warmly.

=== REAL-TIME MARKET CONTEXT ===
Commodity: {commodity}
Market Location: {market}

[Quantitative Analysis]
{math_text}
[Qualitative News Context]
{news_text}
================================

User Question: "{user_question}"

Instructions for your response:
1. Speak directly to the farmer. Do not mention "The quantitative analysis says..." Just state the insights naturally as an expert.
2. Combine the math and the news to give a clear recommendation (e.g., Sell now, wait 2 weeks, etc.).
3. Keep the response concise but highly informative."""
    return super_prompt

# --- TEST THE FUSION ENGINE ---
if __name__ == "__main__":
    test_question = "Should I sell my Wheat harvest today or hold it?"
    test_market = "Ahmednagar"
    test_commodity = "Wheat"
    
    final_prompt = generate_agrivani_prompt(test_question, test_market, test_commodity)
    
    print("\n" + "="*50)
    print("🔥 THE FINAL LLM PROMPT 🔥")
    print("="*50)
    print(final_prompt)