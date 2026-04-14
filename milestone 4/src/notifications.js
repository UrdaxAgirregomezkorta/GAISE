/**
 * Notifications module - Send Telegram messages on changes
 */

/**
 * Send a message to Telegram
 * @param {string} message - Message text (supports HTML parse_mode)
 * @param {boolean} dryRun - If true, don't actually send (just log)
 * @returns {Promise<boolean>}
 */
export async function sendTelegramMessage(message, dryRun = false) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[notifications] Telegram credentials not configured');
    return false;
  }

  if (dryRun) {
    console.log('[notifications] [DRY-RUN] Would send: ' + message.substring(0, 80) + '...');
    return true;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (!response.ok) {
      console.error(`[notifications] Telegram error: ${response.status}`);
      return false;
    }

    console.log('[notifications] Message sent to Telegram');
    return true;
  } catch (err) {
    console.error('[notifications] Failed to send:', err.message);
    return false;
  }
}

/**
 * Format and send change summary notification
 * @param {Object} summary - Change summary {new, priceChanged, attributesChanged, removed}
 * @param {number} runId - Run ID
 * @param {boolean} dryRun - If true, don't send
 * @returns {Promise<boolean>}
 */
export async function notifyChanges(summary, runId, dryRun = false) {
  const { new: newListings, priceChanged, attributesChanged, removed } = summary;

  // Only notify if there are changes
  if (newListings === 0 && priceChanged === 0 && attributesChanged === 0 && removed === 0) {
    console.log('[notifications] No changes to report');
    return true;
  }

  const timestamp = new Date().toLocaleString();
  let message = `<b>🏠 Real Estate Monitor - Changes Detected</b>\n\n`;
  message += `<b>Run #${runId}</b>\n`;
  message += `<i>${timestamp}</i>\n\n`;

  if (newListings > 0) {
    message += `<b>✨ New Listings:</b> ${newListings}\n`;
  }

  if (priceChanged > 0) {
    message += `<b>💰 Price Changes:</b> ${priceChanged}\n`;
  }

  if (attributesChanged > 0) {
    message += `<b>📝 Attribute Changes:</b> ${attributesChanged}\n`;
  }

  if (removed > 0) {
    message += `<b>✂️ Removed:</b> ${removed}\n`;
  }

  return await sendTelegramMessage(message, dryRun);
}

/**
 * Send detailed change notification with specific listing
 * @param {string} listingId - Listing ID
 * @param {string} changeType - Type of change
 * @param {string} title - Listing title
 * @param {Object} diff - Diff object {field, old, new}
 * @param {boolean} dryRun
 * @returns {Promise<boolean>}
 */
export async function notifyListingChange(listingId, changeType, title, diff, dryRun = false) {
  let emoji = '✨';
  let action = 'New';

  if (changeType === 'price_changed') {
    emoji = '💰';
    action = 'Price Changed';
  } else if (changeType === 'attributes_changed') {
    emoji = '📝';
    action = 'Updated';
  } else if (changeType === 'removed') {
    emoji = '✂️';
    action = 'Removed';
  }

  let message = `<b>${emoji} ${action}</b>\n\n`;
  message += `<b>${title.substring(0, 60)}...</b>\n`;
  message += `<code>${listingId}</code>\n\n`;

  if (diff && Array.isArray(diff)) {
    for (const change of diff) {
      if (change.field === 'priceNum') {
        message += `<b>Price:</b> ${change.old || 'N/A'} → ${change.new || 'N/A'}\n`;
      } else if (change.field !== 'price') {
        const oldVal = String(change.old).substring(0, 30);
        const newVal = String(change.new).substring(0, 30);
        message += `<b>${change.field}:</b> <i>${oldVal}</i> → <i>${newVal}</i>\n`;
      }
    }
  }

  return await sendTelegramMessage(message, dryRun);
}

/**
 * Check if notifications are enabled
 * @returns {boolean}
 */
export function isEnabled() {
  return process.env.ENABLE_NOTIFICATIONS === 'true' || process.env.ENABLE_NOTIFICATIONS === '1';
}

/**
 * Test the Telegram connection
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('[notifications] Missing Telegram credentials');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({
      chat_id: chatId,
      text: '✅ Test message from real-estate-monitor'
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    if (response.ok) {
      console.log('[notifications] ✅ Telegram connection successful');
      return true;
    } else {
      console.error(`[notifications] ❌ Telegram error: ${response.status}`);
      return false;
    }
  } catch (err) {
    console.error('[notifications] ❌ Connection failed:', err.message);
    return false;
  }
}
