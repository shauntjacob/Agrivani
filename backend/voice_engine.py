import os
import speech_recognition as sr
from gtts import gTTS
from deep_translator import GoogleTranslator
from pydub import AudioSegment
import uuid
import requests
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
AUDIO_DIR = os.path.join(os.path.dirname(__file__), "data", "audio_cache")
if not os.path.exists(AUDIO_DIR):
    os.makedirs(AUDIO_DIR)

# Optional remote IndicConformer ASR endpoint (set VAKYANSH_ASR_URL in .env)
VAKYANSH_ASR_URL = os.getenv("VAKYANSH_ASR_URL", "http://localhost:8001/asr")


# --- 1a. PRIMARY: IndicConformer ASR (Laptop 2 via Tailscale) ---
def vakyansh_speech_to_text(audio_path: str) -> str | None:
    """
    Sends audio to Laptop 2's IndicConformer server.
    Converts to 16kHz mono WAV first to avoid 422 errors.
    """
    try:
        print(f"🧠 Sending audio to IndicConformer (Laptop 2)...")
        
        # Convert to 16kHz mono WAV (Laptop 2 requires this format)
        wav_path = audio_path + "_16k.wav"
        print(f"🧠 Converting audio for IndicConformer...")
        audio = AudioSegment.from_file(audio_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio.export(wav_path, format="wav")
        print(f"🧠 Audio converted. Size: {os.path.getsize(wav_path)} bytes. Sending to {VAKYANSH_ASR_URL}")
        
        with open(wav_path, "rb") as wav_file:
            response = requests.post(
                VAKYANSH_ASR_URL,
                files={"file": ("audio.wav", wav_file, "audio/wav")},
                timeout=30,
            )
        print(f"🧠 IndicConformer responded with status: {response.status_code}")
        
        if os.path.exists(wav_path):
            os.remove(wav_path)
            
        response.raise_for_status()
        text = response.json().get("text", "").strip()
        
        # Clean up NeMo array brackets if present (e.g., "[' text ']")
        if text.startswith("['") and text.endswith("']"):
            text = text[2:-2].strip()
            
        if text:
            print(f"🎤 IndicConformer heard (Marathi): {text}")
            return text
        return None
    except requests.exceptions.ConnectionError:
        print("⚠️ Laptop 2 (IndicConformer) is offline. Falling back to Google STT...")
        return None
    except Exception as e:
        print(f"⚠️ IndicConformer error: {e}. Falling back to Google STT...")
        # Clean up temp file if it exists
        if 'wav_path' in locals() and os.path.exists(wav_path):
            os.remove(wav_path)
        return None

# --- 1b. LOCAL FALLBACK DISABLED ---
# The original HuggingFace Vakyansh model is private/unavailable.
# Fallback goes directly to Google STT instead.
def local_vakyansh_speech_to_text(audio_path: str) -> str | None:
    return None


def _google_speech_to_text(audio_path: str, lang: str | None = None) -> str | None:
    """Fallback or direct: converts audio and runs Google STT."""
    wav_path = audio_path + ".wav"
    try:
        audio = AudioSegment.from_file(audio_path)
        audio.export(wav_path, format="wav")
    except Exception as e:
        print(f"⚠️ Audio Conversion Error (Is ffmpeg installed?): {e}")
        return None

    recognizer = sr.Recognizer()
    try:
        print(f"🧠 Running Google STT for language: {lang or 'mr-IN'}...")
        with sr.AudioFile(wav_path) as source:
            audio_data = recognizer.record(source)
            
        stt_lang = "mr-IN"
        if lang and lang.startswith("en"):
            stt_lang = "en-IN"
            
        text = recognizer.recognize_google(audio_data, language=stt_lang)  # type: ignore
        print(f"🎤 Google STT heard ({stt_lang}): {text}")
        return text
    except sr.UnknownValueError:
        print("⚠️ Could not understand audio")
        return None
    except Exception as e:
        print(f"⚠️ Google STT Error: {e}")
        return None
    finally:
        if os.path.exists(wav_path):
            os.remove(wav_path)


def speech_to_text(audio_path: str, lang: str | None = None) -> str | None:
    """
    Primary entry point. 
    Currently set to test the Federated Laptop 2 NeMo Server first for Marathi,
    or uses Google STT directly for English.
    """
    # NEW: Log duration using ffprobe
    try:
        import subprocess
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audio_path]
        duration = subprocess.check_output(cmd).decode().strip()
        print(f"📏 Audio Duration: {duration}s")
    except:
        pass

    # If the requested language is English, skip Marathi ASR and go straight to Google STT
    if lang and lang.startswith("en"):
        print("🧠 English language requested. Directing directly to Google STT for English transcription.")
        return _google_speech_to_text(audio_path, lang)

    # 1. Try Laptop 2 via Tailscale (GPU Accelerated)
    result = vakyansh_speech_to_text(audio_path)
    if result:
        return result
        
    # 2. Try running fully locally on Laptop 1 CPU
    result = local_vakyansh_speech_to_text(audio_path)
    if result:
        return result
        
    # 3. If all local AI fails, fall back to Google API
    return _google_speech_to_text(audio_path, lang)

# --- 2. TRANSLATION (Marathi <-> English) ---
def marathi_to_english(text):
    try:
        return GoogleTranslator(source='mr', target='en').translate(text)
    except: 
        return text

import re

def english_to_marathi(text):
    try:
        if not text or not text.strip():
            return text
        
        lines = text.split("\n")
        translated_lines = []
        
        for line in lines:
            if not line.strip():
                translated_lines.append("")
                continue
            
            urls = []
            def repl(match):
                urls.append(match.group(0))
                return f" LINKPLACEHOLDER{len(urls)-1} "

            text_with_placeholders = re.sub(r'\[([^\]]+)\]\((https?://[^\s\)]+)\)|https?://[^\s\)]+', repl, line)
            clean_text = text_with_placeholders.replace("**", "").replace("💡", "").replace("📰", "").replace("📍", "").replace("📉", "")
            
            translated_line = GoogleTranslator(source='en', target='mr').translate(clean_text)
            if not translated_line:
                translated_line = clean_text

            def put_back(match):
                idx = int(match.group(1))
                if idx < len(urls):
                    original_url = urls[idx]
                    md_match = re.match(r'\[([^\]]+)\]\((https?://[^\s\)]+)\)', original_url)
                    if md_match:
                        link_text = md_match.group(1)
                        link_url = md_match.group(2)
                        try:
                            translated_link_text = GoogleTranslator(source='en', target='mr').translate(link_text)
                        except:
                            translated_link_text = link_text
                        return f"[{translated_link_text}]({link_url})"
                    else:
                        return original_url
                return match.group(0)

            translated_line = re.sub(r'LINKPLACEHOLDER(\d+)', put_back, translated_line, flags=re.IGNORECASE)
            translated_lines.append(translated_line)
            
        return "\n".join(translated_lines)
    except Exception as e:
        print(f"Translation Error: {e}")
        return text

# --- 3. TEXT TO SPEECH (Marathi Text -> Audio File) ---
def text_to_speech(marathi_text):
    try:
        filename = f"response_{uuid.uuid4().hex[:8]}.mp3"
        filepath = os.path.join(AUDIO_DIR, filename)
        
        # Generate Audio (Google TTS for Marathi)
        tts = gTTS(text=marathi_text, lang='mr', slow=False)
        tts.save(filepath)
        
        return filename
    except Exception as e:
        print(f"⚠️ TTS Error: {e}")
        return None