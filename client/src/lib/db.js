import Dexie from 'dexie';

export const db = new Dexie('AgriVaniDB');

// Version 1: Chats and messages
db.version(1).stores({
  chats: '_id, title, createdAt',
  messages: '++id, chatId, role, createdAt',
});

// Version 2: Add mandi prices
db.version(2).stores({
  chats: '_id, title, createdAt',
  messages: '++id, chatId, role, createdAt',
  mandiPrices: 'crop, timestamp',
});

// Version 3: Add price alerts
db.version(3).stores({
  chats: '_id, title, createdAt',
  messages: '++id, chatId, role, createdAt',
  mandiPrices: 'crop, timestamp',
  priceAlerts: '_id, cropName, userId, createdAt', // Sync with MongoDB
});

// Version 4: Offline Outbox Queue for Hybrid Sync
db.version(4).stores({
  chats: '_id, title, createdAt',
  messages: '++id, chatId, role, createdAt',
  mandiPrices: 'crop, timestamp',
  priceAlerts: '_id, cropName, userId, createdAt',
  offlineQueue: '++id, chatId, payload, timestamp', 
});

// Version 5: Offline Voice Queue
db.version(5).stores({
  chats: '_id, title, createdAt',
  messages: '++id, chatId, role, createdAt',
  mandiPrices: 'crop, timestamp',
  priceAlerts: '_id, cropName, userId, createdAt',
  offlineQueue: '++id, chatId, payload, timestamp',
  voiceQueue: '++id, chatId, blob, timestamp',
});

// ===== CHAT HELPERS =====

export async function getCachedChats() {
  try {
    return await db.chats.orderBy('createdAt').reverse().toArray();
  } catch (error) {
    console.error('Error getting cached chats:', error);
    return [];
  }
}

export async function getCachedChatById(id) {
  try {
    return await db.chats.get(id);
  } catch (error) {
    console.error('Error getting cached chat by id:', error);
    return null;
  }
}

export async function cacheChats(chats) {
  try {
    await db.chats.bulkPut(chats);
  } catch (error) {
    console.error('Error caching chats:', error);
  }
}

export async function cacheSingleChat(chat) {
  try {
    await db.chats.put(chat);
  } catch (error) {
    console.error('Error caching single chat:', error);
  }
}

export async function deleteCachedChat(chatId) {
  try {
    await db.chats.delete(chatId);
  } catch (error) {
    console.error('Error deleting cached chat:', error);
  }
}

export async function renameCachedChat(chatId, newTitle) {
  try {
    await db.chats.update(chatId, { title: newTitle });
  } catch (error) {
    console.error('Error renaming cached chat:', error);
  }
}

// ===== MESSAGE HELPERS =====

export async function getCachedMessages(chatId) {
  try {
    return await db.messages.where('chatId').equals(chatId).toArray();
  } catch (error) {
    console.error('Error getting cached messages:', error);
    return [];
  }
}

export async function cacheMessages(chatId, messages) {
  try {
    await db.messages.where('chatId').equals(chatId).delete();
    const messagesToCache = messages.map(msg => ({ ...msg, chatId }));
    await db.messages.bulkAdd(messagesToCache);
  } catch (error) {
    console.error('Error caching messages:', error);
  }
}

// ===== MANDI PRICE HELPERS =====

export async function getCachedMandiPrices(crop) {
  try {
    return await db.mandiPrices.get(crop);
  } catch (error) {
    console.error('Error getting cached mandi prices:', error);
    return null;
  }
}

export async function cacheMandiPrices(crop, data) {
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

// ===== PRICE ALERT HELPERS =====

/**
 * Cache alerts from server to IndexedDB
 */
export async function cacheAlerts(alerts) {
  try {
    // Clear old alerts first
    await db.priceAlerts.clear();
    // Add new alerts (using bulkPut to handle updates based on _id)
    await db.priceAlerts.bulkPut(alerts);
  } catch (error) {
    console.error('Error caching alerts:', error);
  }
}

/**
 * Get cached alerts for instant display
 */
export async function getCachedAlerts() {
  try {
    return await db.priceAlerts.toArray();
  } catch (error) {
    console.error('Error getting cached alerts:', error);
    return [];
  }
}

/**
 * Delete alert from IndexedDB (optimistic update)
 */
export async function deleteCachedAlert(alertId) {
  try {
    await db.priceAlerts.delete(alertId);
  } catch (error) {
    console.error('Error deleting cached alert:', error);
  }
}

/**
 * Add single alert to cache
 */
export async function cacheSingleAlert(alert) {
  try {
    await db.priceAlerts.put(alert);
  } catch (error) {
    console.error('Error caching single alert:', error);
  }
}

// ===== CLEAR ALL =====

// ===== CLEAR ALL =====

export async function clearCache() {
  try {
    await db.chats.clear();
    await db.messages.clear();
    await db.mandiPrices.clear();
    await db.priceAlerts.clear();
    await db.offlineQueue.clear();
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// ===== OFFLINE QUEUE HELPERS =====

export async function saveToOfflineQueue(chatId, payload) {
  try {
    await db.offlineQueue.put({
      chatId,
      payload,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error adding to offline queue:', error);
  }
}

export async function getOfflineQueue() {
  try {
    return await db.offlineQueue.orderBy('timestamp').toArray();
  } catch (error) {
    console.error('Error getting offline queue:', error);
    return [];
  }
}

export async function deleteFromOfflineQueue(id) {
  try {
    await db.offlineQueue.delete(id);
  } catch (error) {
    console.error('Error deleting from offline queue:', error);
  }
}

// ===== VOICE QUEUE HELPERS =====

export async function saveToVoiceQueue(chatId, blob, metadata = {}) {
  try {
    await db.voiceQueue.put({
      chatId,
      blob,
      userId: metadata.userId || "anonymous",
      lat: metadata.lat || 0,
      lon: metadata.lon || 0,
      language: metadata.language || "mr-IN",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error adding to voice queue:', error);
  }
}

export async function getVoiceQueue() {
  try {
    return await db.voiceQueue.orderBy('timestamp').toArray();
  } catch (error) {
    console.error('Error getting voice queue:', error);
    return [];
  }
}

export async function deleteFromVoiceQueue(id) {
  try {
    await db.voiceQueue.delete(id);
  } catch (error) {
    console.error('Error deleting from voice queue:', error);
  }
}