import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import "../../routes/pricesPage/pricesPage.css";

const PriceTrendChart = ({ data = [], crop = "", language = "en-IN" }) => {
  const strings =
    language === "mr-IN"
      ? {
          title: "शहर-वार 14-दिवसांचा भाव कल (AI भविष्यवाणीसह)",
          subtitle:
            "तुमच्या जवळच्या मार्केटमधील मागील 7 दिवस आणि पुढील 7 दिवसांचा अंदाज",
          priceLabel: "किंमत (₹/kg)",
          dateLabel: "तारीख",
          avgPrice: "सरासरी",
          highest: "सर्वाधिक",
          lowest: "सर्वात कमी",
          noData: "ऐतिहासिक डेटा उपलब्ध नाही",
        }
      : {
          title: "City-Wise 14-Day Price Trend (with AI Forecast)",
          subtitle:
            "Past 7 days and future 7-day predictions for your local mandis",
          priceLabel: "Price (₹/kg)",
          dateLabel: "Date",
          avgPrice: "Average",
          highest: "Highest",
          lowest: "Lowest",
          noData: "No historical data available",
        };

  const { chartData, markets, stats } = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0)
      return { chartData: [], markets: [], stats: null };

    // 🕵️ DEBUG: Print the raw data to the browser console!
    console.log("RAW CHART DATA:", data);

    const grouped = {};
    const allPrices = [];
    const marketSet = new Set();

    data.forEach((item) => {
      if (!item || !item.date) return;

      const rawDate = new Date(item.date);
      if (isNaN(rawDate.getTime())) return;

      rawDate.setHours(0, 0, 0, 0);
      const dateStr = language === "mr-IN" 
          ? new Intl.DateTimeFormat("mr-IN", { day: 'numeric', month: 'short' }).format(rawDate) 
          : format(rawDate, "MMM dd");

      if (!grouped[dateStr]) {
        grouped[dateStr] = { date: dateStr, timestamp: rawDate.getTime() };
      }

      const marketName = item.market || "Unknown";

      // 🌟 THE MATH FIX: Convert Quintals to Kg right here!
      // 🌟 THE MATH FIX: Convert Quintals to Kg, but IGNORE fake government placeholders!
      const rawPrice = item.price || item.modalPrice || 0;

      let pricePerKg = 0;
      // Only accept the price if it's a realistic wholesale number (e.g., > ₹500 per quintal)
      if (rawPrice > 500) {
        pricePerKg = Number((rawPrice / 100).toFixed(1));
      }

      // If the price is 0 (because we rejected it), Recharts will automatically
      // skip drawing a dot and just connect the line to the next valid day!
      if (pricePerKg > 0) {
        grouped[dateStr][marketName] = pricePerKg;
        grouped[dateStr][`${marketName}_signal`] = item.signal || 50;
        marketSet.add(marketName);
        allPrices.push(pricePerKg);
      }
    });

    let historicalData = Object.values(grouped).sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    const uniqueMarkets = Array.from(marketSet).slice(0, 5);

    let calculatedStats = null;
    if (allPrices.length > 0) {
      calculatedStats = {
        avg: Math.round(
          allPrices.reduce((a, b) => a + b, 0) / allPrices.length,
        ),
        min: Math.round(Math.min(...allPrices)),
        max: Math.round(Math.max(...allPrices)),
      };
    }

    const futureData = [];
    const minPossiblePrice = calculatedStats ? calculatedStats.min * 0.75 : 5;

    if (historicalData.length > 1) {
      const lastDay = historicalData[historicalData.length - 1];
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const marketSlopes = {};

      uniqueMarkets.forEach((market) => {
        const marketPoints = historicalData
          .map((d, idx) => ({
            x: idx,
            y: d[market],
            signal: d[`${market}_signal`],
          }))
          .filter((p) => p.y > 0);

        if (marketPoints.length >= 2) {
          const n = marketPoints.length;
          const sumX = marketPoints.reduce((acc, p) => acc + p.x, 0);
          const sumY = marketPoints.reduce((acc, p) => acc + p.y, 0);
          const sumXY = marketPoints.reduce((acc, p) => acc + p.x * p.y, 0);
          const sumXX = marketPoints.reduce((acc, p) => acc + p.x * p.x, 0);

          const denominator = n * sumXX - sumX * sumX;
          if (denominator !== 0) {
            let slope = (n * sumXY - sumX * sumY) / denominator;
            const latestSignal = marketPoints[marketPoints.length - 1].signal;

            if (latestSignal > 70 && slope > 0) slope *= 0.3;
            if (latestSignal < 30 && slope < 0) slope *= 0.4;

            const intercept = (sumY - slope * sumX) / n;
            marketSlopes[market] = { slope, intercept };

            for (let i = historicalData.length - 1; i >= 0; i--) {
              if (historicalData[i][market] > 0) {
                historicalData[i][`${market} (Predicted)`] =
                  historicalData[i][market];
                break;
              }
            }
          }
        }
      });

      for (let i = 1; i <= 7; i++) {
        const futureTime = lastDay.timestamp + i * ONE_DAY_MS;
        const fDate = new Date(futureTime);
        const dateStr = language === "mr-IN" 
            ? new Intl.DateTimeFormat("mr-IN", { day: 'numeric', month: 'short' }).format(fDate) 
            : format(fDate, "MMM dd");
            
        const futureDayObj = {
          date: dateStr,
          timestamp: futureTime,
        };

        uniqueMarkets.forEach((market) => {
          if (marketSlopes[market]) {
            const { slope, intercept } = marketSlopes[market];
            const futureX = historicalData.length - 1 + i;
            let predictedPrice = Number(
              (slope * futureX + intercept).toFixed(1),
            );
            if (predictedPrice < minPossiblePrice)
              predictedPrice = minPossiblePrice;
            futureDayObj[`${market} (Predicted)`] = predictedPrice;
          }
        });
        futureData.push(futureDayObj);
      }
    }

    return {
      chartData: [...historicalData, ...futureData],
      markets: uniqueMarkets,
      stats: calculatedStats,
    };
  }, [data, language]);

  const cityColors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

  const translateMarket = (mkt) => {
    if (language !== "mr-IN" || !mkt) return mkt;
    let t = mkt;
    t = t.replace(/Pune/gi, "पुणे");
    t = t.replace(/manjri/gi, "मांजरी");
    t = t.replace(/moshi/gi, "मोशी");
    t = t.replace(/pimpri/gi, "पिंपरी");
    t = t.replace(/Kalyan/gi, "कल्याण");
    t = t.replace(/Nagpur/gi, "नागपूर");
    t = t.replace(/Nashik/gi, "नाशिक");
    t = t.replace(/Aurangabad/gi, "संभाजीनगर");
    t = t.replace(/Vashi/gi, "वाशी");
    t = t.replace(/Solapur/gi, "सोलापूर");
    t = t.replace(/Mumbai/gi, "मुंबई");
    t = t.replace(/apmc/gi, "APMC");
    t = t.replace(/Mandi/gi, "मंडी");
    return t;
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div
        className="noDataCard"
        style={{ padding: "60px 24px", borderStyle: "dashed" }}
      >
        <div style={{ fontSize: "64px", marginBottom: "16px" }}>📈</div>
        <div
          className="noDataText"
          style={{
            fontWeight: "bold",
            color: "var(--text-secondary)",
            marginBottom: "8px",
          }}
        >
          {strings.noData}
        </div>
      </div>
    );
  }

  return (
    <div className="card trend-card-wrapper">
      <div style={{ marginBottom: "16px" }}>
        <h3
          style={{
            margin: "0 0 4px 0",
            fontSize: "18px",
            fontWeight: "bold",
            color: "var(--agri-primary)",
          }}
        >
          {strings.title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--text-secondary)",
          }}
        >
          {strings.subtitle}
        </p>
      </div>

      {stats && (
        <div className="trend-stats-grid">
          <div
            className="soft-card trend-stat-box"
            style={{
              background: "rgba(16, 185, 129, 0.05)",
              border: "1px solid rgba(16, 185, 129, 0.1)",
            }}
          >
            <div
              className="trend-stat-label"
              style={{
                color: "var(--text-secondary)",
                marginBottom: "4px",
                textTransform: "uppercase",
                fontWeight: "bold",
              }}
            >
              {strings.avgPrice}
            </div>
            <div
              className="trend-stat-value"
              style={{
                fontWeight: "800",
                color: "var(--agri-primary)",
              }}
            >
              ₹{stats.avg}
            </div>
          </div>

          <div
            className="soft-card trend-stat-box"
            style={{
              background: "rgba(245, 158, 11, 0.05)",
              border: "1px solid rgba(245, 158, 11, 0.1)",
            }}
          >
            <div
              className="trend-stat-label"
              style={{
                color: "var(--text-secondary)",
                marginBottom: "4px",
                textTransform: "uppercase",
                fontWeight: "bold",
              }}
            >
              {strings.highest}
            </div>
            <div
              className="trend-stat-value"
              style={{ fontWeight: "800", color: "#D97706" }}
            >
              ₹{stats.max}
            </div>
          </div>

          <div
            className="soft-card trend-stat-box"
            style={{
              background: "rgba(59, 130, 246, 0.05)",
              border: "1px solid rgba(59, 130, 246, 0.1)",
            }}
          >
            <div
              className="trend-stat-label"
              style={{
                color: "var(--text-secondary)",
                marginBottom: "4px",
                textTransform: "uppercase",
                fontWeight: "bold",
              }}
            >
              {strings.lowest}
            </div>
            <div
              className="trend-stat-value"
              style={{ fontWeight: "800", color: "#2563EB" }}
            >
              ₹{stats.min}
            </div>
          </div>
        </div>
      )}

      <div style={{ width: "100%" }}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={chartData}
            /* Changed left margin to 0 so it looks good on both Desktop & Mobile */
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border-light)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              axisLine={{ stroke: "var(--border-light)" }}
              tickLine={false}
              minTickGap={15}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "var(--text-secondary)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => `₹${val}`}
              width={35}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-medium)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
                boxShadow: "var(--shadow-lg)",
                fontSize: "12px",
              }}
              formatter={(value, name) => [`₹${value}/kg`, name]}
            />
            <Legend
              wrapperStyle={{
                paddingTop: "10px",
                fontSize: "11px",
                fontWeight: "600",
              }}
            />

            {markets.map((market, index) => (
              <React.Fragment key={market}>
                <Line
                  type="monotone"
                  dataKey={market}
                  name={translateMarket(market)}
                  stroke={cityColors[index % cityColors.length]}
                  strokeWidth={2.5}
                  dot={{
                    r: 3,
                    fill: cityColors[index % cityColors.length],
                    strokeWidth: 2,
                    stroke: "#fff",
                  }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls={true}
                />
                <Line
                  type="monotone"
                  dataKey={`${market} (Predicted)`}
                  name={language === "mr-IN" ? `${translateMarket(market)} (AI अंदाज)` : `${market} (AI Forecast)`}
                  stroke={cityColors[index % cityColors.length]}
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls={true}
                  legendType="none"
                />
              </React.Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PriceTrendChart;
