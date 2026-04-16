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
        change_id,
        listing_id as id,
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

    // For now, return 0 for change stats since change tracking is new
    // In future runs, these will populate
    const newCount = 0;
    const changedCount = 0;
    const removedCount = 0;

    const avgResult = await turso.execute(`
      SELECT AVG(CAST(priceNum as REAL)) as avg FROM listings_current 
      WHERE active = 1 AND priceNum IS NOT NULL
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
    
    return result.rows || [];
  } catch (err) {
    console.error('[dashboard-db] Error fetching price distribution:', err.message);
    return [];
  }
}
