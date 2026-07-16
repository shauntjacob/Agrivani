/**
 * Mandi Data Service
 * Fetches and caches mandi price data
 */

import { DEFAULT_LOCATION } from "./config";
import { db } from './db';
export const MANDI_LOCATIONS = {
  'Vashi': { lat: 19.0760, lon: 72.9983, district: 'Thane/Mumbai' },
  'Kalyan': { lat: 19.2403, lon: 73.1305, district: 'Thane' },
  'Pune': { lat: 18.5204, lon: 73.8567, district: 'Pune' },
  'Nashik': { lat: 19.9975, lon: 73.7898, district: 'Nashik' },
  'Aurangabad': { lat: 19.8762, lon: 75.3433, district: 'Chhatrapati Sambhajinagar' },
  'Nagpur': { lat: 21.1458, lon: 79.0882, district: 'Nagpur' },
  'Solapur': { lat: 17.6599, lon: 75.9064, district: 'Solapur' },
};

/**
 * Fetch mandi prices from data.gov.in or mock data
 * @param {string} crop - Crop name
 * @returns {Promise<Array>} Mandi price data
 */
export async function fetchMandiPrices(crop) {
  try {
    // Try to fetch from cache first
    const cached = await getCachedMandiPrices(crop);
    const cacheAge = cached ? Date.now() - new Date(cached.timestamp).getTime() : Infinity;

    // Use cache if less than 6 hours old
    if (cached && cacheAge < 6 * 60 * 60 * 1000) {
      console.log('Using cached mandi prices');
      return cached.data;
    }

    // Fetch fresh data from API
    // Note: data.gov.in API requires registration for API key
    // For now, using mock data - replace with real API call
    const freshData = await fetchFromAPI(crop);

    // Cache the fresh data
    await cacheMandiPrices(crop, freshData);

    return freshData;
  } catch (error) {
    console.error('Error fetching mandi prices:', error);

    // Fallback to cached data even if old
    const cached = await getCachedMandiPrices(crop);
    if (cached) {
      return cached.data;
    }

    // Last resort: return mock data
    return getMockMandiData(crop);
  }
}

/**
 * Fetch from data.gov.in API (placeholder - needs API key)
 */
/**
 * Fetch from AgriVani Backend API
 */
async function fetchFromAPI(crop) {
  try {
    // 1. Call your local backend (prices.js route)
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/prices/${crop}`);
    const result = await response.json();

    if (result.success && result.history && result.history.length > 0) {
      // 2. Map history to get the latest price for each specific market if possible
      // Otherwise fallback to result.currentPrice
      const marketPrices = {};
      result.history.forEach(h => {
        if (!marketPrices[h.market]) {
          marketPrices[h.market] = h.price;
        }
      });

      // 3. Map your MANDI_LOCATIONS to include the real price from DB
      return Object.entries(MANDI_LOCATIONS).map(([name, location]) => ({
        name: `${name} Mandi`,
        ...location,
        pricePerKg: marketPrices[name] || result.currentPrice, // Real price from your API
        crop,
        date: result.lastUpdated,
        source: 'AgriVani Live API',
      }));
    }

    // Fallback if API response is empty
    return getMockMandiData(crop);
  } catch (error) {
    console.error("API Fetch failed, using mocks:", error);
    return getMockMandiData(crop);
  }
}

/**
 * Generate realistic mock mandi data
 */
function getMockMandiData(crop) {
  const basePrices = {
    'Tomato': 25,
    'टोमॅटो': 25,
    'Onion': 20,
    'कांदा': 20,
    'Potato': 15,
    'बटाटा': 15,
    'Soybean': 45,
    'सोयाबीन': 45,
    'Cotton': 55,
    'कापूस': 55,
  };

  const basePrice = basePrices[crop] || 30;

  return Object.entries(MANDI_LOCATIONS).map(([name, location]) => {
    // Add realistic price variation (±20%)
    const variation = (Math.random() - 0.5) * 0.4;
    const pricePerKg = Math.round(basePrice * (1 + variation));

    return {
      name: `${name} Mandi`,
      ...location,
      pricePerKg,
      crop,
      date: new Date().toISOString(),
      source: 'Mock Data',
    };
  });
}

/**
 * Cache mandi prices in IndexedDB
 */
async function cacheMandiPrices(crop, data) {
  try {
    await db.mandiPrices.put({
      crop,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error caching mandi prices:', error);
  }
}

/**
 * Get cached mandi prices from IndexedDB
 */
async function getCachedMandiPrices(crop) {
  try {
    return await db.mandiPrices.get(crop);
  } catch (error) {
    console.error('Error getting cached mandi prices:', error);
    return null;
  }
}

/**
 * Get user's geolocation
 * @returns {Promise<{lat, lon}>}
 */
export async function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      resolve({ ...DEFAULT_LOCATION });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        console.warn('Geolocation error, using default location:', error);
        resolve({ ...DEFAULT_LOCATION });
      },
      {
        timeout: 5000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  });
}