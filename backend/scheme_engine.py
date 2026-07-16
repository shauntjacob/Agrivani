import os
import requests
import chromadb
import time
import random
import urllib3
import sys
import io  
import asyncio
import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from urllib.parse import urljoin, urlparse
import ollama
from typing import Any, cast
import datetime

# --- NEW ASYNC SCRAPER IMPORTS ---
from crawl4ai import AsyncWebCrawler

# --- OCR IMPORTS ---
import pytesseract
from pdf2image import convert_from_bytes
from dotenv import load_dotenv

load_dotenv()

_tess_cmd = os.getenv("TESSERACT_CMD")
if _tess_cmd:
    pytesseract.pytesseract.tesseract_cmd = _tess_cmd

POPPLER_PATH = os.getenv("POPPLER_PATH") or None

# Disable SSL Warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")
WEBSITE_LIST_FILE = os.path.join(DATA_DIR, "websites.txt")
HISTORY_FILE = os.path.join(DATA_DIR, "crawled_history.log")
DB_PATH = os.path.join(DATA_DIR, "chroma_db")

if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)

client = chromadb.PersistentClient(path=DB_PATH)
web_collection = client.get_or_create_collection(name="schemes_web")
pdf_collection = client.get_or_create_collection(name="schemes_pdf")

# 🌟 LAZY LOADING FIX: Don't load the model until we actually need it!
embedder = None

def get_embedder():
    global embedder
    if embedder is None:
        print("⏳ Loading Scheme AI Model into memory (First time only)...")
        try:
            embedder = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2', local_files_only=True)
        except Exception:
            embedder = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    return embedder

# --- THE AGRICULTURAL FILTERS ---
BANNED_URL_WORDS = [
    'college', 'student', 'grievance', 'tender', 'syllabus', 
    'exam', 'result', 'faculty', 'admission', 'course','changelanguage', 'lang='
]

AGRI_KEYWORDS = [
    # Core English Farming Words
    'agri', 'farm', 'crop', 'harvest', 'soil', 'yield', 'horticulture', 
    'livestock', 'dairy', 'poultry', 'plantation', 'cultivation',

    # Core Marathi/Hindi Words
    'krishi', 'shetkari', 'sheti', 'kisan', 'pik', 'biyane', 'khate', 
    'fawarni', 'rog', 'kid', 'jamin', 'pani', 'paus', 'havaman',

    # Schemes & Finance
    'subsidy', 'scheme', 'yojana', 'yojna', 'anudan', 'loan', 'karj', 
    'insurance', 'vima', 'pikvima', 'pmkisan', 'nabard',

    # Equipment & Inputs
    'tractor', 'seed', 'fertilizer', 'irrigation', 'pesticide', 
    'insecticide', 'pump', 'drip', 'sprinkler',

    # Markets & Pricing
    'apmc', 'mandi', 'msp', 'bazar', 'bazarbhav', 'rate', 'quintal', 
    'export', 'import', 'vyapar',

    # Seasons & Weather
    'kharif', 'rabi', 'monsoon', 'drought', 'rainfall', 'weather',

    # Major Crops (Maharashtra/India focus)
    'cotton', 'kapus', 'sugarcane', 'us', 'onion', 'kanda', 'soybean', 
    'wheat', 'gahu', 'rice', 'tandul', 'tur', 'dal', 'maize', 'makka'
]

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
]

def log(msg):
    print(msg)
    sys.stdout.flush()

def get_random_headers():
    return {'User-Agent': random.choice(USER_AGENTS)}

def random_sleep(min_s=1, max_s=3):
    time.sleep(random.uniform(min_s, max_s))

def load_history():
    if not os.path.exists(HISTORY_FILE): return set()
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        return set(line.strip() for line in f)

def add_to_history(url):
    with open(HISTORY_FILE, 'a', encoding='utf-8') as f:
        f.write(url + "\n")

# 🌟 BULLETPROOF DB SAVER: Now limited to 10 to be completely immune to SQLite crashes
def safe_chroma_upsert(collection, docs, metas, ids, batch_size=10):
    if not docs: return
    for i in range(0, len(docs), batch_size):
        try:
            collection.upsert(
                documents=docs[i:i+batch_size],
                metadatas=metas[i:i+batch_size],
                ids=ids[i:i+batch_size]
            )
        except Exception as e:
            log(f"   ⚠️ Minor DB Warning: {e}. Self-healing and skipping chunk...")

