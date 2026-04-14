import { chromium } from 'playwright';
import crypto from 'crypto';

const START_URL = 'https://inmobiliariaiparralde.com/';
const DEFAULT_FILTERS = {
  propertyType: 'Piso',
  municipality: 'Hendaye'
};

/**
 * Derive stable ID from URL
 * @param {string} detailUrl
 * @returns {string}
 */
function deriveStableId(detailUrl) {
  try {
    const url = new URL(detailUrl);
    const match = url.pathname.match(/\/inmueble_detalles\/(\d+)/i);
    if (match) {
      return `inmueble-${match[1]}`;
    }
  } catch (e) {
    // fall through to hash-based ID
  }

  const digest = crypto.createHash('sha1').update(detailUrl || '').digest('hex').slice(0, 12);
  return `inmueble-${digest}`;
}

/**
 * Normalize text (trim, collapse spaces)
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Apply filters to search form
 * @param {any} page - Playwright page
 * @param {Object} filters - { propertyType, municipality }
 */
async function applyFilters(page, filters = {}) {
  // Ensure filters object exists
  if (!filters || typeof filters !== 'object') {
    console.warn('[iparralde] Invalid filters object');
    return;
  }

  // Check if search form exists
  const searchForm = page.locator('form.findus[action*="listado_de_inmuebles"]').first();
  const formExists = await searchForm.count().catch(() => 0) > 0;

  if (!formExists) {
    console.warn('[iparralde] Search form not found; skipping filter application');
    return;
  }

  try {
    if (filters.propertyType) {
      const typeSelect = searchForm.locator('select[name="tipoInmueble[]"]');
      if (await typeSelect.count() > 0) {
        await typeSelect.selectOption({ label: filters.propertyType });
      }
    }

    if (filters.municipality) {
      const muniSelect = searchForm.locator('select[name="municipio[]"]');
      if (await muniSelect.count() > 0) {
        await muniSelect.selectOption({ label: filters.municipality });
      }
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
      searchForm.locator('button[type="submit"]').click()
    ]);
  } catch (err) {
    console.warn('[iparralde] Filter application failed:', err.message);
  }
}

/**
 * Extract listings from current page
 * @param {any} page - Playwright page
 * @returns {Promise<Array>}
 */
async function extractCurrentPageListings(page) {
  const items = await page.evaluate(() => {
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const cards = [...document.querySelectorAll('.property-list-list')];

    return cards.map((card) => {
      const detailAnchors = [...card.querySelectorAll('a[href*="/inmuebles/inmueble_detalles/"]')];
      const detailUrl = detailAnchors.length > 0 ? detailAnchors[0].href : '';

      const titleFromHeading = card.querySelector('h3')?.textContent || '';
      const titleFromLink = detailAnchors
        .map((a) => normalize(a.textContent))
        .find((text) => text && !/ver detalles/i.test(text)) || '';
      const title = normalize(titleFromHeading) || titleFromLink;

      const location = normalize(card.querySelector('.property-list-list-info p')?.textContent || '');
      const price = normalize(card.querySelector('.price')?.textContent || '');

      return { title, price, location, detailUrl };
    });
  });

  return items
    .map((item) => ({
      title: normalizeText(item.title),
      price: normalizeText(item.price),
      location: normalizeText(item.location),
      detailUrl: item.detailUrl
    }))
    .filter((item) => item.detailUrl);
}

/**
 * Scrape all pages from site
 * @param {any} page - Playwright page
 * @param {number} maxPages - Max pages to scrape (null = all)
 * @returns {Promise<Array>}
 */
async function scrapeAllPages(page, maxPages = null) {
  const scrapingTimestamp = new Date().toISOString();
  const results = [];
  const seenIds = new Set();

  let pageNumber = 1;
  while (true) {
    if (maxPages && pageNumber > maxPages) {
      break;
    }

    let pageListings = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      pageListings = await extractCurrentPageListings(page);
      if (pageListings.length > 0) {
        break;
      }
      await page.waitForTimeout(1500);
      if (attempt === 2 && pageNumber === 1) {
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
    }

    if (pageListings.length === 0) {
      break;
    }

    for (const listing of pageListings) {
      const stableId = deriveStableId(listing.detailUrl);
      if (seenIds.has(stableId)) {
        continue;
      }

      seenIds.add(stableId);
      results.push({
        id: stableId,
        siteId: 'iparralde',
        title: listing.title,
        price: listing.price,
        location: listing.location,
        url: listing.detailUrl,
        scrapedAt: scrapingTimestamp
      });
    }

    // Try to go to next page
    const nextPageNumber = pageNumber + 1;
    const nextPageLink = page.locator(`.pager li a.page:has-text("${nextPageNumber}")`).first();
    if ((await nextPageLink.count()) === 0) {
      break;
    }

    const firstListingLocator = page.locator('.property-list-list a[href*="/inmuebles/inmueble_detalles/"]').first();
    let firstListingHrefBefore = null;
    if ((await firstListingLocator.count()) > 0) {
      firstListingHrefBefore = await firstListingLocator.getAttribute('href');
    }

    await nextPageLink.click();

    try {
      if (firstListingHrefBefore) {
        await page.waitForFunction(
          (previousHref) => {
            const currentHref = document
              .querySelector('.property-list-list a[href*="/inmuebles/inmueble_detalles/"]')
              ?.getAttribute('href');
            return Boolean(currentHref && previousHref && currentHref !== previousHref);
          },
          firstListingHrefBefore,
          { timeout: 10000 }
        );
      } else {
        await page.waitForSelector('.property-list-list', { timeout: 10000, state: 'attached' });
      }
    } catch (err) {
      await page.waitForTimeout(1500);
    }

    pageNumber = nextPageNumber;
  }

  return results;
}

/**
 * Main scrape function for iparralde
 * @param {Object} options - { filters, maxPages }
 * @returns {Promise<Array>}
 */
export async function scrapeIparralde(options = {}) {
  const { filters = DEFAULT_FILTERS, maxPages = null } = options;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });

  try {
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await applyFilters(page, filters);
    await page.waitForTimeout(1500);

    const listings = await scrapeAllPages(page, maxPages);

    // Filter by normalized municipality if provided
    if (filters.municipality) {
      const municipalityRegex = new RegExp(filters.municipality, 'i');
      const filtered = listings.filter((item) => municipalityRegex.test(item.location));
      return filtered.length > 0 ? filtered : listings;
    }

    return listings;
  } finally {
    await browser.close();
  }
}
