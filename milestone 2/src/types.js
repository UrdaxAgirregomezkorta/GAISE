/**
 * @typedef {Object} Listing
 * @property {string} id - Stable listing ID
 * @property {string} siteId - Source site identifier (e.g., 'iparralde')
 * @property {string} title - Property title/description
 * @property {string} price - Raw price string (e.g., "249,500 €")
 * @property {number} [priceNum] - Normalized numeric price
 * @property {string} location - Location/municipality
 * @property {string} url - Full detail URL
 * @property {string} scrapedAt - ISO timestamp of scrape
 * @property {string} [createdAt] - Record creation timestamp
 * @property {string} [updatedAt] - Record update timestamp
 */

/**
 * @typedef {Object} ScrapeOptions
 * @property {string} site - Site adapter to use (e.g., 'iparralde')
 * @property {string} [out] - Output file path (if specified, save JSON)
 * @property {boolean} [persist] - Persist to databases (SQLite + Turso)
 * @property {boolean} [status] - Show database status and exit
 * @property {boolean} [dryRun] - Print changes without persisting
 * @property {number} [maxPages] - Limit pagination to N pages
 * @property {Object} [filters] - Site-specific filters (e.g., { propertyType, municipality })
 */

export {};
