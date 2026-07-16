# AgriVani

**AI-powered agricultural assistant for Indian farmers** — Marathi voice interaction, mandi price forecasting, crop disease detection, government scheme search, and offline-first support, powered by a federated multi-node local LLM deployment.

---

## Features

- **Conversational AI** — Agentic chat with NLU-based intent detection (prices, weather, schemes, disease, general Q&A)
- **Mandi price tracker** — Live APMC prices from the Data.gov.in API, with Prophet-based 7-day price forecasting
- **Price alerts** — Set crop price targets; email notifications when thresholds are hit
- **Plant disease detection** — Upload a crop/leaf photo; a fine-tuned EfficientNetV2-S (CNN) model classifies the disease across a 38-class taxonomy (tomato, rice, maize, potato) and returns confidence scores plus treatment suggestions, cross-checked with a LLaVA vision pass
- **Government scheme RAG** — ChromaDB-backed semantic search over government scheme websites and PDFs, crawled with Crawl4AI (async web crawler) and OCR'd where needed
- **Multilingual support** — Marathi voice input via the Vyakyansh ASR model (client-side), translated to English via the `deep-translator` (Google Translate) library for intent processing; responses are converted to Marathi speech using gTTS
- **Weather forecasts** — Open-Meteo integration for temperature, rainfall, and wind speed
- **Offline-first client** — IndexedDB (Dexie) cache with a sync queue for chats, prices, and voice, so the app stays usable in low-connectivity rural areas
- **Farmer profiles** — Firebase Auth + Firestore for crops, location, and chat history
- **Media handling** — Cloudinary and ImageKit for crop image storage and delivery

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Vite 6, React Router 7, Dexie (IndexedDB), Recharts |
| **Backend** | FastAPI, Uvicorn, APScheduler, LangChain (embeddings/vector store integration) |
| **ML / AI** | PyTorch (EfficientNetV2-S), Ollama (llama3.1:8b, qwen2.5:3b, LLaVA), Sentence-Transformers |
| **Vector DB** | ChromaDB (persistent local storage) |
| **Speech** | Vyakyansh (ASR, client-side), gTTS (Marathi TTS), deep-translator (Marathi ↔ English) |
| **Auth & Data** | Firebase Auth + Firestore |
| **Media** | Cloudinary, ImageKit |
| **Networking** | Tailscale (private mesh VPN linking federated inference nodes) |
| **Data Sources** | Data.gov.in APMC API, Open-Meteo, government scheme portals (crawled) |

---

## Architecture

AgriVani runs as a **Federated Multi-Node Architecture**, with three machines communicating over a private Tailscale mesh VPN (encrypted, low-latency, no internet dependency between nodes):

```
┌───────────────────────────────────────────────────────────────────────┐
│                    Federated Multi-Node Architecture                  │
│                     (Tailscale Private Mesh VPN)                      │
│                                                                         │
│   ┌────────────────┐     ┌────────────────┐     ┌───────────────────┐ │
│   │ Orchestrator   │◄───►│ Vision Node    │◄───►│ Inference Node    │ │
│   │ Node (Laptop 1)│     │ (Laptop 2)     │     │ (Laptop 3)         │ │
│   │ FastAPI        │     │ LLaVA          │     │ llama3.1:8b        │ │
│   │ Routing, API   │     │ (multimodal    │     │ (via Ollama)       │ │
│   │ management     │     │ image analysis)│     │ Reasoning, advisory│ │
│   │                │     │                │     │ synthesis          │ │
│   └────────┬───────┘     └────────────────┘     └────────────────────┘ │
└────────────┼───────────────────────────────────────────────────────────┘
             │
   ┌─────────▼──────────────────────────────────────────────────────────┐
   │                       React/Vite Frontend (client/)                 │
   │  Auth (Firebase) │ Chat UI │ Prices │ Disease Upload │ Voice        │
   │  IndexedDB cache │ Offline sync queue                               │
   └───────────────────────────────────────────────────────────────────┘
```

