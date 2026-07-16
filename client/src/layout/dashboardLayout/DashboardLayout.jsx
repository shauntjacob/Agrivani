import React, { useEffect, useState, useRef } from "react";
import "./dashboardLayout.css";
import {
  Outlet,
  useNavigate,
  useOutletContext,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ChatList from "../../components/ChatList/ChatList.jsx";
import { syncOfflineQueue } from "../../lib/offlineSync";

const DashboardLayout = () => {
  const { userId, isLoaded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isSidebarOpen, setIsSidebarOpen } = useOutletContext() || {};
  const [checkingProfile, setCheckingProfile] = useState(true);

  const profileChecked = useRef(false);

  useEffect(() => {
    if (isLoaded && !userId) {
      navigate("/sign-in", { replace: true });
    } else if (userId) {
      // Ask for Notification Permissions early
      if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }

      // ⚡ HYBRID MODE: Monitor Network Status
      const handleOnline = () => {
        syncOfflineQueue(userId);
      };
      
      window.addEventListener("online", handleOnline);
      // Run it once on mount just in case there are pending items from last session
      syncOfflineQueue(userId);

      return () => {
        window.removeEventListener("online", handleOnline);
      };
    }
  }, [isLoaded, userId, navigate]);

  useEffect(() => {
    const checkProfileStatus = async () => {
      if (!isLoaded || !userId) return;

      if (profileChecked.current) {
        setCheckingProfile(false);
        return;
      }
      profileChecked.current = true;

      if (
        location.pathname === "/dashboard/profile-setup-chat" ||
        location.pathname === "/dashboard/profile"
      ) {
        setCheckingProfile(false);
        return;
      }

      try {
        // 🌟 FIXED: We MUST send the userId to the backend!
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/profile/status?user_id=${userId}`,
          {
            credentials: "include",
          },
        );
        const data = await res.json();

        // 🌟 FIXED: Explicitly check if profileCompleted is strictly false
        if (
          data &&
          data.profileCompleted === false &&
          location.pathname === "/dashboard"
        ) {
          navigate("/dashboard/profile-setup-chat", { replace: true });
        }
      } catch (error) {
        console.error("Error checking profile:", error);
      } finally {
        setCheckingProfile(false);
      }
    };

    checkProfileStatus();
  }, [isLoaded, userId, location.pathname, navigate]);

  if (!isLoaded || checkingProfile) return <div>Loading...</div>;

  return (
    <div className={`dashboardLayout ${isSidebarOpen ? "sidebar-open" : ""}`}>
      <div className="menu">
        <ChatList setIsSidebarOpen={setIsSidebarOpen} />
      </div>
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
};

export default DashboardLayout;
