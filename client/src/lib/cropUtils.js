export const CROP_MAP = {
  Tomato: { en: "Tomato", mr: "टोमॅटो" },
  Onion: { en: "Onion", mr: "कांदा" },
  Potato: { en: "Potato", mr: "बटाटा" },
  Wheat: { en: "Wheat", mr: "गहू" },
  Rice: { en: "Rice", mr: "तांदूळ" },
  Cotton: { en: "Cotton", mr: "कापूस" },
  Soybean: { en: "Soybean", mr: "सोयाबीन" },
  Sugarcane: { en: "Sugarcane", mr: "ऊस" },
  Maize: { en: "Maize", mr: "मका" },
  Bajra: { en: "Bajra", mr: "बाजरी" },
  Mango: { en: "Mango", mr: "आंबा" },
  Grapes: { en: "Grapes", mr: "द्राक्षे" },
};

/**
 * Normalizes a crop string to its primary English key from CROP_MAP.
 * If not found, returns the original string trimmed.
 */
export function normalizeCrop(name) {
  if (!name) return "";
  const clean = name.trim();
  const key = Object.keys(CROP_MAP).find(
    (k) =>
      k.toLowerCase() === clean.toLowerCase() ||
      CROP_MAP[k].mr === clean ||
      CROP_MAP[k].en.toLowerCase() === clean.toLowerCase(),
  );
  return key || clean;
}

/**
 * Gets display label for a cropKey (which might be normalized or raw) based on language.
 */
export function getCropLabel(cropKey, isMr) {
  // Always normalize first to ensure we check the map with the primary English key
  const normalizedKey = normalizeCrop(cropKey);
  const mapItem = CROP_MAP[normalizedKey];
  if (mapItem) return isMr ? mapItem.mr : mapItem.en;
  return normalizedKey;
}
