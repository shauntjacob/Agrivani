// src/context/LanguageContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  // ✨ Initialize state by checking localStorage first.
  // If nothing is saved, default to Marathi ("mr-IN").
  const [language, setLanguage] = useState(() => {
    const savedLanguage = localStorage.getItem("agrivani_language");
    return savedLanguage ? savedLanguage : "mr-IN";
  });

  // ✨ Every time the language changes, securely save it to the browser
  useEffect(() => {
    localStorage.setItem("agrivani_language", language);
  }, [language]);

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "mr-IN" ? "en-IN" : "mr-IN"));
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
