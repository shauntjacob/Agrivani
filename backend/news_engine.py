import feedparser
import ollama

def get_agri_news(crop_name):
    # 1. Search Google News RSS
    # "ceid=IN:en" ensures we get Indian news in English
    rss_url = f"https://news.google.com/rss/search?q={crop_name}+price+India+agriculture&hl=en-IN&gl=IN&ceid=IN:en"
    
    try:
        feed = feedparser.parse(rss_url)
        
        if not feed.entries:
            return "NEUTRAL", ["No recent news found."]

        # --- THE FIX IS HERE ---
        # We explicitly grab .title and ensure it is a string
        headlines = []
        for entry in feed.entries[:3]:
            title = getattr(entry, 'title', 'Unknown Title')
            headlines.append(str(title))
            
        news_text = "\n".join(headlines)
        
        # 2. AI Sentiment Analysis
        prompt = f"""
        Analyze these news headlines for {crop_name} prices:
        "{news_text}"
        
        Output strictly one word:
        - "BULLISH" (if news suggests price will GO UP / supply shortage / rain damage)
        - "BEARISH" (if news suggests price will DROP / bumper harvest / export ban)
        - "NEUTRAL" (if mixed or unclear)
        """
        
        response = ollama.chat(model='gemma2:2b', messages=[{'role': 'user', 'content': prompt}])
        sentiment = response['message']['content'].strip().upper()
        
        # Cleanup AI output (sometimes it adds extra punctuation)
        if "BULLISH" in sentiment: sentiment = "BULLISH (Price Up)"
        elif "BEARISH" in sentiment: sentiment = "BEARISH (Price Down)"
        else: sentiment = "NEUTRAL"

        return sentiment, headlines

    except Exception as e:
        print(f"⚠️ News Error: {e}")
        return "NEUTRAL", ["Could not fetch news."]