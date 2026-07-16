"""
╔══════════════════════════════════════════════════════════════════════╗
║   AgriVani — IndicConformer ASR Server (Runs on LAPTOP 2)           ║
║   AI4Bharat indicconformer_stt_mr_hybrid_rnnt_large                 ║
║                                                                      ║
║   ► Place this file on Laptop 2 and run:                            ║
║       python asr_server.py                                           ║
║                                                                      ║
║   ► Server starts at: http://0.0.0.0:8001                           ║
║   ► Main backend calls: http://<asr-host>:8001/asr                  ║
╚══════════════════════════════════════════════════════════════════════╝

PREREQUISITES (run once on Laptop 2):
    git clone https://github.com/AI4Bharat/NeMo.git
    cd NeMo
    git checkout nemo-v2
    pip install -r requirements/requirements_asr.txt
    pip install fastapi uvicorn python-multipart pydub torch torchaudio
"""

import os
import uuid
import shutil
import logging
import tempfile

import torch
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment

# ─────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
)
log = logging.getLogger("asr_server")

# ─────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="AgriVani ASR — IndicConformer (Marathi)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Temp directory for audio processing
# ─────────────────────────────────────────────────────────────
TEMP_DIR = os.path.join(os.path.dirname(__file__), "data", "asr_temp")
os.makedirs(TEMP_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────
# Model — loaded ONCE at startup to avoid cold-start lag
# ─────────────────────────────────────────────────────────────
asr_model = None

def load_model():
    """
    Loads the AI4Bharat IndicConformer Marathi model.
    Model is downloaded from HuggingFace on first run (~1.5 GB).
    Subsequent starts load from local cache instantly.
    """
    global asr_model
    try:
        import nemo.collections.asr as nemo_asr  # type: ignore

        log.info("⏳ Loading IndicConformer Marathi model from HuggingFace...")
        log.info("   (First run downloads ~1.5 GB — subsequent starts are instant)")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        log.info(f"   Device: {device.upper()}")

        asr_model = nemo_asr.models.ASRModel.from_pretrained(
            "ai4bharat/indicconformer_stt_mr_hybrid_rnnt_large"
        )
        asr_model = asr_model.to(device)
        asr_model.freeze()

        # Use RNNT decoding (more accurate for conversational Marathi)
        asr_model.cur_decoder = "rnnt"

        log.info("✅ IndicConformer ready! AgriVani ASR server is live.")

    except ImportError:
        log.error(
            "❌ NeMo not installed. Run:\n"
            "   git clone https://github.com/AI4Bharat/NeMo.git\n"
            "   cd NeMo && git checkout nemo-v2\n"
            "   pip install -r requirements/requirements_asr.txt"
        )
        raise


# ─────────────────────────────────────────────────────────────
# Audio conversion helper
# Converts any browser format (WebM, OGG, MP4) → 16kHz mono WAV
# IndicConformer requires 16kHz mono WAV specifically
# ─────────────────────────────────────────────────────────────
def convert_to_16k_mono_wav(input_path: str, output_path: str) -> bool:
    """Convert any audio file to 16kHz mono WAV using pydub."""
    try:
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_channels(1)          # mono
        audio = audio.set_frame_rate(16000)    # 16kHz
        audio = audio.set_sample_width(2)      # 16-bit PCM
        audio.export(output_path, format="wav")
        log.info(f"   ✅ Converted to 16kHz mono WAV: {os.path.basename(output_path)}")
        return True
    except Exception as e:
        log.error(f"   ❌ Audio conversion failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────
# Startup event
# ─────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    load_model()


# ─────────────────────────────────────────────────────────────
# Health Check — Laptop 1 can ping this to verify Laptop 2 is ready
# ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok" if asr_model is not None else "model_not_loaded",
        "model": "indicconformer_stt_mr_hybrid_rnnt_large",
        "language": "mr-IN",
        "device": "cuda" if torch.cuda.is_available() else "cpu",
    }


# ─────────────────────────────────────────────────────────────
# Main ASR Endpoint
# ─────────────────────────────────────────────────────────────
@app.post("/asr")
async def transcribe(file: UploadFile = File(...)):
    """
    Accepts any audio file (WebM, WAV, MP3, OGG), converts it to
    16kHz mono WAV, runs IndicConformer inference, and returns
    the Marathi transcript.

    Called by the main backend's voice_engine.py (set VAKYANSH_ASR_URL in .env):
        POST http://<asr-host>:8001/asr
        Content-Type: multipart/form-data
        file: <audio blob>

    Returns:
        { "text": "मला टोमॅटोचा भाव सांगा", "engine": "indicconformer" }
    """
    if asr_model is None:
        raise HTTPException(
            status_code=503,
            detail="ASR model is not loaded yet. Try again in a few seconds."
        )

    # 1. Save the uploaded file to a temp path
    uid = uuid.uuid4().hex[:8]
    original_ext = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    raw_path = os.path.join(TEMP_DIR, f"{uid}_raw{original_ext}")
    wav_path = os.path.join(TEMP_DIR, f"{uid}_converted.wav")

    try:
        log.info(f"📥 Received audio: {file.filename} ({file.content_type})")

        with open(raw_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # 2. Convert to 16kHz mono WAV
        ok = convert_to_16k_mono_wav(raw_path, wav_path)
        if not ok:
            raise HTTPException(
                status_code=422,
                detail="Could not convert audio to WAV format. Is ffmpeg installed?"
            )

        # 3. Run IndicConformer inference
        log.info(f"🧠 Running IndicConformer transcription...")
        transcripts = asr_model.transcribe([wav_path], language_id="mr")

        # NeMo returns a list; get the first result
        if isinstance(transcripts, (list, tuple)) and len(transcripts) > 0:
            # Handle both string results and hypothesis objects
            result = transcripts[0]
            text = result.text if hasattr(result, "text") else str(result)
        else:
            text = str(transcripts)

        text = text.strip()
        log.info(f"🎤 Transcribed: '{text}'")

        return {
            "text": text,
            "engine": "indicconformer",
            "language": "mr-IN",
        }

    except HTTPException:
        raise
    except Exception as e:
        log.error(f"❌ Transcription error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    finally:
        # 4. Clean up temp files
        for path in [raw_path, wav_path]:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    log.info("🚀 Starting AgriVani ASR Server on port 8001...")
    log.info("   Set VAKYANSH_ASR_URL in the main backend .env to reach this server.")
    uvicorn.run(
        "asr_server:app",
        host="0.0.0.0",
        port=8001,
        log_level="info",
        reload=False,      # Don't use reload — model takes time to load
    )
