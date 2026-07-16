import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../lib/firebase"; // ✨ Make sure this path points to your firebase.js
import { onAuthStateChanged, signOut } from "firebase/auth";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // ✨ This Firebase listener automatically remembers the user across the whole app!
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // User is logged in
        setUser({
          uid: currentUser.uid,
          email: currentUser.email,
          name: currentUser.displayName || "Farmer",
        });
        setUserId(currentUser.uid);
      } else {
        // User is logged out
        setUser(null);
        setUserId(null);
      }
      setIsLoaded(true); // Tells the app we finished checking the session
    });

    // Cleanup the listener when the app closes
    return () => unsubscribe();
  }, []);

  // We keep this so your Login/Signup pages don't break
  const login = (userData) => {
    setUser(userData);
    setUserId(userData.uid || userData.id);
  };

  // ✨ Firebase Logout
  const logout = async () => {
    try {
      await signOut(auth); // Tells Firebase to destroy the session
      setUser(null);
      setUserId(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userId, isLoaded, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
