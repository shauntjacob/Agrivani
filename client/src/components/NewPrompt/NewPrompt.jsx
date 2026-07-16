import React, { useState, useRef, useEffect, useMemo } from "react";
import "./NewPrompt.css";
import Upload from "../Upload/Upload";
import DocumentUpload from "../DocumentUpload/DocumentUpload";
import { IKImage, IKContext } from "imagekitio-react";
import { groq } from "../../lib/groq";
import { API_URL } from "../../lib/config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import useSpeechToText from "../../hooks/useSpeechToText";
import { getAuth } from "firebase/auth";
import {
  Mic,
  X,
  Check,
  Camera,
  FileScan,
  Edit2,
  Send,
  Save,
  FileText,
  Image,
  FileUp,
} from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { cacheMessages, saveToOfflineQueue } from "../../lib/db";
import { getMarketAnalysis } from "../../lib/marketDataService";
import { getUserLocation } from "../../lib/mandiDataService";
import voiceService from "../../lib/voiceService";
import { detectProfileUpdate } from "../../lib/profileUpdateDetector";
import { useAuth } from "../../context/AuthContext";

// ── Audio Waveform ─────────────────────────────────────────────────────────────
const DynamicWaveform = ({ volume, isActive }) => {
  const bars = useMemo(
    () => Array.from({ length: 12 }, () => Math.random()),
    [],
  );
  return (
    <div className={`waveform-visualizer ${isActive ? "active" : ""}`}>
      {bars.map((seed, i) => {
        const height = isActive ? Math.max(10, volume * seed * 0.8 + 10) : 4;
        return (
          <div
            key={i}
            className="wave-bar"
            style={{ height: `${height}%`, transition: "height 0.1s ease" }}
          />
        );
      })}
    </div>
  );
};

