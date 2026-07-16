import React, { useState, useMemo } from "react";
import {
  MapPin,
  TrendingUp,
  Truck,
  DollarSign,
  Navigation,
} from "lucide-react";
import * as ss from "simple-statistics";
import "../../routes/pricesPage/pricesPage.css";

const ProfitComparisonTable = ({ mandis, quantity, language, lastUpdated }) => {
  const [sortBy, setSortBy] = useState("netProfit"); // netProfit, distance, pricePerKg

  const strings =
    language === "mr-IN"
      ? {
          mandi: "मंडी",
          distance: "अंतर",
          marketRate: "बाजार भाव",
          transport: "वाहतूक",
          netProfit: "निव्वळ नफा",
          directions: "दिशा",
          best: "सर्वोत्तम",
          sortBy: "क्रमवारी",
          updated: "अपडेट केले",
        }
      : {
          mandi: "Mandi",
          distance: "Distance",
          marketRate: "Market Rate",
          transport: "Transport",
          netProfit: "Net Profit",
          directions: "Directions",
          best: "Best",
          sortBy: "Sort by",
          updated: "Updated",
        };

  // 🌟 THE "BEST OF BOTH WORLDS" FILTER
  const sortedMandis = useMemo(() => {
    if (!mandis || mandis.length === 0) return [];

    // 1. Keep ALL markets (local and major) as long as they have a valid price
    const validMandis = mandis.filter((m) => m.pricePerKg > 0);

    // 2. Let the math decide the winner!
    // (Small quantities = local markets win. Large quantities = major hubs win)
    const sorted = [...validMandis].sort((a, b) => {
      if (sortBy === "distance") return a.distance - b.distance;
      if (sortBy === "pricePerKg") return b.pricePerKg - a.pricePerKg;
      return b.netProfit - a.netProfit; // Default: netProfit
    });

    // 3. Show only the Top 5 to keep the dashboard looking beautiful
    return sorted.slice(0, 5);
  }, [mandis, sortBy]);

  const bestMandi = sortedMandis[0];

  const translateMarket = (mkt) => {
    if (language !== "mr-IN" || !mkt) return mkt;
    let t = mkt;
    t = t.replace(/Pune/gi, "पुणे");
    t = t.replace(/Kalyan/gi, "कल्याण");
    t = t.replace(/Nagpur/gi, "नागपूर");
    t = t.replace(/Nashik/gi, "नाशिक");
    t = t.replace(/Aurangabad/gi, "संभाजीनगर");
    t = t.replace(/Vashi/gi, "वाशी");
    t = t.replace(/Solapur/gi, "सोलापूर");
    t = t.replace(/Mumbai/gi, "मुंबई");
    t = t.replace(/Mandi/gi, "मंडी");
    return t;
  };

  const openInMaps = (mandi) => {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mandi.lat},${mandi.lon}&travelmode=driving`;
    window.open(mapsUrl, "_blank");
  };

  if (!sortedMandis || sortedMandis.length === 0) {
    return (
      <div className="noDataCard">
        {language === "mr-IN"
          ? "मंडी डेटा उपलब्ध नाही"
          : "No mandi data available"}
      </div>
    );
  }

  return (
    <div className="profitComparisonTable">
      {/* Sort Controls */}
      <div className="tableControls">
        <span>{strings.sortBy}:</span>
        <div className="sortButtons">
          <button
            className={sortBy === "netProfit" ? "active" : ""}
            onClick={() => setSortBy("netProfit")}
          >
            {strings.netProfit}
          </button>
          <button
            className={sortBy === "distance" ? "active" : ""}
            onClick={() => setSortBy("distance")}
          >
            {strings.distance}
          </button>
          <button
            className={sortBy === "pricePerKg" ? "active" : ""}
            onClick={() => setSortBy("pricePerKg")}
          >
            {strings.marketRate}
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="desktopTable">
        <table>
          <thead>
            <tr>
              <th>{strings.mandi}</th>
              <th>{strings.distance}</th>
              <th>{strings.marketRate}</th>
              <th>{strings.transport}</th>
              <th>{strings.netProfit}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedMandis.map((mandi, index) => {
              const isBest = sortBy === "netProfit" && index === 0;
              return (
                <tr
                  key={`${mandi.name}-${index}`}
                  className={isBest ? "bestRow" : ""}
                >
                  <td className="mandiName">
                    <MapPin size={16} />
                    <span>{translateMarket(mandi.name)}</span>
                    {isBest && (
                      <span className="bestBadge">{strings.best}</span>
                    )}
                  </td>
                  <td>{mandi.distance} km</td>
                  <td>₹{mandi.pricePerKg}/kg</td>
                  <td className="transportCost">₹{mandi.transportCost}</td>
                  <td className="netProfit">
                    <strong>₹{mandi.netProfit.toLocaleString()}</strong>
                  </td>
                  <td>
                    <button
                      className="directionsBtn"
                      onClick={() => openInMaps(mandi)}
                      title={strings.directions}
                    >
                      <Navigation size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="mobileCards">
        {sortedMandis.map((mandi, index) => {
          const isBest = sortBy === "netProfit" && index === 0;
          return (
            <div
              key={`${mandi.name}-${index}`}
              className={`mandiCard ${isBest ? "bestCard" : ""}`}
            >
              <div className="cardHeader">
                <div>
                  <h3>{translateMarket(mandi.name)}</h3>
                  {isBest && (
                    <span className="bestBadge">✅ {strings.best}</span>
                  )}
                </div>
                <button
                  className="directionsBtn"
                  onClick={() => openInMaps(mandi)}
                >
                  <Navigation size={18} />
                </button>
              </div>

              <div className="statsGrid">
                <div className="stat">
                  <MapPin size={14} color="var(--text-tertiary)" />
                  <div>
                    <div className="statLabel">{strings.distance}</div>
                    <div className="statValue">{mandi.distance} km</div>
                  </div>
                </div>

                <div className="stat">
                  <DollarSign size={14} color="var(--text-tertiary)" />
                  <div>
                    <div className="statLabel">{strings.marketRate}</div>
                    <div className="statValue">₹{mandi.pricePerKg}/kg</div>
                  </div>
                </div>

                <div className="stat">
                  <Truck size={14} color="var(--text-tertiary)" />
                  <div>
                    <div className="statLabel">{strings.transport}</div>
                    <div className="statValue">₹{mandi.transportCost}</div>
                  </div>
                </div>

                <div className="stat highlight">
                  <TrendingUp size={14} color="var(--agri-primary)" />
                  <div>
                    <div className="statLabel">{strings.netProfit}</div>
                    <div className="statValue profit">
                      ₹{mandi.netProfit.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="profitBar">
                <div
                  className="profitFill"
                  style={{
                    width: `${(mandi.netProfit / bestMandi.netProfit) * 100}%`,
                    background: isBest
                      ? "var(--agri-growth)"
                      : "var(--agri-primary-light)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="tableFooter">
        <div className="calculation">
          <strong>{language === "mr-IN" ? "गणना:" : "Calculation:"}</strong>{" "}
          {language === "mr-IN"
            ? `नफा = (भाव × ${quantity} kg) - वाहतूक (₹15/km)`
            : `Profit = (Rate × ${quantity} kg) - Transport (₹15/km)`}
        </div>
        <div className="lastUpdated">
          {strings.updated}:{" "}
          {lastUpdated
            ? new Date(lastUpdated).toLocaleString(language === "mr-IN" ? "mr-IN" : "en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "short",
              })
            : new Date().toLocaleTimeString(language === "mr-IN" ? "mr-IN" : "en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
        </div>
      </div>
    </div>
  );
};

export default ProfitComparisonTable;
