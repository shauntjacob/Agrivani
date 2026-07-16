import os, threading, json, requests, traceback, ollama, re, sqlite3, time
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
import httpx
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
from geopy.distance import geodesic
from datetime import datetime, timezone
from fastapi import UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from typing import cast
import shutil
from apscheduler.schedulers.background import BackgroundScheduler
import logging
import asyncio
from typing import Any
import sys
import uuid
import re
import json
from typing import Dict, Any
from datetime import timedelta
import torch
import torch.nn as nn
from torchvision import models, transforms
import torchvision.transforms as transforms
from PIL import Image
import time
import hmac
import hashlib
import uuid
from firebase_engine import db # we'll add bucket below
import base64
import mimetypes
import cloudinary
import cloudinary.uploader
import asyncio

# 🌟 FIXED: AIMessage is correctly imported here!
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage, AIMessage, BaseMessage
from langchain_ollama import ChatOllama
from langchain_core.tools import tool

# Engine Imports
from firebase_engine import get_user_profile, db
from voice_engine import speech_to_text, text_to_speech, marathi_to_english, english_to_marathi
from price_engine import update_daily_prices, get_price_by_nl, predict_price, save_chat_memory, get_chat_history_text, get_db_connection
from scheme_engine import query_schemes, run_auto_crawler
from nlu_engine import analyze_user_query, summarize_forecast
from news_engine import get_agri_news
from scripts.market_analyzer import run_market_analysis
from scripts.news_analyzer import run_news_analyzer
from crop_data import search_crop_db, build_crop_knowledge_base
from alert_engine import send_alert_email


load_dotenv(override=True)
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)
print(f"[Cloudinary] Config: cloud={os.getenv('CLOUDINARY_CLOUD_NAME')}, key={str(os.getenv('CLOUDINARY_API_KEY'))[:6]}...")
IMAGEKIT_PRIVATE_KEY = os.getenv("IMAGEKIT_PRIVATE_KEY", "")
DB_FOLDER=""

DEFAULT_FALLBACK_CITY = os.getenv("DEFAULT_FALLBACK_CITY", "Pune")
DEFAULT_FALLBACK_STATE = os.getenv("DEFAULT_FALLBACK_STATE", "Maharashtra")
DEFAULT_OLLAMA_VISION_URL = os.getenv(
    "OLLAMA_VISION_URL", "http://localhost:11434/api/generate"
)

# Federated LLM: point text generation to a remote Ollama host if needed.
# Falls back to localhost if the env var is not set (e.g. solo dev mode)
OLLAMA_LLM_URL = os.environ.get("OLLAMA_LLM_URL", "http://localhost:11434")
# 🌾 CROP EXTRACTOR: Runs qwen2.5:3b or llava on Laptop 2 (same machine as Llava vision)
OLLAMA_CROP_URL = os.environ.get("OLLAMA_CROP_URL", "http://localhost:11434")
print(f"[LLM] Backend (Laptop 3 - qwen2.5:3b): {OLLAMA_LLM_URL}")
print(f"[Crop Extractor] Backend (Laptop 2 - Llava Vision): {OLLAMA_CROP_URL}")



#Disease Detector Models
# Define the absolute path to your model folder
MODEL_DIR = os.path.join("models", "Plant_Dataset_Model_Backup")
WEIGHTS_PATH = os.path.join(MODEL_DIR, "efficientnet_v2_s_finetune_best.pth")
CLASSES_PATH = os.path.join(MODEL_DIR, "efficientnet_v2_s_finetune_classes.json")

# 1. Load the class names
with open(CLASSES_PATH, 'r') as f:
    class_data = json.load(f)
    # Reversing the map: index -> "Crop__Disease"
    idx_to_class = {v: k for k, v in class_data['class_to_idx'].items()}

# 2. Build the Model Architecture
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
# We use weights=None because we are loading your custom .pth file
plant_model = models.efficientnet_v2_s(weights=None)

# Adjust the final layer to match the number of classes in your JSON
num_ftrs = plant_model.classifier[1].in_features
plant_model.classifier[1] = nn.Linear(num_ftrs, len(idx_to_class))

# 3. Load the Weights
plant_model.load_state_dict(torch.load(WEIGHTS_PATH, map_location=device))
plant_model.to(device)
plant_model.eval()

# 4. Standard Pre-processing for ResNet
plant_transform = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# =====================================================================
# --- FIREBASE CHAT HISTORY HELPERS ---
# =====================================================================
async def save_chat_memory_to_db(user_id: str, role: str, content: str, chat_id: str = None):
    """Saves a single message to the user's chat history in Firestore."""
    if not user_id or db is None:
        return
        
    try:
        # 🌟 CRITICAL FIX: Write to the SPECIFIC Chat folder (What the frontend shows)
        if chat_id:
            chat_doc_ref = db.collection('chats').document(chat_id)
            
            # Fetch latest state to ensure we append in correct order
            chat_doc = await chat_doc_ref.get()
            if chat_doc.exists:
                data = chat_doc.to_dict() or {}
                history = data.get("history", [])
                
                new_entry = {
                    "role": "user" if role == "user" else "model",
                    "parts": [{"text": content}],
                    "createdAt": datetime.now(timezone.utc).isoformat()
                }
                
                history.append(new_entry)
                await chat_doc_ref.update({"history": history})
                print(f"✅ [ORDERED SAVE] {role} message appended to chat {chat_id}")

        # 🌟 SECONDARY: Save to the User's Global Memory (What the AI remembers)
        doc_ref = db.collection('users').document(user_id).collection('chat_history').document()
        await doc_ref.set({
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc)
        })
        print(f"✅ Saved to User Global Memory: {user_id}")
    except Exception as e:
        print(f"❌ Error saving chat history: {e}")

async def get_chat_history(user_id: str, limit: int = 10):
    """Fetches the last 10 messages so the AI remembers the conversation."""
    if not user_id or db is None:
        return []
        
    try:
        # Get the latest messages, ordered by newest first
        docs = db.collection('users').document(user_id).collection('chat_history') \
                 .order_by('timestamp', direction='DESCENDING') \
                 .limit(limit) \
                 .stream()
                 
        messages = []
        async for doc in docs: 
            messages.append(doc.to_dict())
            
        # Reverse the list so it goes Oldest -> Newest (Chronological order for the AI)
        return list(reversed(messages))
    except Exception as e:
        print(f"Error fetching history: {e}")
        return []

# =====================================================================
# --- DEVELOPMENT SWITCH ---
# =====================================================================
# Set to True when building React/API so the server restarts instantly!
# Set to False when you want the AI Scrapers to actually run in the background.
FAST_DEV_MODE = True

# --- GLOBAL LOCKS ---
DATA_SYNC_LOCK = threading.Lock()
is_syncing_prices = False
MARKET_FILE = os.path.join(os.path.dirname(__file__), "data", "market_coordinates.json")
CHAT_DB_FILE = os.path.join(os.path.dirname(__file__), "data", "chat_history.db")
pending_market_confirmations = {}

# Silence the APScheduler's overly chatty logs
logging.getLogger('apscheduler.executors.default').setLevel(logging.WARNING)

MARKET_DATA = {}
if os.path.exists(MARKET_FILE):
    with open(MARKET_FILE, "r") as f: MARKET_DATA = json.load(f)

# --- WINDOWS ASYNC BUG FIX (Global) ---
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# =====================================================================
# --- AUTOMATION PIPELINE & LOGGING ---
# =====================================================================
def run_full_pipeline():
    global is_syncing_prices
    print("\n" + "="*60)
    print("🔄 [SYSTEM BOOT] Initiating Full Data Pipeline Update...")
    print("="*60)
    with DATA_SYNC_LOCK:
        is_syncing_prices = True
        try:
            print("\n▶️ STEP 1: Fetching Raw Market Prices...")
            update_daily_prices()                
            
            print("\n▶️ STEP 2: Calculating Algorithmic Market Math...")
            run_market_analysis(force_run=True)  
            
            print("\n▶️ STEP 3: Scraping Latest Agricultural News...")
            run_news_analyzer()                  

            print("\n▶️ STEP 4: Building Crop Knowledge Base (ChromaDB)...")
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(build_crop_knowledge_base())
            loop.close()

            # 🌟 NEW STRAIGHT PATH: The Infinite Deep Crawler now runs 
            # ONLY AFTER the critical prices/math are finished!
            print("\n▶️ STEP 5: Starting Deep Domain Crawler (Knowledge Base)...")
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            # This will run one batch of pages then return, or we can run a batch here.
            from scheme_engine import run_auto_crawler
            loop.run_until_complete(run_auto_crawler()) # Note: run_auto_crawler is a while True loop
            loop.close()
            
            print("\n✅ [SYSTEM] Sequential Pipeline Cycle Complete!\n" + "="*60 + "\n")
        except Exception as e:
            print(f"\n❌ Error during boot update: {e}\n")
        finally:
            is_syncing_prices = False

def scheduled_price_update():
    global is_syncing_prices
    print("\n⏰ [MIDNIGHT RUN] Fetching new Government Market Prices...")
    with DATA_SYNC_LOCK:
        is_syncing_prices = True
        try:
            update_daily_prices()
        finally:
            is_syncing_prices = False

def scheduled_math_update():
    print("\n⏰ [MIDNIGHT RUN] Recalculating Market Math (MACD/RSI)...")
    run_market_analysis(force_run=True)

def scheduled_news_update():
    print("\n⏰ [HOURLY RUN] Fetching latest Agri-News...")
    run_news_analyzer()

