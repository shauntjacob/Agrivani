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
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from urllib.parse import urlparse
from typing import Any, cast

# --- ASYNC SCRAPER ---
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

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- CONFIGURATION ---
BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")

# Fixed: Now points to the data folder
WEBSITE_LIST_FILE = os.path.join(DATA_DIR, "crop_websites.txt")

HISTORY_FILE = os.path.join(DATA_DIR, "crop_crawled_history.log")
DB_PATH = os.path.join(DATA_DIR, "chroma_db")

if not os.path.exists(DATA_DIR): os.makedirs(DATA_DIR)

client = chromadb.PersistentClient(path=DB_PATH)
web_collection = client.get_or_create_collection(name="crop_knowledge_web")
pdf_collection = client.get_or_create_collection(name="crop_knowledge_pdf")

# 🌟 LAZY LOADING FIX: Stops the computer from crashing on boot!
embedder = None
def get_embedder():
    global embedder
    if embedder is None:
        print("⏳ Loading Crop AI Model into memory (First time only)...")
        try:
            embedder = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2', local_files_only=True)
        except Exception:
            embedder = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    return embedder

BANNED_URL_WORDS = ['login', 'register', 'changelanguage', 'lang=', 'cart', 'checkout']

# 🌟 THE SUPERCHARGED KEYWORD LIST
AGRI_KEYWORDS = [
    'agri', 'farm', 'crop', 'harvest', 'soil', 'yield', 'horticulture', 
    'livestock', 'dairy', 'poultry', 'plantation', 'cultivation',
    'krishi', 'shetkari', 'sheti', 'kisan', 'pik', 'biyane', 'khate', 
    'fawarni', 'rog', 'kid', 'jamin', 'pani', 'paus', 'havaman',
    'subsidy', 'scheme', 'yojana', 'yojna', 'anudan', 'loan', 'karj', 
    'insurance', 'vima', 'pikvima', 'pmkisan', 'nabard',
    'tractor', 'seed', 'fertilizer', 'irrigation', 'pesticide', 
    'insecticide', 'pump', 'drip', 'sprinkler',
    'apmc', 'mandi', 'msp', 'bazar', 'bazarbhav', 'rate', 'quintal', 
    'export', 'import', 'vyapar',
    'kharif', 'rabi', 'monsoon', 'drought', 'rainfall', 'weather',
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

def random_sleep(min_s=1, max_s=3):
    time.sleep(random.uniform(min_s, max_s))

def load_history():
    if not os.path.exists(HISTORY_FILE): return set()
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        return set(line.strip() for line in f)

def add_to_history(url):
    with open(HISTORY_FILE, 'a', encoding='utf-8') as f:
        f.write(url + "\n")

# 🌟 BULLETPROOF DB SAVER: Chunk size strictly 10 to prevent SQLite crashes!
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
            log(f"   ⚠️ Minor DB Warning: {e}. Self-healing and skipping this corrupt chunk...")

# --- 1. THE OCR BRIDGE (For Crop Manual PDFs) ---
def process_pdf_in_memory(pdf_url):
    try:
        log(f"  ⬇️  Streaming PDF to RAM: {pdf_url.split('/')[-1][:30]}...")
        random_sleep(2, 4)
        
        response = requests.get(pdf_url, headers={'User-Agent': random.choice(USER_AGENTS)}, verify=False, timeout=30, stream=True)
        
        ct = response.headers.get('Content-Type', '').lower()
        if 'application/pdf' not in ct and 'binary' not in ct:
            log(f"  ⚠️ Skipped: Not a valid PDF.")
            return

        pdf_file = io.BytesIO(response.content)
        reader = PdfReader(pdf_file)
        count = 0
        pdf_images = None
        
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
                chunks = [extracted_text[j:j+1000] for j in range(0, len(extracted_text), 1000)]
                docs, metas, ids = [], [], []
                
                for c_idx, chunk in enumerate(chunks):
                    docs.append(chunk)
                    metas.append({"source": pdf_url, "type": "pdf_hybrid", "page": i+1})
                    ids.append(f"pdf_{pdf_url}_{i}_{c_idx}")
                
                # 🌟 Bulletproof saver handles the upload safely!
                safe_chroma_upsert(pdf_collection, docs, metas, ids)
                count += 1
        
        if count > 0:
            log(f"  ✅ Indexed {count} pages of crop data.")
        add_to_history(pdf_url)

    except Exception as e:
        log(f"  ❌ PDF Error: {e}")

# --- 2. CRAWL4AI DOMAIN SPIDER ---
async def crawl_domain(start_url, max_pages=50):
    domain = urlparse(start_url).netloc
    queue_file = os.path.join(DATA_DIR, f"crop_queue_{domain}.txt")
    visited = load_history()
    
    if os.path.exists(queue_file):
        with open(queue_file, 'r', encoding='utf-8') as f:
            queue = [line.strip() for line in f if line.strip()]
            if not queue: queue = [start_url]
    else:
        queue = [start_url]
        
    pages_crawled = 0
    log(f"🚀 CRAWLING KNOWLEDGE BASE: {domain}")

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
                    log(f"🕷️ ({pages_crawled}/{max_pages}) Extracting Core Content: {current_url}")
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
                        
                        # 🌟 Bulletproof saver handles the upload safely!
                        safe_chroma_upsert(web_collection, docs, metas, ids)
                    
                    pages_crawled += 1
                    
                    if hasattr(result, 'links') and "internal" in result.links:
                        for link_data in result.links["internal"]:
                            full_link = link_data.get("href", "")
                            base_domain = domain.replace("www.", "")
                            if base_domain in urlparse(full_link).netloc:
                                if full_link not in visited and full_link not in queue:
                                    queue.append(full_link)

                except Exception as e:
                    log(f"  ❌ Error: {e}")

    finally:
        if queue:
            with open(queue_file, 'w', encoding='utf-8') as f:
                for q_url in queue: f.write(q_url + "\n")
            log(f"⏸️ Paused. Saved {len(queue)} links to {queue_file}.")
        else:
            if os.path.exists(queue_file): os.remove(queue_file)
            log(f"🏁 FINISHED DOMAIN: {domain}.")

async def build_crop_knowledge_base():
    log("🌱 STARTING CROP KNOWLEDGE EXTRACTOR...")
    
    if not os.path.exists(WEBSITE_LIST_FILE):
        log(f"⚠️ Please create {WEBSITE_LIST_FILE} and add URLs to scrape.")
        return

    with open(WEBSITE_LIST_FILE, 'r') as f:
        start_urls = [line.strip() for line in f.readlines() if line.strip()]
    
    for url in start_urls:
        await crawl_domain(url, max_pages=200)
        log("⏳ Cooling down (5s)...")
        await asyncio.sleep(5)
        
    log("✅ ALL CROP KNOWLEDGE EXTRACTED AND SAVED TO CHROMADB.")

# --- 3. THE SEARCH FUNCTION FOR SERVER.PY ---
def search_crop_db(query: str, crop_name: str = "") -> str:
    search_query = f"{crop_name} {query}".strip()
    
    web_results = web_collection.query(query_texts=[search_query], n_results=2)
    pdf_results = pdf_collection.query(query_texts=[search_query], n_results=2)
    
    context = ""
    sources = set()
    
    web_docs = web_results.get('documents')
    web_metas = web_results.get('metadatas')
    if web_docs and web_docs[0]:
        context += "\n--- WEB DATA ---\n" + "\n".join(web_docs[0])
        if web_metas and web_metas[0]:
            for meta in web_metas[0]:
                if meta and "source" in meta: sources.add(meta["source"])
                
    pdf_docs = pdf_results.get('documents')
    pdf_metas = pdf_results.get('metadatas')
    if pdf_docs and pdf_docs[0]:
        context += "\n--- PDF MANUALS ---\n" + "\n".join(pdf_docs[0])
        if pdf_metas and pdf_metas[0]:
            for meta in pdf_metas[0]:
                if meta and "source" in meta: sources.add(meta["source"])

    if not context: return "No specific agricultural data found in the knowledge base."
    
    raw_result = (
        f"--- RELEVANT KNOWLEDGE BASE DOCUMENTS ---\n{context}\n\n"
        f"Official Sources: {', '.join(sources)}\n"
        f"Please answer the user's question using only the facts provided above."
    )
    return raw_result

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(build_crop_knowledge_base())