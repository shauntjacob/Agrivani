import { useState, useEffect, useRef } from 'react';
import { saveToVoiceQueue } from '../lib/db';
import { API_URL } from '../lib/config';

const useSpeechToText = (lang = "mr-IN", chatId = null) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(null); // null = not fetched, "" = empty result, "text" = success
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  // 🌟 PRE-WARM: Request microphone access as soon as the component loads
  useEffect(() => {
    const prewarm = async () => {
      try {
        if (window.isSecureContext && navigator.mediaDevices) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          console.log("🎤 Microphone pre-warmed and ready.");
        }
      } catch (err) {
        console.warn("🎤 Pre-warm failed (normal if first visit):", err);
      }
    };
    prewarm();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);
  
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    return () => {
      cancelListening();
    };
  }, []);

  const startVolumeMonitoring = (stream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setVolume(Math.min(100, Math.round((average / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (err) {
      console.error("Error accessing microphone for volume sensing:", err);
    }
  };

  const stopVolumeMonitoring = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setVolume(0);
  };

  const startListening = async (metadata = {}) => {
    if (isListening) return;
    
    // Store metadata in a ref so onstop can access it
    const metadataRef = { current: metadata };
    
    try {
      setError(null);
      setTranscript(null); 

      // 🌟 SECURE CONTEXT CHECK
      if (!window.isSecureContext || !navigator.mediaDevices) {
        throw new Error("INSECURE_CONTEXT: Microphone access requires HTTPS or localhost.");
      }
      
      let stream = streamRef.current;
      if (!stream || !stream.active) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }

      const track = stream.getAudioTracks()[0];
      console.log(`🎤 Mic Track: ${track?.label}, State: ${track?.readyState}, Enabled: ${track?.enabled}`);
      
      // 🌟 MOBILE COMPATIBILITY: Find a supported mimeType
      const mimeType = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        ''
      ].find(type => !type || MediaRecorder.isTypeSupported(type));

      console.log(`🎤 Using mimeType: ${mimeType || 'default'}`);
      
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      let totalSize = 0;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          totalSize += event.data.size;
          console.log(`🎤 Data Pulse: ${event.data.size} bytes (Total: ${totalSize} bytes)`);
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (err) => {
        console.error("🚨 MediaRecorder Error:", err);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        audioChunksRef.current = [];
        stopVolumeMonitoring();

        // 🚨 CRITICAL: Check connection at the EXACT moment of stopping
        const isOffline = !navigator.onLine;
        
        if (isOffline) {
          console.warn("🎤 Connection lost during recording. Saving locally immediately.");
          if (chatId && audioBlob.size > 1000) {
            await saveToVoiceQueue(chatId, audioBlob, metadata);
            const msg = lang === "mr-IN" 
              ? "इंटरनेट नाही. तुमचे रेकॉर्डिंग सेव्ह केले आहे." 
              : "No internet. Your recording has been saved.";
            setError("OFFLINE_NETWORK"); // This will trigger the Marathi UI message
            setIsProcessing(false);
            setIsListening(false);
            return;
          }
        }

        setIsProcessing(true);
        console.log("🎤 Recording stopped. Blob size:", audioBlob.size);
        console.log(`🎤 Audio Blob created: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        audioChunksRef.current = [];

        // 🌟 GHOST CHECK: If audio is too small, don't even try to send it
        if (audioBlob.size < 1000) {
          console.warn("🎤 Recording too small to be valid audio. Skipping upload.");
          setError(lang === "mr-IN" 
            ? "मला कोणताही आवाज ऐकू आला नाही. कृपया मोठ्याने बोला किंवा तुमचा माईक तपासा."
            : "I couldn't hear any sound. Please try speaking louder or check your mic.");
          setIsProcessing(false);
          setTranscript("");
          return;
        }
        
        const extension = audioBlob.type.includes('mp4') ? 'mp4' : 
                          audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
        
        const formData = new FormData();
        formData.append("file", audioBlob, `recording.${extension}`);
        formData.append("lang", lang);
        
        let timeoutId;
        try {
          if (!navigator.onLine) {
            throw new Error("OFFLINE_NETWORK");
          }

          console.log("📡 Sending audio to transcription API...");
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 45000);

          const res = await fetch(`${API_URL}/api/transcribe`, {
            method: "POST",
            body: formData,
            signal: controller.signal
          });
          
          if (timeoutId) clearTimeout(timeoutId);
          
          if (!res.ok) throw new Error(`Backend error: ${res.status}`);
          
          const data = await res.json();
          
          setTranscript(data.text || "");
          if (!data.text) {
            setError("Could not understand the audio. Please try again.");
          }
        } catch (err) {
          if (timeoutId) clearTimeout(timeoutId);
          console.error("🎤 Transcription error:", err);
          
          let errorMessage = lang === "mr-IN" 
            ? "सर्व्हरशी जोडणी करण्यात अडचण येत आहे."
            : "Failed to connect to the backend server.";

          if (err.name === 'AbortError') {
            errorMessage = lang === "mr-IN" 
              ? "कनेक्शनची वेळ संपली. कृपया तुमचे इंटरनेट तपासा."
              : "Connection timeout. Please check your internet.";
          } else if (err.message === "OFFLINE_NETWORK") {
            errorMessage = lang === "mr-IN" 
              ? "तुम्ही ऑफलाइन आहात. तुमचे रेकॉर्डिंग सेव्ह केले आहे."
              : "You are offline. Your recording has been saved.";
          }

          // 🌟 OFFLINE MAGIC: Save to IndexedDB ONLY if offline
          if (chatId && !navigator.onLine) {
            try {
              console.log("🎤 Attempting to save audio locally...");
              if (audioBlob && audioBlob.size > 1000) {
                await saveToVoiceQueue(chatId, audioBlob, metadata);
                errorMessage = lang === "mr-IN"
                  ? "आवाज जतन केला! ऑनलाइन आल्यावर उत्तर मिळेल."
                  : "Audio saved! You'll get an answer once online.";
                console.log("🎤 Saved to offline queue successfully.");
              }
            } catch (queueErr) {
              console.error("🎤 Failed to save to voice queue:", queueErr);
            }
          }
          
          setError(errorMessage);
          setTranscript(""); 
        } finally {
          setIsProcessing(false);
        }
      };

      mediaRecorder.start(); 
      setIsListening(true);
      startVolumeMonitoring(stream);
      
    } catch (err) {
      console.error('Error starting recording:', err);
      if (err.message.includes("INSECURE_CONTEXT")) {
        setError("Microphone blocked: Browser requires HTTPS to use the mic. Please use localhost or an HTTPS URL.");
      } else {
        setError('Microphone access denied or unavailable.');
      }
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
          setIsListening(false);
          stopVolumeMonitoring();
        }
      }, 400);
    }
  };

  const cancelListening = () => {
    console.log("🎤 cancelListening called - resetting state");
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.onstop = null; 
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
    setIsProcessing(false);
    // Only reset if we are not already successful
    setTranscript(prev => prev === null ? "" : prev); 
    stopVolumeMonitoring();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return {
    isListening,
    transcript,
    volume,
    toggleListening,
    startListening,
    stopListening,
    cancelListening,
    setTranscript,
    error,
    isProcessing
  };
};

export default useSpeechToText;
