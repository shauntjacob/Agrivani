import { formatForSpeech } from './marathiNumberConverter';
import { convertTablesToSpeech } from './tableSpeechGenerator';

class VoiceService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isSpeaking = false;
    
    // 🌟 PRE-WARM: Load voices as soon as they are available
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => {
        console.log("🔊 Voices loaded and ready.");
        this.getVoice('mr-IN'); // Trigger a dummy lookup to cache
      };
    }
  }

  getVoice(language) {
    const voices = this.synth.getVoices();
    const langCode = language === 'mr-IN' ? 'mr-IN' : 'en-IN';

    let voice = voices.find(v => v.lang === langCode);

    // Fallback strategy for Marathi
    if (!voice && language === 'mr-IN') {
      // Try Hindi (closer to Marathi than English)
      voice = voices.find(v => v.lang.startsWith('hi'));
    }

    // For English, try India first, then US/GB
    if (!voice && language === 'en-IN') {
      voice = voices.find(v => v.lang === 'en-US') ||
        voices.find(v => v.lang === 'en-GB') ||
        voices.find(v => v.lang.startsWith('en'));
    }

    // 🔹 Prefer male voices for Marathi (more natural for market announcements)
    if (language === 'mr-IN' && voice) {
      const maleVoices = voices.filter(v =>
        (v.lang === 'mr-IN' || v.lang.startsWith('hi')) &&
        (v.name.toLowerCase().includes('male') ||
          v.name.toLowerCase().includes('hemant') || // Microsoft Hemant (male)
          !v.name.toLowerCase().includes('female'))
      );

      if (maleVoices.length > 0) {
        voice = maleVoices[0];
      }
    }

    return voice;
  }

  speak(text, language = 'en-IN', onEnd = null) {
    this.stop();

    if (!text || text.trim() === '') return;

    // 🔹 Format text for speech (converts numbers, removes emojis, adds pauses)
    let cleanText = language === 'mr-IN'
      ? formatForSpeech(text)
      : this.cleanTextForSpeech(text);

    const utterance = new SpeechSynthesisUtterance(cleanText);

    const voice = this.getVoice(language);
    if (voice) {
      utterance.voice = voice;
      console.log(`🎤 Using voice: ${voice.name} (${voice.lang})`);
    }

    utterance.lang = language === 'mr-IN' ? 'mr-IN' : 'en-IN';

    // 🔹 Voice properties for natural speech
    utterance.rate = language === 'mr-IN' ? 0.85 : 0.9; // Slower for Marathi
    utterance.pitch = 0.95; // Slightly lower pitch (more masculine)
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.isSpeaking = true;
      console.log('🔊 Speech started');
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      console.log('✅ Speech ended');
      if (onEnd) onEnd();
    };

    utterance.onerror = (event) => {
      console.error('❌ Speech error:', event.error);
      this.isSpeaking = false;
    };

    // 🔹 Handle long text (split into chunks if needed)
    if (cleanText.length > 500) {
      // Split by sentence markers
      const chunks = cleanText.split('।').filter(s => s.trim());
      this.speakChunks(chunks, language, onEnd);
    } else {
      this.synth.speak(utterance);
    }
  }

  /**
   * Speak text in chunks (for long responses)
   */
  speakChunks(chunks, language, onEnd) {
    let index = 0;

    const speakNext = () => {
      if (index >= chunks.length) {
        this.isSpeaking = false;
        if (onEnd) onEnd();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index].trim() + '।');
      const voice = this.getVoice(language);
      if (voice) utterance.voice = voice;

      utterance.lang = language === 'mr-IN' ? 'mr-IN' : 'en-IN';
      utterance.rate = language === 'mr-IN' ? 0.85 : 0.9;
      utterance.pitch = 0.95;
      utterance.volume = 1.0;

      utterance.onend = () => {
        index++;
        setTimeout(speakNext, 200); // Small pause between chunks
      };

      this.synth.speak(utterance);
    };

    this.isSpeaking = true;
    speakNext();
  }

  stop() {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
  }

  cleanTextForSpeech(text) {
    // 1. Convert tables to human-like sentences
    let speechFriendlyText = convertTablesToSpeech(text, 'en-IN');

    return speechFriendlyText
      .replace(/\|?\s*--+\s*\|/g, '') // Remove table separator lines
      .replace(/\|/g, ' ')            // Replace vertical bars with space
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
      .replace(/[\u{2600}-\u{26FF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[✅❌⏳📊📈📉🔔💰]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isSupported() {
    return 'speechSynthesis' in window;
  }
}

export default new VoiceService();