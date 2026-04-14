#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { parseArgs } from 'util';
import { getAdapter, listAdapters } from './src/adapters/index.js';
import { upsertListings, getStatus, syncToTurso, initTursoDb, close } from './src/db.js';
import { trackRunStart, trackRunFinish, detectChanges } from './src/monitoring.js';

const args = process.argv.slice(2);

/**
 * Parse command-line arguments
 */
function parseArguments(args) {
  try {
    const options = {
      site: { type: 'string', short: 's' },
      out: { type: 'string' },
      persist: { type: 'boolean' },
      status: { type: 'boolean' },
      sync: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'max-pages': { type: 'string' },
      filters: { type: 'string', multiple: true }
    };

    const { values } = parseArgs({ args, options, strict: true, allowPositionals: true });
    return values;
  } catch (err) {
    console.error('Error parsing arguments:', err.message);
    showHelp();
    process.exit(1);
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node scrape.js [options]

Options:
  --site <name>              Scraper to use (e.g., iparralde) [required for scraping]
  --out <file>               Save JSON output to file
  --persist                  Persist to SQLite + Turso databases
  --status                   Show database status and exit
  --sync                     Sync all SQLite listings to Turso and exit
  --dry-run                  Print results without persisting
  --max-pages <n>            Limit pagination to N pages
  --filters.propertyType <v> Property type filter (e.g., "Piso")
  --filters.municipality <v> Municipality filter (e.g., "Hendaye")

Examples:
  node scrape.js --site iparralde
  node scrape.js --site iparralde --out listings.json
  node scrape.js --site iparralde --persist
  node scrape.js --status
  node scrape.js --sync
  node scrape.js --site iparralde --filters.propertyType Piso --filters.municipality Hendaye
  node scrape.js --site iparralde --max-pages 2

Available adapters: ${listAdapters().join(', ')}
  `);
}

/**
 * Parse filters from command line
 * @param {Object} values - Parsed arguments
 */
function extractFilters(values) {
  const filters = {};

  // Handle --filters.propertyType and --filters.municipality
  // Note: parseArgs treats dotted keys specially; we need to reconstruct them
  for (const [key, val] of Object.entries(values)) {
    if (key.startsWith('filters.')) {
      const filterName = key.substring(8); // Remove 'filters.'
      filters[filterName] = val;
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

/**
 * Main CLI handler
 */
async function main() {
  try {
    // Show help if no args
    if (args.length === 0) {
      showHelp();
      process.exitCode = 0;
      return;
    }

    const values = parseArguments(args);

    // Handle --status
    if (values.status) {
      const status = await getStatus();
      console.log('\n=== Database Status ===');
      console.log(`Total listings: ${status.totalListings}`);
      console.log(`Database path: ${status.databasePath}`);
      console.log(`Databases: ${status.databases.join(', ')}`);
      if (Object.keys(status.bySite).length > 0) {
        console.log('By site:');
        for (const [site, info] of Object.entries(status.bySite)) {
          console.log(`  ${site}: ${info.count} listings`);
        }
      }
      if (status.firstScraped) {
        console.log(`First scraped: ${status.firstScraped}`);
      }
      if (status.lastScraped) {
        console.log(`Last scraped: ${status.lastScraped}`);
      }
      // Use exitCode instead of process.exit() to avoid Windows libuv issues
      process.exitCode = 0;
      return;
    }

    // Handle --sync
    if (values.sync) {
      console.log('Syncing SQLite listings to Turso...');
      await syncToTurso();
      process.exitCode = 0;
      return;
    }

    // Get site adapter
    if (!values.site) {
      console.error('Error: --site is required for scraping');
      showHelp();
      process.exitCode = 1;
      return;
    }

    const adapter = getAdapter(values.site);
    if (!adapter) {
      console.error(`Error: unknown site "${values.site}"`);
      console.error(`Available: ${listAdapters().join(', ')}`);
      process.exitCode = 1;
      return;
    }

    // Extract filters
    const filters = extractFilters(values) || {}; // Default to empty object

    // Parse max-pages
    const maxPages = values['max-pages'] ? parseInt(values['max-pages'], 10) : null;

    // Scrape
    console.log(`Scraping ${values.site}...`);
    const listings = await adapter({
      filters,
      maxPages
    });

    console.log(`Found ${listings.length} listings`);

    // Output JSON to stdout
    if (!values.out && !values.persist) {
      console.log(JSON.stringify(listings, null, 2));
      process.exitCode = 0;
      return;
    }

    // Save to file if requested
    if (values.out) {
      writeFileSync(values.out, JSON.stringify(listings, null, 2), 'utf-8');
      console.log(`Wrote ${listings.length} listings to ${values.out}`);
    }

    // Persist to databases if requested
    if (values.persist || (!values.out && !values['dry-run'])) {
      if (values['dry-run']) {
        console.log('[dry-run] Would persist to databases (not actually saving)');
        // Still detect and display changes in dry-run mode
        const turso = await initTursoDb();
        const summary = await detectChanges(turso, listings, 0, values.site, true);
        console.log('[dry-run] Change summary:', summary);
      } else {
        console.log('Persisting to databases...');
        
        // Start tracking this run (Milestone 3)
        const turso = await initTursoDb();
        const runId = await trackRunStart(turso, values.site);
        
        // Persist listings (Milestone 2)
        await upsertListings(listings);
        console.log(`Persisted ${listings.length} listings`);
        
        // Detect and record changes (Milestone 3)
        if (runId) {
          const summary = await detectChanges(turso, listings, runId, values.site, false);
          console.log(`[monitoring] Changes: new=${summary.new}, price_changed=${summary.priceChanged}, attributes_changed=${summary.attributesChanged}, removed=${summary.removed}`);
          
          // Finish tracking run
          await trackRunFinish(turso, runId, 'ok', listings.length);
        }
      }
    }

    process.exitCode = 0;
  } catch (err) {
    console.error('Fatal error:', err);
    process.exitCode = 1;
  }
}

main();
