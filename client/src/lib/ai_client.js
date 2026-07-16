import { GoogleGenAI } from "@google/genai";

# Initialize the client
export const ai = new GoogleGenAI({ 
  apiKey: import.meta.env.VITE_AI_PUBLIC_KEY 
});