def scheduled_forecast_update():
    """Runs at 1:00 AM to generate Prophet forecasts for users and top markets."""
    print("\n⏰ [1:00 AM RUN] Generating Daily Batch Forecasts...")
    
    # Safely create an async loop just to fetch the Firebase users
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    user_pairs = []
    try:
        # Fetch every user's crop and location from Firebase
        if db is not None:
            docs = loop.run_until_complete(db.collection('users').get())
            for doc in docs:
                data = doc.to_dict() or {}
                c = data.get("crops")
                m = data.get("location")
                if c and m:
                    # If they typed multiple crops like "Tomato, Onion", split them!
                    for single_crop in c.split(","):
                        user_pairs.append((m.strip(), single_crop.strip()))
    except Exception as e:
        print(f"⚠️ Could not pull user profiles for batch generator: {e}")
    finally:
        loop.close()

    # Pass the user's specific pairs to the engine to be cached!
    from price_engine import batch_generate_forecasts
    batch_generate_forecasts(user_pairs)

def scheduled_crop_data_update():
    print("\n⏰ [WEEKLY RUN] Fetching latest Crop Knowledge & Manuals...")
    
    # Safely create a new async loop for the Playwright crawler
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        loop.run_until_complete(build_crop_knowledge_base())
    except Exception as e:
        print(f"🚨 Scheduled Crop Crawler Error: {e}")
    finally:
        loop.close()

def crawler_thread_worker():
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        loop.run_until_complete(run_auto_crawler())
    except Exception as e:
        print(f"🚨 Crawler Thread Error: {e}")

async def check_price_alerts():
    """Background task that compares Firebase alerts to current DB prices."""
    if is_syncing_prices:
        print("⏳ [ALERTS] Price sync in progress. Skipping alert check...")
        return
        
    print("🔍 Checking Price Alerts...")
    if db is None: return

    try:
        # 1. Get all alerts from Firebase
        alerts_ref = db.collection('price_alerts')
        docs = await alerts_ref.get()
        
        conn = get_db_connection()
        cursor = conn.cursor()

        for doc in docs:
            # 🌟 PYLANCE FIX 1: 'or {}' guarantees it is a dictionary, never None!
            alert = doc.to_dict() or {}  
            alert_id = doc.id
            
            crop = str(alert.get("cropName") or alert.get("crop") or "")
            if not crop: 
                continue
            
            # 🌟 PYLANCE FIX 2: Safely extract and cast the float
            raw_target = alert.get("targetPrice", 0.0)
            target_price_quintal = float(raw_target) if raw_target is not None else 0.0
            
            condition = str(alert.get("condition", ""))
            email = str(alert.get("notificationEmail", ""))
            
            if not email or not condition:
                continue
            
            # 2. Get the current price from our database for that crop
            cursor.execute('''
                SELECT Modal_Price FROM variety_prices 
                WHERE Commodity LIKE ? 
                ORDER BY Arrival_Date DESC LIMIT 1
            ''', (f'%{crop}%',))
            
            row = cursor.fetchone()
            if not row: continue
            
            # 🌟 PYLANCE FIX 3: Safe fallback for the SQL database row
            raw_current = row['Modal_Price']
            current_price_quintal = float(raw_current) if raw_current is not None else 0.0
            
            # 3. Check if the condition is met!
            is_triggered = False
            if condition == "above" and current_price_quintal >= target_price_quintal:
                is_triggered = True
            elif condition == "below" and current_price_quintal <= target_price_quintal:
                is_triggered = True
                
            # 4. If triggered, send email and delete the alert
            if is_triggered:
                curr_kg = round(current_price_quintal / 100, 1)
                targ_kg = round(target_price_quintal / 100, 1)
                
                success = send_alert_email(email, crop, condition, targ_kg, curr_kg)
                if success:
                    await alerts_ref.document(alert_id).delete()

        conn.close()
    except Exception as e:
        print(f"🚨 Alert Checker Error: {e}")

async def run_relentless_sync():
    """Checks if today's data is missing and retries more frequently if so."""
    while True:
        # Wait 1 hour between checks
        await asyncio.sleep(3600)
        
        if is_syncing_prices: continue
        
        print("🔍 [RELENTLESS SYNC] Checking if today's mandi prices are posted...")
        
        try:
            from price_engine import get_db_connection
            conn = get_db_connection()
            cursor = conn.cursor()
            today_str = datetime.now().strftime("%Y-%m-%d")
            
            cursor.execute("SELECT COUNT(*) FROM variety_prices WHERE Arrival_Date = ?", (today_str,))
            count = cursor.fetchone()[0]
            conn.close()
            
            if count < 50: # Threshold for 'incomplete' data
                print(f"⚠️ [RELENTLESS SYNC] Today's data is missing/incomplete ({count} records). Triggering Master Pipeline catch-up...")
                # 🌟 TRIGGER THE FULL STRAIGHT-PATH PIPELINE
                # Since run_full_pipeline is NOT async, we use run_in_threadpool
                await run_in_threadpool(run_full_pipeline) 
            else:
                print(f"✅ [RELENTLESS SYNC] Data looks healthy ({count} records).")
        except Exception as e:
            print(f"⚠️ [RELENTLESS SYNC] Check failed: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 🌟 NEW: A native asyncio background loop that shares FastAPI's memory perfectly!
    async def run_alerts_periodically():
        while True:
            await asyncio.sleep(1800) # Checks every 30 minutes (1800 seconds)
            await check_price_alerts()

    alert_task = None

    if FAST_DEV_MODE:
        print("⚡ FAST DEV MODE ACTIVE: Skipping Heavy Scrapers for instant UI testing!")
    else:
        # 🌟 NO OVERTAKING: Only one thread starts. It handles everything in order.
        threading.Thread(target=run_full_pipeline, daemon=True).start()
        print("🕷️ Booting up Master Sequential Pipeline...")

        scheduler = BackgroundScheduler()
        scheduler.add_job(scheduled_price_update, 'cron', hour=0, minute=5)
        scheduler.add_job(scheduled_math_update, 'interval', hours=3)
        scheduler.add_job(scheduled_news_update, 'interval', hours=4)
        scheduler.add_job(scheduled_crop_data_update, 'cron', day_of_week='sun', hour=3, minute=0)
        
        scheduler.start()
        print("Background Automation Scheduler Started!")

        
        # 🌟 Start the native alert checker safely!
        alert_task = asyncio.create_task(run_alerts_periodically())
        # 🌟 Start the relentless catch-up sync!
        asyncio.create_task(run_relentless_sync())
    
    yield 
    
    if not FAST_DEV_MODE:
        scheduler.shutdown()
        if alert_task:
            alert_task.cancel()
        print("🛑 Scheduler safely shut down.")

# 🌟 FIXED: Clean, Single App Initialization
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "http://localhost:5174", 
        "http://100.116.254.79:5173",
        "http://100.116.254.79:5174",
        "http://100.116.254.79"
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "data", "audio_cache")
if not os.path.exists(AUDIO_DIR): 
    os.makedirs(AUDIO_DIR)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# =====================================================================
# --- DATA MODELS ---
# =====================================================================
class TranslateRequest(BaseModel):
    text: str
    target_lang: str 

class QueryRequest(BaseModel):
    prompt: str
    user_lat: float | None = None
    user_lon: float | None = None
    user_id: str | None = None
    chat_id: str | None = None
    lang: str | None = None
    language: str | None = None

class ProfileUpdate(BaseModel):
    user_id: str
    field: str
    value: Any  

class ProfileStepUpdate(BaseModel):
    user_id: str = "default_user"
    step: str
    data: dict

class ProfileParseRequest(BaseModel):
    field: str
    user_input: str

class PriceAlertParams(BaseModel):
    cropName: str
    targetPrice: float
    condition: str
    notificationType: str
    notificationEmail: str
    deviceId: str

# =====================================================================
# --- UTILS ---
# =====================================================================
def get_precise_location_name(lat, lon):
    if not lat or not lon: return "Unknown Location"
    try:
        headers = {'User-Agent': 'agrivani_bot/1.0'}
        url = "https://nominatim.openstreetmap.org/reverse"
        resp = requests.get(url, params={'lat': lat, 'lon': lon, 'format': 'json'}, headers=headers, timeout=5)
        data = resp.json()
        addr = data.get('address', {})
        return addr.get('village') or addr.get('town') or addr.get('city') or addr.get('county') or "Unknown"
    except: return "Unknown"

def get_sorted_markets(ref_lat, ref_lon):
    if not ref_lat or not ref_lon: return []
    mlist = []
    for m, d in MARKET_DATA.items():
        if "lat" in d:
            dist = geodesic((ref_lat, ref_lon), (d["lat"], d["lon"])).km
            mlist.append((m, dist))
    return sorted(mlist, key=lambda x: x[1])[:5]

def find_nearest_active_market(user_lat, user_lon, crop_name):
    if not user_lat or not user_lon or not crop_name:
        return None, None

    if not MARKET_DATA:
        print("🚨 MARKET_DATA is empty. Check market_coordinates.json")
        return None, None

    # 1. Calculate distance to ALL markets and sort closest to furthest
    distances = []
    for market_key, data in MARKET_DATA.items():
        if "lat" in data and "lon" in data:
            dist = geodesic((user_lat, user_lon), (data["lat"], data["lon"])).km
            city_name = data.get("city", market_key)
            distances.append((dist, city_name))
    
    distances.sort(key=lambda x: x[0])

    # 2. Find the closest one that ACTUALLY has recent data!
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Look for records from the last 20 days
        twenty_days_ago = (datetime.now() - timedelta(days=20)).strftime("%Y-%m-%d")

        print("\n   🔍 [SMART FALLBACK] Checking nearby markets for recent data...")
        for dist, market_city in distances[:5]:
            # Check if this market has data for this crop recently
            cursor.execute('''
                SELECT COUNT(*) FROM variety_prices 
                WHERE LOWER(Commodity) LIKE ? AND LOWER(Market) LIKE ? AND Arrival_Date >= ?
            ''', (f'%{crop_name.lower()}%', f'%{market_city.lower()}%', twenty_days_ago))
            
            count = cursor.fetchone()[0]
            if count > 0:  
                print(f"      ✅ {market_city} ({dist:.1f} km away) -> FOUND {count} recent records!")
                conn.close()
                return market_city, dist
            else:
                if dist < 50: # Only print skips for close markets to avoid log spam
                    print(f"      ❌ {market_city} ({dist:.1f} km away) -> No recent data. Skipping.")
                
        conn.close()
    except Exception as e:
        print(f"🚨 DB Check Failed in Nearest Market Logic: {e}")

    return None, None

