import os
import urllib.request
import zipfile

# 1. Create the exact folder structure voice_engine.py is looking for
os.makedirs("models/mr_0_glow", exist_ok=True)
os.makedirs("models/mr_1_hifi", exist_ok=True)

print("⏳ Downloading Marathi Glow-TTS model (This might take a minute)...")
glow_url = "https://storage.googleapis.com/vakyansh-open-models/tts/marathi/mr-IN/female_voice_0/glow.zip"
urllib.request.urlretrieve(glow_url, "glow.zip")

print("⏳ Downloading Marathi HiFi-GAN model...")
hifi_url = "https://storage.googleapis.com/vakyansh-open-models/tts/marathi/mr-IN/female_voice_0/hifi.zip"
urllib.request.urlretrieve(hifi_url, "hifi.zip")

print("📦 Extracting files into the models folder...")
with zipfile.ZipFile("glow.zip", 'r') as zip_ref:
    zip_ref.extractall("models/mr_0_glow")

with zipfile.ZipFile("hifi.zip", 'r') as zip_ref:
    zip_ref.extractall("models/mr_1_hifi")

# Clean up the zip files
os.remove("glow.zip")
os.remove("hifi.zip")

print("✅ Setup Complete! Your Marathi Voice Models are ready.")