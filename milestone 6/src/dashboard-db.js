/**
 * Dashboard database queries module
 * Read-only queries for the web dashboard
 */

function rowsToObjects(result) {
  if (!result?.rows) return [];
  const columns = result.columns || [];

  return result.rows.map((row) => {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      obj[col] = row?.[col] ?? row?.[i] ?? null;
    }
    return obj;
  });
}

function firstScalar(result, key) {
  const row = result?.rows?.[0];
  if (!row) return 0;
  return row?.[key] ?? row?.[0] ?? 0;
}

function parseDiffJson(diffJson) {
  if (!diffJson) return [];
  try {
    const parsed = JSON.parse(diffJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeSqlText(value) {
  return String(value).replace(/'/g, "''");
}

function normalizeStoredPrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num < 1000 ? num * 1000 : num;
}

export function isNormalizationNoiseChange(change) {
  if (change?.change_type !== 'price_changed') return false;

  const diff = parseDiffJson(change?.diff_json);
  if (!diff.length) return false;

  const priceEntry = diff.find((d) => d?.field === 'price');
  const priceNumEntry = diff.find((d) => d?.field === 'priceNum');
  if (!priceEntry || !priceNumEntry) return false;

  const oldPrice = String(priceEntry.old ?? '').trim();
  const newPrice = String(priceEntry.new ?? '').trim();
  if (!oldPrice || oldPrice !== newPrice) return false;

  const oldNum = Number(priceNumEntry.old);
  const newNum = Number(priceNumEntry.new);
  if (!Number.isFinite(oldNum) || !Number.isFinite(newNum) || oldNum === newNum) return false;

  const epsilon = 0.001;
  if (Math.abs(oldNum - (newNum * 1000)) < epsilon || Math.abs(newNum - (oldNum * 1000)) < epsilon) {
    return true;
  }

  // Covers parser bug output like 26400 -> 26 or 367500 -> 367 when price text stayed equal.
  return Math.floor(oldNum / 1000) === newNum || Math.floor(newNum / 1000) === oldNum;
}

/**
 * Get all active listings
 * @param {any} turso - Turso database connection
 * @returns {Promise<Array>}
 */
export async function getAllListings(turso) {
  if (!turso) return [];
  
  try {
    const result = await turso.execute(`
      SELECT 
        id, 
        siteId, 
        title, 
        price, 
        location, 
        url,
        active,
        miss_count,
        first_seen,
        last_seen
      FROM listings_current
      WHERE active = 1
      ORDER BY last_seen DESC
      LIMIT 1000
    `);
    
    return rowsToObjects(result);
  } catch (err) {
    console.error('[dashboard-db] Error fetching listings:', err.message);
    return [];
  }
}

/**
 * Get recent changes
 * @param {any} turso - Turso database connection
 * @param {number} limit - Number of changes to fetch
 * @returns {Promise<Array>}
 */
export async function getRecentChanges(turso, limit = 100) {
  if (!turso) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const fetchLimit = safeLimit * 5;
  
  try {
    const result = await turso.execute(`
      SELECT 
        change_id as id,
        listing_id,
        change_type,
        diff_json,
        created_at
      FROM listing_changes
      ORDER BY created_at DESC
      LIMIT ${fetchLimit}
    `);

    const changes = rowsToObjects(result);
    return changes
      .filter((change) => !isNormalizationNoiseChange(change))
      .slice(0, safeLimit);
  } catch (err) {
    console.error('[dashboard-db] Error fetching changes:', err.message);
    return [];
  }
}

/**
 * Get summary stats
 * @param {any} turso - Turso database connection
 * @returns {Promise<Object>}
 */
export async function getSummaryStats(turso) {
  if (!turso) {
    return {
      totalActive: 0,
      newCount: 0,
      changedCount: 0,
      removedCount: 0,
      avgPrice: 0
    };
  }
  
  try {
    const activeResult = await turso.execute(`
      SELECT COUNT(*) as total FROM listings_current WHERE active = 1
    `);
    const totalActive = Number(firstScalar(activeResult, 'total')) || 0;

    const newResult = await turso.execute(`
      SELECT COUNT(*) as count
      FROM listings_current
      WHERE active = 1
        AND first_seen IS NOT NULL
        AND datetime(first_seen) >= datetime('now', '-1 day')
    `);
    const newCount = Number(firstScalar(newResult, 'count')) || 0;

    const changedResult = await turso.execute(`
      SELECT listing_id, change_type, diff_json
      FROM listing_changes
      WHERE change_type IN ('price_changed', 'attributes_changed')
        AND datetime(created_at) >= datetime('now', '-1 day')
    `);

    const changedRows = rowsToObjects(changedResult)
      .filter((change) => !isNormalizationNoiseChange(change));
    const changedCount = new Set(changedRows.map((change) => change.listing_id)).size;

    const removedResult = await turso.execute(`
      SELECT COUNT(*) as count
      FROM listing_changes
      WHERE change_type = 'removed'
        AND datetime(created_at) >= datetime('now', '-1 day')
    `);
    const removedCount = Number(firstScalar(removedResult, 'count')) || 0;

    const avgResult = await turso.execute(`
      SELECT AVG(
        CASE
          WHEN CAST(priceNum as REAL) < 1000 THEN CAST(priceNum as REAL) * 1000
          ELSE CAST(priceNum as REAL)
        END
      ) as avg
      FROM listings_current
      WHERE active = 1 AND priceNum IS NOT NULL
    `);
    const avgPrice = Math.round(Number(firstScalar(avgResult, 'avg')) || 0);

    return {
      totalActive,
      newCount,
      changedCount,
      removedCount,
      avgPrice
    };
  } catch (err) {
    console.error('[dashboard-db] Error fetching stats:', err.message);
    return {
      totalActive: 0,
      newCount: 0,
      changedCount: 0,
      removedCount: 0,
      avgPrice: 0
    };
  }
}

/**
 * Get price distribution for chart
 * @param {any} turso - Turso database connection
 * @returns {Promise<Array>}
 */
export async function getPriceDistribution(turso) {
  if (!turso) return [];
  
  try {
    const result = await turso.execute(`
      WITH normalized_prices AS (
        SELECT
          CASE
            WHEN CAST(priceNum as REAL) < 1000 THEN CAST(priceNum as REAL) * 1000
            ELSE CAST(priceNum as REAL)
          END as normalized_price
        FROM listings_current
        WHERE active = 1 AND priceNum IS NOT NULL
      )
      SELECT 
        CASE 
          WHEN normalized_price < 100000 THEN '< 100k'
          WHEN normalized_price < 200000 THEN '100k - 200k'
          WHEN normalized_price < 300000 THEN '200k - 300k'
          WHEN normalized_price < 400000 THEN '300k - 400k'
          else '> 400k'
        END as range,
        COUNT(*) as count,
        CASE
          WHEN normalized_price < 100000 THEN 1
          WHEN normalized_price < 200000 THEN 2
          WHEN normalized_price < 300000 THEN 3
          WHEN normalized_price < 400000 THEN 4
          ELSE 5
        END as sort_order
      FROM normalized_prices
      GROUP BY range, sort_order
      ORDER BY sort_order
    `);
    
    return rowsToObjects(result);
  } catch (err) {
    console.error('[dashboard-db] Error fetching price distribution:', err.message);
    return [];
  }
}

/**
 * Get aggregated change types for chart
 * @param {any} turso - Turso database connection
 * @returns {Promise<Array>}
 */
export async function getChangesByType(turso) {
  if (!turso) return [];

  try {
    const result = await turso.execute(`
      SELECT
        change_type,
        diff_json
      FROM listing_changes
    `);

    const rows = rowsToObjects(result)
      .filter((change) => !isNormalizationNoiseChange(change));

    const countsByType = new Map();
    for (const row of rows) {
      const key = row.change_type || 'unknown';
      countsByType.set(key, (countsByType.get(key) || 0) + 1);
    }

    return [...countsByType.entries()]
      .map(([change_type, count]) => ({ change_type, count }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error('[dashboard-db] Error fetching changes by type:', err.message);
    return [];
  }
}

/**
 * Get daily trend of changes for chart
 * @param {any} turso - Turso database connection
 * @param {number} days - Days to look back
 * @returns {Promise<Array>}
 */
export async function getTrendData(turso, days = 30) {
  if (!turso) return [];

  try {
    const result = await turso.execute(`
      SELECT
        DATE(created_at) as date,
        change_type,
        diff_json
      FROM listing_changes
      WHERE datetime(created_at) >= datetime('now', '-${days} days')
      ORDER BY date ASC
    `);

    const rows = rowsToObjects(result)
      .filter((change) => !isNormalizationNoiseChange(change));

    const countsByDate = new Map();
    for (const row of rows) {
      const key = row.date;
      if (!key) continue;
      countsByDate.set(key, (countsByDate.get(key) || 0) + 1);
    }

    return [...countsByDate.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  } catch (err) {
    console.error('[dashboard-db] Error fetching trend data:', err.message);
    return [];
  }
}

/**
 * Get top price drops from recent price changes
 * @param {any} turso - Turso database connection
 * @param {number} limit - Max rows to return
 * @returns {Promise<Array>}
 */
export async function getTopPriceDrops(turso, limit = 8) {
  if (!turso) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 25));
  const fetchLimit = safeLimit * 12;

  try {
    const result = await turso.execute(`
      SELECT
        change_id as id,
        listing_id,
        diff_json,
        created_at
      FROM listing_changes
      WHERE change_type = 'price_changed'
      ORDER BY datetime(created_at) DESC
      LIMIT ${fetchLimit}
    `);

    const changes = rowsToObjects(result)
      .filter((change) => !isNormalizationNoiseChange(change));

    const listingIds = [...new Set(changes.map((change) => change.listing_id).filter(Boolean))];
    const listingById = new Map();

    if (listingIds.length > 0) {
      const idsSql = listingIds.map((id) => `'${escapeSqlText(id)}'`).join(', ');
      const listingsResult = await turso.execute(`
        SELECT id, title, location, url
        FROM listings_current
        WHERE id IN (${idsSql})
      `);

      for (const row of rowsToObjects(listingsResult)) {
        listingById.set(row.id, row);
      }
    }

    const drops = [];
    for (const change of changes) {
      const diff = parseDiffJson(change.diff_json);
      const priceNumDiff = diff.find((entry) => entry?.field === 'priceNum');
      if (!priceNumDiff) continue;

      const oldPrice = normalizeStoredPrice(priceNumDiff.old);
      const newPrice = normalizeStoredPrice(priceNumDiff.new);
      if (!Number.isFinite(oldPrice) || !Number.isFinite(newPrice) || oldPrice <= 0) continue;

      const delta = newPrice - oldPrice;
      if (delta >= 0) continue;

      const dropAmount = Math.abs(delta);
      const dropPercent = Number(((dropAmount / oldPrice) * 100).toFixed(2));
      const listing = listingById.get(change.listing_id) || {};

      drops.push({
        id: change.id,
        listing_id: change.listing_id,
        title: listing.title || null,
        location: listing.location || null,
        url: listing.url || null,
        oldPrice: Math.round(oldPrice),
        newPrice: Math.round(newPrice),
        dropAmount: Math.round(dropAmount),
        dropPercent,
        created_at: change.created_at
      });
    }

    const sortedDrops = drops
      .sort((a, b) => (b.dropAmount - a.dropAmount) || (b.dropPercent - a.dropPercent));

    const uniqueDrops = [];
    const seenListingIds = new Set();
    for (const drop of sortedDrops) {
      if (!drop.listing_id || seenListingIds.has(drop.listing_id)) continue;
      seenListingIds.add(drop.listing_id);
      uniqueDrops.push(drop);
      if (uniqueDrops.length >= safeLimit) break;
    }

    return uniqueDrops;
  } catch (err) {
    console.error('[dashboard-db] Error fetching top price drops:', err.message);
    return [];
  }
}

/**
 * Get price history for a specific listing
 * @param {any} turso - Turso database connection
 * @param {string} listing_id - Listing ID
 * @returns {Promise<Array>}
 */
export async function getPriceHistory(turso, listing_id) {
  if (!turso) return [];
  
  try {
    const result = await turso.execute(`
      SELECT 
        sr.started_at,
        ls.priceNum,
        ls.price
      FROM listings_snapshot ls
      JOIN scrape_runs sr ON ls.run_id = sr.run_id
      WHERE ls.listing_id = '${listing_id}'
      ORDER BY sr.started_at ASC
      LIMIT 10
    `);
    
    return rowsToObjects(result);
  } catch (err) {
    console.error('[dashboard-db] Error fetching price history:', err.message);
    return [];
  }
}

/**
 * Create watchlist table if needed
 * @param {any} turso - Turso database connection
 */
export async function initWatchlistTable(turso) {
  if (!turso) return;
  
  try {
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        listing_id TEXT NOT NULL UNIQUE,
        siteId TEXT,
        title TEXT,
        added_at TEXT,
        notes TEXT
      )
    `);
  } catch (err) {
    // Table might already exist
  }
}

/**
 * Get watchlist items
 * @param {any} turso - Turso database connection
 * @returns {Promise<Array>}
 */
export async function getWatchlist(turso) {
  if (!turso) return [];
  
  try {
    const result = await turso.execute(`
      SELECT * FROM watchlist ORDER BY added_at DESC
    `);
    
    return rowsToObjects(result);
  } catch (err) {
    console.error('[dashboard-db] Error fetching watchlist:', err.message);
    return [];
  }
}

/**
 * Add to watchlist
 * @param {any} turso - Turso database connection
 * @param {string} listing_id - Listing ID
 * @param {string} siteId - Site ID
 * @param {string} title - Listing title
 * @returns {Promise<void>}
 */
export async function addToWatchlist(turso, listing_id, siteId, title) {
  if (!turso) return;
  
  try {
    const now = new Date().toISOString();
    await turso.execute(`
      INSERT INTO watchlist (listing_id, siteId, title, added_at)
      VALUES ('${listing_id}', '${siteId}', '${title}', '${now}')
      ON CONFLICT(listing_id) DO NOTHING
    `);
  } catch (err) {
    console.error('[dashboard-db] Error adding to watchlist:', err.message);
  }
}

/**
 * Remove from watchlist
 * @param {any} turso - Turso database connection
 * @param {string} listing_id - Listing ID
 * @returns {Promise<void>}
 */
export async function removeFromWatchlist(turso, listing_id) {
  if (!turso) return;
  
  try {
    await turso.execute(`
      DELETE FROM watchlist WHERE listing_id = '${listing_id}'
    `);
  } catch (err) {
    console.error('[dashboard-db] Error removing from watchlist:', err.message);
  }
}