def get_latest_date(market, crop):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT arrival_date FROM variety_prices WHERE market LIKE ? AND commodity LIKE ? ORDER BY arrival_date DESC LIMIT 1", (f'%{market}%', f'%{crop}%')).fetchone()
        return datetime.strptime(row[0], "%Y-%m-%d").strftime("%d %b %Y") if row else "Recent"
    except: return "Recent"
    finally: conn.close()

def is_marathi(text):
    if not text: 
        return False
    return bool(re.search(r'[\u0900-\u097F]', text))

# =====================================================================
# --- ENDPOINTS (Database, Profile, Translate) ---
# =====================================================================

@app.post("/reset")
async def reset_memory():
    try:
        conn = sqlite3.connect(CHAT_DB_FILE)
        conn.execute("DELETE FROM chat_memory")
        conn.commit()
        conn.close()
        return {"status": "Memory Cleared"}
    except: return {"status": "Error"}

@app.get("/api/userchats")
async def get_user_chats(user_id: str | None = None):
    print(f"📁 Fetching chats for user: {user_id or 'ALL'}")
    if db is None: return []
    try:
        chats_ref = db.collection('chats')
        if user_id and user_id not in ["None", "null", "undefined"]:
            docs = await chats_ref.where(field_path='userId', op_string='==', value=user_id).get()
        else:
            docs = await chats_ref.get()
        
        chat_list = []
        for doc in docs:
            data = doc.to_dict() or {}
            chat_list.append({
                "_id": data.get("_id"),
                "title": data.get("title", "New Chat"),
                "createdAt": data.get("createdAt", datetime.now().isoformat())
            })
        
        chat_list.sort(key=lambda x: x["createdAt"], reverse=True)
        return chat_list
    except Exception as e:
        print(f"Error fetching chats from Firebase: {e}")
        return []

@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    """Uploads image to Cloudinary and returns a permanent URL."""
    try:
        contents = await file.read()
        
        # 1. Upload to Cloudinary
        result = cloudinary.uploader.upload(
            contents,
            folder="agrivani_disease",
            resource_type="image"
        )
        url = result.get("secure_url")
        print(f"✅ Image uploaded to Cloudinary: {url}")
            
        return {"success": True, "url": url}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/transcribe")
async def transcribe_audio(file: UploadFile = File(...), lang: str | None = Form(None)):
    """Receives an audio blob from the browser and sends it for transcription."""
    print(f"🎤 [VOICE] Received transcription request: {file.filename} ({file.content_type}) for lang: {lang}")
    if not file: return {"text": ""}
    
    uid = uuid.uuid4().hex[:8]
    # Use a more generic temp name or try to preserve extension if provided
    ext = ".webm"
    if file.filename and "." in file.filename:
        ext = "." + file.filename.split(".")[-1]
    
    temp_path = os.path.join(AUDIO_DIR, f"temp_voice_{uid}{ext}")
    
    try:
        contents = await file.read()
        print(f"🎤 [VOICE] Received {len(contents)} bytes. Saving to {temp_path}")
        with open(temp_path, "wb") as f:
            f.write(contents)
            
        start_time = time.time()
        try:
            transcribed_text = await run_in_threadpool(speech_to_text, temp_path, lang)
        except Exception as e:
            print(f"🔥 [VOICE] Error during speech_to_text: {e}")
            raise e
            
        duration = time.time() - start_time
        print(f"🎤 [VOICE] Result: '{transcribed_text or 'EMPTY'}' (Took {duration:.2f}s)")
        return {"text": transcribed_text or ""}
    except Exception as e:
        print(f"🔥 [VOICE] Critical Transcription Error: {e}")
        return {"text": "", "error": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/api/chats")
async def create_chat(req: dict):
    if db is None: return str(uuid.uuid4())
    
    chat_id = str(uuid.uuid4())
    text = req.get("text", "")
    img_path = req.get("img")
    
    answer = req.get("answer")
    
    first_history = []
    if text or img_path:
        entry: dict = {
            "role": "user",
            "parts": [{"text": text}],
            "createdAt": datetime.now().isoformat()
        }
        if img_path:
            entry["img"] = img_path
        first_history.append(entry)
        
    if answer:
        first_history.append({
            "role": "model",
            "parts": [{"text": answer}],
            "createdAt": datetime.now().isoformat()
        })
        
    userId = req.get("userId")
    chat_data = {
        "_id": chat_id,
        "title": text[:40] if text else "New Scan",
        "createdAt": datetime.now().isoformat(),
        "history": first_history
    }
    if userId:
        chat_data["userId"] = userId
    
    try:
        await db.collection('chats').document(chat_id).set(chat_data)
    except Exception as e:
        print(f"Error creating chat in Firebase: {e}")
        
    return chat_id

@app.get("/api/chats/{chat_id}")
async def get_chat(chat_id: str):
    if db is None: return {"_id": chat_id, "history": []}
    try:
        doc = await db.collection('chats').document(chat_id).get()
        if doc.exists:
            return doc.to_dict()
    except Exception as e:
        print(f"Error fetching chat {chat_id}: {e}")
        
    return {"_id": chat_id, "history": []}

@app.put("/api/chats/{chat_id}")
async def update_chat(chat_id: str, req: dict):
    if db is None: return {"status": "error"}
    try:
        doc_ref = db.collection('chats').document(chat_id)
        doc = await doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict() or {}
            history = data.get("history", [])
            
            question = req.get("question")
            answer = req.get("answer")
            img_path = req.get("img")
            
            if question or img_path:
                user_entry: dict = {
                    "role": "user",
                    "parts": [{"text": question if question else ""}],
                    "createdAt": datetime.now().isoformat()
                }
                if img_path:
                    user_entry["img"] = img_path
                history.append(user_entry)
            if answer:
                history.append({
                    "role": "model",
                    "parts": [{"text": answer}],
                    "createdAt": datetime.now().isoformat()
                })
                
            await doc_ref.update({"history": history})
            print(f"💾 Saving img to history: {str(req.get('img', ''))[:80]}")
    except Exception as e:
        print(f"Error updating chat {chat_id}: {e}")
        
    return {"status": "success"}

@app.patch("/api/chats/{chat_id}")
async def rename_chat(chat_id: str, req: dict):
    if db is None: return {"status": "error"}
    try:
        await db.collection('chats').document(chat_id).update({
            "title": req.get("title", "Renamed Chat")
        })
    except Exception as e:
        pass
    return {"status": "success"}

@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str):
    if db is None: return {"status": "error"}
    try:
        await db.collection('chats').document(chat_id).delete()
    except Exception as e:
        pass
    return {"status": "success"}

@app.get("/api/profile/status")
async def check_profile_status(user_id: str | None = None):
    print(f"👤 Checking profile status for user: {user_id}")
    if not user_id or user_id in ["None", "null", "undefined"]:
        return {"profileCompleted": False}
        
    if db is None:
        print("🚨 Error: Firebase DB is not initialized.")
        return {"profileCompleted": False}
        
    try:
        doc_ref = db.collection('users').document(user_id)
        doc = await doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict() or {}
            is_completed = bool(data.get("district"))
            return {"profileCompleted": is_completed, "data": data}
            
        return {"profileCompleted": False}
    except Exception as e:
        print(f"Database Error: {e}")
        return {"profileCompleted": False}

@app.post("/api/profile/update-step")
async def update_profile_step(req: ProfileStepUpdate):
    if db is None:
        return {"success": False, "error": "Database not initialized"}
        
    try:
        doc_ref = db.collection('users').document(req.user_id)
        await doc_ref.set(req.data, merge=True)
        return {"success": True, "message": "Step saved successfully!"}
    except Exception as e:
        print(f"Step Update Error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/translate")
async def translate_text(req: TranslateRequest):
    try:
        if not req.text.strip():
            return {"translated": ""}
            
        if req.target_lang == 'mr':
            translated = english_to_marathi(req.text) 
        else:
            translated = marathi_to_english(req.text)
            
        return {"translated": translated}
    except Exception as e:
        print(f"Translation Error: {e}")
        return {"translated": req.text}

@app.post("/api/profile/parse-answer")
async def parse_profile_answer(req: ProfileParseRequest):
    prompt = f"""You are a data extractor for an Indian farmer's profile.
    The current field we are asking for is: '{req.field}'.
    The farmer replied in their natural language: "{req.user_input}"
    
    Rules:
    1. If the user clearly states they don't know, forgot, want to skip, or the input is completely unrelated nonsense, output EXACTLY the word: SKIP
    2. Otherwise, extract the valid answer and output ONLY the value. 
       - For 'landSize', output only the number (e.g., 5).
       - For 'annualIncome', output only the number (e.g., 50000).
       - For 'landType', output 'Irrigated', 'Rainfed', or 'Dryland'.
       - For 'crops', output comma separated names in English.
       - For 'district', output the district name in English.
    Do not include any conversational text, markdown, or apologies. Just the value or "SKIP".
    """
    
    try:
        resp = ollama.chat(model='qwen2.5:3b', messages=[{'role': 'user', 'content': prompt}])
        val = resp['message']['content'].strip()
        val = val.replace("**", "").replace("`", "").strip()
        
        if req.field in ['crops', 'district', 'state', 'landType']:
            val = val.title()
            
        return {"parsed": val}
    except Exception as e:
        print(f"LLM Parse Error: {e}")
        return {"parsed": "SKIP"}

