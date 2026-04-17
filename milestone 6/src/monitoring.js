/**
 * Monitoring module - Change detection and audit trail
 * Tracks what changed between scrape runs
 */

const MAX_MISS_COUNT = 2; // Mark removed after 2 consecutive misses

/**
 * Start a new scrape run and return run_id
 * @param {any} turso - Turso database connection
 * @param {string} siteId - Site identifier
 * @returns {Promise<number>} - run_id
 */
export async function trackRunStart(turso, siteId) {
  if (!turso) return null;

  try {
    const now = new Date().toISOString();
    const query = `
      INSERT INTO scrape_runs (siteId, started_at, listings_found, status)
      VALUES ('${siteId}', '${now}', 0, 'in_progress')
    `;
    await turso.execute(query);

    // Get the inserted run_id
    const result = await turso.execute(`
      SELECT MAX(run_id) as last_id FROM scrape_runs WHERE siteId = '${siteId}'
    `);
    
    if (result && result.rows && result.rows.length > 0) {
      return result.rows[0].last_id;
    }
  } catch (err) {
    console.error('[monitoring] Failed to track run start:', err.message);
  }

  return null;
}

/**
 * Finish tracking a scrape run
 * @param {any} turso - Turso database connection
 * @param {number} run_id - Run ID
 * @param {string} status - 'ok', 'partial', or 'failed'
 * @param {number} listingsFound - Count of listings found
 * @returns {Promise<void>}
 */
export async function trackRunFinish(turso, run_id, status, listingsFound) {
  if (!turso || !run_id) return;

  try {
    const now = new Date().toISOString();
    const query = `
      UPDATE scrape_runs 
      SET finished_at = '${now}', status = '${status}', listings_found = ${listingsFound}
      WHERE run_id = ${run_id}
    `;
    await turso.execute(query);
  } catch (err) {
    console.error('[monitoring] Failed to track run finish:', err.message);
  }
}

/**
 * Normalize price to integer
 * @param {string} price - Raw price string
 * @returns {number} - Normalized price
 */
export function normalizePrice(price) {
  if (!price) return null;

  // Parse European price format, e.g. "16.000,00 €" -> 16000
  let cleaned = String(price).replace(/[^0-9,.-]/g, '').trim();
  if (!cleaned) return null;

  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').split(',')[0];
  } else {
    cleaned = cleaned.replace(/\./g, '');
  }

  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

/**
 * Normalize text fields (trim and collapse spaces)
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Detect changes between current and previous listing state
 * @param {any} listing - Current listing from scraper
 * @param {any} previous - Previous state from listings_current (or null if new)
 * @returns {Object} - { changeType, diffJson }
 */
export function detectChange(listing, previous) {
  if (!previous) {
    return {
      changeType: 'new',
      diffJson: null
    };
  }

  const changes = [];

  // Check price change
  const newPriceNum = normalizePrice(listing.price);
  const oldPriceNum = previous.priceNum;
  if (newPriceNum !== oldPriceNum) {
    changes.push({
      field: 'priceNum',
      old: oldPriceNum,
      new: newPriceNum
    });
    changes.push({
      field: 'price',
      old: previous.price,
      new: listing.price
    });
  }

  // Check attribute changes (normalized comparison)
  const normalizedFields = ['title', 'location'];
  for (const field of normalizedFields) {
    const newVal = normalizeText(listing[field] || '');
    const oldVal = normalizeText(previous[field] || '');
    if (newVal !== oldVal) {
      changes.push({
        field,
        old: oldVal || null,
        new: newVal || null
      });
    }
  }

  if (changes.length === 0) {
    return {
      changeType: 'unchanged',
      diffJson: null
    };
  }

  // Determine primary change type
  const hasPrice = changes.some(c => c.field === 'priceNum');
  const changeType = hasPrice ? 'price_changed' : 'attributes_changed';

  return {
    changeType,
    diffJson: JSON.stringify(changes)
  };
}

/**
 * Process scraped listings and detect changes
 * @param {any} turso - Turso connection
 * @param {Array} currentListings - Current scraped listings
 * @param {number} run_id - Current run ID
 * @param {string} siteId - Site identifier
 * @param {boolean} dryRun - If true, don't write to DB
 * @returns {Promise<Object>} - Summary of changes
 */
