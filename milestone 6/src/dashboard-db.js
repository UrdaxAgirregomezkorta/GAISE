/**
 * Dashboard database queries module
 * Read-only queries for the web dashboard
 */

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
    
    return result.rows || [];
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
        id,
        change_type,
        diff_json,
        created_at
      FROM listing_changes
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    
    return result.rows || [];
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
    const totalActive = activeResult.rows?.[0]?.total || 0;

    const newResult = await turso.execute(`
      SELECT COUNT(*) as total FROM listing_changes 
      WHERE change_type = 'new'
      AND created_at > datetime('now', '-1 day')
    `);
    const newCount = newResult.rows?.[0]?.total || 0;

    const changedResult = await turso.execute(`
      SELECT COUNT(*) as total FROM listing_changes 
      WHERE change_type IN ('price_changed', 'attributes_changed')
      AND created_at > datetime('now', '-1 day')
    `);
    const changedCount = changedResult.rows?.[0]?.total || 0;

    const removedResult = await turso.execute(`
      SELECT COUNT(*) as total FROM listing_changes 
      WHERE change_type = 'removed'
      AND created_at > datetime('now', '-1 day')
    `);
    const removedCount = removedResult.rows?.[0]?.total || 0;

    const avgResult = await turso.execute(`
      SELECT AVG(CAST(price_num as REAL)) as avg FROM listings_current 
      WHERE active = 1 AND price_num IS NOT NULL
    `);
    const avgPrice = Math.round(avgResult.rows?.[0]?.avg || 0);

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
          WHEN price_num < 100000 THEN '< 100k'
          WHEN price_num < 200000 THEN '100k - 200k'
          WHEN price_num < 300000 THEN '200k - 300k'
          WHEN price_num < 400000 THEN '300k - 400k'
          else '> 400k'
        END as range,
        COUNT(*) as count
      FROM listings_current
      WHERE active = 1 AND price_num IS NOT NULL
      GROUP BY range
      ORDER BY price_num
    `);
    
    return result.rows || [];
  } catch (err) {
    console.error('[dashboard-db] Error fetching price distribution:', err.message);
    return [];
  }
}
