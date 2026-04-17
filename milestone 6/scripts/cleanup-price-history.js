#!/usr/bin/env node

import 'dotenv/config';
import { initTursoDb } from '../src/db.js';
import { normalizePrice } from '../src/monitoring.js';
import { isNormalizationNoiseChange } from '../src/dashboard-db.js';

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--apply');

function rowsToObjects(result) {
  if (!result?.rows) return [];
  const columns = result.columns || [];

  return result.rows.map((row) => {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      obj[col] = row?.[col] ?? row?.[i] ?? null;
    }
    return obj;
  });
}

function parseDiffJson(diffJson) {
  if (!diffJson) return [];
  try {
    const parsed = JSON.parse(diffJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escapeSqlString(text) {
  return String(text).replace(/'/g, "''");
}

function printHelp() {
  console.log(`
Usage:
  node scripts/cleanup-price-history.js [--apply]

Modes:
  default       Dry-run (no writes)
  --apply       Apply updates and deletes
`);
}

async function recalcPriceNumForTable(turso, tableName, idColumn) {
  const result = await turso.execute(`
    SELECT ${idColumn} as row_id, price, priceNum
    FROM ${tableName}
    WHERE price IS NOT NULL
  `);

  const rows = rowsToObjects(result);
  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;

  for (const row of rows) {
    scanned++;
    const normalized = normalizePrice(row.price);
    if (normalized === null) continue;

    const current = Number(row.priceNum);
    const hasCurrent = Number.isFinite(current);
    if (hasCurrent && current === normalized) continue;

    wouldUpdate++;
    if (!dryRun) {
      const rowId = row.row_id;
      const whereValue = Number.isInteger(Number(rowId)) && String(rowId) === String(Number(rowId))
        ? String(Number(rowId))
        : `'${escapeSqlString(rowId)}'`;

      await turso.execute(`
        UPDATE ${tableName}
        SET priceNum = ${normalized}
        WHERE ${idColumn} = ${whereValue}
      `);
      updated++;
    }
  }

  return {
    tableName,
    scanned,
    wouldUpdate,
    updated
  };
}

async function cleanupListingChanges(turso) {
  const result = await turso.execute(`
    SELECT change_id, change_type, diff_json
    FROM listing_changes
    WHERE change_type = 'price_changed'
  `);

  const rows = rowsToObjects(result);
  const deleteIds = [];
  let scanned = 0;
  let wouldDelete = 0;
  let deleted = 0;
  let wouldFixDiff = 0;
  let fixedDiff = 0;

  for (const row of rows) {
    scanned++;

    if (isNormalizationNoiseChange(row)) {
      const idNum = Number(row.change_id);
      if (Number.isFinite(idNum)) {
        deleteIds.push(idNum);
        wouldDelete++;
      }
      continue;
    }

    const diff = parseDiffJson(row.diff_json);
    if (!diff.length) continue;

    const priceEntry = diff.find((d) => d?.field === 'price');
    const priceNumEntry = diff.find((d) => d?.field === 'priceNum');
    if (!priceEntry || !priceNumEntry) continue;

    const parsedOld = normalizePrice(priceEntry.old);
    const parsedNew = normalizePrice(priceEntry.new);
    if (parsedOld === null || parsedNew === null) continue;

    let changed = false;
    if (Number(priceNumEntry.old) !== parsedOld) {
      priceNumEntry.old = parsedOld;
      changed = true;
    }
    if (Number(priceNumEntry.new) !== parsedNew) {
      priceNumEntry.new = parsedNew;
      changed = true;
    }

    if (changed) {
      wouldFixDiff++;
      if (!dryRun) {
        const diffJson = escapeSqlString(JSON.stringify(diff));
        await turso.execute(`
          UPDATE listing_changes
          SET diff_json = '${diffJson}'
          WHERE change_id = ${Number(row.change_id)}
        `);
        fixedDiff++;
      }
    }
  }

  if (!dryRun && deleteIds.length > 0) {
    await turso.execute(`
      DELETE FROM listing_changes
      WHERE change_id IN (${deleteIds.join(',')})
    `);
    deleted = deleteIds.length;
  }

  return {
    scanned,
    wouldDelete,
    deleted,
    wouldFixDiff,
    fixedDiff
  };
}

async function main() {
  if (args.has('--help') || args.has('-h')) {
    printHelp();
    return;
  }

  console.log(`[cleanup] Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  const turso = await initTursoDb();
  if (!turso) {
    console.error('[cleanup] Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
    process.exitCode = 1;
    return;
  }

  const tableSummaries = [];
  tableSummaries.push(await recalcPriceNumForTable(turso, 'listings_current', 'id'));
  tableSummaries.push(await recalcPriceNumForTable(turso, 'listings_snapshot', 'snapshot_id'));
  tableSummaries.push(await recalcPriceNumForTable(turso, 'apartments', 'id'));

  const changeSummary = await cleanupListingChanges(turso);

  console.log('\n[cleanup] PriceNum recalculation summary');
  for (const summary of tableSummaries) {
    console.log(`- ${summary.tableName}: scanned=${summary.scanned}, wouldUpdate=${summary.wouldUpdate}, updated=${summary.updated}`);
  }

  console.log('\n[cleanup] listing_changes summary');
  console.log(`- scanned=${changeSummary.scanned}`);
  console.log(`- wouldDeleteNoise=${changeSummary.wouldDelete}, deletedNoise=${changeSummary.deleted}`);
  console.log(`- wouldFixDiff=${changeSummary.wouldFixDiff}, fixedDiff=${changeSummary.fixedDiff}`);

  if (dryRun) {
    console.log('\n[cleanup] Dry-run finished. Re-run with --apply to persist changes.');
  } else {
    console.log('\n[cleanup] Apply finished.');
  }
}

main().catch((err) => {
  console.error('[cleanup] Failed:', err.message);
  process.exitCode = 1;
});