export async function detectChanges(turso, currentListings, run_id, siteId, dryRun = false) {
  if (!turso || !run_id) {
    return { new: 0, changed: 0, removed: 0 };
  }

  const summary = {
    new: 0,
    priceChanged: 0,
    attributesChanged: 0,
    removed: 0,
    unchanged: 0
  };

  try {
    // Get current state from DB
    const previousStates = await turso.execute(`
      SELECT * FROM listings_current WHERE siteId = '${siteId}'
    `);

    const previousMap = new Map();
    if (previousStates && previousStates.rows) {
      for (const row of previousStates.rows) {
        previousMap.set(row.id, {
          id: row.id,
          title: row.title,
          price: row.price,
          priceNum: row.priceNum,
          location: row.location,
          url: row.url,
          active: row.active,
          missCount: row.miss_count,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen
        });
      }
    }

    const now = new Date().toISOString();
    const seenIds = new Set();

    // Process current listings
    for (const listing of currentListings) {
      seenIds.add(listing.id);
      const previous = previousMap.get(listing.id);
      const { changeType, diffJson } = detectChange(listing, previous);

      // Create snapshot
      if (!dryRun) {
        await createSnapshot(turso, run_id, listing);
      }

      // Track change
      if (changeType !== 'unchanged') {
        if (!dryRun) {
          await recordChange(turso, run_id, listing.id, changeType, diffJson);
        }

        if (changeType === 'new') summary.new++;
        else if (changeType === 'price_changed') summary.priceChanged++;
        else if (changeType === 'attributes_changed') summary.attributesChanged++;
      } else {
        summary.unchanged++;
      }

      // Update or insert listings_current
      if (!dryRun) {
        await upsertCurrentListing(turso, listing, siteId, previous, now);
      }
    }

    // Handle removed listings (check miss count)
    for (const [id, previous] of previousMap.entries()) {
      if (!seenIds.has(id)) {
        const newMissCount = (previous.missCount || 0) + 1;

        if (!dryRun) {
          if (newMissCount >= MAX_MISS_COUNT) {
            // Mark as removed
            await recordChange(turso, run_id, id, 'removed', null);
            await markListingRemoved(turso, id);
            summary.removed++;
          } else {
            // Increment miss count
            await updateMissCount(turso, id, newMissCount);
          }
        } else {
          if (newMissCount >= MAX_MISS_COUNT) {
            summary.removed++;
          }
        }
      }
    }

    return summary;
  } catch (err) {
    console.error('[monitoring] Change detection failed:', err.message);
    return summary;
  }
}

/**
 * Create immutable snapshot of listing in this run
 */
async function createSnapshot(turso, run_id, listing) {
  try {
    const query = `
      INSERT INTO listings_snapshot (run_id, listing_id, title, price, priceNum, location, url, scrapedAt)
      VALUES (${run_id}, '${listing.id}', '${listing.title}', '${listing.price}', ${listing.priceNum || 'NULL'}, '${listing.location}', '${listing.url}', '${listing.scrapedAt}')
    `;
    await turso.execute(query);
  } catch (err) {
    console.error(`[monitoring] Failed to create snapshot for ${listing.id}:`, err.message);
  }
}

/**
 * Record a change event
 */
async function recordChange(turso, run_id, listing_id, changeType, diffJson) {
  try {
    const now = new Date().toISOString();
    const diffStr = diffJson ? `'${diffJson.replace(/'/g, "''")}'` : 'NULL';
    const query = `
      INSERT INTO listing_changes (run_id, listing_id, change_type, diff_json, created_at)
      VALUES (${run_id}, '${listing_id}', '${changeType}', ${diffStr}, '${now}')
    `;
    await turso.execute(query);
  } catch (err) {
    console.error(`[monitoring] Failed to record change for ${listing_id}:`, err.message);
  }
}

/**
 * Insert or update listings_current
 */
async function upsertCurrentListing(turso, listing, siteId, previous, now) {
  try {
    const firstSeen = previous ? previous.firstSeen : now;
    const priceNum = normalizePrice(listing.price);

    if (previous) {
      // Update
      const query = `
        UPDATE listings_current
        SET title = '${listing.title}',
            price = '${listing.price}',
            priceNum = ${priceNum || 'NULL'},
            location = '${listing.location}',
            url = '${listing.url}',
            last_seen = '${now}',
            active = 1,
            miss_count = 0
        WHERE id = '${listing.id}'
      `;
      await turso.execute(query);
    } else {
      // Insert
      const query = `
        INSERT INTO listings_current (id, siteId, title, price, priceNum, location, url, active, miss_count, first_seen, last_seen)
        VALUES ('${listing.id}', '${siteId}', '${listing.title}', '${listing.price}', ${priceNum || 'NULL'}, '${listing.location}', '${listing.url}', 1, 0, '${firstSeen}', '${now}')
      `;
      await turso.execute(query);
    }
  } catch (err) {
    console.error(`[monitoring] Failed to upsert listing ${listing.id}:`, err.message);
  }
}

/**
 * Mark listing as removed
 */
async function markListingRemoved(turso, listing_id) {
  try {
    const query = `
      UPDATE listings_current
      SET active = 0
      WHERE id = '${listing_id}'
    `;
    await turso.execute(query);
  } catch (err) {
    console.error(`[monitoring] Failed to mark removed:`, err.message);
  }
}

/**
 * Increment miss count for a listing
 */
async function updateMissCount(turso, listing_id, newCount) {
  try {
    const query = `
      UPDATE listings_current
      SET miss_count = ${newCount}
      WHERE id = '${listing_id}'
    `;
    await turso.execute(query);
  } catch (err) {
    console.error(`[monitoring] Failed to update miss count:`, err.message);
  }
}
