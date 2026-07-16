# AgriVani

**AI-powered agricultural assistant for Indian farmers** — multilingual chat, mandi prices, crop disease detection, government scheme search, and voice support.

---

## Features

- **Conversational AI** — Agentic chat with intent planning (prices, weather, schemes, disease, general Q&A)
- **Mandi price tracker** — Live APMC prices from data.gov.in with Prophet-based forecasting
- **Plant disease detection** — Upload a crop photo; vision AI diagnoses disease and suggests treatment via RAG
- **Government scheme RAG** — ChromaDB-backed semantic search over crawled agri-gov websites and PDFs
- **Crop knowledge base** — Separate ChromaDB index for pest/disease treatment manuals
- **Multilingual support** — Marathi ↔ English translation; Marathi TTS (Vakyansh) and ASR (IndicConformer)
- **Weather forecasts** — Open-Meteo (backend) and OpenWeatherMap (frontend widget)
- **Price alerts** — Set crop price targets; email notifications when thresholds are hit
- **Offline-first client** — IndexedDB (Dexie) cache with sync queue for chats, prices, and voice
- **Farmer profiles** — Firebase Auth + Firestore for crops, location, and chat history

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 6, React Router 7, Dexie (IndexedDB), Recharts |
| **Backend** | FastAPI, Uvicorn, APScheduler, LangChain, Ollama |
| **ML / AI** | PyTorch (EfficientNet-V2), Ollama (Llava, Qwen2.5, Gemma2), Sentence-Transformers |
| **Vector DB** | ChromaDB (persistent local storage) |
| **Auth & Data** | Firebase Auth + Firestore |
| **Media** | Cloudinary, ImageKit |
| **ASR (optional)** | NVIDIA NeMo / AI4Bharat IndicConformer (separate service) |
| **TTS** | Vakyansh Glow-TTS + HiFi-GAN (Marathi) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React/Vite Frontend (client/)               │
│  Auth (Firebase) │ Chat UI │ Prices │ Disease Upload │ Voice  │
│  IndexedDB cache │ Offline sync queue                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST / SSE
┌──────────────────────────▼──────────────────────────────────────┐
│                   FastAPI Backend (backend/server.py)             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Agent       │  │ Disease      │  │ Price Engine           │  │
│  │ Planner     │  │ Detection    │  │ (SQLite + Prophet)     │  │
│  │ (Ollama)    │  │ (Llava+Chroma)│  │ data.gov.in API       │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬────────────┘  │
│         │                │                       │               │
│  ┌──────▼────────────────▼───────────────────────▼────────────┐  │
│  │              ChromaDB (data/chroma_db/)                    │  │
│  │  schemes_web │ schemes_pdf │ crop_knowledge_web │ crop_pdf │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────┬──────────────────┬─────────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌───────▼───────┐  ┌──────▼──────┐
    │  Firebase   │   │ Ollama LLM    │  │ ASR Server  │
    │  Firestore  │   │ (local/remote)│  │ (NeMo, opt) │
    └─────────────┘   └───────────────┘  └─────────────┘
```

**Request flow (chat):** User message → `/ask` → NLU planner picks actions → tools fetch prices/weather/schemes/disease data → Ollama streams final answer → saved to Firestore + client cache.

**Disease flow:** Image upload → `/api/predict-disease` → Llava vision (crop + disease) → ChromaDB treatment lookup → Ollama advice → bilingual response.

---

## Folder Structure

```
AgriVani/
├── backend/                    # FastAPI Python backend
│   ├── server.py               # Main API server & agent orchestration
│   ├── price_engine.py         # Mandi prices, Prophet forecasting, SQLite
│   ├── scheme_engine.py        # Govt scheme crawler + ChromaDB RAG
│   ├── crop_data.py            # Crop disease/treatment knowledge crawler + RAG
│   ├── knowledge_base.py       # Legacy LangChain-based scheme RAG
│   ├── nlu_engine.py           # Intent extraction (Ollama gemma2)
│   ├── voice_engine.py         # STT/TTS + Marathi translation
│   ├── weather_engine.py       # Open-Meteo forecasts
│   ├── news_engine.py          # Google News RSS + sentiment
│   ├── alert_engine.py         # Gmail price alert emails
│   ├── firebase_engine.py      # Firebase Admin SDK init
│   ├── asr_server.py           # Standalone IndicConformer ASR (runs on GPU machine)
│   ├── download_models.py      # Downloads Vakyansh TTS weights
│   ├── data/                   # JSON configs, SQLite DBs, ChromaDB, crawl queues
│   ├── models/                 # TTS + plant disease PyTorch weights (gitignored)
│   ├── scripts/                # Data pipeline utilities (ETL, analysis, migration)
│   └── tts_infer/              # Vakyansh TTS inference helpers
├── client/                     # React/Vite frontend
│   ├── src/
│   │   ├── routes/             # Page components (Home, Dashboard, Chat, Prices…)
│   │   ├── components/         # Reusable UI (Chat, Upload, Weather, Alerts…)
│   │   ├── layout/             # RootLayout, DashboardLayout
│   │   ├── context/            # Auth, Language, Theme providers
│   │   ├── hooks/              # useSpeechToText
│   │   └── lib/                # API clients, Firebase, Dexie, market services
│   ├── public/
│   └── package.json
├── .gitignore
└── README.md
```

> **Note:** The `NeMo/` folder in the parent workspace is a **separate dependency** for the optional ASR server. Do **not** include it in this repository.

---

## Prerequisites

- **Python** 3.10 – 3.12
- **Node.js** 18+ (tested with 24.x)
- **Ollama** with models: `llava`, `qwen2.5:3b`, `gemma2:2b`
- **ffmpeg** (audio conversion for STT/TTS)
- **Firebase project** with Auth + Firestore enabled
- *(Optional)* Tesseract OCR + Poppler (for PDF crawling)
- *(Optional)* CUDA GPU (for local ASR / PyTorch inference)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/agrivani.git
cd agrivani
```

