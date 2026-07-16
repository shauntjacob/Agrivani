import React from "react";
import "../../routes/pricesPage/pricesPage.css";

const PredictionCard = ({ prediction, language }) => {
  if (!prediction || !prediction.recommendation) {
    return (
      <div className="noDataCard">
        <div className="noDataIcon">📊</div>
        <div className="noDataText">
          {language === "mr-IN"
            ? "अंदाज उपलब्ध नाही"
            : "Prediction Not Available"}
        </div>
        <div className="noDataSubtitle">
          {language === "mr-IN"
            ? "किमान 7 दिवसांचा ऐतिहासिक डेटा आवश्यक आहे"
            : "Requires at least 7 days of historical data"}
        </div>
      </div>
    );
  }
  const { recommendation, trend, volatility, metadata } = prediction;

  const strings =
    language === "mr-IN"
      ? {
          action: "शिफारस",
          reasoning: "कारण",
          confidence: "विश्वासार्हता",
          currentPrice: "सध्याचा भाव",
          predicted: "अंदाज",
          change: "बदल",
          trend: "ट्रेंड",
          volatility: "अस्थिरता",
          dataPoints: "डेटा पॉइंट्स",
          disclaimer:
            "⚠️ ही भविष्यवाणी ऐतिहासिक डेटावर आधारित आहे. बाजारातील अचानक बदल संभव आहेत.",
        }
      : {
          action: "Recommendation",
          reasoning: "Reasoning",
          confidence: "Confidence",
          currentPrice: "Current Price",
          predicted: "Predicted (7 days)",
          change: "Change",
          trend: "Trend",
          volatility: "Volatility",
          dataPoints: "Data Points",
          disclaimer:
            "⚠️ This prediction is based on historical data. Market conditions can change suddenly.",
        };

  const getActionColor = (action) => {
    const act = action?.toUpperCase() || "";
    if (recommendation?.actionColor) {
      return recommendation.actionColor;
    }
    if (act === "SELL" || act === "विक्री करा") return "#ef5350";
    if (act === "WAIT" || act === "थांबा") return "#ff9800";
    if (act === "BUY" || act === "खरेदी करा") return "#4caf50";
    return "#9e9e9e";
  };

  const getActionEmoji = (action) => {
    const act = action?.toUpperCase() || "";
    if (act === "SELL" || act === "विक्री करा") return "📉";
    if (act === "WAIT" || act === "थांबा") return "⏳";
    if (act === "BUY" || act === "खरेदी करा") return "📊";
    return "➡️";
  };

  const getTrendEmoji = (direction) => {
    const dir = direction?.toLowerCase() || "";
    if (dir.includes("increase") || dir.includes("वाढ")) return "📈";
    if (dir.includes("decrease") || dir.includes("घट")) return "📉";
    return "➡️";
  };

  // Translation helpers
  const translateAction = (act) => {
    if (language !== "mr-IN") return act;
    const a = act?.toUpperCase() || "";
    if (a === "WAIT") return "थांबा";
    if (a === "SELL") return "विक्री करा";
    if (a === "BUY") return "खरेदी करा";
    if (a === "HOLD") return "होल्ड करा";
    return act;
  };

  const translateTrend = (dir) => {
    if (language !== "mr-IN") return dir;
    const d = dir?.toLowerCase() || "";
    if (d === "decreasing") return "घटत आहे";
    if (d === "increasing") return "वाढत आहे";
    if (d === "stable") return "स्थिर";
    return dir;
  };

  const translateConfidence = (conf) => {
    if (language !== "mr-IN") return conf;
    const c = conf?.toLowerCase() || "";
    if (c === "medium") return "मध्यम";
    if (c === "high") return "उच्च";
    if (c === "low") return "कमी";
    return conf;
  };

  const translateVolatility = (vol) => {
    if (language !== "mr-IN") return vol;
    const v = vol?.toLowerCase() || "";
    if (v === "normal") return "सामान्य";
    if (v === "high") return "उच्च";
    if (v === "low") return "कमी";
    return vol;
  };

  // Safety checks
  if (!recommendation) {
    return (
      <div
        style={{
          background: "#fff8e1",
          padding: "24px",
          borderRadius: "16px",
          textAlign: "center",
          color: "#f57f17",
        }}
      >
        {language === "mr-IN"
          ? "अंदाज उपलब्ध नाही"
          : "Prediction not available"}
      </div>
    );
  }

  return (
    <div className="prediction-card elevation-hover">
      {/* Main Recommendation */}
      <div
        className={`prediction-header ${recommendation.action?.toLowerCase()}`}
      >
        <div className="prediction-icon">
          {getActionEmoji(recommendation.action)}
        </div>
        <div className="prediction-label">{strings.action}</div>
        <div className="prediction-maintitle">{translateAction(recommendation.action)}</div>
      </div>

      {/* Reasoning */}
      <div
        className="prediction-reasoning-box"
        style={{
          margin:
            "0 16px" /* 🌟 Pushes the whole box inward left and right, but leaves the inside alone! */,
          marginBottom:
            "16px" /* Keeps the space between this box and the grid below */,
        }}
      >
        <div className="prediction-reasoning-title">{strings.reasoning}</div>
        <div className="prediction-reasoning-text">
          {recommendation.reasoning}
        </div>
      </div>

      {/* Price Details */}
      <div
        className="prediction-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(100px, 1fr))" /* 🌟 Auto-wraps on tiny screens! */,
          gap: "12px" /* 🌟 Beautiful breathing room */,
          padding: "0 16px",
          marginBottom: "16px" /* Space before the next section */,
        }}
      >
        <div className="prediction-stat-item">
          <div className="prediction-stat-label">{strings.currentPrice}</div>
          <div className="prediction-stat-value primary">
            {/* 🌟 FIX: Divided by 100 and formatted to 1 decimal place */}₹
            {(recommendation.currentPrice / 100).toFixed(1)}/kg
          </div>
        </div>

        <div className="prediction-stat-item">
          <div className="prediction-stat-label">{strings.predicted}</div>
          <div className="prediction-stat-value info">
            {/* 🌟 FIX: Divided by 100 and formatted to 1 decimal place */}₹
            {(recommendation.predictedPrice7Days / 100).toFixed(1)}/kg
          </div>
        </div>

        <div className="prediction-stat-item">
          <div className="prediction-stat-label">{strings.change}</div>
          <div
            className={`prediction-stat-value ${recommendation.percentageChange > 0 ? "growth" : "warning"}`}
          >
            {recommendation.percentageChange > 0 ? "+" : ""}
            {recommendation.percentageChange}%
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div
        className="prediction-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: "12px",
          padding: "0 16px",
          marginBottom: "16px",
        }}
      >
        {/* Trend */}
        {trend && (
          <div className="prediction-stat-item">
            <div className="prediction-stat-label">{strings.trend}</div>
            <div className="prediction-stat-value" style={{ fontSize: "14px" }}>
              {getTrendEmoji(trend.direction)} {translateTrend(trend.direction)}
            </div>
          </div>
        )}

        {/* Confidence */}
        <div className="prediction-stat-item">
          <div className="prediction-stat-label">{strings.confidence}</div>
          <div className="prediction-stat-value" style={{ fontSize: "14px" }}>
            {translateConfidence(recommendation.confidence)}
          </div>
        </div>

        {/* Volatility */}
        {volatility && volatility.volatility && (
          <div className="prediction-stat-item">
            <div className="prediction-stat-label">{strings.volatility}</div>
            <div
              className={`prediction-stat-value small ${volatility.volatility?.toLowerCase()}`}
            >
              {translateVolatility(volatility.volatility)}
            </div>
          </div>
        )}

        {/* Data Points */}
        {metadata && metadata.dataPoints && (
          <div className="prediction-stat-item">
            <div className="prediction-stat-label">{strings.dataPoints}</div>
            <div className="prediction-stat-value" style={{ fontSize: "14px" }}>
              {metadata.dataPoints}
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="prediction-disclaimer">{strings.disclaimer}</div>
    </div>
  );
};

export default PredictionCard;
