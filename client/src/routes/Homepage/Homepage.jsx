import React, { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { TypeAnimation } from "react-type-animation";
import { useTheme } from "../../context/ThemeContext";
import { useLanguage } from "../../context/LanguageContext";
import "./Homepage.css";

const WaveformSVG = ({ className, isLightMode }) => {
  const suffix = isLightMode ? "light" : "dark";
  return (
    <svg
      className={className}
      viewBox="0 0 1200 120"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient
          id={`waveGrad1-${suffix}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop
            offset="0%"
            stopColor={isLightMode ? "#dcfce7" : "#0D4F2F"}
            stopOpacity={isLightMode ? 0.2 : 0}
          />
          <stop
            offset="30%"
            stopColor={isLightMode ? "#a7f3d0" : "#00C46A"}
            stopOpacity={isLightMode ? 0.8 : 0.7}
          />
          <stop
            offset="70%"
            stopColor={isLightMode ? "#6ee7b7" : "#008C72"}
            stopOpacity={isLightMode ? 0.6 : 0.5}
          />
          <stop
            offset="100%"
            stopColor={isLightMode ? "#dcfce7" : "#0D4F2F"}
            stopOpacity={isLightMode ? 0.2 : 0}
          />
        </linearGradient>
        <linearGradient
          id={`waveGrad2-${suffix}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <stop
            offset="0%"
            stopColor={isLightMode ? "#a7f3d0" : "#00C46A"}
            stopOpacity="0"
          />
          <stop
            offset="50%"
            stopColor={isLightMode ? "#34d399" : "#00FFAA"}
            stopOpacity={0.35}
          />
          <stop
            offset="100%"
            stopColor={isLightMode ? "#6ee7b7" : "#008C72"}
            stopOpacity="0"
          />
        </linearGradient>
      </defs>
      <path
        className="wave-path wave-1"
        d="M0,60 C150,10 300,110 450,60 C600,10 750,110 900,60 C1050,10 1150,90 1200,60"
        fill="none"
        stroke={`url(#waveGrad1-${suffix})`}
        strokeWidth="2"
      />
      <path
        className="wave-path wave-2"
        d="M0,70 C100,30 250,100 400,50 C550,10 700,110 850,60 C1000,20 1150,100 1200,70"
        fill="none"
        stroke={`url(#waveGrad2-${suffix})`}
        strokeWidth="1.5"
      />
      <path
        className="wave-path wave-3"
        d="M0,50 C200,90 350,20 500,70 C650,120 800,20 950,60 C1100,100 1180,30 1200,50"
        fill="none"
        stroke={`url(#waveGrad1-${suffix})`}
        strokeWidth="1"
        strokeOpacity="0.4"
      />
    </svg>
  );
};

// ✨ ISOLATED CHAT COMPONENT: This entirely destroys the old DOM when the language changes!
const ChatBubble = ({ isMr, t }) => {
  const [typingStatus, setTypingStatus] = useState("human1");

  // useMemo safely locks these sequences in memory so they never overlap
  const chatSequence = useMemo(
    () =>
      isMr
        ? [
            () => setTypingStatus("human1"),
            "आजचा कांद्याचा भाव?",
            2000,
            () => setTypingStatus("bot"),
            "नाशिकमध्ये ₹२,१०० प्रति क्विंटल.",
            2000,
            () => setTypingStatus("human2"),
            "पाने पिवळी पडत आहेत...",
            2000,
            () => setTypingStatus("bot"),
            "नायट्रोजन खत वापरा.",
            2000,
            () => setTypingStatus("human1"),
            "माझ्यासाठी कोणती सरकारी योजना आहे?",
            2000,
            () => setTypingStatus("bot"),
            "पीएम-किसान — ₹६,०००/वर्ष पात्र!",
            2000,
            () => setTypingStatus("human2"),
            "आज पाऊस पडेल का?",
            2000,
            () => setTypingStatus("bot"),
            "आकाश निरभ्र, आज 32°C.",
            2000,
          ]
        : [
            () => setTypingStatus("human1"),
            "Onion price today?",
            2000,
            () => setTypingStatus("bot"),
            "₹2,100 per quintal in Nashik.",
            2000,
            () => setTypingStatus("human2"),
            "Leaves turning yellow...",
            2000,
            () => setTypingStatus("bot"),
            "Apply Nitrogen fertilizer.",
            2000,
            () => setTypingStatus("human1"),
            "Any govt scheme for me?",
            2000,
            () => setTypingStatus("bot"),
            "PM-KISAN — ₹6,000/yr eligible!",
            2000,
            () => setTypingStatus("human2"),
            "Will it rain today?",
            2000,
            () => setTypingStatus("bot"),
            "Clear skies, 32°C today.",
            2000,
          ],
    [isMr],
  );

  return (
    <div className="chat-bubble">
      <div className="chat-avatar">
        <img
          src={
            typingStatus === "human1"
              ? "/human1.jpeg"
              : typingStatus === "human2"
                ? "/human2.jpeg"
                : "/bot.png"
          }
          alt="speaker"
        />
        <span
          className={`avatar-dot ${typingStatus === "bot" ? "is-bot" : "is-human"}`}
        />
      </div>
      <div className="chat-body">
        <span className="chat-role lang-fade">
          {typingStatus === "bot" ? t.botRole : t.userRole}
        </span>
        <div className="chat-text-wrapper lang-fade">
          <TypeAnimation
            sequence={chatSequence}
            className="chat-text"
            speed={60}
            deletionSpeed={80}
            repeat={Infinity}
          />
        </div>
      </div>
    </div>
  );
};

const Homepage = () => {
  const videoRef = useRef(null);
  const [fade, setFade] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { theme } = useTheme();
  const isLightMode = theme === "light";

  const { language } = useLanguage();
  const isMr = language === "mr-IN";

  useEffect(() => {
    document.title = isMr
      ? "ॲग्रीवाणी - शेतीसाठी एआय"
      : "AgriVani - AI for Agriculture";
  }, [isMr]);

  const t = {
    badge: isMr
      ? "शेतीसाठी व्हॉइस-फर्स्ट एआय"
      : "Voice-First AI for Agriculture",
    sub1: isMr ? "शेतकऱ्यांचे सक्षमीकरण" : "Empowering Farmers with ",
    sub2: isMr ? " व्हॉइस-फर्स्ट एआयने" : "Voice-First AI",
    desc: isMr
      ? "आवाजाद्वारे झटपट, वैयक्तिकृत कृषी मार्गदर्शन मिळवा. पिके, हवामान अंदाज, सरकारी योजना आणि बाजारातील किमती यावर तज्ञांचा सल्ला मिळवण्यासाठी फक्त बोला — प्रत्येक भारतीय शेतकऱ्यासाठी डिजिटल दरी कमी करणे."
      : "Get real-time, personalized agricultural guidance instantly via voice. Simply speak to access expert advice on crops, weather forecasts, government schemes, and market prices — bridging the digital gap for every Indian farmer.",
    btn1: isMr ? "मोफत सुरुवात करा" : "Get Started Free",
    btn2: isMr ? "डेमो पहा" : "Watch Demo",
    stat1: isMr ? "२४/७ एआय सल्ला" : "24/7 AI Advisory",
    stat2: isMr ? "झटपट आवाज मार्गदर्शन" : "Instant Voice Guidance",
    stat3: isMr ? "थेट बाजारातील किमती" : "Real-Time Market Prices",
    pill1: isMr ? "पीक सल्ला" : "Crop Advice",
    pill2: isMr ? "बाजारभाव" : "Market Prices",
    pill3: isMr ? "हवामान एआय" : "Weather AI",
    pill4: isMr ? "सरकारी योजना" : "Govt. Schemes",
    botRole: isMr ? "🌿 ॲग्रीवाणी एआय" : "🌿 Agrivani AI",
    userRole: isMr ? "👤 शेतकरी" : "👤 Farmer",
  };

  useEffect(() => {
    const t = setTimeout(() => setIsLoaded(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let rafId;
    const checkTime = () => {
      if (video.duration) {
        const remaining = video.duration - video.currentTime;
        if (remaining <= 0.7) setFade(true);
        else setFade(false);
        if (remaining <= 0.05) {
          video.currentTime = 0;
          video.play();
          setFade(false);
        }
      }
      rafId = requestAnimationFrame(checkTime);
    };
    rafId = requestAnimationFrame(checkTime);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className={`homepage ${isLoaded ? "loaded" : ""}`}>
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <WaveformSVG
        className="waveform waveform-top"
        isLightMode={isLightMode}
      />

      <div className="hp-inner">
        {/* ✨ No more "key" on the outer structural wrapper. It will never physically jump again! */}
        <div className="hp-left">
          <div className="badge">
            <span className="badge-dot" />
            {/* The language key is strictly tied to the inner span to trigger the crossfade */}
            <span key={language} className="lang-fade">
              {t.badge}
            </span>
          </div>

          <h1 className="hero-title">
            <span key={language} className="lang-fade">
              {isMr ? "ॲग्रीवाणी" : "AGRIVANI"}
            </span>
          </h1>

          <h2 className="hero-sub">
            <span key={language} className="lang-fade">
              {t.sub1}
              {!isMr && " "}
              <span className="gradient-text">{t.sub2}</span>
            </span>
          </h2>

          <p className="hero-desc">
            <span key={language} className="lang-fade">
              {t.desc}
            </span>
          </p>

          <div className="cta-group">
            <Link to="/dashboard" className="btn-primary">
              <span key={language} className="lang-fade">
                {t.btn1}
              </span>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <button className="btn-ghost">
              <span className="play-icon">▶</span>
              <span key={language} className="lang-fade">
                {t.btn2}
              </span>
            </button>
          </div>

          <div className="stats-row">
            <div className="stat">
              <span className="stat-num">
                <span key={language} className="lang-fade">
                  {isMr ? "२४/७" : "24/7"}
                </span>
              </span>
              <span className="stat-lbl">
                <span key={language} className="lang-fade">
                  {t.stat1}
                </span>
              </span>
            </div>
            <div className="stat-div" />
            <div className="stat">
              <span className="stat-num">
                <span key={language} className="lang-fade">
                  {isMr ? "झटपट" : "Instant"}
                </span>
              </span>
              <span className="stat-lbl">
                <span key={language} className="lang-fade">
                  {t.stat2}
                </span>
              </span>
            </div>
            <div className="stat-div" />
            <div className="stat">
              <span className="stat-num">
                <span key={language} className="lang-fade">
                  {isMr ? "रिअल-टाइम" : "Real-Time"}
                </span>
              </span>
              <span className="stat-lbl">
                <span key={language} className="lang-fade">
                  {t.stat3}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="hp-right">
          <div className="video-wrapper">
            <div className="video-glow-ring" />
            <div className="video-container">
              <video
                ref={videoRef}
                className={`bot-video ${fade ? "fade-out" : ""}`}
                src="/Cute_Robot_Tilling_Crop_Field.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
              />
              <div className="video-overlay" />
            </div>

            {/* ✨ Providing the key to the entire component guarantees zero ghost texts! */}
            <ChatBubble key={language} isMr={isMr} t={t} />

            <div className="pill pill-1">
              <span>🌾</span>{" "}
              <span key={language} className="lang-fade">
                {t.pill1}
              </span>
            </div>
            <div className="pill pill-2">
              <span>📊</span>{" "}
              <span key={language} className="lang-fade">
                {t.pill2}
              </span>
            </div>
            <div className="pill pill-3">
              <span>🌦️</span>{" "}
              <span key={language} className="lang-fade">
                {t.pill3}
              </span>
            </div>
            <div className="pill pill-4">
              <span>🏛️</span>{" "}
              <span key={language} className="lang-fade">
                {t.pill4}
              </span>
            </div>
          </div>
        </div>
      </div>

      <WaveformSVG
        className="waveform waveform-bottom"
        isLightMode={isLightMode}
      />

      <div className="hp-terms">
        <img src="/agrivanilogo.png" alt="Agrivani" />
        <div className="hp-links">
          <Link to="/">
            <span key={language} className="lang-fade">
              {isMr ? "सेवा अटी" : "Terms of Service"}
            </span>
          </Link>
          <span>|</span>
          <Link to="/">
            <span key={language} className="lang-fade">
              {isMr ? "गोपनीयता धोरण" : "Privacy Policy"}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Homepage;
