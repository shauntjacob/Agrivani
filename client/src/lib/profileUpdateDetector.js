/**
 * Detects if a user message contains profile updates
 * @param {string} message - The user's message
 * @param {string} language - 'en-IN' or 'mr-IN'
 * @returns {Object} { hasUpdate, field, value, confidence }
 */
export const detectProfileUpdate = (message, language = 'en-IN') => {
  const lowerMsg = message.toLowerCase();

  // Patterns for different fields
  const patterns = {
    income: [
      // English
      { regex: /(?:income|earning|make).*?(?:rs\.?|₹)?\s*(\d{4,})/i, field: 'income' },
      { regex: /(?:rs\.?|₹)\s*(\d{4,})/i, field: 'income' },
      // Marathi
      { regex: /उत्पन्न.*?(\d{4,})/i, field: 'income' },
      { regex: /(\d{4,})\s*रुपये/i, field: 'income' },
    ],
    landSize: [
      { regex: /(\d+(?:\.\d+)?)\s*(?:एकर|acre|acres)/i, field: 'landSize' },
      { regex: /(?:land|जमीन).*?(\d+(?:\.\d+)?)/i, field: 'landSize' },
    ],
    crops: [
      { regex: /(?:grow|plant|पिके|cultivate|सुरूवात|लागवड)?.*?(tomato|onion|potato|wheat|rice|cotton|soybean|टोमॅटो|कांदा|बटाटा|गहू|तांदूळ|कापूस|सोयाबीन)/i, field: 'crops' },
    ],
    district: [
      { regex: /(?:i'?m|i am) from (\w+)/i, field: 'district' },
      { regex: /मी (\w+) (?:मधून|जिल्ह्यात)/i, field: 'district' },
      { regex: /(?:शेती|farm).*?(\w+) जिल्ह्यात/i, field: 'district' },
    ]
  };

  for (const [fieldType, fieldPatterns] of Object.entries(patterns)) {
    for (const pattern of fieldPatterns) {
      const match = lowerMsg.match(pattern.regex);
      if (match) {
        let value = match[1];

        // Process value
        if (fieldType === 'income' || fieldType === 'landSize') {
          value = parseFloat(value);
        } else if (fieldType === 'crops') {
          // Return crop name
          value = [match[1].toLowerCase()];
        } else {
          value = match[1];
        }

        return {
          hasUpdate: true,
          field: fieldType,
          value,
          originalMessage: message,
          confidence: 0.8
        };
      }
    }
  }

  return { hasUpdate: false };
};

/**
 * Detect multiple updates in one message
 */
export const detectMultipleUpdates = (message) => {
  const updates = [];
  const lowerMsg = message.toLowerCase();

  // Income
  const incomeMatch = lowerMsg.match(/(?:income|उत्पन्न).*?(\d{4,})/i);
  if (incomeMatch) updates.push({ field: 'income', value: parseInt(incomeMatch[1]) });

  // Land
  const landMatch = lowerMsg.match(/(\d+(?:\.\d+)?)\s*(?:acre|एकर)/i);
  if (landMatch) updates.push({ field: 'landSize', value: parseFloat(landMatch[1]) });

  // Crops (simplified)
  const cropsList = ['tomato', 'onion', 'potato', 'wheat', 'rice', 'cotton', 'soybean'];
  for (const crop of cropsList) {
    if (lowerMsg.includes(crop)) {
      updates.push({ field: 'crops', value: [crop] });
      break;
    }
  }

  return updates;
};