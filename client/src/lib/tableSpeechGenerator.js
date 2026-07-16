/**
 * Utility to convert Markdown tables into natural, human-like sentences for TTS.
 */

const HEADER_MAP = {
    en: {
        'crop': 'Crop',
        'price': 'price is',
        'trend': 'and it has',
        'market': 'in the market',
        'typical price': 'typical price is',
        'investment': 'typical investment is',
        'return': 'expected return is',
        'risk': 'risk level is',
        'stability': 'market stability is'
    },
    mr: {
        'crop': 'पीक',
        'price': 'चा दर',
        'trend': 'आणि कल',
        'market': 'बाजारात',
        'typical price': 'सरासरी दर',
        'investment': 'गुंतवणूक',
        'return': 'परतावा',
        'risk': 'धोका',
        'stability': 'बाजार स्थिरता'
    }
};

/**
 * Detects if a string contains a markdown table
 */
function containsTable(text) {
    return /\|.*\|/.test(text) && /\|?\s*--+\s*\|/.test(text);
}

/**
 * Parses a markdown table and converts it to sentences
 */
export function convertTablesToSpeech(text, language = 'en-IN') {
    if (!containsTable(text)) return text;

    const isMr = language === 'mr-IN';
    const lines = text.split('\n');
    let result = [];
    let currentTable = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('|') && line.endsWith('|')) {
            if (!currentTable) {
                currentTable = { headers: [], rows: [] };
                // Parse headers
                currentTable.headers = line.split('|').map(h => h.trim()).filter(h => h !== '');
                // Skip next line if it's a separator
                if (lines[i + 1] && /\|?\s*--+\s*\|/.test(lines[i + 1])) {
                    i++;
                }
            } else {
                // Parse row
                const row = line.split('|').map(r => r.trim()).filter(r => r !== '');
                if (row.length > 0) {
                    currentTable.rows.push(row);
                }
            }
        } else {
            if (currentTable) {
                result.push(generateTableSummary(currentTable, isMr));
                currentTable = null;
            }
            result.push(line);
        }
    }

    if (currentTable) {
        result.push(generateTableSummary(currentTable, isMr));
    }

    return result.join(' ');
}

/**
 * Generates natural sentences from parsed table data
 */
function generateTableSummary(table, isMr) {
    const { headers, rows } = table;
    let text = '';

    rows.forEach((row, rowIndex) => {
        let sentence = '';

        if (isMr) {
            // Marathi Template: [Crop] [Price] [Trend]
            // "टोमॅटोचा दर नऊशे रुपये आहे, आणि कल दोन टक्के कमी झाला आहे."
            headers.forEach((header, colIndex) => {
                const value = row[colIndex] || '';
                const lowerHeader = header.toLowerCase();

                if (lowerHeader.includes('crop') || lowerHeader.includes('पीक')) {
                    sentence += value + ' ';
                } else if (lowerHeader.includes('price') || lowerHeader.includes('दर') || lowerHeader.includes('भाव')) {
                    sentence += `चा दर ${value} आहे, `;
                } else if (lowerHeader.includes('trend') || lowerHeader.includes('कल')) {
                    const trendText = value.includes('↑') ? 'वाढला' : value.includes('↓') ? 'कमी झाला' : value;
                    const trendVal = value.replace(/[↑↓]/g, '').trim();
                    sentence += `आणि कल ${trendVal} ${trendText} आहे. `;
                } else {
                    sentence += `${header} ${value} आहे. `;
                }
            });
        } else {
            // English Template: [Crop] [Price] [Trend]
            // "Onion price is 2100 rupees, and it has increased by 5 percent."
            headers.forEach((header, colIndex) => {
                const value = row[colIndex] || '';
                const lowerHeader = header.toLowerCase();

                if (lowerHeader.includes('crop')) {
                    sentence += value + ' ';
                } else if (lowerHeader.includes('price')) {
                    sentence += `price is ${value}, `;
                } else if (lowerHeader.includes('trend')) {
                    const trendAction = value.includes('↑') ? 'increased by' : value.includes('↓') ? 'decreased by' : 'is';
                    const trendVal = value.replace(/[↑↓]/g, '').trim();
                    sentence += `and it has ${trendAction} ${trendVal}. `;
                } else if (lowerHeader.includes('investment')) {
                    sentence += `typical investment is ${value}. `;
                } else if (lowerHeader.includes('risk')) {
                    sentence += `risk level is ${value}. `;
                } else {
                    sentence += `${header} is ${value}. `;
                }
            });
        }

        text += sentence.trim() + ' ';
    });

    return text.trim();
}
