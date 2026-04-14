# Milestone 2 — Persist Scraped Data to SQLite/Turso

This milestone adds persistent storage of scraped real estate listings to both local SQLite and cloud-hosted Turso databases.

## Features

- **Local SQLite**: apartments.db with automatic schema creation and upsert logic.
- **Cloud Turso**: Optional cloud backup using @tursodatabase/serverless.
- **CLI Interface**: Flexible command-line options for scraping, filtering, and database management.
- **Deduplication**: Upsert by ID prevents duplicate rows on repeated runs.

## Setup

### Install Dependencies

```bash
cd milestone\ 2
npm install
```

### Configure Turso (Optional)

1. Create a free account at https://turso.tech
2. Create a new SQLite database (e.g., "real_estate")
3. Create a database token with Read & Write permissions
4. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
# Edit .env with your TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
```

If Turso credentials are not provided, the scraper will work with SQLite only.

## Usage

### Output JSON to stdout

```bash
node scrape.js --site iparralde
```

### Save JSON to file

```bash
node scrape.js --site iparralde --out listings.json
```

### Scrape and persist to databases

```bash
node scrape.js --site iparralde --persist
```

### Check database status

```bash
node scrape.js --status
```

Output:
```
=== Database Status ===
Total listings: 14
Database path: /path/to/apartments.db
Databases: SQLite (local), Turso (cloud)
By site:
  iparralde: 14 listings
First scraped: 2026-03-31T14:42:00.718Z
Last scraped: 2026-03-31T14:42:00.718Z
```

### With custom filters

```bash
node scrape.js --site iparralde \
  --filters.propertyType Piso \
  --filters.municipality Hendaye
```

### Limit pagination

```bash
node scrape.js --site iparralde --max-pages 2
```

## Database Schema

```sql
CREATE TABLE apartments (
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

CREATE INDEX idx_apartments_siteId ON apartments(siteId);
CREATE INDEX idx_apartments_scrapedAt ON apartments(scrapedAt);
```

## Acceptance Tests

1. **No duplicates**: Run scrape twice with `--persist` → row count stays stable.
2. **Database accessible**: Open apartments.db with any SQLite client.
3. **Turso sync**: With Turso configured, verify data appears in cloud console.

## Next Steps

- **Milestone 3**: Add change detection and audit trail (new/changed/removed listings).
- **Milestone 4**: Send Telegram notifications on new listings or price changes.
