import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./ChatList.css";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquareShare,
  TrendingUp,
  CircleUser,
  Pencil,
  Trash2,
  Ellipsis,
} from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import {
  getCachedChats,
  cacheChats,
  deleteCachedChat,
  renameCachedChat,
} from "../../lib/db";

const ChatList = ({ setIsSidebarOpen }) => {
  const [openMenuId, setOpenMenuId] = useState(null);
  const [cachedData, setCachedData] = useState(null); // Local cache state
  const [isHydrating, setIsHydrating] = useState(false); // Background sync indicator
  const [editingId, setEditingId] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);

  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const { userId } = useAuth();

  const t =
    language === "mr-IN"
      ? {
          dashboard: "डॅशबोर्ड",
          createChat: "नवीन चॅट सुरू करा",
          marketPrices: "मंडी भाव",
          contact: "संपर्क",
          recentChats: "अलीकडील चॅट्स",
          loading: "लोड होत आहे...",
          error: "काहीतरी चुकले",
          noChats: "अजून कोणतेही चॅट नाहीत. नवीन सुरू करा!",
          deleting: "डिलीट होत आहे...",
          deleteChat: "चॅट डिलीट करा",
          rename: "नाव बदला",
          save: "सेव्ह",
          cancel: "रद्द करा",
          upgradeTitle: "एग्रिवनी प्रो मध्ये अपग्रेड करा",
          upgradeDesc: "सर्व फीचर्सचा असीमित प्रवेश मिळवा",
        }
      : {
          dashboard: "DASHBOARD",
          createChat: "Create a new Chat",
          marketPrices: "Market Prices",
          contact: "Contact",
          recentChats: "RECENT CHATS",
          loading: "Loading...",
          error: "Something went wrong",
          noChats: "No chats yet. Start a new one!",
          deleting: "Deleting...",
          deleteChat: "Delete Chat",
          rename: "Rename",
          save: "Save",
          cancel: "Cancel",
          upgradeTitle: "Upgrade to AgriVani Pro",
          upgradeDesc: "Get unlimited access to all features",
        };

  // 🔹 STEP 1: Load from IndexedDB immediately on mount
  useEffect(() => {
    const loadCachedData = async () => {
      const cached = await getCachedChats();
      if (cached && cached.length > 0) {
        setCachedData(cached);
      }
    };
    loadCachedData();
  }, []);

  // 🔹 STEP 1.5: Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 🔹 STEP 2: Fetch from server in background (stale-while-revalidate)
  const { isPending, error, data } = useQuery({
    queryKey: ["userChats"],
    queryFn: async () => {
      setIsHydrating(true);
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/userchats?user_id=${userId}`, {
        credentials: "include",
      });
      const serverData = await res.json();

      // 🔹 STEP 3: Hydrate IndexedDB with server data
      if (Array.isArray(serverData)) {
        await cacheChats(serverData);
        setCachedData(serverData); // Update UI
      }

      setIsHydrating(false);
      return serverData;
    },
    enabled: !!userId,
    staleTime: 0, // Always fetch in background
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });

  // 🔹 DELETE MUTATION (syncs with both server and IndexedDB)
  const deleteMutation = useMutation({
    mutationFn: async (chatId) => {
      // Delete from IndexedDB immediately (optimistic update)
      await deleteCachedChat(chatId);
      setCachedData((prev) => prev?.filter((chat) => chat._id !== chatId));

      // Delete from server
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${chatId}`, {
        method: "DELETE",
        credentials: "include",
      }).then((res) => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userChats"] });
      setOpenMenuId(null);
    },
    onError: () => {
      // If server delete fails, refetch to restore correct state
      queryClient.invalidateQueries({ queryKey: ["userChats"] });
    },
  });

  // 🔹 RENAME MUTATION
  const renameMutation = useMutation({
    mutationFn: async ({ chatId, title }) => {
      // Update IndexedDB immediately
      await renameCachedChat(chatId, title);
      setCachedData((prev) =>
        prev?.map((chat) => (chat._id === chatId ? { ...chat, title } : chat)),
      );

      // Update server
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
        credentials: "include",
      }).then((res) => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["userChats"] });
      setEditingId(null);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["userChats"] });
    },
  });

  const handleDelete = (e, chatId) => {
    e.preventDefault();
    deleteMutation.mutate(chatId);
  };

  const toggleMenu = (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();

    if (openMenuId === chatId) {
      setOpenMenuId(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuPosition({
        top: rect.top,
        left: rect.right + 10, // Position 10px to the right of the icon
      });
      setOpenMenuId(chatId);
    }
  };

  const handleLinkClick = (e) => {
    // Prevent redirect if we are clicking a menu icon or popup
    if (e.target.closest(".menuIcon") || e.target.closest(".popupMenu")) {
      e.preventDefault();
      return;
    }

    if (setIsSidebarOpen && window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const startRename = (e, chat) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(chat._id);
    setNewTitle(chat.title);
    setOpenMenuId(null);
  };

  const handleRename = (e, chatId) => {
    if (e) e.preventDefault();
    if (
      newTitle.trim() &&
      newTitle !== displayData.find((c) => c._id === chatId)?.title
    ) {
      renameMutation.mutate({ chatId, title: newTitle });
    } else {
      setEditingId(null);
    }
  };

  // 🔹 RENDER: Show cached data immediately, or server data if no cache
  const displayData = cachedData || data;
  const isLoading = !cachedData && isPending;

  return (
    <div className="chatList">
      <span className="title">{t.dashboard}</span>

      <Link to="/dashboard" onClick={(e) => { handleLinkClick(e); window.dispatchEvent(new Event("resetChat")); }}>
        <MessageSquareShare />
        {t.createChat}
      </Link>
      <Link to="/dashboard/prices" onClick={handleLinkClick}>
        <TrendingUp />
        {t.marketPrices}
      </Link>
      <Link to="/dashboard/contact" onClick={handleLinkClick}>
        <CircleUser />
        {t.contact}
      </Link>

      <hr />

      <span className="title">
        {t.recentChats}
        {isHydrating && (
          <span
            style={{ fontSize: "10px", marginLeft: "8px", color: "#4caf50" }}
          >
            🔄
          </span>
        )}
      </span>

      <div className="list">
        {isLoading ? (
          t.loading
        ) : error && !cachedData ? (
          t.error
        ) : !Array.isArray(displayData) || displayData.length === 0 ? (
          <span style={{ padding: "20px", fontSize: "14px", color: "#666" }}>
            {t.noChats}
          </span>
        ) : (
          displayData
            .slice()
            .reverse()
            .map((chat) => (
              <div className="itemWrapper" key={chat._id}>
                {editingId === chat._id ? (
                  <form
                    className="renameForm"
                    onSubmit={(e) => handleRename(e, chat._id)}
                  >
                    <input
                      autoFocus
                      className="renameInput"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onBlur={() => {
                        // Small timeout to allow onSubmit to fire if Enter was pressed
                        setTimeout(() => setEditingId(null), 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  </form>
                ) : (
                  <Link
                    to={`/dashboard/chats/${chat._id}`}
                    onClick={(e) => handleLinkClick(e)}
                  >
                    {chat.title}
                  </Link>
                )}

                {!editingId && (
                  <div
                    className="menuIcon"
                    onClick={(e) => toggleMenu(e, chat._id)}
                    style={{
                      display: openMenuId === chat._id ? "flex" : undefined,
                    }}
                  >
                    <Ellipsis />
                  </div>
                )}

                {openMenuId === chat._id &&
                  createPortal(
                    <div
                      className="popupMenu portalMenu"
                      ref={menuRef}
                      style={{
                        position: "fixed",
                        top: `${menuPosition.top}px`,
                        left: `${menuPosition.left}px`,
                        zIndex: 1000,
                      }}
                    >
                      <button
                        className="renameBtn"
                        onClick={(e) => startRename(e, chat)}
                      >
                        <Pencil size={16} />
                        {t.rename}
                      </button>
                      <button
                        className="deleteBtn"
                        onClick={(e) => handleDelete(e, chat._id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 size={16} />
                        {deleteMutation.isPending ? t.deleting : t.deleteChat}
                      </button>
                    </div>,
                    document.body,
                  )}
              </div>
            ))
        )}
      </div>

      <hr />

      <div className="upgrade">
        <img src="/agrivanilogo.png" alt="logo" />
        <div className="texts">
          <span>{t.upgradeTitle}</span>
          <span>{t.upgradeDesc}</span>
        </div>
      </div>
    </div>
  );
};

export default ChatList;
