import React, { useState, useEffect, useRef } from "react";
import "./rootLayout.css";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../../context/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  User,
  Menu,
  X,
  Sun,
  Moon,
  Settings,
  LogOut,
  UserCircle,
} from "lucide-react";
import { LanguageProvider, useLanguage } from "../../context/LanguageContext";
import { ThemeProvider, useTheme } from "../../context/ThemeContext";
import voiceService from "../../lib/voiceService"; // 🔹 Import voice service
import WeatherWidget from "../../components/WeatherWidget/WeatherWidget";
import BackgroundVoiceProcessor from "../../components/BackgroundVoiceProcessor/BackgroundVoiceProcessor";

// Clerk PK check removed

const queryClient = new QueryClient();

// Separate component so useLanguage() works inside the Provider
const LanguageToggle = () => {
  const { language, toggleLanguage } = useLanguage();
  const isMarathi = language === "mr-IN";

  return (
    <button
      className="lang-toggle"
      onClick={toggleLanguage}
      title={isMarathi ? "Switch to English" : "मराठीत स्विच करा"}
    >
      <span className={`lang-option ${!isMarathi ? "active" : ""}`}>EN</span>
      <span className="lang-divider">/</span>
      <span className={`lang-option ${isMarathi ? "active" : ""}`}>MR</span>
    </button>
  );
};

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  // ✨ REMOVED: We no longer hide the toggle on the Homepage!
  // Let the global layout handle the perfect alignment.

  return (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      {/* ✨ Added pointerEvents: 'none' so clicking the dead center works every time! */}
      {theme === "dark" ? (
        <Sun size={18} style={{ pointerEvents: "none" }} />
      ) : (
        <Moon size={18} style={{ pointerEvents: "none" }} />
      )}
    </button>
  );
};

const UserMenu = () => {
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const isMr = language === "mr-IN";

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const AVATAR_COLORS = [
    "linear-gradient(135deg, #059669, #065f46)", // Emerald (Primary)
    "linear-gradient(135deg, #10b981, #047857)", // Jade
    "linear-gradient(135deg, #0d9488, #0f766e)", // Teal
    "linear-gradient(135deg, #0891b2, #155e75)", // Cyan/Ocean
    "linear-gradient(135deg, #65a30d, #3f6212)", // Leaf/Lime
    "linear-gradient(135deg, #84cc16, #4d7c0f)", // Grass
    "linear-gradient(135deg, #14b8a6, #0d9488)", // Mint/Teal
  ];

  const getAvatarColor = (name) => {
    if (!name) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  };

  const getInitials = (name) => {
    if (!name) return "?";
    const names = name.split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const initials = getInitials(user.name);
  const avatarBg = getAvatarColor(user.name);

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className="user-avatar-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
      >
        <div className="user-avatar-circle" style={{ background: avatarBg }}>
          {initials}
        </div>
      </button>

      {isOpen && (
        <div className="user-dropdown-menu">
          <div className="user-dropdown-header">
            <div
              className="user-dropdown-avatar"
              style={{ background: avatarBg }}
            >
              {initials}
            </div>
            <div className="user-dropdown-info">
              <span className="user-dropdown-name">{user.name}</span>
              <span className="user-dropdown-email">{user.email}</span>
            </div>
          </div>

          <div className="user-dropdown-divider" />

          <div className="user-dropdown-items">
            <button
              className="user-dropdown-item"
              onClick={() => {
                navigate("/dashboard/settings");
                setIsOpen(false);
              }}
            >
              <Settings size={18} />
              <span>{isMr ? "खाते व्यवस्थापित करा" : "Manage account"}</span>
            </button>
            <button
              className="user-dropdown-item"
              onClick={() => {
                navigate("/dashboard/profile");
                setIsOpen(false);
              }}
            >
              <UserCircle size={18} />
              <span>{isMr ? "प्रोफाइल" : "Profile"}</span>
            </button>

            <div className="user-dropdown-divider" />

            <button className="user-dropdown-item logout" onClick={logout}>
              <LogOut size={18} />
              <span>{isMr ? "बाहेर पडा" : "Sign out"}</span>
            </button>
          </div>

          <div className="user-dropdown-footer">
            <span className="secured-by">{isMr ? "सुरक्षित" : "Secured"}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const HeaderUserControls = ({ isDashboardRoute }) => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { user, logout } = useAuth();
  const isMr = language === "mr-IN";

  return (
    <div className="user">
      {isDashboardRoute && <WeatherWidget />}
      <ThemeToggle />
      <LanguageToggle />
      <UserMenu />
    </div>
  );
};

const RootLayout = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isPublicRoute =
    location.pathname === "/" ||
    location.pathname.startsWith("/sign-in") ||
    location.pathname.startsWith("/sign-up");

  const isDashboardRoute = location.pathname.startsWith("/dashboard");

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // 🔹 Initialize voice service on app load
  useEffect(() => {
    if (!voiceService.isSupported()) {
      console.warn("⚠️ Text-to-Speech not supported in this browser");
      console.warn("Please use Chrome, Edge, or Safari for voice features");
    } else {
      console.log("✅ Text-to-Speech ready");

      // Load voices (required for Chrome/Edge)
      if (window.speechSynthesis) {
        // Trigger initial voice loading
        window.speechSynthesis.getVoices();

        // Listen for voices loaded event
        window.speechSynthesis.onvoiceschanged = () => {
          const voices = window.speechSynthesis.getVoices();
          console.log(`📢 Loaded ${voices.length} voices`);

          // Check for Indian language voices
          const marathiVoice = voices.find((v) => v.lang === "mr-IN");
          const hindiVoice = voices.find((v) => v.lang === "hi-IN");
          const englishIndiaVoice = voices.find((v) => v.lang === "en-IN");
          const englishUSVoice = voices.find((v) => v.lang === "en-US");

          if (marathiVoice) {
            console.log("✅ Marathi voice:", marathiVoice.name);
          } else if (hindiVoice) {
            console.log(
              "⚠️ Marathi not found, using Hindi fallback:",
              hindiVoice.name,
            );
          } else {
            console.log("⚠️ No Marathi/Hindi voices available");
          }

          if (englishIndiaVoice) {
            console.log("✅ English (India) voice:", englishIndiaVoice.name);
          } else if (englishUSVoice) {
            console.log("✅ English (US) voice:", englishUSVoice.name);
          }

          // Log all available languages (for debugging)
          const languages = [...new Set(voices.map((v) => v.lang))].sort();
          console.log("🌍 Available languages:", languages.join(", "));
        };
      }
    }
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <div
              className={`rootLayout ${isPublicRoute ? "public-mode" : ""} ${isSidebarOpen ? "sidebar-open" : ""}`}
            >
              <BackgroundVoiceProcessor />
              <header>
                {isDashboardRoute && (
                  <button
                    className="hamburger-btn"
                    onClick={toggleSidebar}
                    aria-label="Toggle menu"
                  >
                    {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
                  </button>
                )}

                {isDashboardRoute && (
                  <Link to="/" className="logo">
                    <img src="/agrivanilogo.png" alt="" />
                    <span>AGRIVANI</span>
                  </Link>
                )}

                <HeaderUserControls isDashboardRoute={isDashboardRoute} />
              </header>
              <main>
                <Outlet context={{ isSidebarOpen, setIsSidebarOpen }} />
              </main>

              {isSidebarOpen && isDashboardRoute && (
                <div
                  className="sidebar-overlay"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}
            </div>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
};

export default RootLayout;
