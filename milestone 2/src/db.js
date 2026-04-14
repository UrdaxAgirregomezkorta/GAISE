import Database from 'better-sqlite3';
import { createClient } from '@tursodatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'apartments.db');

/** @type {Database.Database} */
let localDb = null;

/** @type {any} */
let tursoDb = null;

/**
 * Initialize SQLite database with schema
 */
function initLocalDb() {
  if (localDb) return localDb;

  localDb = new Database(DB_PATH);
  
  // Enable foreign keys
  localDb.pragma('journal_mode = WAL');

  // Create apartments table if it doesn't exist
  localDb.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_apartments_siteId ON apartments(siteId);
    CREATE INDEX IF NOT EXISTS idx_apartments_scrapedAt ON apartments(scrapedAt);
  `);

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

  tursoDb = createClient({ url, authToken: token });

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
  const db = initLocalDb();

  // Normalize price to numeric if not provided
  if (!listing.priceNum && listing.price) {
    const numStr = listing.price.replace(/[^0-9.-]/g, '');
    listing.priceNum = parseInt(numStr, 10) || null;
  }

  // Upsert to SQLite
  const stmt = db.prepare(`
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
  `);

  stmt.run(
    listing.id,
    listing.siteId,
    listing.title,
    listing.price,
    listing.priceNum,
    listing.location,
    listing.url,
    listing.scrapedAt
  );

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
 * Get database status
 * @returns {Promise<Object>}
 */
export async function getStatus() {
  const db = initLocalDb();
  
  // Prepare Turso if available
  const turso = await initTursoDb();

  // Count total listings in SQLite
  const { count: totalLocal } = db.prepare('SELECT COUNT(*) as count FROM apartments').get();

  // Count by site
  const bySiteLocal = db.prepare(`
    SELECT siteId, COUNT(*) as count
    FROM apartments
    GROUP BY siteId
    ORDER BY siteId
  `).all();

  // Get first and last scraped timestamps
  const timestamps = db.prepare(`
    SELECT MIN(scrapedAt) as first, MAX(scrapedAt) as last
    FROM apartments
  `).get();

  const status = {
    totalListings: totalLocal,
    databasePath: DB_PATH,
    databases: [],
    bySite: {}
  };

  // Add SQLite info
  status.databases.push('SQLite (local)');
  if (turso) {
    status.databases.push('Turso (cloud)');
  }

  // Organize by site
  for (const row of bySiteLocal) {
    status.bySite[row.siteId] = {
      count: row.count
    };
  }

  if (timestamps.first) {
    status.firstScraped = timestamps.first;
  }
  if (timestamps.last) {
    status.lastScraped = timestamps.last;
  }

  return status;
}

/**
 * Close both databases
 */
export function close() {
  if (localDb) {
    localDb.close();
    localDb = null;
  }
  // Turso client doesn't need explicit closing
}

export { initLocalDb, initTursoDb };
