import os
import requests
import hashlib
import json
import chromadb
import io
from bs4 import BeautifulSoup
from pypdf import PdfReader
from urllib.parse import urljoin, urlparse
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

DB_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")
WEBSITES_FILE = os.path.join(os.path.dirname(__file__), "websites.txt")
METADATA_FILE = os.path.join(os.path.dirname(__file__), "crawl_status.json")

try:
    from langchain_community.embeddings.fastembed import FastEmbedEmbeddings
    embedding_func = FastEmbedEmbeddings(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
except:
    from langchain_huggingface import HuggingFaceEmbeddings 
    embedding_func = HuggingFaceEmbeddings(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

class GovernmentSchemeRAG:
    def __init__(self):
        self.client = chromadb.PersistentClient(path=DB_DIR)
        self.vector_db = Chroma(client=self.client, collection_name="govt_schemes", embedding_function=embedding_func)
        self.status_data = self._load_status()
        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)

    def _load_status(self):
        if os.path.exists(METADATA_FILE):
            try:
                with open(METADATA_FILE, "r") as f: return json.load(f)
            except: pass
        return {"indexed_urls": []}

    def _save_status(self):
        with open(METADATA_FILE, "w") as f: json.dump(self.status_data, f)

    def _crawl_website_generator(self, base_url, max_depth=2):
        print(f"🕷️ CRAWLING: {base_url}")
        visited, to_visit = set(), [(base_url, 0)]
        already_indexed = set(self.status_data.get("indexed_urls", []))
        
        while to_visit:
            current_url, depth = to_visit.pop(0)
            if current_url in already_indexed or current_url in visited or depth > max_depth: continue
            visited.add(current_url)
            
            try:
                resp = requests.get(current_url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
                if resp.status_code != 200: continue
                
                clean_text, title = "", "No Title"
                content_type = resp.headers.get('Content-Type', '').lower()

                if 'application/pdf' in content_type:
                    try:
                        pdf_file = io.BytesIO(resp.content)
                        reader = PdfReader(pdf_file)
                        for page in reader.pages: clean_text += page.extract_text() + "\n"
                        title = "PDF Document"
                    except: continue
                elif 'text/html' in content_type:
                    soup = BeautifulSoup(resp.content, "html.parser")
                    for tag in soup(["script", "style", "nav", "footer"]): tag.extract()
                    clean_text = soup.get_text(separator="\n")
                    title = soup.title.string if soup.title else "No Title"
                    
                    if depth < max_depth:
                        for link in soup.find_all("a", href=True):
                            full_url = urljoin(current_url, str(link["href"]))
                            if urlparse(full_url).netloc == urlparse(base_url).netloc:
                                to_visit.append((full_url, depth + 1))

                if len(clean_text) > 300:
                    yield Document(page_content=clean_text, metadata={"source": current_url, "title": title})
                    self.status_data["indexed_urls"].append(current_url)
                    self._save_status()
            except: pass

    def initialize_and_check(self):
        if not os.path.exists(WEBSITES_FILE): return
        with open(WEBSITES_FILE, "r") as f: urls = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        
        for url in urls:
            doc_stream = self._crawl_website_generator(url)
            chunk_buffer, ids_buffer = [], []
            for doc in doc_stream:
                new_chunks = self.text_splitter.split_documents([doc])
                for chunk in new_chunks:
                    unique_string = f"{chunk.metadata['source']}_{chunk.page_content[:50]}"
                    chunk_id = hashlib.md5(unique_string.encode()).hexdigest()
                    chunk_buffer.append(chunk)
                    ids_buffer.append(chunk_id)
                
                if len(chunk_buffer) >= 2000:
                    self.vector_db.add_documents(documents=chunk_buffer, ids=ids_buffer)
                    chunk_buffer, ids_buffer = [], []
            if chunk_buffer: self.vector_db.add_documents(documents=chunk_buffer, ids=ids_buffer)

    def search_schemes(self, query):
        results = self.vector_db.similarity_search(query, k=4)
        if not results: return None
        return "\n\n".join([f"SOURCE: {doc.metadata['source']}\nDETAILS: {doc.page_content[:800]}..." for doc in results])

    def find_schemes_for_crop(self, crop_name):
        query = f"government schemes for {crop_name} farmers subsidy"
        results = self.vector_db.similarity_search(query, k=2)
        return [doc.page_content for doc in results] if results else None

rag_engine = GovernmentSchemeRAG()