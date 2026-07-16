import { getOfflineQueue, deleteFromOfflineQueue } from "./db";

export const syncOfflineQueue = async (userId) => {
  try {
    const items = await getOfflineQueue();
    if (!items || items.length === 0) return;

    for (const item of items) {
      let finalAnswer = "";

      if (item.payload.hasRawFile && item.payload.rawFile) {
        // Disease Fallback Flow
        const formData = new FormData();
        formData.append("file", item.payload.rawFile);
        if (item.payload.text) formData.append("user_message", item.payload.text);
        formData.append("user_id", userId);

        const dRes = await fetch(`${import.meta.env.VITE_API_URL}/api/predict-disease`, { method: "POST", body: formData });
        const dData = await dRes.json();
        
        if (dData.success) {
          finalAnswer = item.payload.language === "mr-IN" 
            ? `🌿 **आढळले:** ${dData.crop} — ${dData.disease}\n\n${dData.prescription_mr}`
            : `🌿 **Detected:** ${dData.crop} — ${dData.disease}\n\n${dData.prescription_en}`;
        } else {
           finalAnswer = item.payload.language === "mr-IN" ? "⚠️ रोग ओळखता आला नाही." : "⚠️ Could not identify the disease.";
        }
      } else {
        // General Chat LLM Flow
        const sRes = await fetch(`${import.meta.env.VITE_API_URL}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: item.payload.text || "Hello", user_id: userId, user_lat: 0, user_lon: 0, lang: item.payload.language }),
        });
        
        if (sRes.body) {
           const reader = sRes.body.getReader();
           const decoder = new TextDecoder("utf-8");
           let accum = "";
           while (true) {
             const { value, done } = await reader.read();
             if (done) break;
             if (value) accum += decoder.decode(value, { stream: true });
           }
           finalAnswer = accum;
        }
      }

      // Save Output back to Server DB
      const isInitial = item.payload.isInitial || String(item.chatId).startsWith("temp-");
      let activeChatId = item.chatId;

      if (isInitial) {
        const postRes = await fetch(`${import.meta.env.VITE_API_URL}/api/chats`, {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: item.payload.text, img: item.payload.img, userId }),
        });
        const newChatId = await postRes.json();
        activeChatId = newChatId;
      }

      // Append answer via PUT
      await fetch(`${import.meta.env.VITE_API_URL}/api/chats/${activeChatId}`, {
         method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ 
           question: isInitial ? undefined : item.payload.text, 
           answer: finalAnswer, 
           img: item.payload.img 
         })
      });

      // Erase from Queue!
      await deleteFromOfflineQueue(item.id);

      // Trigger Push Notification!
      if (Notification.permission === "granted") {
        new Notification("AgriVani AI", {
          body: item.payload.language === "mr-IN" ? "तुमच्या ऑफलाइन प्रश्नाचे उत्तर तयार आहे!" : "Your offline question has been answered!",
          icon: "/agrivanilogo.png"
        });
      }
    }
  } catch (e) {
    console.error("Error syncing offline queue", e);
  }
};
