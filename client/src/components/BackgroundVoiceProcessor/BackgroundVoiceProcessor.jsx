import React, { useEffect, useState } from 'react';
import { getVoiceQueue, deleteFromVoiceQueue } from '../../lib/db';
import { useLanguage } from '../../context/LanguageContext';
import { CloudSync, CheckCircle2 } from 'lucide-react';

const isProcessingGlobal = { current: false };

const BackgroundVoiceProcessor = () => {
  const { language } = useLanguage();
  const isMr = language === "mr-IN";
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSuccess, setLastSuccess] = useState(false);

  useEffect(() => {
    const processQueue = async () => {
      if (!navigator.onLine || isProcessingGlobal.current) {
        const q = await getVoiceQueue();
        setPendingCount(q.length);
        return;
      }
      
      try {
        let queue = await getVoiceQueue();
        setPendingCount(queue.length);
        if (queue.length === 0) return;

        // 🌟 GARBAGE COLLECTION: Clear stale items older than 15 minutes
        const now = Date.now();
        const freshQueue = [];
        for (const item of queue) {
          if (item.timestamp && now - item.timestamp > 15 * 60 * 1000) {
            await deleteFromVoiceQueue(item.id);
          } else {
            freshQueue.push(item);
          }
        }
        queue = freshQueue;
        setPendingCount(queue.length);
        if (queue.length === 0) return;

        isProcessingGlobal.current = true;
        setIsSyncing(true);

        // ☢️ NUCLEAR OPTION: If queue is huge, clear it all to stop the loop
        if (queue.length > 10) {
          console.warn(`🚨 Queue is too large (${queue.length}). Clearing entire voice cache.`);
          for (const item of queue) await deleteFromVoiceQueue(item.id);
          setPendingCount(0);
          return;
        }

        for (const item of queue) {
          try {
            await deleteFromVoiceQueue(item.id);
            if (item.blob.size < 1000) {
              continue;
            }

            const extension = item.blob.type.includes('mp4') ? 'mp4' : 
                              item.blob.type.includes('ogg') ? 'ogg' : 'webm';
            
            const formData = new FormData();
            formData.append("file", item.blob, `recording.${extension}`);
            formData.append("lang", item.language || language || "mr-IN");

            // 1. Step A: Voice -> Text (Transcription)
            console.log(`📡 Background Sync Step 1: Transcribing audio for item ${item.id}`);
            const transcribeRes = await fetch(`${import.meta.env.VITE_API_URL}/api/transcribe`, {
              method: "POST",
              body: formData,
            });

            if (transcribeRes.ok) {
              const transcribeData = await transcribeRes.json();
              const transcriptText = transcribeData.text;

              if (transcriptText && transcriptText !== 'EMPTY') {
                // 2. Step B: Text -> AI Answer (Full Agent)
                console.log(`📡 Background Sync Step 2: Sending transcript to AI: "${transcriptText}"`);
                
                const chatRes = await fetch(`${import.meta.env.VITE_API_URL}/ask`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    prompt: transcriptText,
                    user_id: item.userId || "anonymous",
                    user_lat: item.lat || 0,
                    user_lon: item.lon || 0,
                    language: item.language || "mr-IN",
                    chat_id: item.chatId
                  }),
                });

                if (chatRes.ok) {
                  // 🚨 CRITICAL: We MUST read the full response body.
                  // Since /ask is a streaming endpoint, reading it to the end 
                  // forces the server to complete the 'save_chat_memory' logic.
                  const fullAiResponse = await chatRes.text(); 
                  console.log(`✅ Background Sync Success: Item ${item.id} fully processed. AI said: ${fullAiResponse.slice(0, 50)}...`);
                  
                  // 3. Step C: Success Cleanup
                  console.log(`🧹 Item ${item.id} already removed from queue at start.`);
                  
                  // 🌟 SIGNAL THE UI: "Hey, we just synced a voice message!"
                  window.dispatchEvent(new CustomEvent("voiceSyncSuccess", { 
                    detail: { chatId: item.chatId } 
                  }));
                  window.dispatchEvent(new CustomEvent("triggerSync")); // Existing generic trigger

                  // Browser Notification
                  if ("Notification" in window && Notification.permission === "granted") {
                    const title = isMr ? "अग्रीवाणी: उत्तर तयार" : "AgriVani: Answer Ready";
                    const body = isMr 
                      ? `तुमच्या प्रश्नाचे उत्तर तयार आहे!`
                      : `The answer to your voice question is ready!`;
                    new Notification(title, { body, icon: "/agrivanilogo.png" });
                  }
                }
              } else {
                console.warn("⚠️ Transcript empty, already deleted stale item.");
              }
            }
          } catch (err) {
            console.error("❌ Background Full Sync Error:", err);
          }
        }
        
        setLastSuccess(true);
        setTimeout(() => setLastSuccess(false), 5000);
      } catch (err) {
        console.error("🚨 Background Processor Fatal Error:", err);
      } finally {
        isProcessingGlobal.current = false;
        setIsSyncing(false);
        const finalQ = await getVoiceQueue();
        setPendingCount(finalQ.length);
      }
    };

    const interval = setInterval(processQueue, 30000); // Check every 30s
    processQueue(); // Initial check

    window.addEventListener('online', processQueue);
    return () => {
      window.removeEventListener('online', processQueue);
      clearInterval(interval);
    };
  }, [isMr]);

  if (pendingCount === 0 && !isSyncing && !lastSuccess) return null;

  return (
    <div className="offline-status-bar" style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      backgroundColor: 'var(--bgSoft)',
      padding: '10px 16px',
      borderRadius: '30px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      zIndex: 9999,
      border: '1px solid var(--border)',
      animation: 'slideUp 0.3s ease-out'
    }}>
      {isSyncing ? (
        <CloudSync className="sync-icon-spin" size={20} color="#059669" />
      ) : lastSuccess ? (
        <CheckCircle2 size={20} color="#059669" />
      ) : (
        <CloudSync size={20} color="#666" />
      )}
      
      <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--textColor)' }}>
        {isSyncing 
          ? (isMr ? "सिंक होत आहे..." : "Syncing...") 
          : lastSuccess 
            ? (isMr ? "यशस्वीरित्या सिंक झाले!" : "Synced Successfully!")
            : (isMr ? `${pendingCount} प्रलंबित क्वेरी` : `${pendingCount} Pending Queries`)}
      </span>
    </div>
  );
};

export default BackgroundVoiceProcessor;
