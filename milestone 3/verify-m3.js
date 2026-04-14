import initSqlJs from 'sql.js';
import fs from 'fs';
import { connect } from '@tursodatabase/serverless';
import 'dotenv/config';

(async () => {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  
  if (!url || !token) {
    console.log('❌ No Turso credentials');
    return;
  }

  const turso = await connect({ url, authToken: token });
  
  console.log('\n=== MILESTONE 3 VERIFICATION ===\n');
  
  // Check scrape_runs table
  const runs = await turso.execute('SELECT COUNT(*) as count FROM scrape_runs');
  console.log('📊 Scrape Runs:', runs.rows[0].count);
  
  // Check listings_current
  const current = await turso.execute('SELECT COUNT(*) as count FROM listings_current');
  console.log('📍 Listings Current:', current.rows[0].count);
  
  // Check listings_snapshot
  const snapshots = await turso.execute('SELECT COUNT(*) as count FROM listings_snapshot');
  console.log('📸 Snapshots:', snapshots.rows[0].count);
  
  // Check listing_changes
  const changes = await turso.execute('SELECT COUNT(*) as count FROM listing_changes');
  console.log('🔄 Changes Recorded:', changes.rows[0].count);
  
  // Show last run
  const lastRun = await turso.execute(
    'SELECT run_id, siteId, started_at, listings_found, status FROM scrape_runs ORDER BY run_id DESC LIMIT 1'
  );
  
  if (lastRun.rows.length > 0) {
    const run = lastRun.rows[0];
    console.log(`\n✅ Last Run: ID=${run.run_id}, Site=${run.siteId}, Found=${run.listings_found}, Status=${run.status}`);
  } else {
    console.log('\n⚠️ No scrape runs recorded yet');
  }
  
  // Show change summary
  const changeSummary = await turso.execute(
    'SELECT change_type, COUNT(*) as count FROM listing_changes GROUP BY change_type'
  );
  
  console.log('\n📈 Changes by Type:');
  if (changeSummary.rows.length > 0) {
    for (const row of changeSummary.rows) {
      console.log(`  ${row.change_type}: ${row.count}`);
    }
  } else {
    console.log('  (No changes yet)');
  }
  
  // Show active vs removed listings
  const activeInactive = await turso.execute(
    'SELECT active, COUNT(*) as count FROM listings_current GROUP BY active'
  );
  
  console.log('\n👥 Listings Status:');
  for (const row of activeInactive.rows) {
    const status = row.active ? 'Active' : 'Removed';
    console.log(`  ${status}: ${row.count}`);
  }
})();
