import cron from 'node-cron';
import { getAdapter, listAdapters } from './adapters/index.js';
import { upsertListings, initTursoDb, close } from './db.js';
import { trackRunStart, trackRunFinish, detectChanges } from './monitoring.js';
import { notifyChanges } from './notifications.js';

const DEFAULT_SITES = ['iparralde'];
const MAX_RUNNING_JOBS = 1;
let isRunning = false;

/**
 * Run scrape pipeline for a single site
 * @param {string} siteId
 * @param {boolean} dryRun
 * @returns {Promise<Object>}
 */
async function runSiteJob(siteId, dryRun = false) {
  try {
    console.log(`[${new Date().toISOString()}] 📍 Starting scrape for ${siteId}...`);
    
    const adapter = getAdapter(siteId);
    const listings = await adapter({ filters: {}, maxPages: null });
    console.log(`[${new Date().toISOString()}] ✓ Found ${listings.length} listings for ${siteId}`);

    if (!dryRun) {
      // Initialize Turso
      const turso = await initTursoDb();
      
      // Start tracking run
      const runId = await trackRunStart(turso, siteId);
      
      // Persist to databases
      await upsertListings(listings);
      console.log(`[${new Date().toISOString()}] ✓ Persisted ${listings.length} listings`);

      // Detect changes
      const changes = await detectChanges(turso, listings, runId, siteId, dryRun);
      console.log(`[${new Date().toISOString()}] ✓ Changes detected: new=${changes.new}, price=${changes.price_changed}, attrs=${changes.attributes_changed}, removed=${changes.removed}`);

      // Notify if there are changes
      if (changes.new > 0 || changes.price_changed > 0 || changes.attributes_changed > 0 || changes.removed > 0) {
        try {
          await notifyChanges(changes, runId, dryRun);
          console.log(`[${new Date().toISOString()}] ✓ Notification sent`);
        } catch (notifyErr) {
          console.error(`[${new Date().toISOString()}] ⚠ Notification failed:`, notifyErr.message);
        }
      }

      // Finish tracking run
      await trackRunFinish(turso, runId, 'ok', listings.length);
    } else {
      console.log(`[${new Date().toISOString()}] 🔍 DRY-RUN: Changes would be persisted but notifications disabled`);
    }

    return { siteId, success: true, listings: listings.length };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ✗ Error scraping ${siteId}:`, err.message);
    return { siteId, success: false, error: err.message };
  }
}

/**
 * Run the full scraping pipeline for all sites
 * @param {string[]} sites
 * @param {boolean} dryRun
 * @returns {Promise<void>}
 */
async function runFullPipeline(sites = DEFAULT_SITES, dryRun = false) {
  // Guard against overlapping runs
  if (isRunning) {
    console.log(`[${new Date().toISOString()}] ⏭ Previous run still in progress, skipping this tick`);
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] 🚀 Starting scheduled run for ${sites.join(', ')}`);
  if (dryRun) console.log('   (DRY-RUN mode)');
  console.log(`${'='.repeat(60)}`);

  try {
    const results = [];
    for (const site of sites) {
      const result = await runSiteJob(site, dryRun);
      results.push(result);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const successful = results.filter(r => r.success).length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] ✓ Run completed in ${duration}s (${successful}/${results.length} sites succeeded)`);
    console.log(`${'='.repeat(60)}\n`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ✗ Fatal error in scheduled run:`, err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the scheduler
 * @param {string} cronExpression - Cron expression (e.g., "* / 30 * * * *")
 * @param {string[]} sites - Sites to scrape
 * @param {boolean} dryRun - Dry-run mode
 * @returns {Promise<void>}
 */
export async function startScheduler(cronExpression, sites = DEFAULT_SITES, dryRun = false) {
  console.log(`\n🕐 Scheduler starting with cron expression: "${cronExpression}"`);
  console.log(`📍 Sites to scrape: ${sites.join(', ')}`);
  console.log(`🔐 Dry-run: ${dryRun}`);
  console.log(`\nPress Ctrl+C to stop\n`);

  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: "${cronExpression}"`);
  }

  // Schedule the job
  const task = cron.schedule(cronExpression, () => {
    runFullPipeline(sites, dryRun).catch(err => {
      console.error(`[${new Date().toISOString()}] ✗ Unhandled scheduler error:`, err);
    });
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⏸ Shutting down gracefully...');
    task.stop();
    try {
      await close();
      console.log('✓ Resources cleaned up');
      process.exitCode = 0;
    } catch (err) {
      console.error('✗ Error during shutdown:', err.message);
      process.exitCode = 1;
    }
  });

  // Keep process running
  const keepAliveInterval = setInterval(() => {
    // Just keep the process alive
  }, 1000);

  try {
    // Initial run if desired
    // await runFullPipeline(sites, dryRun);
  } catch (err) {
    console.error('✗ Initial run failed:', err.message);
    task.stop();
    clearInterval(keepAliveInterval);
    throw err;
  }
}

/**
 * Run all configured sites once and then exit
 * @param {string[]} sites
 * @param {boolean} dryRun
 * @returns {Promise<number>} - Exit code
 */
export async function runOnce(sites = DEFAULT_SITES, dryRun = false) {
  console.log(`\n🚀 Running all sites once...`);
  console.log(`📍 Sites: ${sites.join(', ')}`);
  if (dryRun) console.log('🔍 Dry-run mode');
  console.log('');

  try {
    await runFullPipeline(sites, dryRun);
    await close();
    return 0;
  } catch (err) {
    console.error('✗ Fatal error:', err.message);
    try {
      await close();
    } catch {
      // Ignore cleanup errors
    }
    return 1;
  }
}

export { runFullPipeline };
