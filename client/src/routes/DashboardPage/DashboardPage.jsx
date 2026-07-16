import React, { useState } from "react";
import "./DashboardPage.css";
import "../ChatPage/chatPage.css"; // 🌟 ADDED: Ensures the chat bubbles get your teammate's styling

import NewPrompt from "../../components/NewPrompt/NewPrompt";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { IKContext } from "imagekitio-react";
import { MessageSquarePlus, TrendingUp, Sprout } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { normalizeCrop, getCropLabel } from "../../lib/cropUtils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Volume2, VolumeX } from "lucide-react";
import voiceService from "../../lib/voiceService";
import Loading from "../../components/Loading/Loading";

const DashboardPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { userId, isLoaded: authLoaded } = useAuth();
  const { setIsSidebarOpen } = useOutletContext() || {};

  // Streaming / profile states forwarded into NewPrompt
  const [question, setQuestion] = useState("");
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [liveImage, setLiveImage] = useState("");

  const [speakingMessageId, setSpeakingMessageId] = useState(null);

  // ── Real data: chat count ──
  const { data: chatsData, isLoading: chatsLoading } = useQuery({
    queryKey: ["userChats", userId],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/userchats?user_id=${userId}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!userId,
  });

  // ── Real data: crop from profile ──
  const {
    data: profileStatus,
    isLoading: statusLoading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["profileStatus", userId],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/profile/status?user_id=${userId}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!userId,
    staleTime: 1000 * 30, // Reduced to 30s to stay fresh
  });

  // useQuery handles the initial fetch and updates when userId is available.
  // We don't need a separate useEffect to call refetch() on every mount/dependency change.

  const isLoading = !authLoaded || (userId && (chatsLoading || statusLoading));

  const authenticator = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/upload`);
    if (!res.ok) throw new Error("Auth failed");
    return res.json();
  };

  const isMr = language === "mr-IN";
  const chatCount = Array.isArray(chatsData) ? chatsData.length : "—";


  const handleSpeakMessage = (text) => {
    if (speakingMessageId === "live") {
      voiceService.stop();
      setSpeakingMessageId(null);
    } else {
      voiceService.stop();
      voiceService.speak(text, language, () => setSpeakingMessageId(null));
      setSpeakingMessageId("live");
    }
  };

  // Normalized crops from profile
  const rawData = profileStatus?.data || profileStatus?.profile || (profileStatus?.crops ? profileStatus : {});
  let userCropsRaw = rawData.crops || rawData.cropsGrown || [];
  if (typeof userCropsRaw === "string") {
    userCropsRaw = userCropsRaw.split(",").map((s) => s.trim());
  } else if (!Array.isArray(userCropsRaw)) {
    userCropsRaw = [];
  }

  const userCropsNormalized = [
    ...new Set(userCropsRaw.map((c) => normalizeCrop(c)).filter(Boolean)),
  ];

  // Decide what label to show
  let cropLabel = "";
  if (statusLoading) {
    cropLabel = isMr ? "लोड होत आहे..." : "Loading crops...";
  } else if (userCropsNormalized.length > 0) {
    cropLabel =
      userCropsNormalized
        .slice(0, 2)
        .map((c) => getCropLabel(c, isMr))
        .join(", ") + (userCropsNormalized.length > 2 ? "…" : "");
  } else {
    cropLabel = isMr ? "पिके नोंदवलेली नाहीत" : "No crops recorded";
  }

  const showDashboard = !question && !streamingAnswer;

  if (isLoading) return <Loading />;

  return (
    <IKContext
      urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
      publicKey={import.meta.env.VITE_IMAGE_KIT_PUBLIC_KEY}
      authenticator={authenticator}
    >
      <div className="dashboardPage">
        <div className="dashboardPage-container">
          {/* 🌟 FIX: We grouped the Logo, Banner, and KPIs into ONE block that hides completely when chatting */}
          {showDashboard && (
            <div className="texts">
              {/* Logo now correctly disappears when chatting! */}
              <div className="logo-minimal">
                <img src="/agrivanilogo.png" alt="AgriVani" />
                <h1>AGRIVANI</h1>
              </div>

              {/* ── Welcome Banner ── */}
              <div className="welcome-banner fade-in">
                <div className="banner-content">
                  <h2>
                    {isMr ? "नमस्ते, बळीराजा! 🌾" : "Welcome back, Farmer! 🌾"}
                  </h2>
                  <p>
                    {isMr
                      ? "तुमच्या शेतीसाठी वैयक्तिकृत सल्ला आणि बाजार भाव येथे मिळवा."
                      : "Get personalized farming advice and live market prices."}
                  </p>
                </div>
                <div className="banner-badge">AgriVani AI</div>
              </div>

              {/* ── KPI Row — REAL DATA ── */}
              <div className="summary-row fade-in">
                {/* Chat count — real */}
                <div 
                  className="kpi-card soft-card elevation-hover"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    const ctx = typeof setIsSidebarOpen === 'function' ? setIsSidebarOpen : null;
                    if (ctx) ctx(prev => !prev);
                  }}
                  title={isMr ? "चॅट्स पहा" : "View Chats"}
                >
                  <div className="kpi-icon chat-icon">
                    <MessageSquarePlus size={20} />
                  </div>
                  <div className="kpi-data">
                    <span className="kpi-value">{chatCount}</span>
                    <span className="kpi-label">
                      {isMr ? "चॅट्स" : "Chats"}
                    </span>
                  </div>
                </div>

                {/* Crops from profile — real */}
                <div
                  className="kpi-card soft-card elevation-hover"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate("/dashboard/profile")}
                  title={isMr ? "प्रोफाइल पहा" : "View profile"}
                >
                  <div className="kpi-icon check-icon">
                    <Sprout size={20} />
                  </div>
                  <div className="kpi-data">
                    <span
                      className="kpi-value"
                      style={{
                        fontSize: userCropsNormalized.length > 0 ? 13 : 14,
                        fontWeight: 600,
                      }}
                    >
                      {cropLabel}
                    </span>
                    <span className="kpi-label">
                      {isMr ? "तुमची पिके" : "Your Crops"}
                    </span>
                  </div>
                </div>

                {/* Market prices link — navigates to prices */}
                <div
                  className="kpi-card soft-card elevation-hover"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate("/dashboard/prices")}
                >
                  <div className="kpi-icon market-icon">
                    <TrendingUp size={20} />
                  </div>
                  <div className="kpi-data">
                    <span
                      className="kpi-value"
                      style={{ fontSize: 13, fontWeight: 600 }}
                    >
                      {isMr ? "भाव तपासा" : "Check Prices"}
                    </span>
                    <span className="kpi-label">
                      {isMr ? "मंडी बाजार" : "Mandi Market"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── LIVE CHAT UI ── */}
          {!showDashboard && (
            <div
              className="chatPage"
              style={{
                flex: 1,
                width: "100%",
                padding: "10px 0 0 0", // Removes side/bottom padding
                marginBottom: "-20px", // 🌟 Negates the Dashboard's 20px bottom padding to pull it flush
              }}
            >
              <div
                className="chatPage-container dashboard-live-chat"
                style={{
                  borderBottomLeftRadius: 0, // 🌟 Flattens the bottom corners
                  borderBottomRightRadius: 0, // 🌟 Flattens the bottom corners
                  borderBottom: "none", // Removes the bottom border line
                }}
              >
                <div className="wrapper" style={{ paddingBottom: "160px" }}>
                  <div className="chat">
                    {/* 0. Live User Image Bubble */}
                    {liveImage && (
                      <div className="imgContainer user fade-in">
                        <img
                          src={liveImage}
                          alt="Uploaded"
                          style={{
                            maxHeight: "300px",
                            maxWidth: "400px",
                            borderRadius: "12px",
                            objectFit: "cover",
                          }}
                        />
                      </div>
                    )}

                    {/* 1. User Input Bubble */}
                    {question && (
                      <div className="message user fade-in">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "#22c55e", textDecoration: "underline", fontWeight: "bold" }}
                              />
                            ),
                          }}
                        >
                          {question}
                        </Markdown>
                      </div>
                    )}

                    {/* 2. AI Thinking Indicator */}
                    {isTyping && (
                      <div className="message ai-thinking-bubble fade-in">
                        <div className="typing-dots">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                        <em>
                          {isMr ? "विचार करत आहे..." : "AI is thinking..."}
                        </em>
                      </div>
                    )}

                    {/* 3. Live AI Stream Bubble */}
                    {streamingAnswer && (
                      <div
                        className="message ai fade-in" // 🌟 ADDED 'ai' (or 'bot', check chatPage.css)
                        style={{ position: "relative" }}
                      >
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ node, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "#22c55e", textDecoration: "underline", fontWeight: "bold" }}
                              />
                            ),
                          }}
                        >
                          {streamingAnswer}
                        </Markdown>

                        {/* Audio Playback Button (Shows when AI finishes) */}
                        {!isTyping && (
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              marginTop: "10px",
                            }}
                          >
                            <button
                              onClick={() =>
                                handleSpeakMessage(streamingAnswer)
                              }
                              className="voice-playback-btn-inline"
                            >
                              {speakingMessageId === "live" ? (
                                <VolumeX size={16} />
                              ) : (
                                <Volume2 size={16} />
                              )}
                              {speakingMessageId === "live"
                                ? isMr
                                  ? "थांबवा"
                                  : "Stop"
                                : isMr
                                  ? "उत्तर ऐका"
                                  : "Listen"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <NewPrompt
            setLiveQuestion={setQuestion}
            setLiveIsTyping={setIsTyping}
            setLiveAnswer={setStreamingAnswer}
            setPendingProfileUpdate={setPendingUpdate}
            setUpdatingProfile={setUpdatingProfile}
            setLiveImage={setLiveImage}
            liveQuestion={question}
            liveAnswer={streamingAnswer}
            liveIsTyping={isTyping}
            pendingProfileUpdate={pendingUpdate}
            chatId="new_chat"
          />
        </div>
      </div>
    </IKContext>
  );
};

export default DashboardPage;
