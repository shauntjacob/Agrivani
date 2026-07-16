import requests
from geopy.geocoders import Nominatim
from datetime import datetime, date

geolocator = Nominatim(user_agent="agrivani_weather_bot/1.0")

def get_weather_forecast(location_name: str, days: int = 7) -> str:
    """
    Fetches the agricultural weather forecast for a given location using Open-Meteo.
    Always fetches days+1 from the API and skips today (index 0),
    so 'tomorrow' queries correctly return future data, not today's.
    """
    if not location_name or location_name.lower() in ["unknown", "none", "null"]:
        return "I could not find the location to check the weather. Please provide a city or village name."

    try:
        # 1. Get Coordinates
        location = geolocator.geocode(location_name)
        if not location:
            return f"Error: Could not locate '{location_name}' on the map."
            
        lat, lon = location.latitude, location.longitude
        
        # 2. Open-Meteo API — fetch days+1 so we can skip today (index 0)
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": [
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "precipitation_probability_max",
                "windspeed_10m_max",
                "uv_index_max"
            ],
            "timezone": "auto",
            "forecast_days": days + 1  # +1 so we can skip today
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        daily = data.get("daily", {})
        if not daily:
            return "Weather data currently unavailable."
            
        dates = daily.get("time", [])
        temp_max = daily.get("temperature_2m_max", [])
        temp_min = daily.get("temperature_2m_min", [])
        precip_sum = daily.get("precipitation_sum", [])
        rain_prob = daily.get("precipitation_probability_max", [])
        wind_max = daily.get("windspeed_10m_max", [])
        uv_index = daily.get("uv_index_max", [])
        
        today_str = date.today().strftime("%A, %b %d, %Y")
        
        # 3. Format — skip index 0 (today), show days 1..days
        forecast_lines = [
            f"🌤️ Weather Forecast for {location_name} ({lat:.2f}°N, {lon:.2f}°E):",
            f"[Today is {today_str}. The following data is for upcoming days ONLY.]"
        ]
        
        # Indices 1..days (skip index 0 = today)
        for i in range(1, min(days + 1, len(dates))):
            date_obj = datetime.strptime(dates[i], "%Y-%m-%d")
            day_str = date_obj.strftime("%A, %b %d, %Y")
            
            rain_str = f"{precip_sum[i]}mm" if precip_sum and precip_sum[i] is not None else "N/A"
            wind_str = f"{wind_max[i]} km/h" if wind_max and wind_max[i] is not None else "N/A"
            uv_str = f"{uv_index[i]}" if uv_index and uv_index[i] is not None else "N/A"
            
            line = (
                f"- {day_str}: 🌡️ {temp_min[i]}°C – {temp_max[i]}°C | "
                f"🌧️ Rain: {rain_prob[i]}% chance ({rain_str}) | "
                f"💨 Wind: {wind_str} | ☀️ UV: {uv_str}"
            )
            forecast_lines.append(line)
            
        forecast_lines.append("\nNote: High UV index and low rainfall probability is ideal for harvesting. High wind speeds may damage standing crops.")
        return "\n".join(forecast_lines)
        
    except Exception as e:
        print(f"🚨 Weather API Error: {e}")
        # We can't easily check for Marathi here without passing the flag, 
        # but we can provide a neutral message or rely on the LLM to translate.
        # For now, let's just make it Marathi-friendly if it's the only failure.
        return f"क्षमस्व, {location_name} साठी हवामान सेवा सध्या उपलब्ध नाही."
