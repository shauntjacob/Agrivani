import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo,
} from "firebase/auth";
import { auth } from "../../lib/firebase";
import "../auth.css";

const SignInPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMr = language === "mr-IN";

  // ✨ Update the browser tab title dynamically
  useEffect(() => {
    document.title = isMr ? "लॉग इन | ॲग्रीवाणी" : "Log In | AgriVani";
  }, [isMr]);

  const t = {
    welcome: isMr ? "पुन्हा स्वागत आहे" : "Welcome Back",
    sub: isMr
      ? "वैयक्तिकृत पीक सल्ला, थेट बाजारातील किमती आणि हवामान अंदाजांमध्ये प्रवेश करण्यासाठी साइन इन करा."
      : "Sign in to access personalized crop advice, live market prices, and weather forecasts.",
    loginTab: isMr ? "लॉग इन" : "Log In",
    signupTab: isMr ? "साइन अप" : "Sign Up",
    loginTitle: isMr ? "लॉग इन" : "Log In",
    loginSub: isMr
      ? "पुन्हा स्वागत आहे! कृपया तुमचे तपशील प्रविष्ट करा."
      : "Welcome back! Please enter your details.",
    emailLabel: isMr ? "ईमेल" : "Email",
    emailPlace: isMr ? "तुमचा ईमेल प्रविष्ट करा" : "Enter your email",
    passLabel: isMr ? "पासवर्ड" : "Password",
    passPlace: isMr ? "तुमचा पासवर्ड प्रविष्ट करा" : "Enter your password",
    remember: isMr ? "मला लक्षात ठेवा" : "Remember me",
    forgot: isMr ? "पासवर्ड विसरलात?" : "Forgot Password?",
    signingIn: isMr ? "साइन इन करत आहे..." : "Signing In...",
    loginBtn: isMr ? "लॉगिन" : "Login",
    or: isMr ? "किंवा" : "OR",
    google: isMr ? "Google सह सुरू ठेवा" : "Continue with Google",
    noAccount: isMr ? "खाते नाही?" : "Don't have an account?",
    createAcc: isMr ? "खाते तयार करा" : "Create an account",
    errInvalid: isMr
      ? "अवैध ईमेल किंवा पासवर्ड."
      : "Invalid email or password.",
    errGeneral: isMr
      ? "त्रुटी आली. कृपया पुन्हा प्रयत्न करा."
      : "An error occurred. Please try again.",
    errGoogle: isMr ? "Google साइन-इन अयशस्वी झाले." : "Google sign-in failed.",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const user = userCredential.user;

      login({
        uid: user.uid,
        email: user.email,
        name: user.displayName || "Farmer",
      });
      navigate("/dashboard");
    } catch (err) {
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        setError(t.errInvalid);
      } else {
        setError(t.errGeneral);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const { isNewUser } = getAdditionalUserInfo(result);

      login({
        uid: user.uid,
        email: user.email,
        name: user.displayName || "Farmer",
      });

      if (isNewUser) navigate("/dashboard/profile-setup-chat");
      else navigate("/dashboard");
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") setError(t.errGoogle);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-decor-circle auth-decor-c1"></div>
        <div className="auth-decor-circle auth-decor-c2"></div>
        <div className="auth-left-inner">
          <div className="auth-brand">
            <img src="/agrivanilogo.png" alt="logo" />
            <span className="auth-brand-name">
              {isMr ? "ॲग्रीवाणी" : "AGRIVANI"}
            </span>
          </div>
          <h1 className="auth-hero-title">{t.welcome}</h1>
          <p className="auth-hero-sub">{t.sub}</p>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-tabs">
            <Link to="/sign-in" className="auth-tab active">
              {t.loginTab}
            </Link>
            <Link to="/sign-up" className="auth-tab">
              {t.signupTab}
            </Link>
          </div>

          <div className="auth-form-content">
            <div className="auth-card-head">
              <h2>{t.loginTitle}</h2>
              <p>{t.loginSub}</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-field">
                <label>{t.emailLabel}</label>
                <div className="auth-input-wrap">
                  <Mail className="auth-input-icon" size={20} />
                  <input
                    type="email"
                    placeholder={t.emailPlace}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <label>{t.passLabel}</label>
                <div className="auth-input-wrap">
                  <Lock className="auth-input-icon" size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t.passPlace}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="auth-options">
                <label className="auth-checkbox">
                  <input type="checkbox" />
                  <span>{t.remember}</span>
                </label>
                <Link
                  to="/forgot-password"
                  style={{
                    fontSize: "13px",
                    fontWeight: "700",
                    color: "var(--agri-primary)",
                    textDecoration: "none",
                  }}
                >
                  {t.forgot}
                </Link>
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading}
              >
                {loading ? t.signingIn : t.loginBtn}
              </button>

              <div className="auth-divider">
                <span>{t.or}</span>
              </div>

              <button
                type="button"
                className="auth-google-btn"
                onClick={handleGoogleSignIn}
                disabled={loading}
              >
                <svg className="google-icon" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t.google}
              </button>
            </form>

            <p className="auth-footer-prompt">
              {t.noAccount}{" "}
              <Link
                to="/sign-up"
                style={{
                  color: "var(--agri-primary)",
                  fontWeight: "700",
                  textDecoration: "none",
                }}
              >
                {t.createAcc}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
