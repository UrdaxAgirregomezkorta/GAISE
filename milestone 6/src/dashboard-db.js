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
  
  try {
    const result = await turso.execute(`
      SELECT 
        change_id,
        listing_id,
        change_type,
        diff_json,
        created_at
      FROM listing_changes
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    
    return rowsToObjects(result);
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

    // For now, return 0 for change stats since change tracking is new
    // In future runs, these will populate
    const newCount = 0;
    const changedCount = 0;
    const removedCount = 0;

    const avgResult = await turso.execute(`
      SELECT AVG(CAST(priceNum as REAL)) as avg FROM listings_current 
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
      SELECT 
        CASE 
          WHEN priceNum < 100000 THEN '< 100k'
          WHEN priceNum < 200000 THEN '100k - 200k'
          WHEN priceNum < 300000 THEN '200k - 300k'
          WHEN priceNum < 400000 THEN '300k - 400k'
          else '> 400k'
        END as range,
        COUNT(*) as count
      FROM listings_current
      WHERE active = 1 AND priceNum IS NOT NULL
      GROUP BY range
      ORDER BY priceNum
    `);
    
    return rowsToObjects(result);
  } catch (err) {
    console.error('[dashboard-db] Error fetching price distribution:', err.message);
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
