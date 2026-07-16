import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";
import NewPrompt from "../../components/NewPrompt/NewPrompt";
import "./ProfileSetupChatPage.css";
import { getAuth } from "firebase/auth";

const ProfileSetupChatPage = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const wrapperRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Proxy states for NewPrompt's Hub
  const [liveQuestion, setLiveQuestion] = useState("");
  const [liveIsTyping, setLiveIsTyping] = useState(false);

  const isMr = language === "mr-IN";
  const strings = isMr
    ? { thinking: "विचार करत आहे..." }
    : { thinking: "AI is thinking..." };

  const questions = [
    {
      field: "district",
      aiMessage: {
        "mr-IN":
          "नमस्ते! सर्वात आधी, आपण कोणत्या जिल्ह्यात शेती करता? (उदा. नाशिक, पुणे)",
        "en-IN":
          "Hello! First, which district do you farm in? (e.g., Nashik, Pune)",
      },
    },
    {
      field: "landSize",
      aiMessage: {
        "mr-IN": "आपल्याकडे किती एकर जमीन आहे? (उदा. 2, 5.5)",
        "en-IN": "How many acres of land do you have? (e.g., 2, 5.5)",
      },
    },
    // 🌟 NEW: Ask for Land Type
    {
      field: "landType",
      aiMessage: {
        "mr-IN":
          "तुमची जमीन कशा प्रकारची आहे? (उदा. बागायत, कोरडवाहू, किंवा जिरायत)",
        "en-IN":
          "What type of land do you have? (e.g., Irrigated, Rainfed, or Dryland)",
      },
    },
    {
      field: "crops",
      aiMessage: {
        "mr-IN": "आपण कोणती पिके घेतात? (उदा. टोमॅटो, कांदा, गहू)",
        "en-IN": "What crops do you grow? (e.g., Tomato, Onion, Wheat)",
      },
    },
    {
      field: "income",
      aiMessage: {
        "mr-IN": "शेवटचं, आपले वार्षिक उत्पन्न किती आहे? (उदा. 50000, 200000)",
        "en-IN": "Lastly, what is your annual income? (e.g., 50000, 200000)",
      },
    },
  ];

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          role: "model",
          parts: [{ text: questions[0].aiMessage[language] }],
        },
      ]);
    }
  }, [language]);

  useEffect(() => {
    if (wrapperRef.current) {
      wrapperRef.current.scrollTo({
        top: wrapperRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, liveQuestion, liveIsTyping]);

  // 🌟 HELPER: Converts spoken words (Marathi/English) into actual digits
  // 🌟 HELPER: Converts spoken words (Marathi/English) into actual digits
  const parseSpokenNumber = (rawMarathi, translatedEnglish) => {
    const combinedText = `${rawMarathi} ${translatedEnglish}`.toLowerCase();

    // 1. आधी प्रत्यक्ष अंक शोधण्याचा प्रयत्न करा (उदा. "5" किंवा "60000")
    const digitMatch = combinedText.match(/\d+(?:\.\d+)?/);
    if (digitMatch) {
      let num = parseFloat(digitMatch[0]);
      if (combinedText.includes("thousand") || combinedText.includes("हजार"))
        num *= 1000;
      if (combinedText.includes("lakh") || combinedText.includes("लाख"))
        num *= 100000;
      return num;
    }

    // 2. अंक नसल्यास, शब्दांवरून आकडा शोधा (उदा. 'साठ' -> 60)
    const wordMap = {
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
      hundred: 100,
      एक: 1,
      दोन: 2,
      दीड: 1.5,
      अडीच: 2.5,
      तीन: 3,
      चार: 4,
      पाच: 5,
      सहा: 6,
      सात: 7,
      आठ: 8,
      नऊ: 9,
      दहा: 10,
      वीस: 20,
      तीस: 30,
      चाळीस: 40,
      पन्नास: 50,
      साठ: 60,
      सत्तर: 70,
      ऐंशी: 80,
      नव्वद: 90,
      शंभर: 100,
    };

    let baseNum = 0;
    const words = combinedText.split(/[\s,]+/);
    for (let word of words) {
      if (wordMap[word] !== undefined) {
        baseNum = wordMap[word];
        break; // पहिला आकडा सापडताच थांबा
      }
    }

    // जर बेस नंबर (उदा. 60) सापडला, तर त्याला हजार/लाख ने गुणा
    if (baseNum > 0) {
      if (combinedText.includes("thousand") || combinedText.includes("हजार"))
        baseNum *= 1000;
      if (combinedText.includes("lakh") || combinedText.includes("लाख"))
        baseNum *= 100000;
      return baseNum;
    }

    return 0; // काहीच न सापडल्यास 0
  };

  const handleSend = async (text) => {
    if (!text?.trim() || loading) return;

    const userAnswer = text.trim();
    setLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        parts: [{ text: userAnswer }],
      },
    ]);

    const currentQ = questions[currentStep];

    // 🌟 STEP 1: Translate Marathi to English using Python API
    let englishAnswer = userAnswer;
    if (language === "mr-IN") {
      try {
        const transRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/translate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: userAnswer, target_lang: "en" }),
          },
        );
        const transData = await transRes.json();
        englishAnswer = transData.translated || userAnswer;
      } catch (e) {
        console.error("Translation failed:", e);
      }
    }

    // 🌟 STEP 2: Process the translated English text
    let fieldToUpdate = "";
    let valueToSave = null;
    let extraField = null; // Used to auto-calculate farmer tier
    let extraValue = null;

    if (currentQ.field === "landSize") {
      fieldToUpdate = "landSize";
      valueToSave = parseSpokenNumber(userAnswer, englishAnswer);

      if (valueToSave > 0) {
        extraField = "farmerCategory";
        if (valueToSave <= 1) extraValue = "marginal";
        else if (valueToSave <= 2) extraValue = "small";
        else if (valueToSave <= 4) extraValue = "semi-medium";
        else if (valueToSave <= 10) extraValue = "medium";
        else extraValue = "large";
      }

      // 🌟 NEW: Smart Land Type Parser
    } else if (currentQ.field === "landType") {
      fieldToUpdate = "landType";
      const combinedText = `${englishAnswer} ${userAnswer}`.toLowerCase();

      if (
        combinedText.includes("irrigated") ||
        combinedText.includes("बागायत") ||
        combinedText.includes("bagayat")
      ) {
        valueToSave = "Irrigated";
      } else if (
        combinedText.includes("dryland") ||
        combinedText.includes("जिरायत") ||
        combinedText.includes("jirayat")
      ) {
        valueToSave = "Dryland";
      } else {
        // Default to Rainfed if they say "Rainfed", "कोरडवाहू", or give an unclear answer
        valueToSave = "Rainfed";
      }
    } else if (currentQ.field === "crops") {
      fieldToUpdate = "crops";
      const englishStopWords = [
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "am",
        "an",
        "and",
        "any",
        "are",
        "aren't",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can't",
        "cannot",
        "could",
        "couldn't",
        "did",
        "didn't",
        "do",
        "does",
        "doesn't",
        "doing",
        "don't",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "hadn't",
        "has",
        "hasn't",
        "have",
        "haven't",
        "having",
        "he",
        "he'd",
        "he'll",
        "he's",
        "her",
        "here",
        "here's",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "how's",
        "i",
        "i'd",
        "i'll",
        "i'm",
        "i've",
        "if",
        "in",
        "into",
        "is",
        "isn't",
        "it",
        "it's",
        "its",
        "itself",
        "let's",
        "let",
        "lets",
        "me",
        "more",
        "most",
        "mustn't",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "ought",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "shan't",
        "she",
        "she'd",
        "she'll",
        "she's",
        "should",
        "shouldn't",
        "so",
        "some",
        "such",
        "take",
        "takes",
        "than",
        "that",
        "that's",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "there's",
        "these",
        "they",
        "they'd",
        "they'll",
        "they're",
        "they've",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "wasn't",
        "we",
        "we'd",
        "we'll",
        "we're",
        "we've",
        "were",
        "weren't",
        "what",
        "what's",
        "when",
        "when's",
        "where",
        "where's",
        "which",
        "while",
        "who",
        "who's",
        "whom",
        "why",
        "why's",
        "with",
        "won't",
        "would",
        "wouldn't",
        "you",
        "you'd",
        "you'll",
        "you're",
        "you've",
        "your",
        "yours",
        "yourself",
        "yourselves",
      ];

      const cleanedCrops = englishAnswer
        .split(/[\s,]+/)
        .filter((word) => !englishStopWords.includes(word.toLowerCase()))
        .filter((word) => word.length > 1)
        .map((c) => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()); // Capitalize first letter

      valueToSave = [...new Set(cleanedCrops)];
    } else if (currentQ.field === "income") {
      fieldToUpdate = "annualIncome";
      // 🌟 FIXED: Use our new spoken number parser
      valueToSave = parseSpokenNumber(userAnswer, englishAnswer);
    } else {
      fieldToUpdate = "district";
      // Clean up conversational phrasing for location
      const cleanedDistrict = englishAnswer
        .replace(/i live in|district|from|is|my/gi, "")
        .trim();
      valueToSave = cleanedDistrict.split(/[\s,]+/)[0] || userAnswer; // Grab the core word
    }

    // 🌟 STEP 3: Save cleanly to the database
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      const realUserId = currentUser ? currentUser.uid : "anonymous_user";

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/profile/update-field`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: realUserId,
            field: fieldToUpdate,
            value: valueToSave,
          }),
        },
      );

      const result = await response.json();

      // Save extra calculated field (like Farmer Tier) if it exists
      if (extraField && extraValue && result.success) {
        await fetch(
          `${import.meta.env.VITE_API_URL}/api/profile/update-field`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: realUserId,
              field: extraField,
              value: extraValue,
            }),
          },
        );
      }

      if (result.success) {
        if (currentStep < questions.length - 1) {
          const nextStep = currentStep + 1;
          setCurrentStep(nextStep);
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              {
                role: "model",
                parts: [{ text: questions[nextStep].aiMessage[language] }],
              },
            ]);
          }, 800);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "model",
              parts: [
                {
                  text: isMr
                    ? "🎉 धन्यवाद! आपले प्रोफाइल पूर्ण झाले आहे. आता आपण डॅशबोर्ड वापरू शकता."
                    : "🎉 Thank you! Your profile is complete. You can now use the dashboard.",
                },
              ],
            },
          ]);
          setTimeout(() => {
            navigate("/dashboard");
          }, 3000);
        }
      }
    } catch (error) {
      console.error("Profile step error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          parts: [
            {
              text: isMr
                ? "❌ काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा."
                : "❌ Something went wrong. Please try again.",
            },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatPage">
      <div className="chatPage-container">
        <div className="wrapper" ref={wrapperRef}>
          <div className="chat">
            {messages.map((msg, index) => (
              <React.Fragment key={index}>
                <div className={`message ${msg.role === "user" ? "user" : ""}`}>
                  {msg.parts[0].text}
                </div>
              </React.Fragment>
            ))}

            {/* Live transcription preview */}
            {liveQuestion && (
              <div className="message user setup-live-preview">
                {liveQuestion}
                <span className="setup-live-dot">...</span>
              </div>
            )}

            {/* AI thinking indicator */}
            {liveIsTyping && !liveQuestion && (
              <div className="message ai-thinking-bubble">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <em>{strings.thinking}</em>
              </div>
            )}
          </div>
        </div>

        {/* The AgriVani Hub — fully integrated */}
        <NewPrompt
          onCustomSend={handleSend}
          setLiveQuestion={setLiveQuestion}
          setLiveIsTyping={setLiveIsTyping}
          setLiveAnswer={() => {}}
          setLiveImage={() => {}}
          setPendingProfileUpdate={() => {}}
          setUpdatingProfile={() => {}}
          liveQuestion={liveQuestion}
          liveIsTyping={liveIsTyping}
          pendingProfileUpdate={null}
          data={{}}
        />
      </div>
    </div>
  );
};

export default ProfileSetupChatPage;
