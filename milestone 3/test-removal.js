import { connect } from '@tursodatabase/serverless';
import 'dotenv/config';
import { detectChanges, trackRunStart, trackRunFinish } from './src/monitoring.js';

(async () => {
  const turso = await connect({ 
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN 
  });
  
  console.log('\n=== RUN 4: TESTING REMOVAL (MISS_COUNT >= 2) ===\n');
  
  const listings = [
    {
      id: 'inmueble-813',
      siteId: 'iparralde',
      title: 'Maravillosa villa (REDUCED)',
      price: '545.000,00 €',
      priceNum: 545000,
      location: '64700 Hendaye, FR',
      url: 'https://inmobiliariaiparralde.com/inmuebles/inmueble_detalles/813',
      scrapedAt: new Date().toISOString()
    },
    {
      id: 'inmueble-812',
      siteId: 'iparralde',
      title: 'Gran piso en la mejor zona del Paseo Colón con garaje*',
      price: '495.000,00 €',
      priceNum: 495000,
      location: '20302 Irun, ES',
      url: 'https://inmobiliariaiparralde.com/inmuebles/inmueble_detalles/812',
      scrapedAt: new Date().toISOString()
    }
    // Still missing the other 8
  ];
  
  const runId = await trackRunStart(turso, 'iparralde');
  const summary = await detectChanges(turso, listings, runId, 'iparralde', false);
  await trackRunFinish(turso, runId, 'ok', listings.length);
  
  console.log('Change Summary:');
  console.log(`  Price Changed: ${summary.priceChanged}`);
  console.log(`  Removed: ${summary.removed}`);
  
  const query = 'SELECT listing_id, change_type FROM listing_changes WHERE run_id = ' + runId + ' AND change_type = ' + "'removed'";
  const removals = await turso.execute(query);
  
  console.log('\nRemovals Recorded:');
  if (removals.rows.length > 0) {
    for (const row of removals.rows) {
      console.log(`  ✂️  ${row.listing_id}`);
    }
  } else {
    console.log('  (None marked as removed yet)');
  }
  
  const missCounts = await turso.execute('SELECT id, active, miss_count FROM listings_current WHERE miss_count >= 1 ORDER BY miss_count DESC');
  
  console.log('\nMiss Count Status:');
  for (const row of missCounts.rows) {
    const symbol = row.active ? '🔶' : '🔴';
    console.log(`  ${symbol} ${row.id}: miss_count=${row.miss_count}`);
  }
})();