// ── Main NewPrompt ─────────────────────────────────────────────────────────────
const NewPrompt = ({
  dataRef,
  data,
  setLiveQuestion,
  setLiveAnswer,
  setLiveIsTyping,
  setPendingProfileUpdate,
  setUpdatingProfile,
  setLiveImage,
  liveQuestion,
  liveAnswer,
  liveIsTyping,
  pendingProfileUpdate,
  onCustomSend,
  chatId,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const { userId } = useAuth();
  const isMr = language === "mr-IN";

  const {
    isListening,
    transcript,
    volume,
    startListening,
    stopListening,
    cancelListening,
    setTranscript,
    error: speechError,
  } = useSpeechToText(language, chatId);

  const [uploadKey, setUploadKey] = useState(0);
  const [img, setImg] = useState(
    location.state?.initialImage || {
      isLoading: false,
      error: "",
      dbData: {},
      aiData: {},
    },
  );
  const [uiState, setUiState] = useState("idle"); // 'idle'|'listening'|'reviewing'|'editing'
  const [editableTranscript, setEditableTranscript] = useState("");
  const [docContext, setDocContext] = useState(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showScannerMenu, setShowScannerMenu] = useState(false);
  const [speechHint, setSpeechHint] = useState("");

  const strings = isMr
    ? {
        listening: "ऐकत आहे...",
        placeholder: "काहीही विचारा...",
        thinking: "विचार करत आहे...",
        micTitle: "आवाज इनपुट सुरू करा",
        cancelTitle: "रद्द करा",
        doneTitle: "ठोकळा",
        sendTitle: "पाठवा",
        editTitle: "बदला",
        saveTitle: "जतन करा",
        error: "त्रुटी: प्रतिसाद मिळाला नाही.",
        analyzeImage: "हे चित्र विश्लेषण करा",
        formLabel: "बोला किंवा आपला शेतकरी प्रश्न टाइप करा",
        speakAnswer: "उत्तर ऐका",
        stopSpeaking: "थांबवा",
        docReady: (n) => `📄 "${n}" तयार`,
        docHint: "दस्तऐवजाबद्दल प्रश्न विचारा...",
        docReadErr: "दस्तऐवज वाचता आला नाही.",
        profileUpdated: (f, v) => `✅ प्रोफाइल अद्यतनित! ${f}: ${v}`,
        offlineQueued: "तुमचे रेकॉर्डिंग सेव्ह केले आहे आणि ऑनलाइन आल्यावर प्रक्रिया केली जाईल.",
      }
    : {
        listening: "Listening...",
        placeholder: "Ask anything...",
        thinking: "AI is thinking...",
        micTitle: "Start voice input",
        cancelTitle: "Cancel",
        doneTitle: "Done",
        sendTitle: "Send",
        editTitle: "Edit",
        saveTitle: "Save & Send",
        error: "Error: Could not get a response.",
        analyzeImage: "Analyze this image",
        formLabel: "Speak or type your farming question",
        speakAnswer: "Listen to answer",
        stopSpeaking: "Stop",
        docReady: (n) => `📄 "${n}" ready`,
        docHint: "Ask about the document...",
        docReadErr: "Could not read document.",
        profileUpdated: (f, v) => `✅ Profile updated! ${f}: ${v}`,
        offlineQueued: "Your audio is recorded and will be processed when online.",
      };

  const authenticator = async () => {
    try {
      const res = await fetch(`${API_URL}/api/upload`);
      if (!res.ok) throw new Error("Auth failed");
      return res.json();
    } catch (err) {
      throw new Error(`Authentication request failed: ${err.message}`);
    }
  };

  const latestAnswerRef = useRef("");
  const isSubmitting = useRef(false);
  const hasRun = useRef(false);
  const latestImgRef = useRef(img);

  useEffect(() => {
    latestImgRef.current = img;
  }, [img]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async ({ text, img, answer }) => {
      const payload = { text, img };
      if (answer) payload.answer = answer; // Securely attach the answer if it was generated natively (e.g. Disease API)
      if (userId) payload.userId = userId;

      const response = await fetch(
        `${API_URL}/api/chats`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      return response.json();
    },
    onSuccess: (chatId, variables) => {
      setLiveImage("");
      navigate(`/dashboard/chats/${chatId}`, {
        state: { initialImage: variables.img, optimisticText: variables.text, optimisticAnswer: variables.answer },
      });
    },
  });

  const mutation = useMutation({
    mutationFn: async (mutationData) => {
      if (!data?._id) throw new Error("Chat ID missing");

      // 🌟 FIX: Properly cache BOTH the user's message (with image) AND the AI's answer
      let newMessages = [];

      if (mutationData.question || mutationData.img) {
        const userParts = [{ text: mutationData.question || "" }];

        const userMsg = {
          role: "user",
          parts: userParts,
          createdAt: new Date().toISOString(),
        };
        if (mutationData.img) {
          userMsg.img = mutationData.img;
        }

        newMessages.push(userMsg);
      }

      if (mutationData.answer) {
        newMessages.push({
          role: "model",
          parts: [{ text: mutationData.answer }],
          createdAt: new Date().toISOString(),
        });
      }

      // Update local UI immediately so it doesn't flash
      if (newMessages.length > 0) {
        await cacheMessages(data._id, [
          ...(data.history || []),
          ...newMessages,
        ]);
      }

      return fetch(`${API_URL}/api/chats/${data._id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutationData),
      }).then((res) => res.json());
    },

    onSuccess: () => {
      setLiveQuestion("");
      setLiveAnswer("");
      setEditableTranscript("");
      setUploadKey((prev) => prev + 1);
      // Refetch first, then clear liveImage only after data arrives
      queryClient
        .invalidateQueries({ queryKey: ["chat", data._id] })
        .then(() => {
          setLiveImage("");
          setImg({ isLoading: false, error: "", dbData: {}, aiData: {} });
        });
    },
  });

  useEffect(() => {
    if (speechError) {
      if (speechError.includes("Microphone") || speechError.includes("HTTPS")) {
        setSpeechHint(
          isMr
            ? (speechError.includes("HTTPS") 
                ? "सुरक्षा त्रुटी: मायक्रोफोनसाठी HTTPS आवश्यक आहे. कृपया सुरक्षित लिंक वापरा."
                : "मायक्रोफोनमध्ये त्रुटी. कृपया परवानग्या तपासा.")
            : speechError,
        );
      } else if (speechError.includes("understand") || speechError === "no-speech") {
        setSpeechHint(
          isMr
            ? "तुमचा आवाज ऐकू आला नाही. पुन्हा प्रयत्न करा."
            : "Did not hear anything. Please try again.",
        );
      } else if (speechError.includes("connect") || speechError.includes("internet") || speechError.includes("timed out") || speechError === "OFFLINE_NETWORK" || speechError.includes("saved")) {
        const isSaved = speechError.includes("saved") || speechError === "OFFLINE_NETWORK";
        setSpeechHint(
          isMr
            ? (isSaved ? "आवाज जतन केला! ऑनलाइन आल्यावर उत्तर मिळेल." : "नेटवर्क कनेक्शन नाही. तुम्ही ऑफलाइन आहात.")
            : (isSaved ? "Audio saved! You'll get an answer once online." : "No network connection. You are offline."),
        );
      } else {
        setSpeechHint(
          isMr
            ? "काहीतरी चुकले. पुन्हा प्रयत्न करा."
            : "Something went wrong. Please try again.",
        );
      }

      setUiState((prev) => {
        if (prev === "processing" || prev === "listening") return "editing";
        // If it's already editing, keep it editing. If idle, keep it idle.
        return prev;
      });
      const timer = setTimeout(() => setSpeechHint(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [speechError, isMr]);

  // When transcript arrives async (from Vakyansh upload), move to reviewing
  useEffect(() => {
    if (uiState === "processing") {
      // 🚨 AGGRESSIVE GUARD: If there's already a speech error (like "Audio saved"),
      // STOP everything else. Do not show "Could not hear anything".
      if (speechError) {
        console.log("🎤 Speech error detected during processing, skipping empty transcript check.");
        return;
      }

      if (transcript) {
        setEditableTranscript(transcript);
        setSpeechHint("");
        setUiState("reviewing");
      } else if (transcript === "") {
        console.warn("🎤 Transcript returned empty, moving to editing.");
        setEditableTranscript("");
        setUiState("editing");
        setSpeechHint(isMr ? "आवाज दिसला नाही. कृपया टाईप करा." : "Could not hear anything. Please type your question.");
      }
    }
  }, [transcript, uiState, speechError]);

  useEffect(() => {
    console.log(`🎤 UI State changed to: ${uiState}`);
  }, [uiState]);

  useEffect(() => {
    if (dataRef?.current) {
      dataRef.current.scrollTo({
        top: dataRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [liveAnswer, liveIsTyping, pendingProfileUpdate, dataRef]);

  useEffect(() => {
    latestAnswerRef.current = liveAnswer;
  }, [liveAnswer]);

  useEffect(() => {
    const handleSetInput = (e) => {
      add(e.detail, false);
    };
    const handleReset = () => {
      if (!data) {
        setLiveQuestion("");
        setLiveAnswer("");
        setImg({ isLoading: false, error: "", dbData: {}, aiData: {} });
        setDocContext(null);
        setEditableTranscript("");
        cancelListening();
      }
    };
    
    window.addEventListener("setChatInput", handleSetInput);
    window.addEventListener("resetChat", handleReset);
    return () => {
       window.removeEventListener("setChatInput", handleSetInput);
       window.removeEventListener("resetChat", handleReset);
    };
  }, [data?._id]);

  const commitProfileUpdate = async (update) => {
    setUpdatingProfile(true);
    try {
      const res = await fetch(
        `${API_URL}/api/profile/update-field`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: update.field, value: update.value }),
        },
      );
      const result = await res.json();
      if (result.success) {
        const fieldLabel =
          {
            income: isMr ? "उत्पन्न" : "Income",
            landSize: isMr ? "जमीन" : "Land",
            crops: isMr ? "पिके" : "Crops",
            district: isMr ? "जिल्हा" : "District",
          }[update.field] || update.field;
        const displayVal =
          update.field === "income"
            ? `₹${Number(update.value).toLocaleString("en-IN")}`
            : update.field === "landSize"
              ? `${update.value} ${isMr ? "एकर" : "acres"}`
              : update.field === "crops"
                ? update.value.join(", ")
                : update.value;
        setLiveAnswer(
          (prev) =>
            prev + `\n\n---\n${strings.profileUpdated(fieldLabel, displayVal)}`,
        );
      }
    } catch (err) {
      console.error("Profile update error:", err);
    } finally {
      setUpdatingProfile(false);
      setPendingProfileUpdate(null);
    }
  };

  const pendingUpdateRef = useRef(null);
  useEffect(() => {
    pendingUpdateRef.current = pendingProfileUpdate;
  }, [pendingProfileUpdate]);
  useEffect(() => {
    const onSync = () => {
      if (pendingUpdateRef.current)
        commitProfileUpdate(pendingUpdateRef.current);
    };
    window.addEventListener("triggerSync", onSync);
    return () => window.removeEventListener("triggerSync", onSync);
  }, []);

  // 🌟 FIX: Return an object with lat/lon instead of a formatted string!
  const getRealGPS = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: 0, lon: 0 });
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            });
          },
          (err) => {
            console.warn("GPS access denied or failed:", err.message);
            resolve({ lat: 0, lon: 0 }); // Safe fallback so the app doesn't crash
          },
          { timeout: 5000 },
        );
      }
    });
  };

  const add = async (text, isInitial) => {
    const currentImgAiData = img.aiData;
    const currentImgPath = img.dbData?.filePath;
    const currentRawFile = img.rawFile;
    const currentLocalPreview = img.localPreview;
    const currentPersistentUrl = img.persistentUrl; // ← Firebase Storage URL// 🌿 Capture before state is cleared

    const imgToSave = currentPersistentUrl || currentLocalPreview || currentImgPath || "";

    let aiInput = text;
    let displayText = text;

    if (docContext?.text) {
      const docHeader = `### DOCUMENT CONTEXT: ${docContext.fileName}\n\n${docContext.text}\n\n---\n${isMr ? "वरील दस्तऐवजाच्या आधारे वापरकर्त्याच्या प्रश्नाचे उत्तर द्या:" : "Using the document text provided above, please answer the following user request:"}\n`;

      aiInput =
        docHeader +
        (text ||
          (isMr ? "या दस्तऐवजाचे विश्लेषण करा." : "Analyze this document."));
      displayText = text
        ? `📄 ${docContext.fileName} — ${text}`
        : `📄 ${isMr ? "दस्तऐवज विश्लेषण" : "Analyze"}: ${docContext.fileName}`;
    }

    if (!aiInput && !currentImgAiData?.inlineData && !currentRawFile && !isInitial) return;

    if (!isInitial) {
      setLiveQuestion(displayText);
      if (typeof setLiveImage === "function")
        setLiveImage(
          currentPersistentUrl || currentLocalPreview || currentImgPath || "",
        );
    }

    isSubmitting.current = true;
    setLiveAnswer("");
    setPendingProfileUpdate(null);
    setDocContext(null);
    setEditableTranscript("");
    setTranscript("");
    setUiState("idle");
    cancelListening();
    setLiveIsTyping(true);

    if (onCustomSend) {
      await onCustomSend(aiInput);
      setLiveIsTyping(false);
      return;
    }

    // ⚡ HYBRID MODE: INTERCEPT OFFLINE REQUESTS ⚡
    if (!navigator.onLine) {
      const saveText = displayText || text || "";
      const chatId = data?._id || `temp-${Date.now()}`;
      
      const payload = {
        text: saveText,
        img: imgToSave,
        isInitial,
        hasRawFile: !!currentRawFile,
        rawFile: currentRawFile || null,
        language: language,
        timestamp: new Date().toISOString()
      };

      await saveToOfflineQueue(chatId, payload);

      setLiveAnswer(
        isMr
          ? "⏳ तुम्ही सध्या ऑफलाइन आहात. इंटरनेट जोडणी परत येताच आम्ही तुमचा प्रश्न आमच्या सर्व्हरकडे पाठवू!"
          : "⏳ You are currently offline. Your question has been queued and will be answered automatically when your connection is restored!"
      );
      setLiveIsTyping(false);
      isSubmitting.current = false;
      setImg({ isLoading: false, error: "", dbData: {}, aiData: {} });
      return;
    }

    // 🌿 DISEASE PREDICTION: Raw image file present → route to disease endpoint
    if (currentRawFile) {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        const realUserId = currentUser ? currentUser.uid : "anonymous_user";

        const formData = new FormData();
        formData.append("file", currentRawFile);
        if (aiInput) formData.append("user_message", aiInput);
        formData.append("user_id", realUserId);

        let diseaseRes;
        try {
          diseaseRes = await fetch(
            `${API_URL}/api/predict-disease`,
            { method: "POST", body: formData },
          );
        } catch (err) {
          console.warn("API_URL request failed:", err.message);
          throw err;
        }
        let diseaseData;
        const resText = await diseaseRes.text();
        try {
          diseaseData = JSON.parse(resText);
        } catch (err) {
          console.error("Failed to parse disease JSON response:", resText);
          throw new Error(`Server returned invalid JSON: ${resText.slice(0, 100)}`);
        }
        console.log(
          "🌿 Disease response:",
          JSON.stringify(diseaseData).slice(0, 200),
        );
        console.log(
          "🌿 success:",
          diseaseData.success,
          "crop:",
          diseaseData.crop,
          "disease:",
          diseaseData.disease,
        );
        console.log(
          "🌿 Disease response:",
          JSON.stringify(diseaseData).slice(0, 200),
        );
        console.log(
          "🌿 success:",
          diseaseData.success,
          "crop:",
          diseaseData.crop,
          "disease:",
          diseaseData.disease,
        );

        if (diseaseData.success) {
          const prescription = isMr
            ? `🌿 **आढळले:** ${diseaseData.crop} — ${diseaseData.disease}\n\n${diseaseData.prescription_mr}`
            : `🌿 **Detected:** ${diseaseData.crop} — ${diseaseData.disease}\n\n${diseaseData.prescription_en}`;
          setLiveAnswer(prescription);

          // 🌿 Keep the image visible in chat while saving

          // Use base64 preview as the persistent image reference
          // Prefer permanent Firebase URL (or Cloudinary), fall back to base64 for display
          const finalPersistentUrl = latestImgRef.current?.persistentUrl;
          const finalImgToSave = finalPersistentUrl || currentPersistentUrl || currentLocalPreview || currentImgPath || "";
          
          const saveText = displayText || text || "";
          if (!data?._id || data._id.toString().startsWith("temp-")) {
            createMutation.mutate({ text: saveText, img: finalImgToSave, answer: prescription });
          } else {
            console.log("💾 imgToSave:", finalImgToSave?.slice(0, 80));
            console.log("💾 currentPersistentUrl:", currentPersistentUrl);
            console.log(
              "💾 currentLocalPreview length:",
              currentLocalPreview?.length,
            );
            mutation.mutate({
              question: isInitial ? undefined : saveText,
              answer: prescription,
              img: finalImgToSave,
            });
          }
        } else {
          setLiveAnswer(
            isMr
              ? "⚠️ रोग ओळखता आला नाही. कृपया स्पष्ट चित्र घ्या."
              : "⚠️ Could not identify the disease. Please try a clearer photo.",
          );
        }
      } catch (err) {
        console.error("Disease prediction error FULL:", err.message, err.stack);
        setLiveAnswer(
          isMr
            ? "⚠️ त्रुटी: रोग तपासणी सेवेशी जोडता आले नाही."
            : "⚠️ Error: Could not connect to the disease detection service.",
        );
      } finally {
        setLiveIsTyping(false);
        isSubmitting.current = false;
        // Clean up blob URL to free memory
        setImg({ isLoading: false, error: "", dbData: {}, aiData: {} }); // ← reset here
      }
      return;
    }

    try {
      const updateDetected = detectProfileUpdate(aiInput, language);

      // 1. Get real User ID and GPS dynamically
      const auth = getAuth();
      const currentUser = auth.currentUser;
      const realUserId = currentUser ? currentUser.uid : "anonymous_user";
      const coords = await getRealGPS();

      // Prompt goes to server as-is; server handles translation internally
      let finalPromptForAI = aiInput;

      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPromptForAI,
          user_id: realUserId,
          user_lat: coords.lat,
          user_lon: coords.lon,
          lang: language,
        }),
      });

      if (!response.body)
        throw new Error("No readable stream available from local server");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accum = "";
      let firstChunkReceived = false;

      // 🌟 STEP 3: Read the Stream
      while (true) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          accum += chunk;

          if (!firstChunkReceived) {
            setLiveIsTyping(false);
            firstChunkReceived = true;
          }
          setLiveAnswer(accum);
        }
      }

      let finalResponseText = accum;

      // Check for profile updates (using the translated English text so your detector works properly)
      if (updateDetected.hasUpdate) {
        setPendingProfileUpdate({
          field: updateDetected.field,
          value: updateDetected.value,
        });
      }

      // 5. Save & Navigate
      const finalPersistentUrl = latestImgRef.current?.persistentUrl;
      const finalImgToSave = finalPersistentUrl || currentPersistentUrl || currentLocalPreview || currentImgPath || "";

      const saveText = displayText || text || "";
      if (!data?._id || data._id.toString().startsWith("temp-")) {
        createMutation.mutate({ text: saveText, img: finalImgToSave, answer: finalResponseText });
      } else {
        mutation.mutate({
          question: isInitial ? undefined : saveText,
          answer: finalResponseText,
          img: finalImgToSave,
        });
      }
    } catch (err) {
      console.error("Local Server Stream Error:", err);
      
      const connectionError = isMr 
        ? "\n\n⚠️ (एग्रीवाणी इंजिनशी संपर्क तुटला. कृपया पुन्हा प्रयत्न करा.)" 
        : "\n\n⚠️ (Connection to engine lost. Please try again.)";

      // 🌟 STABILITY FIX: If we already have partial text (accum), don't wipe it!
      // This prevents the "disappearing message" frustration.
      if (accum && accum.length > 5) {
        setLiveAnswer(accum + connectionError);
      } else {
        setLiveAnswer(
          isMr
            ? "⚠️ त्रुटी: AgriVani इंजिनशी कनेक्ट होऊ शकलो नाही."
            : "⚠️ Error: Could not connect to the local AgriVani engine.",
        );
      }
    } finally {
      setLiveIsTyping(false);
      isSubmitting.current = false;
      setImg({ isLoading: false, error: "", dbData: {}, aiData: {} }); // ← reset here too
    }
  };

  const handleStartListening = async () => {
    setEditableTranscript("");
    setTranscript(null); // null = recording just started, not yet sent
    setUiState("listening");

    // 🌟 Capture context for offline sync
    const auth = getAuth();
    const userId = auth.currentUser?.uid || "anonymous_user";
    let coords = { lat: 0, lon: 0 };
    try {
      coords = await getUserLocation();
    } catch (e) {
      console.warn("Could not get location for voice metadata:", e);
    }

    if (!navigator.onLine) {
      setSpeechHint(isMr ? "तुम्ही ऑफलाइन आहात. रेकॉर्डिंग सेव्ह केले जाईल." : "You are offline. Recording will be saved locally.");
    }

    startListening({ userId, lat: coords.lat, lon: coords.lon, language });
  };
  const handleStopListening = () => {
    stopListening(); // triggers async upload in useSpeechToText
    
    // Only show "Processing" if we are actually online
    if (navigator.onLine) {
      setUiState("processing"); // show spinner while Vakyansh runs
    } else {
      setUiState("queued"); // Show the "Recorded & Queued" message
    }
  };

  const handleToggleMic = () => {
    if (uiState === "listening") handleStopListening();
    else if (uiState === "reviewing" || uiState === "editing") handleSend();
    else handleStartListening();
  };

  const handleSend = () => {
    if (
      editableTranscript.trim() ||
      img.rawFile ||
      img.dbData?.filePath ||
      docContext
    )
      add(editableTranscript, false);
    else setUiState("idle");
  };

  const handleEdit = () => setUiState("editing");

  const handleCancelUI = () => {
    cancelListening();
    setUiState("idle");
    setEditableTranscript("");
    setTranscript("");
    setImg({ isLoading: false, error: "", dbData: {}, aiData: {} });
    setDocContext(null);
    setUploadKey((prev) => prev + 1);
  };

  // Called when image is ready — go straight to listening so user can speak their query
  const handleImageReady = () => {
    setEditableTranscript("");
    handleStartListening();
  };

  const handleDocumentError = (msg) => {
    setEditableTranscript(strings.docReadErr);
    setTimeout(() => {
      setUiState("idle");
      setEditableTranscript("");
    }, 2000);
  };

  useEffect(() => {
    if (!hasRun.current && data?.history?.length === 1)
      add(data.history[0].parts[0].text, true);
    hasRun.current = true;
  }, []);

  const isOverlayActive = uiState !== "idle";

  return (
    <IKContext
      urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
      publicKey={import.meta.env.VITE_IMAGE_KIT_PUBLIC_KEY}
      authenticator={authenticator}
    >
      <div className={`agrivani-hub-root ui-state-${uiState}`}>
        {img.isLoading && (
          <div className="image-loading-card glassmorphism animate-pop">
            <div className="loading-spinner-small" />
            <span>{isMr ? "चित्र पाठवत आहे..." : "Uploading Image..."}</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            UNIFIED FLOATING CARD (Voice, Image, and Document)
        ══════════════════════════════════════════════════════════════ */}
        {console.log(
          "🖼️ IMG STATE:",
          JSON.stringify({
            hasRawFile: !!img.rawFile,
            hasLocalPreview: !!img.localPreview,
            hasFilePath: !!img.dbData?.filePath,
            isLoading: img.isLoading,
            uiState,
          }),
        )}
        {(isOverlayActive || img.localPreview || docContext) && (
          <div
            className="transcript-floating-card glassmorphism animate-pop unified-hub-card"
            style={{
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="card-header">
              <div className="header-left">
                {img.dbData?.filePath && (
                  <Camera size={14} style={{ marginRight: "4px" }} />
                )}
                {docContext && (
                  <FileText size={14} style={{ marginRight: "4px" }} />
                )}
                {uiState === "listening" ? (
                  <div className="pulse-dot" />
                ) : uiState === "editing" ? (
                  <Edit2 size={16} />
                ) : (
                  <Check size={16} />
                )}
                <span>
                  {uiState === "listening"
                    ? strings.listening
                    : uiState === "processing"
                      ? (isMr ? "प्रक्रिया होत आहे..." : "Processing...")
                      : uiState === "queued"
                        ? (isMr ? "रेकॉर्ड आणि जतन केले" : "Recorded & Saved")
                        : uiState === "editing"
                        ? strings.editTitle
                        : img.dbData?.filePath || docContext
                          ? isMr
                            ? "फाइल तयार आहे"
                            : "File Ready"
                          : strings.doneTitle}
                </span>
              </div>
              <div className="header-actions">
                <button
                  className="card-action-btn cancel-trigger"
                  onClick={handleCancelUI}
                  title={strings.cancelTitle}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div
              className="unified-card-body"
              style={{ overflowY: "auto", maxHeight: "60vh" }}
            >
              {/* Image Preview — always use local blob URL */}
              {img.localPreview && (
                <div className="card-image-section">
                  <img
                    src={img.localPreview}
                    alt="Preview"
                    className="preview-img-display"
                    style={{
                      width: "200px",
                      borderRadius: "8px",
                      objectFit: "cover",
                    }}
                  />
                </div>
              )}

              {/* Document Preview */}
              {docContext && (
                <div className="doc-preview-section">
                  {docContext.previewUrl && (
                    <div className="card-image-section">
                      <img
                        src={docContext.previewUrl}
                        alt="Scanned Form"
                        className="preview-img-display"
                        style={{
                          width: "200px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          marginBottom: "10px"
                        }}
                      />
                    </div>
                  )}
                  <div className="doc-meta-strip">
                    <span className="doc-type-badge">
                      {docContext.fileType.toUpperCase()}
                    </span>
                    <span className="doc-char-count">
                      {docContext.fileName} (
                      {docContext.text.length.toLocaleString()} chars)
                    </span>
                  </div>
                  <div className="doc-text-preview compact">
                    {docContext.text.slice(0, 150)}...
                  </div>
                </div>
              )}

              {isOverlayActive && (
                <div className="transcript-content-area">
                  {uiState === "editing" ? (
                    <textarea
                      className="editable-text editing-mode"
                      value={editableTranscript}
                      onChange={(e) => setEditableTranscript(e.target.value)}
                      placeholder={
                        docContext ? strings.docHint : strings.placeholder
                      }
                      autoFocus
                    />
                  ) : (
                    <p className="live-text transcript-display">
                      {uiState === "processing"
                        ? (isMr ? "आवाज णोंदवत आहे..." : "Recognising your voice...")
                        : uiState === "queued"
                          ? strings.offlineQueued
                          : editableTranscript ||
                          (isListening
                            ? docContext
                              ? strings.docHint
                              : strings.listening
                            : strings.placeholder)}
                    </p>
                  )}
                  <DynamicWaveform
                    volume={volume}
                    isActive={uiState === "listening"}
                  />
                </div>
              )}
            </div>

            {isOverlayActive && (
              <div className="card-footer-actions">
                {uiState === "listening" ? (
                  <button
                    className="footer-action-btn stop-trigger"
                    onClick={handleStopListening}
                  >
                    <Check size={20} />
                    <span>{strings.doneTitle}</span>
                  </button>
                ) : uiState === "processing" ? (
                  <div className="processing-indicator" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", opacity: 0.8 }}>
                    <div className="loading-spinner-small" />
                    <span>{isMr ? "आवाज विश्लेषण होत आहे..." : "Transcribing your voice..."}</span>
                  </div>
                ) : uiState === "queued" ? (
                  <button
                    className="footer-action-btn done-btn"
                    onClick={() => setUiState("idle")}
                  >
                    <Check size={20} />
                    <span>{isMr ? "ठीक आहे" : "Done"}</span>
                  </button>
                ) : uiState === "editing" ? (
                  <div className="dual-actions">
                    <button
                      className="footer-action-btn cancel-btn"
                      onClick={() => setUiState("reviewing")}
                    >
                      <X size={18} />
                      <span>{strings.cancelTitle}</span>
                    </button>
                    <button
                      className="footer-action-btn confirm-trigger"
                      onClick={handleSend}
                    >
                      <Save size={18} />
                      <span>{strings.saveTitle}</span>
                    </button>
                  </div>
                ) : (
                  <div className="review-actions">
                    <button
                      className="footer-action-btn edit-btn"
                      onClick={handleEdit}
                    >
                      <Edit2 size={18} />
                      <span>{strings.editTitle}</span>
                    </button>
                    <button
                      className="footer-action-btn confirm-trigger"
                      onClick={handleSend}
                    >
                      <Send size={18} />
                      <span>{strings.sendTitle}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="agrivani-panel">
          <div className="panel-content">
            <Upload
              key={uploadKey}
              setImg={setImg}
              onSuccessCallback={handleImageReady}
              renderCustom={(trigger) => (
                <div
                  className={`hub-nav-item upload-wrap ${liveIsTyping || uiState !== "idle" ? "btn-disabled" : ""}`}
                  data-tooltip="Upload / Capture"
                >
                  {showUploadMenu && (
                    <div className="action-popup-menu">
                      <div className="action-popup-item" onClick={(e) => { e.stopPropagation(); setShowUploadMenu(false); trigger("camera"); }}>
                        <Camera size={18} /> {isMr ? "कॅमेरा" : "Camera"}
                      </div>
                      <div className="action-popup-item" onClick={(e) => { e.stopPropagation(); setShowUploadMenu(false); trigger("gallery"); }}>
                        <Image size={18} /> {isMr ? "गॅलरी" : "Gallery"}
                      </div>
                    </div>
                  )}
                  <button 
                    className="hub-btn circle-neumorphic upload-btn"
                    disabled={liveIsTyping || uiState !== "idle"}
                    onClick={() => { setShowUploadMenu(!showUploadMenu); setShowScannerMenu(false); }}
                  >
                    <Camera size={26} />
                  </button>
                  <span className="btn-label" style={{cursor: 'pointer'}} onClick={() => { setShowUploadMenu(!showUploadMenu); setShowScannerMenu(false); }}>
                    {isMr ? "कॅमेरा" : "Camera"}
                  </span>
                </div>
              )}
            />

            <div className="central-action-wrap">
              <div className="mic-interaction-wrap">
                <div className="ai-orb-container">
                  <div
                    className={`ai-orb-glow ${uiState === "listening" ? "orb-active" : ""}`}
                  />
                  <div className="ai-orb-core" />
                </div>
                <button
                  className={[
                    "main-mic-btn",
                    uiState === "listening" ? "listening-active" : "",
                    uiState === "reviewing" || uiState === "editing"
                      ? "confirm-ready"
                      : "",
                    docContext ? "doc-mic-ready" : "",
                  ].join(" ")}
                  onClick={(e) => { setShowUploadMenu(false); setShowScannerMenu(false); handleToggleMic(e); }}
                  disabled={liveIsTyping && uiState === "idle"}
                >
                  {uiState === "reviewing" || uiState === "editing" ? (
                    <Send size={32} />
                  ) : (
                    <Mic size={40} />
                  )}
                </button>
              </div>
              <div className="mic-hint-text">
                {speechHint ? (
                  <span className="speech-error-hint">{speechHint}</span>
                ) : uiState === "listening" ? (
                  strings.listening
                ) : uiState === "processing" ? (
                  isMr ? "कृपया थांबा..." : "Transcribing, please wait..."
                ) : uiState === "reviewing" ? (
                  isMr ? (
                    "पाठवा"
                  ) : (
                    "Tap Mic to Send"
                  )
                ) : isMr ? (
                  "AgriBot शी बोला"
                ) : (
                  "Speak to AgriBot"
                )}
              </div>
            </div>

            <DocumentUpload
              key={`doc-${uploadKey}`}
              onDocumentReady={(doc) => {
                setDocContext(doc);
                setEditableTranscript("");
                handleStartListening();
              }}
              onError={handleDocumentError}
              renderCustom={(trigger, docStatus) => {
                const isBusy = liveIsTyping || uiState !== "idle" || mutation.isPending;
                return (
                  <div
                    className={`hub-nav-item scanner-wrap ${isBusy ? "btn-disabled" : ""}`}
                    data-tooltip="Scan / Upload Form"
                    style={isBusy ? { opacity: 0.5, pointerEvents: 'none' } : {}}
                  >
                    {showScannerMenu && !isBusy && (
                      <div className="action-popup-menu">
                        <div className="action-popup-item" onClick={(e) => { e.stopPropagation(); setShowScannerMenu(false); trigger("camera"); }}>
                          <FileScan size={18} /> {isMr ? "स्कॅन करा" : "Scan Form"}
                        </div>
                        <div className="action-popup-item" onClick={(e) => { e.stopPropagation(); setShowScannerMenu(false); trigger("gallery"); }}>
                          <FileUp size={18} /> {isMr ? "फाईल" : "Upload File"}
                        </div>
                      </div>
                    )}
                    <button
                      className={[
                        "hub-btn circle-neumorphic scanner-btn",
                        docStatus === "reading" ? "btn-scanning" : "",
                        docStatus === "done" ? "btn-scan-done" : "",
                      ].join(" ")}
                      disabled={isBusy}
                      onClick={() => { setShowScannerMenu(!showScannerMenu); setShowUploadMenu(false); }}
                    >
                      {docStatus === "reading" ? (
                        <span className="scan-spinner" />
                      ) : (
                        <FileScan size={26} />
                      )}
                    </button>
                    <span className="btn-label" style={{cursor: 'pointer'}} onClick={() => { !isBusy && setShowScannerMenu(!showScannerMenu); setShowUploadMenu(false); }}>
                      {docStatus === "reading"
                        ? isMr
                          ? "वाचत आहे..."
                          : "Reading..."
                        : isMr
                          ? "स्कॅनर"
                          : "Scanner"}
                    </span>
                  </div>
                );
              }}
            />
          </div>
        </div>
      </div>
    </IKContext>
  );
};

export default NewPrompt;
