/**
 * Profit-First Calculation Engine
 * Shared logic for chatbot and dashboard
 */

// Constants
const TRANSPORT_RATE_PER_KM = 15; // ₹15/km
const DEFAULT_QUANTITY_KG = 100;

/**
 * Haversine Formula: Calculate distance between two coordinates
 * @param {number} lat1 - User latitude
 * @param {number} lon1 - User longitude
 * @param {number} lat2 - Mandi latitude
 * @param {number} lon2 - Mandi longitude
 * @returns {number} Distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 10) / 10; // Round to 1 decimal
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate transport cost based on distance
 * @param {number} distanceKm - Distance in kilometers
 * @returns {number} Transport cost in ₹
 */
export function calculateTransportCost(distanceKm) {
  return Math.round(distanceKm * TRANSPORT_RATE_PER_KM);
}

/**
 * Calculate estimated net profit
 * @param {number} pricePerKg - Market price per kg
 * @param {number} quantityKg - Quantity in kg (default: 100)
 * @param {number} transportCost - Transport cost in ₹
 * @returns {number} Net profit in ₹
 */
export function calculateNetProfit(pricePerKg, quantityKg = DEFAULT_QUANTITY_KG, transportCost) {
  const grossRevenue = pricePerKg * quantityKg;
  const netProfit = grossRevenue - transportCost;
  return Math.round(netProfit);
}

/**
 * Analyze mandi options and rank by profit
 * @param {Array} mandis - Array of mandi objects with {name, lat, lon, pricePerKg}
 * @param {object} userLocation - {lat, lon}
 * @param {number} quantityKg - Quantity in kg
 * @returns {Array} Sorted mandis with profit calculations
 */
export function analyzeMandiOptions(mandis, userLocation, quantityKg = DEFAULT_QUANTITY_KG) {
  const analyzed = mandis.map(mandi => {
    const distance = calculateDistance(
      userLocation.lat,
      userLocation.lon,
      mandi.lat,
      mandi.lon
    );
    
    const transportCost = calculateTransportCost(distance);
    const netProfit = calculateNetProfit(mandi.pricePerKg, quantityKg, transportCost);
    
    return {
      ...mandi,
      distance,
      transportCost,
      netProfit,
      grossRevenue: mandi.pricePerKg * quantityKg,
    };
  });
  
  // Sort by net profit (descending)
  return analyzed.sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Get best mandi recommendation
 * @param {Array} analyzedMandis - Output from analyzeMandiOptions
 * @returns {object} Best mandi with recommendation text
 */
export function getBestMandiRecommendation(analyzedMandis, language = 'en-IN') {
  if (!analyzedMandis || analyzedMandis.length === 0) {
    return null;
  }
  
  const best = analyzedMandis[0];
  
  const text = language === 'mr-IN' 
    ? `${best.name} सर्वोत्तम आहे - ₹${best.netProfit} नफा (${best.distance} km, ₹${best.pricePerKg}/kg)`
    : `${best.name} is best - ₹${best.netProfit} profit (${best.distance} km, ₹${best.pricePerKg}/kg)`;
  
  return {
    ...best,
    recommendationText: text,
  };
}

/**
 * Generate chatbot response for market query
 * @param {Array} analyzedMandis - Analyzed mandi data
 * @param {string} crop - Crop name
 * @param {number} quantity - Quantity in kg
 * @param {string} language - 'en-IN' or 'mr-IN'
 * @returns {string} Formatted chatbot response
 */
export function generateMarketChatResponse(analyzedMandis, crop, quantity, language = 'en-IN') {
  if (!analyzedMandis || analyzedMandis.length === 0) {
    return language === 'mr-IN'
      ? 'माफ करा, सध्या मंडी माहिती उपलब्ध नाही.'
      : 'Sorry, mandi information is currently unavailable.';
  }
  
  const best = analyzedMandis[0];
  const top3 = analyzedMandis.slice(0, 3);
  
  if (language === 'mr-IN') {
    let response = `**${crop} साठी मंडी भाव विश्लेषण (${quantity} kg)**\n\n`;
    response += `✅ **सर्वोत्तम पर्याय: ${best.name}**\n`;
    response += `• नफा: ₹${best.netProfit}\n`;
    response += `• अंतर: ${best.distance} km\n`;
    response += `• भाव: ₹${best.pricePerKg}/kg\n`;
    response += `• वाहतूक: ₹${best.transportCost}\n\n`;
    
    if (top3.length > 1) {
      response += `**इतर पर्याय:**\n`;
      top3.slice(1).forEach((mandi, idx) => {
        response += `${idx + 2}. ${mandi.name}: ₹${mandi.netProfit} नफा (${mandi.distance} km)\n`;
      });
    }
    
    response += `\n📊 संपूर्ण तुलना आणि 7-दिवसांचा ट्रेंड पाहण्यासाठी [मंडी भाव](/dashboard/prices) वर जा`;
    
    return response;
  } else {
    let response = `**Market Analysis for ${crop} (${quantity} kg)**\n\n`;
    response += `✅ **Best Option: ${best.name}**\n`;
    response += `• Net Profit: ₹${best.netProfit}\n`;
    response += `• Distance: ${best.distance} km\n`;
    response += `• Market Rate: ₹${best.pricePerKg}/kg\n`;
    response += `• Transport: ₹${best.transportCost}\n\n`;
    
    if (top3.length > 1) {
      response += `**Other Options:**\n`;
      top3.slice(1).forEach((mandi, idx) => {
        response += `${idx + 2}. ${mandi.name}: ₹${mandi.netProfit} profit (${mandi.distance} km)\n`;
      });
    }
    
    response += `\n📊 View Full Profit Comparison & 7-Day Charts at [Market Prices](/dashboard/prices)`;
    
    return response;
  }
}

export { DEFAULT_QUANTITY_KG, TRANSPORT_RATE_PER_KM };