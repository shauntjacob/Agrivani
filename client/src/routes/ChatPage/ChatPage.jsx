import React, { useRef, useEffect, useState } from "react";
import "./chatPage.css";
import NewPrompt from "../../components/NewPrompt/NewPrompt";
import { useLocation } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IKImage } from "imagekitio-react";
import { useParams } from "react-router-dom";
import { Volume2, VolumeX, X, UserCheck } from "lucide-react";
import voiceService from "../../lib/voiceService";
import { useLanguage } from "../../context/LanguageContext";
import {
  getCachedChatById,
  getCachedMessages,
  cacheMessages,
  cacheSingleChat,
} from "../../lib/db";

const TypedMessage = ({ text, role, language, isLast, onComplete }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isDone, setIsDone] = useState(false);
  
  useEffect(() => {
    if (role === "user" || !isLast) {
      setDisplayedText(text);
      setIsDone(true);
      return;
    }

    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.slice(0, i));
      i++;
      if (i > text.length) {
        clearInterval(interval);
        setIsDone(true);
        if (onComplete) onComplete(text);
      }
    }, 10); // Speed of typing

    return () => clearInterval(interval);
  }, [text, role, isLast]);

  return (
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
      {displayedText}
    </Markdown>
  );
};

const ChatPage = () => {
  const wrapperRef = useRef(null);
  const lastProcessedMessageId = useRef(null);
  const { id: chatId } = useParams();
// ... (rest of imports/state)
  const { language } = useLanguage();
  const [speakingMessageId, setSpeakingMessageId] = useState(null);

  const isMr = language === "mr-IN";
  const strings = isMr
    ? {
        listenToResponse: "उत्तर ऐका",
        stopListening: "थांबवा",
      }
    : {
        listenToResponse: "Listen to answer",
        stopListening: "Stop",
      };

  // ── LIVE STREAMING STATE (Lifted from NewPrompt) ──
  const [question, setQuestion] = useState("");
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [liveImage, setLiveImage] = useState("");

  const queryClient = useQueryClient();
  const { isPending, error, data } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/chats/${chatId}`,
          {
            credentials: "include",
          },
        );
        if (!res.ok) throw new Error("Network response was not ok");
        const serverChat = await res.json();

        // 🔹 Update cache
        const { history, ...meta } = serverChat;
        await cacheSingleChat({ ...meta, _id: chatId });
        if (history) await cacheMessages(chatId, history);

        return serverChat;
      } catch (err) {
        console.warn("API fetch failed, trying local cache...", err);
        const cachedMeta = await getCachedChatById(chatId);
        const cachedMessages = await getCachedMessages(chatId);

        if (cachedMeta) {
          return { ...cachedMeta, history: cachedMessages, _offline: true };
        }
        throw err;
      }
    },
    enabled: !!chatId && chatId !== "[object Object]" && chatId !== "undefined",
    retry: (failureCount, error) => failureCount < 1, // Only retry once
    staleTime: 1000 * 60 * 5, // Consider fresh for 5 mins
  });

  useEffect(() => {
    const handleVoiceSync = (e) => {
      if (e.detail?.chatId === chatId) {
        console.log("🔄 Voice Sync Event Received! Refreshing chat...");
        queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      }
    };

    window.addEventListener("voiceSyncSuccess", handleVoiceSync);
    return () =>
      window.removeEventListener("voiceSyncSuccess", handleVoiceSync);
  }, [chatId, queryClient]);

  useEffect(() => {
    if (data && wrapperRef.current) {
      wrapperRef.current.scrollTo({
        top: wrapperRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [data]);

  const handleSpeakMessage = (text, messageIndex) => {
    if (speakingMessageId === messageIndex) {
      voiceService.stop();
      setSpeakingMessageId(null);
    } else {
      voiceService.stop();
      voiceService.speak(text, language, () => {
        setSpeakingMessageId(null);
      });
      setSpeakingMessageId(messageIndex);
    }
  };

  return (
    <div className="chatPage">
      <div className="chatPage-container">
        <div className="wrapper" ref={wrapperRef}>
          <div className="chat">
            {isPending ? (
              <div className="status">Loading...</div>
            ) : error && !data ? (
              <div className="status">
                Something went wrong! Please check your connection.
              </div>
            ) : (
              <>
                {data?.history?.map((message, i) => {
                  const isLast = i === data.history.length - 1;
                  const isAi = message.role !== "user";

                  return (
                    <React.Fragment key={i}>
                      {message.img && (
                        <div
                          className={
                            message.role === "user"
                              ? "imgContainer user"
                              : "imgContainer"
                          }
                        >
                          <img
                            src={message.img}
                            alt="plant"
                            style={{
                              maxHeight: "300px",
                              maxWidth: "400px",
                              borderRadius: "12px",
                              objectFit: "cover",
                            }}
                            loading="lazy"
                          />
                        </div>
                      )}
                      {message.parts[0].text && (
                        <div
                          className={
                            message.role === "user" ? "message user" : "message"
                          }
                        >
                          <TypedMessage
                            text={message.parts[0].text}
                            role={message.role}
                            language={language}
                            isLast={isLast}
                            onComplete={(fullText) => {
                              // 🌟 AUTO-PLAY logic - Only play once per message
                              const spokenKey = `spoken_${chatId}_${i}`;
                              if (isAi && isLast && !localStorage.getItem(spokenKey)) {
                                console.log("📣 Auto-playing new AI message...");
                                handleSpeakMessage(fullText, i);
                                localStorage.setItem(spokenKey, "true");
                                lastProcessedMessageId.current = i;
                              }
                            }}
                          />
                          {/* Voice button for assistant responses */}
                          {isAi && (
                            <button
                              onClick={() =>
                                handleSpeakMessage(message.parts[0].text, i)
                              }
                              className="voice-playback-btn-inline"
                              title={
                                speakingMessageId === i
                                  ? strings.stopListening
                                  : strings.listenToResponse
                              }
                            >
                              {speakingMessageId === i ? (
                                <>
                                  <VolumeX size={16} />
                                  {strings.stopListening}
                                </>
                              ) : (
                                <>
                                  <Volume2 size={16} />
                                  {strings.listenToResponse}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* ── LIVE STREAMING MESSAGE (Rendered inside scroll area) ── */}
                {/* Show live image only if history doesn't already contain it */}
                {liveImage && (
                  <div className="imgContainer user">
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
                {question && (
                  <div className="message user">
                    <p>{question}</p>
                  </div>
                )}
                {isTyping && (
                  <div className="message ai-thinking-bubble">
                    <div className="typing-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <em>
                      {language === "mr-IN"
                        ? "विचार करत आहे..."
                        : "AI is thinking..."}
                    </em>
                  </div>
                )}
                {streamingAnswer && (
                  <div className="message streaming-message" style={{ position: "relative" }}>
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {streamingAnswer}
                    </Markdown>

                    {!isTyping && (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          marginTop: "10px",
                        }}
                      >
                        <button
                          onClick={() =>
                            handleSpeakMessage(streamingAnswer, "live")
                          }
                          className="voice-playback-btn-inline"
                        >
                          {speakingMessageId === "live" ? (
                            <VolumeX size={16} />
                          ) : (
                            <Volume2 size={16} />
                          )}
                          {speakingMessageId === "live"
                            ? strings.stopListening
                            : strings.listenToResponse}
                        </button>

                        {pendingUpdate && !updatingProfile && (
                          <button
                            className="sync-pill"
                            onClick={() =>
                              window.dispatchEvent(
                                new CustomEvent("triggerSync"),
                              )
                            }
                          >
                            <UserCheck size={16} />
                            {language === "mr-IN"
                              ? `प्रोफाइलमध्ये जतन करा`
                              : `Sync to profile`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {updatingProfile && (
                  <div className="profile-update-loader">
                    {language === "mr-IN"
                      ? "⏳ प्रोफाइल अद्यतनित होत आहे..."
                      : "⏳ Updating profile..."}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {data && (
          <NewPrompt
            dataRef={wrapperRef}
            data={data}
            setLiveQuestion={setQuestion}
            setLiveAnswer={setStreamingAnswer}
            setLiveIsTyping={setIsTyping}
            setPendingProfileUpdate={setPendingUpdate}
            setUpdatingProfile={setUpdatingProfile}
            setLiveImage={setLiveImage}
            liveQuestion={question}
            liveAnswer={streamingAnswer}
            liveIsTyping={isTyping}
            pendingProfileUpdate={pendingUpdate}
            chatId={chatId}
          />
        )}
      </div>
    </div>
  );
};

export default ChatPage;
