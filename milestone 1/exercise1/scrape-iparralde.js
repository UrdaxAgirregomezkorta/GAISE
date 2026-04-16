const { chromium } = require('playwright');
const crypto = require('crypto');

const START_URL = 'https://inmobiliariaiparralde.com/';
const TARGET_PROPERTY_TYPE_LABEL = 'Piso';
const TARGET_MUNICIPALITY_LABEL = 'Hendaye';

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function deriveStableId(detailUrl) {
  try {
    const url = new URL(detailUrl);
    const match = url.pathname.match(/\/inmueble_detalles\/(\d+)/i);
    if (match) {
      return `inmueble-${match[1]}`;
    }

    const digest = crypto.createHash('sha1').update(url.pathname + url.search).digest('hex').slice(0, 12);
    return `inmueble-${digest}`;
  } catch {
    const digest = crypto.createHash('sha1').update(String(detailUrl || '')).digest('hex').slice(0, 12);
    return `inmueble-${digest}`;
  }
}

async function applyFilters(page) {
  const searchForm = page.locator('form.findus[action*="listado_de_inmuebles"]').first();

  await searchForm.locator('select[name="tipoInmueble[]"]').selectOption({ label: TARGET_PROPERTY_TYPE_LABEL });
  await searchForm.locator('select[name="municipio[]"]').selectOption({ label: TARGET_MUNICIPALITY_LABEL });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    searchForm.locator('button[type="submit"]').click()
  ]);
}

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

      return {
        title,
        price,
        location,
        detailUrl
      };
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

async function scrapeAllPages(page) {
  const scrapingTimestamp = new Date().toISOString();
  const results = [];
  const seenIds = new Set();

  let pageNumber = 1;
  while (true) {
    let pageListings = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
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
        title: listing.title,
        price: listing.price,
        location: listing.location,
        detailUrl: listing.detailUrl,
        scrapingTimestamp
      });
    }

    const nextPageNumber = pageNumber + 1;
    const nextPageLink = page.locator(`.pager li a.page:has-text("${nextPageNumber}")`).first();
    if ((await nextPageLink.count()) === 0) {
      break;
    }

    const firstListingLocator = page
      .locator('.property-list-list a[href*="/inmuebles/inmueble_detalles/"]')
      .first();
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
    } catch {
      await page.waitForTimeout(1500);
    }

    pageNumber = nextPageNumber;
  }

  return results;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });

  try {
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await applyFilters(page);
    await page.waitForTimeout(1500);

    const listings = await scrapeAllPages(page);
    const municipalityRegex = /hendaye|hendaia/i;
    const filteredListings = listings.filter((item) => municipalityRegex.test(item.location));
    const outputListings = filteredListings.length > 0 ? filteredListings : listings;

    console.table(
      outputListings.map((item) => ({
        id: item.id,
        title: item.title,
        price: item.price,
        location: item.location,
        detailUrl: item.detailUrl
      }))
    );

    console.log(JSON.stringify(outputListings, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Scraping failed:', error);
  process.exitCode = 1;
});
