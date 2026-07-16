import requests
import time
import json
import os
import random

SERVER_URL = "http://127.0.0.1:8000/ask"
BASE_DIR = os.path.dirname(__file__)
QUESTIONS_FILE = os.path.join(BASE_DIR, "questions.json")

def load_questions():
    if not os.path.exists(QUESTIONS_FILE):
        print(f"❌ ERROR: Could not find {QUESTIONS_FILE}")
        return []
    try:
        with open(QUESTIONS_FILE, "r") as f: return json.load(f)
    except Exception as e:
        print(f"❌ ERROR loading JSON: {e}")
        return []

def run_dataset_training():
    print("🚀 STARTING GOLDEN DATASET TRAINING...")
    questions = load_questions()
    if not questions: return

    random.shuffle(questions)
    success_count = 0
    total_questions = len(questions)
    
    for i, question in enumerate(questions):
        print(f"--------------------------------------------------")
        print(f"📝 [Test {i+1}/{total_questions}] Asking: '{question}'")
        
        try:
            start_time = time.time()
            response = requests.post(SERVER_URL, json={"prompt": question})
            if response.status_code == 200:
                bot_reply = response.text
                duration = time.time() - start_time
                if len(bot_reply) > 20 and "error" not in bot_reply.lower():
                    print(f"✅ PASS: Bot answered in {duration:.2f}s")
                    success_count += 1
                else: print(f"❌ FAIL: Bot gave an error or empty response.")
            else: print(f"❌ Server Error: {response.status_code}")
        except Exception as e:
            print(f"❌ Connection Error: {e}")
            break
        time.sleep(1)

    print(f"\n🎉 TRAINING COMPLETE! Score: {success_count}/{total_questions}")

if __name__ == "__main__":
    run_dataset_training()