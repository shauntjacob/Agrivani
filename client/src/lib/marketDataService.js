/**
 * Market Data Service
 * Fetches comprehensive market analysis for chatbot
 */

import { API_URL, DEFAULT_LOCATION } from "./config";

export async function getMarketAnalysis(crop, quantity = 100, userLocation) {
  try {
    const [priceHistory, prediction, mandiPrices] = await Promise.all([
      fetch(`${API_URL}/api/prices/${crop}`).then((res) => res.json()),
      fetch(`${API_URL}/api/prices/predict/${crop}`).then((res) => res.json()),
      import("./mandiDataService.js").then((mod) => mod.fetchMandiPrices(crop)),
    ]);

    const { analyzeMandiOptions } = await import("./profitCalculator.js");
    const analyzedMandis = analyzeMandiOptions(
      mandiPrices,
      userLocation || DEFAULT_LOCATION,
      quantity,
    );

    const trendSummary = analyzeTrend(priceHistory.history || []);

    return {
      success: true,
      crop,
      currentPrice: priceHistory.currentPrice,
      priceHistory: priceHistory.history || [],
      prediction: prediction.success ? prediction : null,
      profitComparison: {
        bestMandi: analyzedMandis[0],
        allMandis: analyzedMandis.slice(0, 3),
      },
      trend: trendSummary,
    };
  } catch (error) {
    console.error("Market analysis error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Analyze price trend from history
 */
function analyzeTrend(history) {
  if (!history || history.length < 2) {
    return { direction: "stable", change: 0 };
  }

  const recent = history.slice(-7);
  const firstPrice = recent[0].price;
  const lastPrice = recent[recent.length - 1].price;
  const change = ((lastPrice - firstPrice) / firstPrice) * 100;

  let direction = "stable";
  if (change > 3) direction = "increasing";
  else if (change < -3) direction = "decreasing";

  return {
    direction,
    change: change.toFixed(1),
    firstPrice,
    lastPrice,
  };
}
