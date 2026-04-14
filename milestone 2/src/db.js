import initSqlJs from 'sql.js';
import { connect } from '@tursodatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'apartments.db');

/** @type {any} */
let localDb = null;

/** @type {any} */
let tursoDb = null;

/** @type {boolean} */
let dbInitialized = false;

/**
 * Initialize SQLite database with schema
 */
async function initLocalDb() {
  if (dbInitialized) return localDb;

  const SQL = await initSqlJs();
  
  let data = null;
  if (fs.existsSync(DB_PATH)) {
    data = fs.readFileSync(DB_PATH);
    localDb = new SQL.Database(data);
  } else {
    localDb = new SQL.Database();
  }

  // Create apartments table if it doesn't exist
  localDb.run(`
    CREATE TABLE IF NOT EXISTS apartments (
      id TEXT PRIMARY KEY,
      siteId TEXT NOT NULL,
      title TEXT,
      price TEXT,
      priceNum INTEGER,
      location TEXT,
      url TEXT,
      scrapedAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  localDb.run(`
    CREATE INDEX IF NOT EXISTS idx_apartments_siteId ON apartments(siteId);
  `);

  localDb.run(`
    CREATE INDEX IF NOT EXISTS idx_apartments_scrapedAt ON apartments(scrapedAt);
  `);

  dbInitialized = true;
  console.log(`[db] SQLite initialized at ${DB_PATH}`);
  return localDb;
}

/**
 * Initialize Turso (cloud) database
 */
async function initTursoDb() {
  if (tursoDb) return tursoDb;

  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  if (!url || !token) {
    console.warn('[db] Turso credentials not found; skipping cloud DB');
    return null;
  }

  tursoDb = await connect({ url, authToken: token });

  try {
    await tursoDb.execute(`
      CREATE TABLE IF NOT EXISTS apartments (
        id TEXT PRIMARY KEY,
        siteId TEXT NOT NULL,
        title TEXT,
        price TEXT,
        priceNum INTEGER,
        location TEXT,
        url TEXT,
        scrapedAt TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      );
    `);

    await tursoDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_apartments_siteId ON apartments(siteId);
    `);

    await tursoDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_apartments_scrapedAt ON apartments(scrapedAt);
    `);

    console.log('[db] Turso initialized');
  } catch (err) {
    console.error('[db] Turso initialization failed:', err.message);
    tursoDb = null;
  }

  return tursoDb;
}

/**
 * Upsert a single listing to both databases
 * @param {import('./types.js').Listing} listing
 */
export async function upsertListing(listing) {
  const db = await initLocalDb();

  // Normalize price to numeric if not provided
  if (!listing.priceNum && listing.price) {
    const numStr = listing.price.replace(/[^0-9.-]/g, '');
    listing.priceNum = parseInt(numStr, 10) || null;
  }

  // Upsert to SQLite using sql.js
  const stmt = `
    INSERT INTO apartments (id, siteId, title, price, priceNum, location, url, scrapedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      price = excluded.price,
      priceNum = excluded.priceNum,
      location = excluded.location,
      url = excluded.url,
      scrapedAt = excluded.scrapedAt,
      updatedAt = datetime('now')
  `;

  db.run(stmt, [
    listing.id,
    listing.siteId,
    listing.title,
    listing.price,
    listing.priceNum,
    listing.location,
    listing.url,
    listing.scrapedAt
  ]);

  // Save to disk
  saveLocalDb();

  // Upsert to Turso if available
  if (tursoDb) {
    try {
      await tursoDb.execute({
        sql: `
          INSERT INTO apartments (id, siteId, title, price, priceNum, location, url, scrapedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            price = excluded.price,
            priceNum = excluded.priceNum,
            location = excluded.location,
            url = excluded.url,
            scrapedAt = excluded.scrapedAt,
            updatedAt = datetime('now')
        `,
        args: [
          listing.id,
          listing.siteId,
          listing.title,
          listing.price,
          listing.priceNum,
          listing.location,
          listing.url,
          listing.scrapedAt
        ]
      });
    } catch (err) {
      console.error('[db] Turso upsert failed:', err.message);
    }
  }
}

/**
 * Upsert multiple listings
 * @param {import('./types.js').Listing[]} listings
 */
export async function upsertListings(listings) {
  for (const listing of listings) {
    await upsertListing(listing);
  }
}

/**
 * Save database to file
 */
function saveLocalDb() {
  if (!localDb) return;
  const data = localDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Get database status
 * @returns {Promise<Object>}
 */
export async function getStatus() {
  const db = await initLocalDb();
  
  // Prepare Turso if available
  const turso = await initTursoDb();

  // Count total listings in SQLite
  const countResult = db.exec('SELECT COUNT(*) as count FROM apartments');
  const totalLocal = countResult.length > 0 ? countResult[0].values[0][0] : 0;

  // Count by site
  const bySiteResult = db.exec(`
    SELECT siteId, COUNT(*) as count
    FROM apartments
    GROUP BY siteId
    ORDER BY siteId
  `);

  // Get first and last scraped timestamps
  const timestampsResult = db.exec(`
    SELECT MIN(scrapedAt) as first, MAX(scrapedAt) as last
    FROM apartments
  `);

  const status = {
    totalListings: totalLocal,
    databasePath: DB_PATH,
    databases: [],
    bySite: {}
  };

  // Add database info
  status.databases.push('SQLite (local)');
  if (turso) {
    status.databases.push('Turso (cloud)');
  }

  // Organize by site
  if (bySiteResult.length > 0 && bySiteResult[0].values.length > 0) {
    for (const row of bySiteResult[0].values) {
      status.bySite[row[0]] = {
        count: row[1]
      };
    }
  }

  if (timestampsResult.length > 0 && timestampsResult[0].values.length > 0) {
    const first = timestampsResult[0].values[0][0];
    const last = timestampsResult[0].values[0][1];
    if (first) status.firstScraped = first;
    if (last) status.lastScraped = last;
  }

  return status;
}

/**
 * Close both databases
 */
export function close() {
  if (localDb) {
    saveLocalDb();
    localDb = null;
  }
  // Turso client doesn't need explicit closing
}

export { initLocalDb, initTursoDb };
