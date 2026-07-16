import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore_async  # <--- UPGRADED to the Async Client
import os

# Path to your secret JSON key
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

# 1. Initialize Firebase Admin
def init_firebase():
    if not os.path.exists(KEY_PATH):
        print("⚠️ Warning: serviceAccountKey.json not found! Firebase will not connect.")
        return None
        
    # Check if we already initialized to prevent crashing on server restarts
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    
    # Return the high-speed Async client
    return firestore_async.client()

# Connect to the database
db = init_firebase()

# 2. Function to read a farmer's profile
async def get_user_profile(user_id):
    """Fetches the user's saved data asynchronously from Firebase"""
    if not db: return None
    
    try:
        doc_ref = db.collection('users').document(user_id)
        
        # Pylance is happy: We are properly 'awaiting' the network call!
        doc = await doc_ref.get()
        
        if doc.exists:
            return doc.to_dict()
        else:
            print(f"No profile found in Firebase for user: {user_id}")
            return None
            
    except Exception as e:
        print(f"🔥 Firebase Read Error: {e}")
        return None