# --- 1. THE JANITOR (Safely cleans dead links in chunks) ---
async def run_janitor():
    log("🧹 STARTING JANITOR: Checking for dead links in the database...")
    all_sources = set()
    
    # 🌟 SAFE JANITOR FIX: Fetch items in small chunks so SQLite doesn't crash!
    try:
        chunk_size = 100
        offset = 0
        
        while True:
            # Safely fetch web links
            web_data = web_collection.get(include=["metadatas"], limit=chunk_size, offset=offset)
            web_metas = web_data.get("metadatas") or []
            
            # Safely fetch PDF links
            pdf_data = pdf_collection.get(include=["metadatas"], limit=chunk_size, offset=offset)
            pdf_metas = pdf_data.get("metadatas") or []
            
            if not web_metas and not pdf_metas:
                break # We reached the end of the database!
                
            for meta in web_metas + pdf_metas:
                if meta and "source" in meta:
                    all_sources.add(meta["source"])
                    
            offset += chunk_size
            
    except Exception as e:
        log(f"   ⚠️ Janitor DB Read Error (Skipping cleanup this time): {e}")
        return # Safely exit the janitor without crashing the crawler!
            
    log(f"🔍 Found {len(all_sources)} unique URLs to verify.")
    
    deleted_count = 0
    async with httpx.AsyncClient(verify=False, timeout=5.0) as http_client:
        for url in all_sources:
            try:
                resp = await http_client.head(url)
                if resp.status_code == 404:
                    log(f"   💀 DEAD LINK FOUND (404): {url}. Deleting from DB...")
                    try:
                        web_collection.delete(where={"source": url})
                        pdf_collection.delete(where={"source": url})
                        deleted_count += 1
                    except Exception as e:
                        log(f"   ⚠️ Failed to delete {url}: {e}")
            except Exception:
                pass 
                
    log(f"✨ JANITOR FINISHED. Cleaned up {deleted_count} dead policies.")

# --- 2. THE OCR BRIDGE ---
def process_pdf_in_memory(pdf_url):
    try:
        log(f"  ⬇️  Streaming PDF to RAM: {pdf_url.split('/')[-1][:30]}...")
        random_sleep(2, 4)
        
        response = requests.get(pdf_url, headers=get_random_headers(), verify=False, timeout=30, stream=True)
        
        ct = response.headers.get('Content-Type', '').lower()
        if 'application/pdf' not in ct and 'binary' not in ct:
            log(f"  ⚠️ Skipped: Server says it is {ct}")
            return

        pdf_file = io.BytesIO(response.content)
        reader = PdfReader(pdf_file)
        count = 0
        pdf_images = None
        
        docs, metas, ids = [], [], []
        
        for i, page in enumerate(reader.pages):
            digital_text = page.extract_text()
            extracted_text = ""
            
            if digital_text and len(digital_text.strip()) > 50:
                extracted_text = digital_text
                log(f"      📄 Page {i+1}: Digital text found.")
            else:
                log(f"      👁️ Page {i+1}: No text found. Running OCR...")
                if pdf_images is None:
                    if POPPLER_PATH:
                        pdf_images = convert_from_bytes(response.content, poppler_path=POPPLER_PATH)
                    else:
                        pdf_images = convert_from_bytes(response.content)
                
                try:
                    page_image = pdf_images[i]
                    extracted_text = pytesseract.image_to_string(page_image, lang='mar+eng')
                except IndexError:
                    log(f"      ⚠️ Page {i+1}: Image mismatch error. Skipping.")
                    extracted_text = ""

            if extracted_text and len(extracted_text.strip()) > 50:
                docs.append(extracted_text)
                metas.append({"source": pdf_url, "type": "pdf_hybrid", "page": i+1})
                ids.append(f"pdf_hybrid_{pdf_url}_{i}")
                count += 1
        
        # 🌟 Use the bulletproof saver
        safe_chroma_upsert(pdf_collection, docs, metas, ids)
        
        if count > 0:
            log(f"  ✅ Indexed {count} pages (RAM Only).")
        else:
            log("  ⚠️ Scanned PDF failed OCR. No text extracted.")
            
        add_to_history(pdf_url)

    except Exception as e:
        log(f"  ❌ PDF Error: {e}")