### 2. Backend setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

**Download TTS models (~150 MB):**

```bash
python download_models.py
```

**Add plant disease model weights** (not included in repo):

Place your trained EfficientNet weights in:
```
backend/models/Plant_Dataset_Model_Backup/
  ├── efficientnet_v2_s_finetune_best.pth
  └── efficientnet_v2_s_finetune_classes.json
```

**Configure environment:**

```bash
cp .env.example .env
cp serviceAccountKey.json.example serviceAccountKey.json
# Fill in all values — see Environment Variables below
```

**Start the backend:**

```bash
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend setup

```bash
cd ../client
npm install
cp .env.example .env
# Fill in all VITE_* values
npm run dev
```

Open **http://localhost:5173**

### 4. (Optional) ASR server on a GPU machine

```bash
# On a separate machine with CUDA:
git clone https://github.com/AI4Bharat/NeMo.git
cd NeMo && git checkout nemo-v2
pip install -r requirements/requirements_asr.txt
pip install fastapi uvicorn python-multipart pydub torch torchaudio

# Copy backend/asr_server.py to that machine and run:
python asr_server.py   # listens on :8001
```

Set `VAKYANSH_ASR_URL` in `backend/.env` to point to that server.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `MARKET_PRICE` | data.gov.in API key for mandi prices |
| `GEOAPIFY_KEY` | Geocoding (APMC coordinate lookup) |
| `OPENWEATHER_KEY` | OpenWeatherMap (if used server-side) |
| `GOVT_API_KEY` | Additional government data API |
| `IMAGE_KIT_ENDPOINT` | ImageKit CDN endpoint |
| `IMAGE_KIT_PUBLIC_KEY` | ImageKit public key |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit upload signing (server-side secret) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `OLLAMA_LLM_URL` | Ollama base URL for text LLM (default `http://localhost:11434`) |
| `OLLAMA_CROP_URL` | Ollama URL for crop vision extraction |
| `OLLAMA_VISION_URL` | Ollama vision API endpoint for disease detection |
| `VAKYANSH_ASR_URL` | IndicConformer ASR server URL |

Also place your Firebase Admin SDK JSON at `backend/serviceAccountKey.json`.

### Frontend (`client/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |
| `VITE_OPENWEATHER_API_KEY` | OpenWeatherMap for weather widget |
| `VITE_GROQ_API_KEY` | Groq SDK (client-side LLM calls) |
| `VITE_AI_PUBLIC_KEY` | Google Generative AI API key |
| `VITE_IMAGE_KIT_ENDPOINT` | ImageKit CDN endpoint |
| `VITE_IMAGE_KIT_PUBLIC_KEY` | ImageKit public key |

Firebase client config should also be moved to environment variables (see Security section).

---

## API Endpoints (Backend)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ask` | Main chat agent (streaming SSE) |
| `POST` | `/api/predict-disease` | Plant disease detection from image |
| `POST` | `/api/transcribe` | Speech-to-text |
| `POST` | `/voice-ask` | Voice input → chat response |
| `GET/POST` | `/api/chats/*` | Chat CRUD (Firestore) |
| `GET` | `/api/prices/{crop}` | Mandi prices for a crop |
| `GET` | `/api/prices/predict/{crop}` | Price forecast |
| `GET/POST/DELETE` | `/api/prices/alerts` | Price alert management |
| `GET/POST` | `/api/profile/*` | Farmer profile read/update |
| `POST` | `/api/translate` | Marathi ↔ English translation |
| `GET` | `/api/upload` | ImageKit upload auth signature |

---

## Running Locally (Quick Start)

```bash
# Terminal 1 — Backend
cd backend && .venv\Scripts\activate && uvicorn server:app --reload --port 8000

# Terminal 2 — Frontend
cd client && npm run dev

# Terminal 3 — Ollama (if not already running)
ollama serve
ollama pull llava qwen2.5:3b gemma2:2b
```
## Author

   Built by:
   - Bipin Balkrishna Patil
   - Sarvesh Sanjay Sawant
   - Shaun Thomas Jacob     
   - Ron Gibson Vincelal Joe
