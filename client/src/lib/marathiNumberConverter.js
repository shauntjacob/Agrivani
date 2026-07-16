/**
 * Convert numbers to Marathi words for natural speech
 */
import { convertTablesToSpeech } from './tableSpeechGenerator';

const marathiOnes = ['', 'एक', 'दोन', 'तीन', 'चार', 'पाच', 'सहा', 'सात', 'आठ', 'नऊ'];
const marathiTeens = ['दहा', 'अकरा', 'बारा', 'तेरा', 'चौदा', 'पंधरा', 'सोळा', 'सतरा', 'अठरा', 'एकोणीस'];
const marathiTens = ['', '', 'वीस', 'तीस', 'चाळीस', 'पन्नास', 'साठ', 'सत्तर', 'ऐंशी', 'नव्वद'];
const marathiHundreds = ['', 'शंभर', 'दोनशे', 'तीनशे', 'चारशे', 'पाचशे', 'सहाशे', 'सातशे', 'आठशे', 'नऊशे'];

/**
 * Convert number to Marathi words
 */
export function numberToMarathi(num) {
  if (num === 0) return 'शून्य';
  if (num < 0) return 'उणे ' + numberToMarathi(Math.abs(num));

  // Handle decimals
  if (num % 1 !== 0) {
    const parts = num.toString().split('.');
    const intPart = numberToMarathi(parseInt(parts[0]));
    const decPart = parts[1].split('').map(d => marathiOnes[parseInt(d)] || 'शून्य').join(' ');
    return `${intPart} पूर्णांक ${decPart}`;
  }

  if (num < 10) return marathiOnes[num];
  if (num < 20) return marathiTeens[num - 10];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return marathiTens[tens] + (ones ? marathiOnes[ones] : '');
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    return marathiHundreds[hundreds] + (remainder ? ' ' + numberToMarathi(remainder) : '');
  }
  if (num < 100000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    return numberToMarathi(thousands) + ' हजार' + (remainder ? ' ' + numberToMarathi(remainder) : '');
  }
  if (num < 10000000) {
    const lakhs = Math.floor(num / 100000);
    const remainder = num % 100000;
    return numberToMarathi(lakhs) + ' लाख' + (remainder ? ' ' + numberToMarathi(remainder) : '');
  }

  const crores = Math.floor(num / 10000000);
  const remainder = num % 10000000;
  return numberToMarathi(crores) + ' कोटी' + (remainder ? ' ' + numberToMarathi(remainder) : '');
}

/**
 * Convert currency to Marathi speech
 * ₹27 → सत्तावीस रुपये
 */
export function currencyToMarathi(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  let result = numberToMarathi(rupees) + ' रुपये';
  if (paise > 0) {
    result += ' आणि ' + numberToMarathi(paise) + ' पैसे';
  }

  return result;
}

/**
 * Convert weight to Marathi speech
 * 100 kg → शंभर किलो
 */
export function weightToMarathi(value, unit = 'kg') {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  const unitMap = {
    'kg': 'किलो',
    'quintal': 'क्विंटल',
    'ton': 'टन',
    'g': 'ग्रॅम'
  };

  return numberToMarathi(num) + ' ' + (unitMap[unit] || unit);
}

/**
 * Convert percentage to Marathi speech
 * 7.4% → सात पूर्णांक चार टक्के
 */
export function percentageToMarathi(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  return numberToMarathi(num) + ' टक्के';
}

/**
 * Convert distance to Marathi speech
 * 24.5 km → चोवीस पूर्णांक पाच किलोमीटर
 */
export function distanceToMarathi(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return value;

  return numberToMarathi(num) + ' किलोमीटर';
}


/**
 * Format Marathi text for natural speech
 * Adds pauses, removes emojis, formats properly
 */
export function formatForSpeech(text) {
  // 1. Convert tables to human-like sentences first
  const speechFriendlyText = convertTablesToSpeech(text, 'mr-IN');

  return speechFriendlyText
    // Remove table syntax as fallback
    .replace(/\|?\s*--+\s*\|/g, '')
    // Remove all emojis
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[✅❌⏳📊📈📉🔔💰🤖📍💵🟢]/g, '')

    // Convert numbers in text
    .replace(/₹(\d+\.?\d*)/g, (match, num) => currencyToMarathi(num))
    .replace(/(\d+\.?\d*)\s*kg/gi, (match, num) => weightToMarathi(num, 'kg'))
    .replace(/(\d+\.?\d*)\s*km/gi, (match, num) => distanceToMarathi(num))
    .replace(/(\d+\.?\d*)%/g, (match, num) => percentageToMarathi(num))

    // Convert standalone numbers
    .replace(/\b(\d+\.?\d*)\b/g, (match, num) => numberToMarathi(parseFloat(num)))

    // Add pauses after headings (marked with **)
    .replace(/\*\*(.*?)\*\*/g, '$1।') // । = Devanagari pause

    // Add pauses after bullet points
    .replace(/^•\s*/gm, '। ')
    .replace(/^\d+\.\s*/gm, '। ')

    // Add pause after colons
    .replace(/:/g, '।')

    // Clean up markdown
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')

    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}