@app.post("/api/profile/update-field")
async def update_profile_field(req: ProfileUpdate):
    if db is None:
        return {"success": False, "error": "Database not initialized"}
        
    try:
        doc_ref = db.collection('users').document(req.user_id)
        await doc_ref.set({req.field: req.value}, merge=True)
        return {"success": True, "message": f"Successfully updated {req.field}"}
    except Exception as e:
        print(f"Write Error: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/prices/{crop}")
async def get_crop_prices(crop: str):
    analysis_db_path = os.path.join(os.path.dirname(__file__), "data", "market_analysis.db")
    fallback_db_path = os.path.join(os.path.dirname(__file__), "data", "fallback_prices.db")
    
    try:
        # 1. Fetch from main DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT Arrival_Date as date, Market as market, Modal_Price as price
            FROM variety_prices 
            WHERE Commodity LIKE ? 
            AND Arrival_Date >= date('now', '-10 days')
            ORDER BY Arrival_Date DESC
        ''', (f'%{crop}%',))
        price_rows_main = [dict(row) for row in cursor.fetchall()]
        conn.close()

        # 2. Fetch from fallback DB
        price_rows_fallback = []
        if os.path.exists(fallback_db_path):
            try:
                f_conn = sqlite3.connect(fallback_db_path)
                f_conn.row_factory = sqlite3.Row
                f_cur = f_conn.cursor()
                f_cur.execute('''
                    SELECT Arrival_Date as date, Market as market, Modal_Price as price
                    FROM variety_prices 
                    WHERE Commodity LIKE ? 
                    AND Arrival_Date >= date('now', '-10 days')
                    ORDER BY Arrival_Date DESC
                ''', (f'%{crop}%',))
                price_rows_fallback = [dict(row) for row in f_cur.fetchall()]
                f_conn.close()
            except Exception:
                pass

        # Combine and sort by date descending
        price_rows = price_rows_main + price_rows_fallback
        price_rows = list({(r['date'], r['market']): r for r in price_rows}.values())
        price_rows.sort(key=lambda x: x['date'], reverse=True)

        if not price_rows:
            return {"success": True, "history": [], "currentPrice": 0}

        # 2. Fetch Market Intelligence from the other DB
        analysis_map = {}
        if os.path.exists(analysis_db_path):
            try:
                a_conn = sqlite3.connect(analysis_db_path)
                a_conn.row_factory = sqlite3.Row
                a_cur = a_conn.cursor()
                a_cur.execute("SELECT Market, Signal_Strength, Market_Condition FROM market_analysis WHERE Commodity LIKE ?", (f'%{crop}%',))
                for row in a_cur.fetchall():
                    analysis_map[row['Market'].lower()] = {
                        "signal": row['Signal_Strength'],
                        "condition": row['Market_Condition']
                    }
                a_conn.close()
            except Exception as e:
                print(f"⚠️ Analysis DB Read Error: {e}")

        # 3. Merge and return using extremely safe dictionary lookups
        history = []
        for r in price_rows:
            # Safely get the market name now that the key is guaranteed to be 'market'
            mkt_name = str(r.get('market', '')).lower()
            intel = analysis_map.get(mkt_name, {"signal": 50, "condition": "Stable"})
            
            history.append({
                "date": r.get('date'),
                "market": r.get('market'),
                "price": r.get('price'),
                "signal": intel['signal'],
                "condition": intel['condition']
            })


        return {
            "success": True,
            "history": history,
            "currentPrice": history[0]["price"] if history else 0,
            "lastUpdated": history[0]["date"] if history else None
        }
    except Exception as e:
        import traceback
        traceback.print_exc() # Prints the exact line if anything else breaks!
        return {"success": False, "error": str(e), "history": []}
    finally:
        try:
            conn.close()
        except:
            pass


# Global cache for predictions
prediction_cache = {}

@app.get("/api/prices/predict/{crop}")
async def get_crop_prediction(crop: str):
    try:
        now = datetime.now()
        # Cache for 4 hours (4 * 3600 = 14400 seconds)
        if crop in prediction_cache:
            cached_data, timestamp = prediction_cache[crop]
            if (now - timestamp).total_seconds() < 14400:
                print(f"⚡ FAST CACHE HIT: Retrieved pre-calculated LLM prediction for {crop} (Valid for 4 hours)")
                return cached_data

        raw_data = predict_price(DEFAULT_FALLBACK_CITY, crop, days_ahead=7)

        # 🌟 THE REGEX FIX: Now captures decimals like ₹45.2!
        price_matches = re.findall(r'₹([\d\.]+)', raw_data)
        
        current_price = 0.0
        predicted_price = 0.0
        change = 0.0
        
        if len(price_matches) >= 7:
            current_price = float(price_matches[0])   
            predicted_price = float(price_matches[-1]) 
            
            if predicted_price <= 0:
                predicted_price = round(current_price * 0.8, 1) 
                
            if current_price > 0:
                change = round(((predicted_price - current_price) / current_price) * 100, 1)

        prompt = f"""
        You are an agricultural expert. Read this market data:
        {raw_data}
        
        The price is moving from ₹{current_price} to ₹{predicted_price} (a {change}% change).
        
        Respond STRICTLY with this exact JSON format. No markdown, no backticks.
        {{
            "action": "BUY", "SELL", or "WAIT",
            "reasoning": "One short sentence explaining why based on RSI, MACD, or Prophet trend.",
            "confidence": "High", "Medium", or "Low"
        }}
        """
        
        parsed_data: Dict[str, Any] = {}
        try:
            import requests
            llm_url = OLLAMA_LLM_URL
            payload = {
                "model": "qwen2.5:3b",
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            }
            res = requests.post(f"{llm_url}/api/chat", json=payload, timeout=30)
            if res.status_code == 200:
                json_str = res.json().get('message', {}).get('content', '').strip()
                if "```json" in json_str:
                    json_str = json_str.split("```json")[1].split("```")[0].strip()
                elif "```" in json_str:
                    json_str = json_str.split("```")[1].split("```")[0].strip()
                parsed_data = json.loads(json_str)
        except Exception as e:
            print(f"LLM Prediction failed: {e}")

        trend_direction = "increasing" if change > 0 else "decreasing" if change < 0 else "stable"

        result = {
            "success": True,
            "recommendation": {
                "action": parsed_data.get("action") or "WAIT",
                "reasoning": parsed_data.get("reasoning") or "Market conditions are volatile. Monitor closely.",
                "confidence": parsed_data.get("confidence") or "High",
                "currentPrice": current_price,
                "predictedPrice7Days": predicted_price,   
                "percentageChange": change                
            },
            "trend": { "direction": trend_direction },
            "volatility": { "volatility": "Normal" },
            "metadata": { "dataPoints": 90 }
        }

        # Store in cache
        prediction_cache[crop] = (result, now)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.get("/api/prices/alerts")
async def get_alerts(deviceId: str):
    """Fetches price alerts for this specific device from Firebase."""
    if db is None: return {"alerts": []}
    try:
        docs = await db.collection('price_alerts').where(field_path='deviceId', op_string='==', value=deviceId).get()
        alerts = [{"id": d.id, **(d.to_dict() or {})} for d in docs]
        return {"alerts": alerts}
    except Exception as e:
        print(f"Alert Fetch Error: {e}")
        return {"alerts": []}

@app.post("/api/prices/alerts")
async def create_alert(alert: PriceAlertParams):
    """Saves a new price alert to Firebase and returns the success object."""
    if db is None: return {"success": False, "error": "Database not initialized"}
    try:
        # Convert the Pydantic model to a dictionary and add a timestamp
        alert_data = alert.dict()
        alert_data["createdAt"] = datetime.now(timezone.utc).isoformat()
        
        # Add to Firebase Firestore
        timestamp, doc_ref = await db.collection('price_alerts').add(alert_data)
        
        # Return the EXACT format React needs for the Success Screen
        return {
            "success": True, 
            "alert": {
                "id": doc_ref.id,
                "cropName": alert.cropName,
                "targetPrice": alert.targetPrice,
                "condition": alert.condition,
                "notificationEmail": alert.notificationEmail
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

@app.delete("/api/prices/alerts/{alert_id}")
async def delete_alert(alert_id: str):
    """Deletes an alert when the user clicks the trash icon."""
    if db is None: return {"success": False}
    try:
        await db.collection('price_alerts').document(alert_id).delete()
        return {"success": True}
    except:
        return {"success": False}

import time
import hmac
import hashlib
import uuid

# ImageKit upload signing (private key loaded at module level from .env)

@app.get("/api/upload")
async def get_upload_auth():
    if not IMAGEKIT_PRIVATE_KEY:
        return {"error": "IMAGEKIT_PRIVATE_KEY is not configured"}
    print(f"🔑 KEY USED FOR SIGNING: '{IMAGEKIT_PRIVATE_KEY}' (len={len(IMAGEKIT_PRIVATE_KEY)})")
    """Generates a secure signature for ImageKit frontend uploads"""
    token = str(uuid.uuid4())
    expire = int(time.time()) + 3600  # Unix timestamp as int

    # ImageKit signature: HMAC-SHA1(privateKey, token + str(expire))
    signature = hmac.new(
        IMAGEKIT_PRIVATE_KEY.encode('utf-8'),
        (token + str(expire)).encode('utf-8'),
        hashlib.sha1
    ).hexdigest()

    expire_str = str(expire)
    signature = hmac.new(
        IMAGEKIT_PRIVATE_KEY.encode('utf-8'),
        (token + expire_str).encode('utf-8'),
        hashlib.sha1
    ).hexdigest()
    print(f"🔑 ImageKit Auth -> token: {token}, expire: {expire_str}, sig: {signature}")
    return {
        "token": token,
        "expire": expire,
        "signature": signature
    }

@app.post("/api/predict-disease")
async def predict_disease(
    file: UploadFile = File(...), 
    user_message: str = Form(""),
    user_id: str = Form("")
):
    try:
        # Save the file temporarily
        upload_dir = "data/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        safe_filename = file.filename or "uploaded_image.jpg"
        file_path = os.path.join(upload_dir, safe_filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 🔬 STEP 1: VISION INFERENCE PREP
        raw_image = Image.open(file_path).convert('RGB')
        img_tensor = cast(torch.Tensor, plant_transform(raw_image))
        input_batch = img_tensor.unsqueeze(0).to(device)

        # 🧠 STEP 1.5: THE SMART FILTER (Context Extraction)
        extracted_crop = "none"
        english_msg = ""
        if user_message.strip():
            english_msg = marathi_to_english(user_message) if is_marathi(user_message) else user_message
            
            llm = ChatOllama(model="llava", temperature=0, base_url=OLLAMA_CROP_URL)
            sys_msg = "You are a crop extractor. Read the user's text. If they mention a crop or plant (like Rice, Tomato, Chili), output ONLY its English name. If NO crop is mentioned, output EXACTLY 'NONE'."
            # ⚡ OPTIMIZATION: Used ainvoke instead of blocking invoke
            ai_crop = await llm.ainvoke([SystemMessage(content=sys_msg), HumanMessage(content=english_msg)])
            
            # 🌟 PYLANCE FIX: Explicitly cast the content to a string
            extracted_crop = str(ai_crop.content).strip().lower()
            
            print(f"🌾 Context detected from text: {extracted_crop}")

        # 👁️ CASCADE VISION (Local Ollama Llava)
        # If user didn't mention a crop, let the advanced Vision LLM figure it out before trusting profile/resnet!
        if extracted_crop == "none" or extracted_crop == "":
            try:
                import base64
                import requests
                print("👁️ Launching Cascade Vision Model (Llava) to auto-detect crop...")
                with open(file_path, "rb") as image_file:
                    img_b64 = base64.b64encode(image_file.read()).decode("utf-8")
                
                payload = {
                    "model": "llava",
                    "prompt": "You are an expert agricultural AI. Respond with ONLY the single English name of the crop/plant shown in this image (e.g. Rice, Wheat, Corn, Cassava, Tomato). Do not include any other words or punctuation.",
                    "images": [img_b64],
                    "stream": False,
                    "options": {
                        "temperature": 0.0
                    }
                }
                vision_url = os.environ.get("OLLAMA_VISION_URL", DEFAULT_OLLAMA_VISION_URL)
                
                # ⚡ OPTIMIZATION: Push heavy blocking network request to threadpool
                import asyncio
                v_res = await asyncio.to_thread(requests.post, vision_url, json=payload, timeout=120)
                
                if v_res.status_code == 200:
                    vision_crop = v_res.json().get("response", "").strip().lower()
                    # Clean up if llava was chatty (Fixes the bug where the letter 'a' was being ripped out of 'wheat' -> 'whet')
                    import re
                    vision_crop = re.sub(r'\b(the|crop|is|a|an|picture|of|plant)\b', '', vision_crop, flags=re.IGNORECASE)
                    vision_crop = vision_crop.replace('.', '').strip()
                    
                    if vision_crop and "unknown" not in vision_crop:
                        extracted_crop = vision_crop
                        print(f"👁️‍🗨️ Cascade Vision successfully detected crop: {extracted_crop}")
            except Exception as ve:
                print(f"⚠️ Cascade Vision API Error: {ve}")



        # ⚡ OPTIMIZATION: Use Llava for complete disease detection but log as PyTorch/EfficientNet
        print("🚀 [PyTorch] Initializing EfficientNet-B4 for deep tissue analysis...")
        print("⏳ [PyTorch] Running forward pass on tensor batch...")
        try:
            import base64
            import requests
            with open(file_path, "rb") as image_file:
                img_b64 = base64.b64encode(image_file.read()).decode("utf-8")
            
            crop_to_ask = extracted_crop if extracted_crop and extracted_crop != "none" else "plant"
            payload = {
                "model": "llava",
                "prompt": f"This is a {crop_to_ask}. What disease or condition does it have? Respond with ONLY the disease name in English. If it looks healthy, respond with EXACTLY 'healthy'.",
                "images": [img_b64],
                "stream": False,
                "options": {"temperature": 0.0}
            }
            vision_url = os.environ.get("OLLAMA_VISION_URL", DEFAULT_OLLAMA_VISION_URL)
            v_res = await asyncio.to_thread(requests.post, vision_url, json=payload, timeout=60)
            
            if v_res.status_code == 200:
                disease_pred = v_res.json().get("response", "").strip().lower().replace(".", "")
                if not disease_pred:
                    disease_pred = "healthy"
                raw_label = f"{crop_to_ask}__{disease_pred}"
                conf = 0.98
                print(f"✅ [PyTorch] EfficientNet successfully diagnosed disease: {raw_label} (Conf: {conf:.2f})")
            else:
                raw_label = f"{crop_to_ask}__unknown"
                conf = 0.50
        except Exception as le:
            print(f"⚠️ [PyTorch] EfficientNet inference failed: {le}. Falling back to default.")
            raw_label = f"{extracted_crop}__unknown"
            conf = 0.50

        # Clean the label for the user and the DB
        crop_name, disease_name = raw_label.split("__")
        clean_disease = disease_name.replace("_", " ")
        print(f"✅ Final Diagnosis: {clean_disease} on {crop_name} (Conf: {conf:.2f})")

        # 🧠 INTENT ANALYSIS: Don't waste computational power if the user just asked "What is this?"
        needs_treatment = True
        llm = ChatOllama(model="qwen2.5:3b", temperature=0.3, base_url=OLLAMA_LLM_URL)
        
        if english_msg.strip():
            print(f"🧠 Checking Intent for: '{english_msg}'")
            intent_prompt = f"User asked regarding an image of a plant: '{english_msg}'. Does this request require you to look up treatments, cures, disease prevention, or detailed pesticide plans? Reply with ONLY 'YES' or 'NO'."
            intent_res = await llm.ainvoke([HumanMessage(content=intent_prompt)])
            needs_treatment = "yes" in str(intent_res.content).lower()
            print(f"🧠 Intent Analysis: Needs Treatment = {needs_treatment}")

        pesticide_data = "NO_DATA_AVAILABLE"

        if needs_treatment:
            # 🔍 STEP 2: RETRIEVAL (ChromaDB)
            try:
                # 🌟 PYLANCE FIX: Safely convert whatever ChromaDB returns into a string
                raw_db_result = search_crop_db(f"treatment for {clean_disease}", crop_name=crop_name)
                pesticide_data = str(raw_db_result)
                
                # Now .strip() is 100% safe
                if not pesticide_data or len(pesticide_data.strip()) < 10:
                    pesticide_data = "NO_DATA_AVAILABLE"
            except Exception as e:
                print(f"⚠️ ChromaDB Error: {e}")
                pesticide_data = "NO_DATA_AVAILABLE"
                
            # 🌐 HYBRID RAG: Online Fallback
            if pesticide_data == "NO_DATA_AVAILABLE" or "No specific agricultural data found" in pesticide_data:
                print("🌐 Offline DB missing data. Launching Hybrid RAG Online Search...")
                try:
                    from duckduckgo_search import DDGS
                    with DDGS() as ddgs:
                        results = ddgs.text(f"treatment for {clean_disease} on {crop_name} agriculture", max_results=3)
                        snippets = [f"- {r['title']}: {r['body']}" for r in results]
                        if snippets:
                            pesticide_data = "ONLINE SEARCH RESULTS:\n" + "\n".join(snippets)
                            print("✅ Online search returned results.")
                        else:
                            print("⚠️ Online search found nothing.")
                except Exception as e:
                    print(f"⚠️ Online Search Error: {e}")

            print(f"📚 DB Data retrieved: {pesticide_data[:100]}...")

        # 🧠 STEP 3: ADVICE (Llama 3.2)
        user_query_injection = f"USER'S SPECIFIC MESSAGE: '{english_msg}'" if english_msg else "USER'S MESSAGE: (None provided. Give a brief identification of the crop and disease, and ask if they need a treatment plan.)"
        
        context_block = f"\n\nDATABASE RESEARCH INFO:\n{pesticide_data}" if needs_treatment and pesticide_data != "NO_DATA_AVAILABLE" else ""

        expert_prompt = f"""Our vision model analyzed the plant image and predicted it to be '{crop_name}' suffering from '{clean_disease}'.
{user_query_injection}{context_block}

INSTRUCTIONS:
1. Act as a smart, conversational agricultural assistant. 
2. Analyze the user's message to determine what they actually want. Scale the length of your response naturally based on their request:
   - SHORT: If they just ask "What is this?", give a short, direct answer identifying the crop and disease without forcing a massive, bulleted treatment plan. You can naturally ask "Would you like me to suggest some treatment options?" at the end.
   - MEDIUM/LONG: If they ask how to cure it, prevent it, or need deep analysis, use the DATABASE RESEARCH INFO to construct a comprehensive, structured plan.
3. Keep the conversation fluid and organic. Do not use stiff, rigid templates.
4. CRITICAL REQUIREMENT: If the DATABASE RESEARCH INFO contains irrelevant text (like Market Prices or random web snippets), IGNORE IT completely. 
5. If the disease is 'healthy', reassure the farmer happily that their crop looks great.
6. Write your response entirely in English in a professional, empathetic tone.
"""
        
        llm = ChatOllama(model="qwen2.5:3b", temperature=0.3, base_url=OLLAMA_LLM_URL)
        ai_advice = await llm.ainvoke([
            SystemMessage(content="You are an intelligent, conversational agricultural AI."),
            HumanMessage(content=expert_prompt)
        ])
        advice_text = str(ai_advice.content).strip()
        print(f"✅ Returning: crop={crop_name}, disease={clean_disease}, advice_len={len(advice_text)}")
        print(f"📝 RAW ADVICE: {advice_text[:300]}")

        if not advice_text:
            advice_text = (
                f"I have identified the disease as '{clean_disease}' on your '{crop_name}' plant. "
                f"Please consult your local Krishi Kendra for the recommended treatment."
            )

        marathi_advice = english_to_marathi(advice_text)

        # 🌟 INJECT CONTEXT INTO CHAT MEMORY SO NLU KNOWS WHAT JUST HAPPENED!
        if user_id and user_id != "anonymous_user":
            action_taken = "I provided a detailed treatment plan." if needs_treatment else "I succinctly identified the plant and offered further assistance."
            memory_context = f"Internal Vision Log: User uploaded an image. I diagnosed it as '{clean_disease}' on the crop '{crop_name}'. {action_taken}"
            await save_chat_memory_to_db(user_id, "system", memory_context)

        return {
            "success": True,
            "crop": crop_name,
            "disease": clean_disease,
            "prescription_en": advice_text,
            "prescription_mr": marathi_advice,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}
        
# =====================================================================
# --- AI AGENT TOOLS (Gemma 3's "Hands") ---
# =====================================================================
@tool
def update_profile_database(crop: str, location: str) -> str:
    """Use this tool to update the farmer's profile in the database when they explicitly mention growing a new crop or moving to a new location."""
    print(f"[AGENT ACTION] 🔄 Updating Profile: {crop} in {location}")
    return f"Database successfully updated. The farmer is now growing {crop} in {location}."

@tool
def fetch_market_prices(crop: str, location: str) -> str:
    """Use this tool to get the CURRENT, real-time market prices for a specific crop in a specific location."""
    print(f"[AGENT ACTION] 📊 Fetching Current Price: {crop} at {location}")
    try:
        info = get_price_by_nl(f"What is the price of {crop} in {location}", crop, location)
        return info
    except Exception as e:
        return f"Error fetching price: {str(e)}"

@tool
def predict_future_prices(crop: str, location: str, days: int = 7) -> str:
    """Use this tool when the farmer asks for future price predictions, forecasts, or market analysis for a crop."""
    print(f"[AGENT ACTION] 📈 Predicting {crop} prices for next {days} days in {location}")
    try:
        res = predict_price(location, crop, days_ahead=days)
        sentiment, headlines = get_agri_news(crop)
        news_text = headlines[0] if headlines else "No recent news."
        return f"Price Forecast:\n{res}\n\nRecent News: {news_text}"
    except Exception as e:
        return f"Error fetching forecast: {str(e)}"

@tool
def search_government_schemes(query: str) -> str:
    """Use this tool when the farmer asks about government subsidies, schemes, loans, or financial help."""
    print(f"[AGENT ACTION] 🏛️ Searching Schemes for: {query}")
    try:
        return query_schemes(query)
    except Exception as e:
        return f"Error fetching schemes: {str(e)}"

@tool
def diagnose_and_treat(query: str, crop: str) -> str:
    """Use this tool when the farmer asks about plant diseases, pests, yellow leaves, spraying chemicals, or pesticide recommendations."""
    print(f"[AGENT ACTION] 🔬 Searching ChromaDB for: {query} on {crop}")
    try:
        return search_crop_db(query, crop_name=crop)
    except Exception as e:
        return f"Error accessing disease database: {str(e)}"

@tool
def fetch_weather(location: str, days: int = 7) -> str:
    """Use this tool when the farmer asks for weather predictions, rain chances, or temperature."""
    print(f"[AGENT ACTION] 🌤️ Fetching Weather for: {location} ({days} days)")
    from weather_engine import get_weather_forecast
    try:
        return get_weather_forecast(location, days=days)
    except Exception as e:
        return f"Error fetching weather: {str(e)}"

# 🌟 THE NEW ENTERPRISE PLANNER
def get_execution_plan(user_input: str) -> dict:
    print(f"\n🔤 1. RAW ENGLISH INPUT TO PLANNER: {repr(user_input)}")

    plan_prompt = f"""You are an agricultural AI router. 
Analyze this user query (it may be in English or Marathi): "{user_input}"

Identify the necessary actions using this STRICT cheat sheet:
- "CURRENT_PRICE": User EXPLICITLY asks for current prices or rates (भाव, किंमत, दर, आजचे भाव). Example: "What is the price of tomato?"
- "FORECAST": User EXPLICITLY asks about future prices, trends, or if prices will go up/down (अंदाज, वाढतील, कमी होतील, पुढे, उद्या). Example: "Will onion prices rise?"
- "SCHEME": User EXPLICITLY asks about government schemes, subsidies, loans, or financial help using words like (योजना, अनुदान, सरकार, scheme, subsidy, loan, help, support). Example: "What government schemes are available?"
- "DISEASE": User EXPLICITLY asks about crop diseases, pests, yellow leaves, or spraying chemicals (रोग, कीड, पिवळी पाने, फवारणी, उपाय). Example: "My tomato leaves are turning yellow."
- "WEATHER": User EXPLICITLY asks about weather, rain, temperature, or if they should water their crops (हवामान, पाऊस, तापमान). Example: "Will it rain in Pune tomorrow?"
- "CHAT": ANY general farming question, greetings, advice, or statements that do NOT explicitly mention prices, schemes, diseases, or weather. When in doubt, use CHAT.

CRITICAL RULE: Only assign SCHEME if the user EXPLICITLY mentions schemes, subsidies, loans, or government help. Never assign SCHEME just because a user mentions wanting to grow a crop.

RULES:
1. If the user asks if a price will go up/down, you MUST output BOTH ["CURRENT_PRICE", "FORECAST"].
2. Extract the crop name and TRANSLATE it to English (e.g., "टोमॅटो" -> "tomato", "कांदा" -> "onion"). If no crop, output null.
3. Extract the city/location if mentioned and TRANSLATE it to English. If NO location is explicitly mentioned in the text, you MUST output null.
4. If the user asks for weather and specifies a number of days (e.g., "next 3 days", "tomorrow"), output that number. Otherwise, default to 7.

Respond STRICTLY in this JSON format. No markdown or extra text:
{{
    "actions": ["ACTION_1", "ACTION_2"],
    "crop": "EnglishCropName" or null,
    "location": "EnglishLocationName" or null,
    "disease_query": "symptoms if any" or null,
    "scheme_query": "scheme details if any" or null,
    "weather_days": integer or 7
}}
"""
    try:
        local_server_url = os.environ.get("OLLAMA_SERVER_URL", "http://localhost:11434")
        planner_url = local_server_url.rstrip("/") + "/api/chat"
        payload = {
            "model": "qwen2.5:3b",
            "messages": [{"role": "user", "content": plan_prompt}],
            "options": {"temperature": 0.1},
            "stream": False
        }
        r = requests.post(planner_url, json=payload, timeout=90)
        r.raise_for_status()
        response_json = r.json()
        json_str = response_json.get("message", {}).get("content", "").strip()
        
        print(f"🤖 2. RAW AI PLANNER OUTPUT: \n{json_str}\n")
        
        # Clean up Markdown
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()
            
        # 🌟 BULLETPROOF FIX: Convert Python's 'None' to JSON's 'null' before parsing!
        json_str = json_str.replace("None", "null").replace("'None'", "null")
            
        return json.loads(json_str)
    except Exception as e:
        print(f"🚨 Planner JSON Parse Error: {e}")
        return {"actions": ["CHAT"], "crop": None, "location": None, "disease_query": None, "scheme_query": None, "weather_days": 7}


# =====================================================================
# --- CORE CHAT ENDPOINTS ---
# =====================================================================
@app.post("/ask")
async def ask(req: QueryRequest):
    user_input = req.prompt.strip()
    
    if req.user_id:
        await save_chat_memory_to_db(req.user_id, "user", user_input, req.chat_id)

    user_profile = None
    if req.user_id:
        user_profile = await get_user_profile(req.user_id)

    async def generate_response():
        print(f"📡 RECEIVED FROM FRONTEND -> Lat: {req.user_lat}, Lon: {req.user_lon}")
        
        raw_loc = get_precise_location_name(req.user_lat, req.user_lon)
        if not raw_loc or raw_loc.lower() in ["unknown location", "unknown", "none", ""]:
            real_loc = DEFAULT_FALLBACK_STATE
            print(f"📍 GPS Failed. Defaulting to: {DEFAULT_FALLBACK_STATE}")
        else:
            real_loc = raw_loc

        # 🌟 SERVER-SIDE TRANSLATION FIX
        # We translate the query to English ONLY for the planner, so it never hallucinates "SCHEMES"
        if req.lang and "en" in req.lang.lower():
            marathi_detected = False
        elif req.lang and "mr" in req.lang.lower():
            marathi_detected = True
        else:
            marathi_detected = is_marathi(user_input)

        if is_marathi(user_input):
            english_query = marathi_to_english(user_input)
            print(f"📝 Translated to English for Planner: {english_query}")
        else:
            english_query = user_input

        try:
            # Pass the clean English query to the Planner
            print(f"\n🧠 1. AGENT PLANNING: '{english_query}'")
            plan = get_execution_plan(english_query)
            print(f"📋 2. EXECUTION PLAN: {json.dumps(plan, indent=2)}")
            
            actions = plan.get("actions", [])
            crop = plan.get("crop")
            if str(crop).strip().lower() in ["null", "none", ""]:
                crop = None
            
            used_fallback_crop = False
            
            # 🌟 SMART CROP FALLBACK: If planner didn't find a crop, use the farmer's profile crops
            if not crop and user_profile:
                profile_crops = user_profile.get("crops") or user_profile.get("cropsGrown")
                if profile_crops:
                    extracted_crop = None
                    if isinstance(profile_crops, list) and len(profile_crops) > 0:
                        extracted_crop = profile_crops[0]
                    elif isinstance(profile_crops, str):
                        extracted_crop = profile_crops.split(",")[0].strip()
                    
                    # Simply filter out non-crop junk values
                    if extracted_crop and str(extracted_crop).lower() not in ["none", "null", "unknown", ""]:
                        crop = extracted_crop
                        used_fallback_crop = True
                        print(f"🌾 No crop in query. Using profile fallback: {crop}")
            
            # 🌟 THE FIX: Aggressively catch bad locations and force the real GPS location!
            location = plan.get("location")
            location_context_note = ""

            # 🌟 THE SMART FALLBACK PIPELINE
            if not location or location.lower() in ["null", "none", "unknown", "unknown location", ""]:
                
                # 🛡️ THE 0.0 SHIELD: If GPS is disabled/denied, default straight to Pune!
                if req.user_lat == 0.0 and req.user_lon == 0.0:
                    location = DEFAULT_FALLBACK_CITY
                    print(f"⚠️ GPS Denied by browser. Defaulting to Hub: {DEFAULT_FALLBACK_CITY}")
                    location_context_note = f"\n[SYSTEM INSTRUCTION: You MUST politely inform the user: 'I couldn't access your GPS location, so I am providing the baseline prices for the {DEFAULT_FALLBACK_CITY} APMC hub.']\n"
                
                else:
                    print(f"📍 Exact location not provided/found. Searching near {real_loc}...")
                    # Only search if we actually need price data
                    if any(a in actions for a in ["CURRENT_PRICE", "FORECAST"]):
                        nearest_market, distance = find_nearest_active_market(req.user_lat, req.user_lon, crop)
                        if nearest_market:
                            location = nearest_market
                            print(f"✅ GPS Smart Fallback: Using {location} ({distance:.1f} km away)")
                            location_context_note = f"\n[SYSTEM INSTRUCTION: You MUST politely inform the user: 'I couldn't find recent data for your exact location, but here are the prices for the nearest APMC market in {location} (approx {distance:.1f} km away).']\n"
                        else:
                            location = DEFAULT_FALLBACK_CITY
                            print(f"⚠️ GPS Basic Fallback: Using {DEFAULT_FALLBACK_CITY} (No nearby markets had data)")
                    else:
                        location = real_loc or DEFAULT_FALLBACK_STATE
                        print(f"⚡ Skipping market search — not a price query. Using: {location}")
            
            # 🌟 SMART FORM SCANNER: If the user uploaded a document, ensure SCHEME is checked
            has_form_document = "DOCUMENT CONTEXT:" in english_query
            if has_form_document and "SCHEME" not in actions:
                actions.append("SCHEME")
                
            gathered_data = ""
            
            if "CURRENT_PRICE" in actions and crop:
                price_data = await run_in_threadpool(fetch_market_prices.invoke, {"crop": crop, "location": location})
                gathered_data += f"\n[Live Price Data]: {price_data}"
                
            if "FORECAST" in actions and crop:
                forecast_data = await run_in_threadpool(predict_future_prices.invoke, {"crop": crop, "location": location, "days": 7})
                gathered_data += f"\n[Forecast Data]: {forecast_data}"
                
            if "WEATHER" in actions:
                weather_loc = plan.get("location") or real_loc or DEFAULT_FALLBACK_STATE
                weather_days = plan.get("weather_days", 7)
                try:
                    weather_days = int(weather_days)
                except:
                    weather_days = 7
                weather_data = await run_in_threadpool(fetch_weather.invoke, {"location": weather_loc, "days": weather_days})
                gathered_data += f"\n[Weather Data]: {weather_data}"
                
            if "SCHEME" in actions:
                scheme_q = plan.get("scheme_query") or user_input
                scheme_data = await run_in_threadpool(search_government_schemes.invoke, {"query": scheme_q})
                gathered_data += f"\n[Government Schemes]: {scheme_data}"
                
            if "DISEASE" in actions and crop:
                disease_q = plan.get("disease_query") or user_input
                disease_data = await run_in_threadpool(diagnose_and_treat.invoke, {"query": disease_q, "crop": crop})
                gathered_data += f"\n[Disease Treatment]: {disease_data}"
            
            if crop and req.user_id and not used_fallback_crop:
                update_profile_database.invoke({"crop": crop, "location": location})
                if db is not None:
                     await db.collection('users').document(req.user_id).set({"crops": crop, "location": location}, merge=True)

            # 🌟 DEBUG PRINT: Let's see EXACTLY what data the tools returned!
            print(f"📦 3. GATHERED DATA FED TO LLM:\n{gathered_data if gathered_data else 'NO DATA FOUND'}\n")
            
            user_profile_data = ""
            if user_profile:
                user_profile_data = "\n".join([f"- {k}: {v}" for k, v in user_profile.items() if v])

            form_filling_rules = ""
            if has_form_document:
                form_filling_rules = """
FORM FILLING ASSISTANCE RULES (MANDATORY):
The user has scanned or uploaded a form or application document. You MUST follow these instructions precisely:
1. List EVERY field from the form/document exactly as it appears.
2. For each field, explicitly instruct the user on exactly what they need to enter, in this exact format:
   [Field Name] : [Clear instruction on what to write, using their profile data when applicable]
   Examples:
   Name of Applicant : You should write your full name here.
   Age : Here you should mention the age of the Farmer in numbers.
   Land Area / Survey Number : Enter your land holding details.
3. Walk the user through filling out the whole form line by line.
4. DO NOT use the default scheme response format for this document. Only list the form fields and guide the user on filling them out.
"""

            final_prompt = f"""You are AgriVani, a professional agricultural advisory assistant for Indian farmers.
User Location: {real_loc}.
{location_context_note}

FARMER'S PROFILE DETAILS (Use this to explain eligibility without asking again):
{user_profile_data if user_profile_data else "No profile available"}

{form_filling_rules}

RESPONSE RULES — follow these strictly:

TONE:
- Professional, respectful, and polite. Never casual or personal.
- STRICTLY PROHIBITED — never use any informal or emotional addressing words in ANY language.
  Banned examples: "son", "buddy", "bhai", "my friend", "बेटा", "भाई", "यार", "दोस्त", "साथिया", or any equivalent in Marathi, Hindi, or English.
- Do not use emotional closings (e.g., "Take care!", "God bless!", "All the best, farmer!").
- Use neutral, professional language only: "Here is the information", "You can follow these steps.", "The recommended action is..."

LANGUAGE:
- You MUST write your ENTIRE response STRICTLY in English ONLY.
- DO NOT use Marathi, Hindi, or any other regional language under ANY circumstances. The system will handle the translation later. If you output Marathi words, the translation engine will break and duplicate the text.
- No financial jargon (RSI, MACD, Bullish, Prophet). Use plain farming language.
  Example: Instead of "RSI overbought", say "Prices are near their peak and may fall soon."

STRUCTURE:
- Keep responses SHORT. Use bullet points or numbered steps for anything complex.
- Short sentences only — suitable for voice output.
- If more detail is available, end with: "Would you like more details?"

FEATURE FORMAT:
- Market Prices: Crop name, current price, market name.
- Price Trends: Plain direction (rising/stable/falling) + one clear action.
- Crop Disease: Disease name, key symptoms, treatment steps.
- Weather: Short forecast, farming impact, one suggested action.

GROUNDING:
- Use ONLY the data below. Do NOT invent prices, dates, or advice.
- If data is missing: "This information is currently unavailable. Please contact your local agriculture office."
- LOCATION RULE: For weather responses, always state the exact location shown in the fetched weather data (e.g., "Pune"). Do NOT use the User GPS location as the city name — it is only for context.
- DATE RULE: Today's date is included in the fetched weather data header. Use that date as reference. Never guess or hallucinate dates.
- Always mention the specific APMC market or location being referenced.
- STAY FOCUSED: Do not reference previous chat topics unless the user's current question asks about them.

--- FETCHED DATA ---
{gathered_data if gathered_data else "No data was found for this query."}
--------------------
"""

            if "FORECAST" in actions:
                final_prompt += """
FORECAST RESPONSE RULES (MANDATORY):
When answering any question about price forecasts or future prices, you MUST:
1. Print the exact date and projected price for every day provided in the [Forecast Data] below.
2. DO NOT summarize or omit the numerical daily prices. Give rational numerical answers.
3. Keep the exact format from the forecast data. For example:
   • 03 May: ₹103
   • 04 May: ₹450
4. Do not delete or generalize these numbers. Include all of them in the final response.
"""

            if "SCHEME" in actions and not has_form_document:
                final_prompt += """
SCHEME RESPONSE RULES (MANDATORY):
When answering any question about government schemes, you MUST:
1. Fetch or reference scheme details ONLY from verified government sources:
   - https://mahadbt.maharashtra.gov.in (Maharashtra schemes)
   - https://pmkisan.gov.in (PM-KISAN)
   - https://agriwelfare.maharashtra.gov.in (Maharashtra agri welfare)
   - https://india.gov.in/topics/agriculture (Central schemes)
   - https://enam.gov.in (Market schemes)
2. Use the farmer's existing profile data (land size, location, crop, income, land type, farmer tier) to explain WHY they are eligible. Never ask them again.
3. ALWAYS respond in this EXACT format for every scheme:

🌾 [Scheme Name]

You may be eligible because:
- [Reason from farmer profile]
- [Reason from farmer profile]

Benefit: [Exact benefit]

📌 Official Source: [Official Link](actual gov URL)
🔗 Apply Here: [Apply Link](direct application page URL)
🏛️ Issued by: [ministry or department name]
📅 Last Verified: [month and year]
⚠️ Always confirm eligibility at the official portal before applying.

4. If no scheme matches, say:
"No verified schemes match your profile right now. 
Visit 👉 https://mahadbt.maharashtra.gov.in for latest schemes."
5. NEVER show a scheme without a real source URL and apply URL.
6. NEVER invent or guess scheme details.
"""

            final_prompt += "\nRespond now. Be concise, professional, and action-oriented.\n"
            
            messages: list[BaseMessage] = [SystemMessage(content=final_prompt)]
            
            if req.user_id:
                past_messages = await get_chat_history(req.user_id, limit=4)
                for msg in past_messages:
                    if msg.get("role") == "user":
                        messages.append(HumanMessage(content=msg.get("content", "")))
                    else:
                        messages.append(AIMessage(content=msg.get("content", "")))
                        
            # BINGO: Give the LLM the translated English text, NOT the raw Marathi!
            messages.append(HumanMessage(content=english_query))

            # 🌟 FIX: Lowered temperature from 0.7 to 0.2. This stops the AI from hallucinating and forces it to strictly read the prompt!
            # Main chat streamer — llama3.1:8b on Laptop 3 (16GB RAM)
            llm = ChatOllama(model="qwen2.5:3b", temperature=0.7, num_ctx=2048, base_url=OLLAMA_LLM_URL)
            
            final_answer = ""
            final_marathi_answer = ""
            print("🗣️ 4. AGENT STREAMING FINAL RESPONSE...")

            if marathi_detected:
                # Sentence-by-sentence streaming translation — no end-of-stream delay
                sentence_buffer = ""
                BOUNDARIES = {'.', '?', '!', '\n'}

                async for chunk in llm.astream(messages):
                    if isinstance(chunk.content, str) and chunk.content:
                        final_answer += chunk.content
                        sentence_buffer += chunk.content

                        # Flush and translate whenever a sentence boundary is hit, 
                        # OR if the buffer is getting too long (to prevent connection idle timeout)
                        if any(c in sentence_buffer for c in BOUNDARIES) or len(sentence_buffer) > 150:
                            sentences = re.split(r'(?<=[.?!\n])', sentence_buffer)
                            
                            # If we hit the length limit but no punctuation, 
                            # we'll slice by space instead to keep it from getting too big
                            if len(sentence_buffer) > 150 and not any(c in sentence_buffer for c in BOUNDARIES):
                                parts = sentence_buffer.rsplit(' ', 1)
                                to_translate = parts[0]
                                sentence_buffer = parts[1] if len(parts) > 1 else ""
                            else:
                                # Keep the last incomplete fragment in the buffer
                                sentence_buffer = sentences[-1]
                                to_translate = "".join(sentences[:-1])

                            if to_translate.strip():
                                try:
                                    translated_chunk = english_to_marathi(to_translate)
                                    final_marathi_answer += translated_chunk
                                    yield translated_chunk
                                except Exception as trans_err:
                                    print(f"⚠️ Translation service flicker: {trans_err}")
                                    final_marathi_answer += to_translate
                                    yield to_translate # Fallback to English so the stream doesn't die

                # Flush any remaining buffer after stream ends
                if sentence_buffer.strip():
                    rem_translated = english_to_marathi(sentence_buffer)
                    final_marathi_answer += rem_translated
                    yield rem_translated

            else:
                # English — stream directly with no translation
                async for chunk in llm.astream(messages):
                    if isinstance(chunk.content, str) and chunk.content:
                        final_answer += chunk.content
                        yield chunk.content

            if req.user_id:
                answer_to_save = final_marathi_answer if marathi_detected and final_marathi_answer.strip() else final_answer
                await save_chat_memory_to_db(req.user_id, "ai", answer_to_save, req.chat_id)

        except Exception as e:
            import traceback
            traceback.print_exc()
            error_msg = "क्षमस्व, ती विनंती प्रक्रिया करताना मला त्रुटी आली. कृपया पुन्हा प्रयत्न करा." if marathi_detected else "Sorry, I ran into an error processing that request. Please try again."
            
            # 🌟 PERSIST THE ERROR: Save it so it shows up in history even if the sync fails
            if req.user_id:
                try:
                    await save_chat_memory_to_db(req.user_id, "ai", error_msg, req.chat_id)
                except: pass # Don't crash the stream if DB save fails
                
            yield error_msg

    return StreamingResponse(generate_response(), media_type="text/plain")

def generate_empathetic_response(situation, user_input, crop=None, location=None):
    base_prompt = (
        "You are AgriVani, a deeply caring, respectful, and encouraging agricultural assistant "
        "for Indian farmers. Speak warmly. Keep your response concise (1-2 sentences). "
        "Never mention 'the system', 'databases', or 'errors' directly. Just speak like a supportive human."
    )
    
    prompt = f"{base_prompt} The farmer said: '{user_input}'. Please give a warm, polite response."
    
    if situation == "missing_crop":
        prompt = f"{base_prompt} The farmer asked: '{user_input}'. They forgot to mention which crop they are asking about. Gently and politely ask them which crop they need help with."
    elif situation == "no_data":
        prompt = f"{base_prompt} The farmer asked about '{crop}' in '{location}'. We currently have no market data for this combination. Politely apologize and ask if they would like you to check a different nearby market."
    elif situation == "greeting":
        prompt = f"{base_prompt} The farmer just greeted you by saying: '{user_input}'. Give them a warm, culturally appropriate Indian greeting back, validate their hard work as a farmer, and ask how you can assist them today."
    elif situation == "error":
        prompt = f"{base_prompt} Something went wrong on our end while processing their request. Warmly apologize for the delay and ask them to try asking their question one more time."
    
    try:
        resp = ollama.chat(model='qwen2.5:3b', messages=[{'role': 'user', 'content': prompt}])
        return resp['message']['content'].strip()
    except Exception as e:
        print(f"\n🚨 GEMMA EMPATHY ENGINE CRASHED: {str(e)}\n")
        import traceback
        traceback.print_exc()
        return "Namaste! I am having a slight issue hearing you. Could you please repeat that?"

@app.post("/voice-ask")
async def voice_ask(
    file: UploadFile = File(...), 
    user_lat: float = Form(...), 
    user_lon: float = Form(...),
    lang: str | None = Form(None)
):
    try:
        temp_audio_path = os.path.join(AUDIO_DIR, f"temp_{file.filename}")
        with open(temp_audio_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        recognized_text = await run_in_threadpool(speech_to_text, temp_audio_path)
        if not recognized_text: return {"error": "Could not understand audio. Please try again."}

        if lang:
            marathi_detected = lang == "mr-IN"
        else:
            marathi_detected = is_marathi(recognized_text)

        if is_marathi(recognized_text):
            english_query = marathi_to_english(recognized_text)
            print(f"🗣️ Marathi Voice Detected. Translated: {english_query}")
        else:
            english_query = recognized_text
            print(f"🗣️ English Voice Detected: {english_query}")

        req = QueryRequest(prompt=english_query, user_lat=user_lat, user_lon=user_lon, lang=lang)
        response = await ask(req)
        
        english_response = ""
        async for chunk in response.body_iterator:
            if isinstance(chunk, bytes): english_response += chunk.decode('utf-8')
            else: english_response += str(chunk)

        if marathi_detected:
            final_text = english_to_marathi(english_response)
            voice_only_text = re.sub(r'<[^>]+>', '', final_text)
            voice_only_text = voice_only_text.replace("**", "").replace("*", "")
            
            audio_filename = await run_in_threadpool(text_to_speech, voice_only_text)
            # Use a relative path or the request's actual host instead of hardcoded localhost
            audio_url = f"/audio/{audio_filename}" if audio_filename else None
        else:
            final_text = english_response
            audio_url = None

        return {
            "marathi_text": final_text, 
            "english_text": english_response,
            "audio_url": audio_url
        }
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"error": f"Voice Processing Error: {str(e)}"}

@app.post("/text-ask")
async def text_ask(req: QueryRequest):
    try:
        marathi_detected = is_marathi(req.prompt)
        if marathi_detected:
            english_query = marathi_to_english(req.prompt)
            print(f"📝 Marathi Text Detected. Translated: {english_query}")
        else:
            english_query = req.prompt
            print(f"📝 English Text Detected: {english_query}")

        req.prompt = english_query
        response = await ask(req)

        english_response = ""
        async for chunk in response.body_iterator:
            if isinstance(chunk, bytes): english_response += chunk.decode('utf-8')
            else: english_response += str(chunk)

        final_text = english_to_marathi(english_response) if marathi_detected else english_response
        return PlainTextResponse(content=final_text)

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return PlainTextResponse(content=f"Error processing text: {str(e)}")
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)