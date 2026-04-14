import { connect } from '@tursodatabase/serverless';
import 'dotenv/config';
import { detectChanges, trackRunStart, trackRunFinish } from './src/monitoring.js';

(async () => {
  const url = process.env.TURSO_DATABASE_URL;
  const token = process.env.TURSO_AUTH_TOKEN;
  
  if (!url || !token) {
    console.log('❌ No Turso credentials');
    return;
  }

  const turso = await connect({ url, authToken: token });
  
  console.log('\n=== TESTING CHANGE DETECTION ===\n');
  
  // Simulate scraped data with changes
  const simulatedListings = [
    // Same as before
    {
      id: 'inmueble-813',
      siteId: 'iparralde',
      title: 'Maravillosa villa individual (PRICE REDUCED)',  // CHANGED
      price: '550.000,00 €',  // CHANGED (was 586.000)
      priceNum: 550000,
      location: '64700 Hendaye, FR',
      url: 'https://inmobiliariaiparralde.com/inmuebles/inmueble_detalles/813',
      scrapedAt: new Date().toISOString()
    },
    // Same (no changes)
    {
      id: 'inmueble-812',
      siteId: 'iparralde',
      title: 'Gran piso en la mejor zona del Paseo Colón con garaje*',
      price: '495.000,00 €',
      priceNum: 495000,
      location: '20302 Irun, ES',
      url: 'https://inmobiliariaiparralde.com/inmuebles/inmueble_detalles/812',
      scrapedAt: new Date().toISOString()
    },
    // Same (no changes)
    {
      id: 'inmueble-811',
      siteId: 'iparralde',
      title: 'Bonita y soleada vivienda de tres habitaciones en el barrio de Arbes',
      price: '310.000,00 €',
      priceNum: 310000,
      location: '20302 Irun, ES',
      url: 'https://inmobiliariaiparralde.com/inmuebles/inmueble_detalles/811',
      scrapedAt: new Date().toISOString()
    },
    // MISSING - these 7 will increment miss_count
    // (inmueble-808, inmueble-770, inmueble-810, inmueble-809, inmueble-785, inmueble-799, inmueble-791)
  ];
  
  // Start a new run
  const runId = await trackRunStart(turso, 'iparralde');
  console.log(`Started run: ${runId}`);
  
  // Detect changes
  const summary = await detectChanges(turso, simulatedListings, runId, 'iparralde', false);
  console.log('\nChange Summary:');
  console.log(`  New: ${summary.new}`);
  console.log(`  Price Changed: ${summary.priceChanged}`);
  console.log(`  Attributes Changed: ${summary.attributesChanged}`);
  console.log(`  Removed: ${summary.removed}`);
  console.log(`  Unchanged: ${summary.unchanged}`);
  
  // Finish run
  await trackRunFinish(turso, runId, 'ok', simulatedListings.length);
  
  // Show the changes recorded
  console.log('\nDetailed Changes:');
  const changes = await turso.execute(
    'SELECT listing_id, change_type, diff_json FROM listing_changes WHERE run_id = ' + runId
  );
  
  for (const row of changes.rows) {
    console.log(`  ${row.listing_id}: ${row.change_type}`);
    if (row.diff_json) {
      const diff = JSON.parse(row.diff_json);
      for (const d of diff) {
        console.log(`    - ${d.field}: ${d.old} → ${d.new}`);
      }
    }
  }
  
  // Show miss_count tracking
  console.log('\nMiss Count Tracking:');
  const misses = await turso.execute(
    'SELECT id, title, active, miss_count FROM listings_current WHERE miss_count > 0'
  );
  
  if (misses.rows.length > 0) {
    for (const row of misses.rows) {
      const status = row.active ? '🔶' : '🔴';
      console.log(`  ${status} ${row.id}: miss_count=${row.miss_count}`);
    }
  } else {
    console.log('  (No listings missing)');
  }
})();
