import { scrapeIparralde } from './iparralde.js';

/**
 * Registry of available scrapers
 */
const adapters = {
  iparralde: scrapeIparralde
};

/**
 * Get scraper for site
 * @param {string} siteId
 * @returns {Function|null}
 */
export function getAdapter(siteId) {
  return adapters[siteId] || null;
}

/**
 * List available sites
 * @returns {string[]}
 */
export function listAdapters() {
  return Object.keys(adapters);
}
