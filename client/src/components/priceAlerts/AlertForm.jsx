import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import "./priceAlerts.css";

const AlertForm = ({ crop, currentPrice, language, onSuccess }) => {
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState("above");
  const [email, setEmail] = useState("");
  const [createdAlert, setCreatedAlert] = useState(null);

  const queryClient = useQueryClient();

  // 🌟 MATH FIX 1: Convert the raw Quintal price to Per-Kg for the UI
  const displayCurrentPrice = currentPrice
    ? Number((currentPrice / 100).toFixed(1))
    : null;

  const t =
    language === "mr-IN"
      ? {
          crop: "पीक",
          whenPrice: "जेव्हा किंमत",
          goesAbove: "↗ वाढेल (वर जाईल)",
          goesBelow: "↘ कमी होईल (खाली जाईल)",
          targetPrice: "लक्ष्य किंमत (₹/kg)",
          emailLabel: "सूचना ईमेल",
          emailPlaceholder: "तुमचा ईमेल प्रविष्ट करा",
          emailNote: "किंमत अलर्ट या ईमेलवर पाठवला जाईल",
          createAlert: "अलर्ट तयार करा",
          creating: "तयार होत आहे...",
          currentPriceLabel: "सध्याचा बाजार भाव",
          successTitle: "✅ अलर्ट यशस्वीरित्या तयार झाला!",
          successMsg: "जेव्हा",
          successMsg2: "पेक्षा",
          successEmail: "वर सूचना पाठवली जाईल",
          above: "वर जाईल",
          below: "खाली जाईल",
          createAnother: "नवीन अलर्ट तयार करा",
          noPrice: "किंमत माहिती उपलब्ध नाही",
        }
      : {
          crop: "Crop",
          whenPrice: "When price",
          goesAbove: "↗ Goes above",
          goesBelow: "↘ Goes below",
          targetPrice: "Target Price (₹/kg)",
          emailLabel: "Notification Email",
          emailPlaceholder: "Enter your email address",
          emailNote:
            "You will receive a Gmail notification when this price is hit",
          createAlert: "Create Alert",
          creating: "Creating...",
          currentPriceLabel: "Current Market Price",
          successTitle: "✅ Alert Created Successfully!",
          successMsg: "When",
          successMsg2: "goes",
          successEmail: "Email will be sent to",
          above: "above",
          below: "below",
          createAnother: "Create Another Alert",
          noPrice: "Price data unavailable",
        };

  const getDeviceId = () => {
    let id = localStorage.getItem("agrivani_device_id");
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("agrivani_device_id", id);
    }
    return id;
  };

  const mutation = useMutation({
    mutationFn: async (alertData) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/prices/alerts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ...alertData, deviceId: getDeviceId() }),
        },
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create alert");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setCreatedAlert(data.alert);
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      if (onSuccess) onSuccess();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!targetPrice || !email) return;

    mutation.mutate({
      cropName: crop,
      // 🌟 MATH FIX 2: Multiply user's Kg price by 100 so the DB stores Quintals!
      targetPrice: parseFloat(targetPrice) * 100,
      condition,
      notificationType: "email",
      notificationEmail: email,
    });
  };

  const handleReset = () => {
    setCreatedAlert(null);
    setTargetPrice("");
    setEmail("");
    setCondition("above");
  };

  // ── Success state ────────────────────────────────────────────────────────
  if (createdAlert) {
    return (
      <div className="alert-form-card">
        <div className="success-message">
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔔</div>
          <h3>{t.successTitle}</h3>

          <div
            className="alert-item-card"
            style={{ marginBottom: "24px", textAlign: "left", width: "100%" }}
          >
            <div className="alert-detail-row">
              <span className="label">Crop</span>
              <span className="value">{createdAlert.cropName}</span>
            </div>
            <div className="alert-detail-row">
              <span className="label">Condition</span>
              <span className="value">
                {/* 🌟 MATH FIX 3: Divide by 100 to show the Kg price in the success message */}
                {createdAlert.condition === "above" ? "↗ Above" : "↘ Below"} ₹
                {Number((createdAlert.targetPrice / 100).toFixed(1))}/kg
              </span>
            </div>
            <div className="alert-detail-row">
              <span className="label">Email</span>
              <span className="value" style={{ color: "var(--agri-primary)" }}>
                {createdAlert.notificationEmail}
              </span>
            </div>
          </div>

          <p className="success-note">
            {language === "mr-IN"
              ? "जेव्हा किंमत लक्ष्यापर्यंत पोहोचेल, Gmail वर सूचना पाठवली जाईल."
              : "A Gmail notification will be sent automatically when the price target is hit."}
          </p>

          <button className="agri-btn-primary btn-full" onClick={handleReset}>
            {t.createAnother}
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div className="alert-form-card">
      {/* Current Price Banner */}
      <div className="alert-price-banner">
        <span className="current-price-label">{t.currentPriceLabel}</span>
        <span className="current-price-value">
          {displayCurrentPrice ? `₹${displayCurrentPrice}/kg` : t.noPrice}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="alert-form-content">
        {/* Crop (read-only) */}
        <div className="inputGroup">
          <label>{t.crop}</label>
          <input
            value={crop}
            readOnly
            className="cropDropdown read-only-input"
          />
        </div>

        {/* Condition */}
        <div className="inputGroup">
          <label>{t.whenPrice}</label>
          <div className="alert-condition-grid">
            <div
              className={`alert-condition-btn ${condition === "above" ? "active" : ""}`}
              onClick={() => setCondition("above")}
            >
              {t.goesAbove}
            </div>
            <div
              className={`alert-condition-btn ${condition === "below" ? "active" : ""}`}
              onClick={() => setCondition("below")}
            >
              {t.goesBelow}
            </div>
          </div>
        </div>

        {/* Target Price */}
        <div className="inputGroup">
          <label>{t.targetPrice}</label>
          <div className="alert-input-wrapper">
            <span className="alert-currency-symbol">₹</span>
            <input
              type="number"
              required
              min="0"
              step="0.5"
              // 🌟 MATH FIX 4: Use the new display price to calculate the dynamic placeholder
              placeholder={
                displayCurrentPrice
                  ? `e.g. ${displayCurrentPrice + (condition === "above" ? 5 : -5)}`
                  : "25.00"
              }
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="quantityInput input-with-symbol"
            />
          </div>
        </div>

        {/* Email */}
        <div className="inputGroup">
          <label>{t.emailLabel}</label>
          <input
            type="email"
            required
            placeholder={t.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="quantityInput"
          />
          <span className="email-note">{t.emailNote}</span>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="agri-btn-primary btn-full"
        >
          {mutation.isPending ? t.creating : t.createAlert}
        </button>

        {/* Error */}
        {mutation.isError && (
          <div className="error-text">
            {mutation.error?.message || "Something went wrong"}
          </div>
        )}
      </form>
    </div>
  );
};

export default AlertForm;