**Voice input path:**
Farmer speaks (Marathi) → audio preprocessing → Vyakyansh ASR → text translated to English via `deep-translator` → NLU intent classification → RAG / price / weather / scheme lookup → response generated → translated back and delivered as Marathi speech (gTTS) → saved to Firestore + client cache.

**Image input path:**
Farmer uploads/captures crop image → preprocessing (resize, noise removal, color correction) → image sent to LLaVA (Vision Node) for description **and** to the EfficientNetV2-S classifier (Orchestrator Node) for disease classification → confidence score computed → treatment advisory retrieved from knowledge base → llama3.1:8b (Inference Node) synthesizes the final farmer-facing response.

**Knowledge base:**
ChromaDB stores chunked government scheme documents (both web-scraped text and OCR'd PDFs), populated by a Crawl4AI async crawler. Embeddings are generated with `paraphrase-multilingual-MiniLM-L12-v2` (Sentence-Transformers), enabling multilingual Marathi/English similarity search. Mandi prices are stored in SQLite and forecast 7 days ahead using Prophet.

---

## Folder Structure

```
AgriVani/
├── backend/                    # FastAPI Python backend (Orchestrator Node)
│   ├── server.py               # Main API server & agent orchestration
│   ├── price_engine.py         # Mandi prices, Prophet forecasting, SQLite
│   ├── scheme_engine.py        # Crawl4AI-based govt scheme crawler + ChromaDB RAG
│   ├── crop_data.py            # Crop disease/treatment knowledge crawler
│   ├── nlu_engine.py           # Intent extraction
│   ├── voice_engine.py         # Vyakyansh ASR handling, gTTS, Marathi/English translation
│   ├── weather_engine.py       # Open-Meteo forecasts
│   ├── alert_engine.py         # Gmail price alert emails
│   ├── firebase_engine.py      # Firebase Admin SDK init
│   ├── data/                   # JSON configs, SQLite DBs, ChromaDB, crawl queues
│   ├── models/                 # Plant disease PyTorch weights (gitignored)
│   └── scripts/                # Data pipeline utilities (ETL, analysis, migration)
├── client/                     # React/Vite frontend
│   ├── src/
│   │   ├── routes/             # Page components (Home, Dashboard, Chat, Prices…)
│   │   ├── components/         # Reusable UI (Chat, Upload, Weather, Alerts…)
│   │   ├── layout/             # RootLayout, DashboardLayout
│   │   ├── context/            # Auth, Language, Theme providers
│   │   ├── hooks/               # useSpeechToText
│   │   └── lib/                # API clients, Firebase, Dexie, market services
│   ├── public/
│   └── package.json
├── vision_node/                 # LLaVA multimodal service (runs on Laptop 2)
├── inference_node/               # llama3.1:8b via Ollama (runs on Laptop 3)
├── .gitignore
└── README.md
```

> **Note:** The Vision Node and Inference Node are intended to run on separate machines on the same Tailscale network. They are not required to be colocated with the Orchestrator, and the folder layout above should be adapted based on how you split the services across machines.

---

## Prerequisites

- **Operating System:** Windows 10/11 (developed and tested on Windows; other OSes are untested)
- **Python** 3.9+
- **Node.js** 18+
- **Ollama** with models: `llama3.1:8b`, `qwen2.5:3b`, `llava`
- **Tailscale** account (for connecting the Orchestrator, Vision, and Inference nodes if running on separate machines)
- **Firebase project** with Auth + Firestore enabled
- **Cloudinary** and/or **ImageKit** account for media storage
- **Hardware (per node):**
  - Minimum: Intel i3/AMD equivalent, 4 GB RAM, 250 GB HDD
  - Recommended: Intel i5/i7 or Ryzen 5+, 8 GB+ RAM, 512 GB SSD, NVIDIA GPU with 4 GB+ VRAM (for the Vision/Inference nodes)
- **Internet:** 2 Mbps minimum, 5 Mbps+ recommended (for data source APIs; inter-node traffic runs over Tailscale, not the public internet)

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/agrivani.git
cd agrivani
```

### 2. Backend setup (Orchestrator Node)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows

pip install -r requirements.txt
```

**Add plant disease model weights** (not included in repo):

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

### 4. Vision Node (LLaVA) — separate machine

```bash
# On a machine with Ollama installed, joined to the same Tailscale network:
ollama pull llava
ollama serve
```

### 5. Inference Node (llama3.1:8b) — separate machine

```bash
# On another machine, joined to the same Tailscale network:
ollama pull llama3.1:8b
ollama pull qwen2.5:3b
ollama serve
```

Point the Orchestrator's `.env` at the Tailscale IPs/hostnames of the Vision and Inference nodes (see Environment Variables below).

> If you don't have separate machines available, all three Ollama models can instead be run on a single machine for local development — the federated multi-node design is a deployment choice, not a hard requirement.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `MARKET_PRICE` | Data.gov.in API key for mandi prices |
| `GEOAPIFY_KEY` | Geocoding (APMC coordinate lookup) |
| `GOVT_API_KEY` | Additional government data API |
| `IMAGE_KIT_ENDPOINT` | ImageKit CDN endpoint |
| `IMAGE_KIT_PUBLIC_KEY` | ImageKit public key |
| `IMAGEKIT_PRIVATE_KEY` | ImageKit upload signing (server-side secret) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `OLLAMA_LLM_URL` | Ollama URL for the Inference Node (llama3.1:8b) |
| `OLLAMA_VISION_URL` | Ollama URL for the Vision Node (LLaVA) |
| `OLLAMA_CROP_URL` | Ollama URL used for auxiliary crop-related generation (qwen2.5:3b) |

Also place your Firebase Admin SDK JSON at `backend/serviceAccountKey.json`.

### Frontend (`client/.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | Backend base URL (e.g. `http://localhost:8000`) |
| `VITE_IMAGE_KIT_ENDPOINT` | ImageKit CDN endpoint |
| `VITE_IMAGE_KIT_PUBLIC_KEY` | ImageKit public key |

Firebase client config should also be moved to environment variables (see Security section).

---

## API Endpoints (Backend)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ask` | Main chat agent |
| `POST` | `/api/predict-disease` | Plant disease detection from image (EfficientNetV2-S + LLaVA) |
| `POST` | `/api/transcribe` | Speech-to-text (Vyakyansh) |
| `POST` | `/voice-ask` | Voice input → chat response |
| `GET/POST` | `/api/chats/*` | Chat CRUD (Firestore) |
| `GET` | `/api/prices/{crop}` | Mandi prices for a crop |
| `GET` | `/api/prices/predict/{crop}` | 7-day price forecast (Prophet) |
| `GET/POST/DELETE` | `/api/prices/alerts` | Price alert management |
| `GET/POST` | `/api/profile/*` | Farmer profile read/update |
| `POST` | `/api/translate` | Marathi ↔ English translation |
| `GET` | `/api/upload` | ImageKit upload auth signature |

---

## Running Locally (Quick Start)

```bash
# Terminal 1 — Backend (Orchestrator Node)
cd backend && .venv\Scripts\activate && uvicorn server:app --reload --port 8000

# Terminal 2 — Frontend
cd client && npm run dev

# Terminal 3 — Ollama (Vision + Inference, if running locally for dev)
ollama serve
ollama pull llava llama3.1:8b qwen2.5:3b
```

---

## Known Limitations

- Plant disease detection accuracy depends on lighting, image quality, and background complexity; the model is trained on a limited (~18 GB) dataset covering four crops.
- The government scheme knowledge base depends on a fixed set of crawled sources and may not cover all crops, regions, or newly introduced schemes.
- Speech recognition accuracy has been validated primarily for standard Marathi and may vary across regional dialects.

## Future Scope

- Extend language support beyond Marathi (Tamil, Telugu, Gujarati, Bengali).
- Move from web scraping to authenticated API integrations with government data sources (Open-Meteo, ICAR, eNAM) where available.
- Add personalized recommendations based on farm size, location, and crop history.

---

## Author

Built by:
- Bipin Balkrishna Patil
- Sarvesh Sanjay Sawant
- Shaun Thomas Jacob
- Ron Gibson Vincelal Joe
