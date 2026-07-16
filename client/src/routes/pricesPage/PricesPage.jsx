import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "../../context/LanguageContext";
import PriceTrendChart from "../../components/priceAlerts/PriceTrendChart";
import PredictionCard from "../../components/priceAlerts/PredictionCard";
import ProfitComparisonTable from "../../components/priceAlerts/ProfitComparisonTable";
import AlertForm from "../../components/priceAlerts/AlertForm";
import AlertsList from "../../components/priceAlerts/AlertsList";
import "./pricesPage.css";
import {
  fetchMandiPrices,
  getUserLocation,
  MANDI_LOCATIONS,
} from "../../lib/mandiDataService";
import { analyzeMandiOptions } from "../../lib/profitCalculator";
import { DEFAULT_LOCATION } from "../../lib/config";
import {
  HandCoins,
  ChartNoAxesCombined,
  Bot,
  Bell,
  NotepadText,
  Clock,
  MapPin,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { normalizeCrop, getCropLabel } from "../../lib/cropUtils";

const PricesPage = () => {
  const { language } = useLanguage();
  const { userId } = useAuth();
  
  const isMr = language === "mr-IN";

  const { data: profileStatus } = useQuery({
    queryKey: ["profileStatus", userId],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/profile/status?user_id=${userId}`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: !!userId,
    staleTime: 1000 * 60,
  });

  const DEFAULT_CROPS = [
    { value: "Tomato", label: isMr ? "🍅 टोमॅटो" : "🍅 Tomato" },
    { value: "Onion", label: isMr ? "🧅 कांदा" : "🧅 Onion" },
    { value: "Potato", label: isMr ? "🥔 बटाटा" : "🥔 Potato" },
    { value: "Soybean", label: isMr ? "🌱 सोयाबीन" : "🌱 Soybean" },
    { value: "Cotton", label: isMr ? "🌿 कापूस" : "🌿 Cotton" },
    { value: "Wheat", label: isMr ? "🌾 गहू" : "🌾 Wheat" },
    { value: "Rice", label: isMr ? "🌾 तांदूळ" : "🌾 Rice" },
  ];

  const EMOJI_MAP = {
    Tomato: "🍅", Onion: "🧅", Potato: "🥔", Soybean: "🌱", Cotton: "🌿",
    Wheat: "🌾", Rice: "🌾", Sugarcane: "🎋", Maize: "🌽", Bajra: "🌾",
    Mango: "🥭", Grapes: "🍇"
  };

  const crops = React.useMemo(() => {
    const rawData = profileStatus?.data || {};
    let userCropsRaw = rawData.crops || rawData.cropsGrown || [];
    if (typeof userCropsRaw === "string") {
      userCropsRaw = userCropsRaw.split(",").map((s) => s.trim());
    } else if (!Array.isArray(userCropsRaw)) {
      userCropsRaw = [];
    }

    const userCropsNormalized = [...new Set(userCropsRaw.map(c => normalizeCrop(c)).filter(Boolean))];

    if (userCropsNormalized.length === 0) {
      return DEFAULT_CROPS;
    }

    return userCropsNormalized.map(c => {
      const emoji = EMOJI_MAP[c] || "🌱";
      return {
        value: c,
        label: `${emoji} ${getCropLabel(c, isMr)}`
      };
    });
  }, [profileStatus, isMr]);

  const [selectedCrop, setSelectedCrop] = useState("Tomato");

  useEffect(() => {
    if (crops.length > 0 && !crops.find(c => c.value === selectedCrop)) {
      setSelectedCrop(crops[0].value);
    }
  }, [crops, selectedCrop]);

  const [quantity, setQuantity] = useState(100);
  const [userLocation, setUserLocation] = useState(null);
  const [analyzedMandis, setAnalyzedMandis] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const t =
    isMr
      ? {
          title: "मंडी भाव आणि नफा विश्लेषण",
          subtitle: "वाहतूक खर्च आणि अंतर विचारात घेऊन सर्वोत्तम मंडी शोधा",
          selectCrop: "पीक निवडा",
          quantity: "प्रमाण (kg)",
          profitComparison: "नफा तुलना",
          trend: "७ दिवसांचा ट्रेंड",
          prediction: "AI भविष्यवाणी",
          setAlert: "किंमत अलर्ट सेट करा",
          myAlerts: "माझे अलर्ट",
          loading: "लोड होत आहे...",
          noData: "डेटा उपलब्ध नाही",
          analyzing: "विश्लेषण करत आहे...",
          unavailable: "उपलब्ध नाही",
          locationDetected: "तुमचे स्थान सापडले",
          refresh: "रिफ्रेश",
          offlineData: "ऑफलाइन डेटा",
          lastUpdated: "शेवटचा अपडेट",
        }
      : {
          title: "Market Prices & Profit Analysis",
          subtitle:
            "Find the best mandi considering transport costs and distance",
          selectCrop: "Select Crop",
          quantity: "Quantity (kg)",
          profitComparison: "Profit Comparison",
          trend: "7-Day Trend",
          prediction: "AI Prediction",
          setAlert: "Set Price Alert",
          myAlerts: "My Alerts",
          loading: "Loading...",
          noData: "No data available",
          analyzing: "Analyzing...",
          unavailable: "Unavailable",
          locationDetected: "Location detected",
          refresh: "Refresh",
          offlineData: "Offline data",
          lastUpdated: "Last updated",
        };

  const getDeviceId = () => {
    let id = localStorage.getItem("agrivani_device_id");
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("agrivani_device_id", id);
    }
    return id;
  };

  useEffect(() => {
    getUserLocation().then(setUserLocation);
  }, []);

  const { data: priceData, isLoading: priceLoading } = useQuery({
    queryKey: ["prices", selectedCrop],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/prices/${selectedCrop}`)
        .then((r) => r.json())
        .catch(() => ({ success: false, history: [] })),
    retry: 1,
  });

  useEffect(() => {
    if (priceData?.success && priceData.history) {
      const marketPrices = {};
      priceData.history.forEach((h) => {
        // 🌟 MATH FIX: Divide the API's Quintal price by 100 for the profit table
        if (!marketPrices[h.market])
          marketPrices[h.market] = Number((h.price / 100).toFixed(1));
      });

      const loc = userLocation || DEFAULT_LOCATION;
      const fallbackKgPrice = priceData.currentPrice
        ? Number((priceData.currentPrice / 100).toFixed(1))
        : 0;

      const mandiData = Object.entries(MANDI_LOCATIONS).map(
        ([name, location]) => ({
          name: `${name} Mandi`,
          ...location,
          pricePerKg: marketPrices[name] || fallbackKgPrice,
          crop: selectedCrop,
          date: priceData.lastUpdated,
          source: marketPrices[name] ? "AgriVani Live API" : "AgriVani Average",
        }),
      );

      // The `analyzeMandiOptions` function automatically filters by closest distance/profitability based on the user's location!
      const analyzed = analyzeMandiOptions(mandiData, loc, quantity);
      setAnalyzedMandis(analyzed);
      setLastUpdated(new Date(priceData.lastUpdated));
      setIsOfflineData(false);
    }
  }, [priceData, selectedCrop, quantity, userLocation]);

  const { data: predictionData, isLoading: predictionLoading } = useQuery({
    queryKey: ["prediction", selectedCrop],
    queryFn: () =>
      fetch(
        `${import.meta.env.VITE_API_URL}/api/prices/predict/${selectedCrop}`,
      )
        .then((r) => r.json())
        .catch(() => ({ success: false })),
    retry: 1,
    enabled: !!(priceData?.history && priceData.history.length >= 7),
  });

  const { data: alertsData, refetch: refetchAlerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const deviceId = getDeviceId();
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/prices/alerts?deviceId=${deviceId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const currentPrice =
    priceData?.currentPrice || analyzedMandis?.[0]?.pricePerKg || null;

  // 🌟 SMARTER, CRASH-PROOF LOCAL MANDI FILTER
  const localHistoryData = React.useMemo(() => {
    if (!priceData?.history || analyzedMandis.length === 0) return [];

    // 1. Safely extract markets that have data
    const activeMarkets = new Set(
      priceData.history
        .filter((item) => item && item.market)
        .map((item) => item.market.toLowerCase()),
    );

    // 2. Map and Fuzzy-Match local markets to active markets
    const topLocalMandis = analyzedMandis
      .filter((m) => m && m.name)
      .map((m) => {
        // Strip out words that break exact matches (e.g., "Pune APMC Mandi" -> "pune")
        return m.name
          .toLowerCase()
          .replace(" mandi", "")
          .replace(" apmc", "")
          .trim();
      })
      .filter((cleanLocalName) =>
        Array.from(activeMarkets).some(
          (activeMkt) =>
            activeMkt.includes(cleanLocalName) ||
            cleanLocalName.includes(activeMkt),
        ),
      )
      .slice(0, 5); // Take top 5 closest matches

    // 3. Filter the final history payload to send to the chart
    return priceData.history.filter((item) => {
      if (!item || !item.market) return false;
      const mkt = item.market.toLowerCase();
      return topLocalMandis.some(
        (cleanLocalName) =>
          mkt.includes(cleanLocalName) || cleanLocalName.includes(mkt),
      );
    });
  }, [priceData, analyzedMandis]);

  return (
    <div className="pricesPage-main-dashboard-view">
      <div className="pricesPage-container">
        <div className="pricesPage">
          {/* ── Header ── */}
          <div className="pricesHeader">
            <div className="headerTop">
              <div>
                <h1>{t.title}</h1>
                <p className="subtitle">{t.subtitle}</p>
              </div>
              <div className="headerActions">
                <button
                  className="refreshBtn"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw size={16} /> {t.refresh}
                </button>
              </div>
            </div>

            <div className="statusBadges">
              {isOfflineData && (
                <div className="offlineBadge">📡 {t.offlineData}</div>
              )}
              {lastUpdated && (
                <div className="lastUpdatedBadge">
                  <Clock size={14} /> {t.lastUpdated}:{" "}
                  {lastUpdated.toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
              {userLocation && (
                <div className="locationBadge">
                  <MapPin size={14} /> {t.locationDetected}
                </div>
              )}
            </div>
          </div>

          {/* ── Crop & Quantity Selector ── */}
          <div className="cropSelector">
            <div className="inputGroup">
              <label>{t.selectCrop}</label>
              <select
                value={selectedCrop}
                onChange={(e) => setSelectedCrop(e.target.value)}
                className="cropDropdown"
              >
                {crops.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="inputGroup">
              <label>{t.quantity}</label>
              <input
                type="number"
                value={quantity}
                min="1"
                max="10000"
                onChange={(e) => setQuantity(parseInt(e.target.value) || 100)}
                className="quantityInput"
              />
            </div>
          </div>

          {/* ── Profit Comparison ── */}
          <div className="section">
            <h2 className="sectionTitle">
              <HandCoins size={26} /> {t.profitComparison}
            </h2>
            {analyzedMandis.length === 0 ? (
              <div className="loadingCard">{t.loading}</div>
            ) : (
              <ProfitComparisonTable
                mandis={analyzedMandis}
                quantity={quantity}
                language={language}
                lastUpdated={lastUpdated}
              />
            )}
          </div>

          {/* ── 7-Day Trend ── */}
          <div className="section">
            <h2 className="sectionTitle">
              <ChartNoAxesCombined size={26} /> {t.trend}
            </h2>
            {priceLoading ? (
              <div className="loadingCard">{t.loading}</div>
            ) : localHistoryData.length > 0 ? (
              <PriceTrendChart
                data={localHistoryData}
                crop={selectedCrop}
                language={language}
              />
            ) : (
              <div className="noDataCard">
                <div
                  className="noDataIcon"
                  style={{
                    fontSize: "48px",
                    marginBottom: "12px",
                    opacity: 0.5,
                  }}
                >
                  📊
                </div>
                <div
                  className="noDataText"
                  style={{ fontWeight: "bold", marginBottom: "8px" }}
                >
                  {t.noData}
                </div>
                <div
                  className="noDataSubtitle"
                  style={{ fontSize: "13px", color: "var(--text-tertiary)" }}
                >
                  {language === "mr-IN"
                    ? "ऐतिहासिक डेटा अद्याप उपलब्ध नाही."
                    : "Historical data not yet available. Check back later."}
                </div>
              </div>
            )}
          </div>

          {/* ── AI Prediction ── */}
          <div className="section">
            <h2 className="sectionTitle">
              <Bot size={26} /> {t.prediction}
            </h2>
            {predictionLoading ? (
              <div className="loadingCard">{t.analyzing}</div>
            ) : predictionData?.success && predictionData?.recommendation ? (
              <PredictionCard prediction={predictionData} language={language} />
            ) : (
              <div className="noDataCard">
                <div
                  className="noDataIcon"
                  style={{
                    fontSize: "48px",
                    marginBottom: "12px",
                    opacity: 0.5,
                  }}
                >
                  🤖
                </div>
                <div className="noDataText" style={{ fontWeight: "bold" }}>
                  {priceData?.history?.length < 7
                    ? language === "mr-IN"
                      ? "अपुरा डेटा"
                      : `Need 7+ days of data (have ${priceData?.history?.length || 0})`
                    : t.unavailable}
                </div>
              </div>
            )}
          </div>

          {/* ── Set Alert (Currently Disabled) ── */}
          {/*
          <div className="section">
            <h2 className="sectionTitle">
              <Bell size={26} /> {t.setAlert}
            </h2>
            <AlertForm
              crop={selectedCrop}
              currentPrice={currentPrice}
              language={language}
              onSuccess={() => refetchAlerts()}
            />
          </div>
          */}

          {/* ── My Alerts (Currently Disabled) ── */}
          {/*
          <div className="section">
            <h2 className="sectionTitle">
              <NotepadText size={26} /> {t.myAlerts}
            </h2>
            <AlertsList
              alerts={alertsData?.alerts || []}
              language={language}
              onDelete={() => refetchAlerts()}
            />
          </div>
          */}
        </div>
      </div>
    </div>
  );
};

export default PricesPage;