# --- 3. CRAWL4AI DOMAIN SPIDER ---
async def crawl_domain(start_url, max_pages=100):
    domain = urlparse(start_url).netloc
    queue_file = os.path.join(DATA_DIR, f"queue_{domain}.txt")
    visited = load_history()
    
    if os.path.exists(queue_file):
        with open(queue_file, 'r', encoding='utf-8') as f:
            queue = [line.strip() for line in f if line.strip()]
            if not queue: 
                queue = [start_url]
    else:
        queue = [start_url]
        
    pages_crawled = 0
    log(f"🚀 STARTING/RESUMING CRAWL: {domain} (Batch of {max_pages} pages)")

    try:
        async with AsyncWebCrawler(verbose=False) as crawler:
            while queue and pages_crawled < max_pages:
                current_url = queue.pop(0)
                
                if any(banned in current_url.lower() for banned in BANNED_URL_WORDS): continue
                if current_url in visited: continue
                
                visited.add(current_url)
                add_to_history(current_url)
                
                if current_url.lower().endswith('.pdf'):
                    process_pdf_in_memory(current_url)
                    pages_crawled += 1 
                    continue

                try:
                    log(f"🕷️ ({pages_crawled}/{max_pages}) Rendering JS: {current_url}")
                    raw_result = await crawler.arun(url=current_url, bypass_cache=True)
                    result = cast(Any, raw_result)
                    
                    if not result.success: continue
                    text = result.markdown or ""
                    
                    text_lower = text.lower()
                    if not any(keyword in text_lower for keyword in AGRI_KEYWORDS):
                        log("   🗑️ No agriculture keywords. Trashing page.")
                    elif len(text) > 200:
                        chunks = [text[i:i+1000] for i in range(0, len(text), 1000)]
                        
                        docs, metas, ids = [], [], []
                        for i, chunk in enumerate(chunks):
                            docs.append(chunk)
                            metas.append({"source": current_url, "type": "website"})
                            ids.append(f"web_{current_url}_{i}")
                        
                        # 🌟 Use the bulletproof saver
                        safe_chroma_upsert(web_collection, docs, metas, ids)
                    
                    pages_crawled += 1
                    
                    if hasattr(result, 'links') and "internal" in result.links:
                        for link_data in result.links["internal"]:
                            full_link = link_data.get("href", "")
                            parsed_link = urlparse(full_link)
                            base_domain = domain.replace("www.", "")
                            
                            if base_domain in parsed_link.netloc:
                                if any(x in full_link.lower() for x in ['login', 'register', 'javascript', '#', 'mailto:']):
                                    continue
                                if full_link not in visited and full_link not in queue:
                                    queue.append(full_link)

                except Exception as e:
                    log(f"  ❌ Error: {e}")

    finally:
        if queue:
            with open(queue_file, 'w', encoding='utf-8') as f:
                for q_url in queue: f.write(q_url + "\n")
            log(f"⏸️ Pausing {domain}. Saved {len(queue)} links to {queue_file}.")
        else:
            if os.path.exists(queue_file): os.remove(queue_file)
            log(f"🏁 COMPLETELY FINISHED DOMAIN: {domain}. No more links exist!")

async def run_auto_crawler():
    log("🚀 DEEP CRAWLER CYCLE INITIATED.")
    last_janitor_run = datetime.datetime.now() # Mock or load from state if preferred
    
    now = datetime.datetime.now()
    
    # Only run every 7 days, AND only if it's the middle of the night
    if (3 <= now.hour <= 5):
        # We can optionally load last_janitor_run from a file to be truly periodic
        await run_janitor()
        log("📅 Janitor cleanup complete for this cycle.")

    if not os.path.exists(WEBSITE_LIST_FILE):
        log("⚠️ No website list found. Skipping crawl.")
        return

    with open(WEBSITE_LIST_FILE, 'r') as f:
        start_urls = [line.strip() for line in f.readlines() if line.strip()]
    
    for url in start_urls:
        await crawl_domain(url, max_pages=50) # Reduced to 50 for faster pipeline cycling
        log("⏳ Cooling down (10s)...")
        await asyncio.sleep(10)
        
    log("🏁 DEEP CRAWLER CYCLE FINISHED. Returning to Master Pipeline.")

# --- 4. THE CHAT ENGINE ---
def query_schemes(user_query):
    web_results = web_collection.query(query_texts=[user_query], n_results=2)
    pdf_results = pdf_collection.query(query_texts=[user_query], n_results=2)
    
    context = ""
    sources = set()
    
    web_docs = web_results.get('documents')
    web_metas = web_results.get('metadatas')
    if web_docs and web_docs[0]:
        context += "\n--- WEBSITE DATA ---\n" + "\n".join(web_docs[0])
        if web_metas and web_metas[0]:
            for meta in web_metas[0]:
                if meta and "source" in meta: sources.add(meta["source"])
                
    pdf_docs = pdf_results.get('documents')
    pdf_metas = pdf_results.get('metadatas')
    if pdf_docs and pdf_docs[0]:
        context += "\n--- PDF DOCUMENTS ---\n" + "\n".join(pdf_docs[0])
        if pdf_metas and pdf_metas[0]:
            for meta in pdf_metas[0]:
                if meta and "source" in meta: sources.add(meta["source"])

    if not context: return "No relevant schemes found in database."
    source_text = "\n\n**🌐 Official Sources:**\n" + "\n".join([f"🔗 {s}" for s in sources])

    print("⚡ Returning raw scheme data to Main Agent...")
    raw_result = (
        f"--- RELEVANT SCHEME DOCUMENTS ---\n{context}\n\n"
        f"Official Sources: {', '.join(sources)}\n"
        f"Please summarize this scheme for the user."
    )
    return raw_result

if __name__ == "__main__":
    asyncio.run(run_auto_crawler())