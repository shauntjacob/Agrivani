import ollama
import json
import re

def parse_dynamic_duration(text):
    """
    Converts natural language time to an integer (number of days).
    """
    text = text.lower()
    
    # 1. Exact Keywords
    if "day after tomorrow" in text: return 2
    if "tomorrow" in text: return 1
    if "next week" in text: return 7
    if "next month" in text: return 30
    if "next year" in text: return 365
    
    # 2. Regex for Numbers (e.g., "15 days", "2 weeks", "6 months")
    match = re.search(r'(\d+)\s*(day|week|month|year)', text)
    if match:
        number = int(match.group(1))
        unit = match.group(2)
        if "day" in unit: return number
        if "week" in unit: return number * 7
        if "month" in unit: return number * 30
        if "year" in unit: return number * 365

    # 3. Fallback
    return 7

def analyze_user_query(user_text):
    """
    Extracts Intent, Crop, Location, and Dynamic Days.
    """
    system_prompt = """
    You are the NLU Brain for AgriVani. Extract INTENT, CROP, LOCATION.
    Do NOT extract days manually.
    
    INTENTS:
    - "price": Current rates.
    - "predict": Future trends (keywords: next, future, forecast, tomorrow, coming).
    - "scheme": Government schemes.
    - "general": Chat.

    OUTPUT JSON: {"intent": "...", "crop": "...", "location": "..."}
    """

    try:
        response = ollama.chat(model='gemma2:2b', messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': f"Query: '{user_text}'"}
        ])
        
        match = re.search(r'\{.*\}', response['message']['content'], re.DOTALL)
        if match:
            data = json.loads(match.group(0))
            intent = str(data.get("intent", "general")).lower()
            
            # Failsafe: Force 'predict' if time words exist
            if any(w in user_text.lower() for w in ["next", "future", "forecast", "days", "week", "month", "अंदाज", "पुढील", "भविष्य", "येणारे"]):
                intent = "predict"

            # --- DYNAMIC TIME CALCULATION ---
            dynamic_days = parse_dynamic_duration(user_text)

            return {
                "intent": intent, 
                "crop": data.get("crop", "").title() if data.get("crop") else None,
                "location": data.get("location", "").title() if data.get("location") else None,
                "days": dynamic_days # The calculated number
            }
    except: pass
    return {"intent": "general", "crop": None, "location": None, "days": 7}

def summarize_forecast(crop, forecast_list):
    """
    Dynamic summary that adapts to the prediction length.
    """
    if not forecast_list: return ""
    try:
        start_val = float(forecast_list[0].split("Rs ")[-1].strip())
        end_val = float(forecast_list[-1].split("Rs ")[-1].strip())
        
        diff = end_val - start_val
        direction = "rise" if diff > 0 else "fall"
        
        # Calculate duration covered by the list
        days_covered = len(forecast_list)
        
        return f"Over the next **{days_covered} days**, {crop} prices are expected to **{direction}** by ₹{abs(int(diff))}."
    except:
        return "Prices are expected to fluctuate."