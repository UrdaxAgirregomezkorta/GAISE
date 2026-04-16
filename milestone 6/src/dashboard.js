/**
 * Dashboard server module
 * Lightweight web UI for browsing listings and monitoring changes
 */

import express from 'express';
import { initTursoDb } from './db.js';
import { getAllListings, getRecentChanges, getSummaryStats, getPriceDistribution } from './dashboard-db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tursoInstance = null;

/**
 * Start the dashboard server
 * @param {number} port - Port to listen on
 * @returns {Promise<void>}
 */
export async function startDashboard(port = 3000) {
  const app = express();
  
  // Initialize Turso connection
  try {
    tursoInstance = await initTursoDb();
    console.log(`[dashboard] Connected to Turso database`);
  } catch (err) {
    console.error(`[dashboard] Failed to connect to database:`, err.message);
    tursoInstance = null;
  }

  // Middleware
  app.use(express.json());

  // API Routes
  app.get('/api/listings', async (req, res) => {
    try {
      const listings = await getAllListings(tursoInstance);
      res.json({ listings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/changes', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const changes = await getRecentChanges(tursoInstance, limit);
      res.json({ changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await getSummaryStats(tursoInstance);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/price-distribution', async (req, res) => {
    try {
      const distribution = await getPriceDistribution(tursoInstance);
      res.json({ distribution });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve static HTML
  app.get('/', (req, res) => {
    res.send(getDashboardHTML());
  });

  // Start server
  app.listen(port, () => {
    console.log(`\n🌐 Dashboard server running at http://localhost:${port}`);
    console.log(`📊 Open your browser and go to: http://localhost:${port}`);
    console.log(`\nPress Ctrl+C to stop\n`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n⏸ Shutting down dashboard...');
    process.exit(0);
  });
}

/**
 * Get the dashboard HTML
 * @returns {string}
 */
function getDashboardHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Real Estate Monitor - Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      background: white;
      border-radius: 10px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }

    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    header p {
      font-size: 1.1em;
      opacity: 0.9;
    }

    .content {
      padding: 30px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-card .value {
      font-size: 2.5em;
      font-weight: bold;
      margin: 10px 0;
    }

    .stat-card .label {
      font-size: 0.9em;
      opacity: 0.9;
    }

    section {
      margin-bottom: 40px;
    }

    h2 {
      color: #333;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    table th {
      background: #f5f5f5;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      color: #333;
      border-bottom: 2px solid #ddd;
      cursor: pointer;
    }

    table th:hover {
      background: #efefef;
    }

    table td {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }

    table tr:hover {
      background: #f9f9f9;
    }

    a {
      color: #667eea;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .change-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .change-new {
      background: #d4edda;
      color: #155724;
    }

    .change-price {
      background: #fff3cd;
      color: #856404;
    }

    .change-attr {
      background: #d1ecf1;
      color: #0c5460;
    }

    .change-removed {
      background: #f8d7da;
      color: #721c24;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #999;
    }

    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }

    .empty-state h3 {
      font-size: 1.5em;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏠 Real Estate Monitor</h1>
      <p>Automated property scraping & change detection</p>
    </header>

    <div class="content">
      <!-- Stats -->
      <div class="stats-grid" id="stats">
        <div class="loading">
          <div class="spinner"></div>
          Loading statistics...
        </div>
      </div>

      <!-- Current Listings -->
      <section>
        <h2>📋 Current Listings</h2>
        <div id="listings">
          <div class="loading">
            <div class="spinner"></div>
            Loading listings...
          </div>
        </div>
      </section>

      <!-- Change Log -->
      <section>
        <h2>📊 Recent Changes</h2>
        <div id="changes">
          <div class="loading">
            <div class="spinner"></div>
            Loading changes...
          </div>
        </div>
      </section>
    </div>
  </div>

  <script>
    let sortField = 'last_seen';
    let sortAsc = false;

    async function loadData() {
      try {
        // Load stats
        const statsRes = await fetch('/api/stats');
        const stats = await statsRes.json();
        renderStats(stats);

        // Load listings
        const listingsRes = await fetch('/api/listings');
        const { listings } = await listingsRes.json();
        renderListings(listings);

        // Load changes
        const changesRes = await fetch('/api/changes?limit=50');
        const { changes } = await changesRes.json();
        renderChanges(changes);
      } catch (err) {
        console.error('Error loading data:', err);
        document.getElementById('listings').innerHTML = '<div class="empty-state"><h3>Error loading data</h3></div>';
      }
    }

    function renderStats(stats) {
      const html = \`
        <div class="stat-card">
          <div class="label">Active Listings</div>
          <div class="value">\${stats.totalActive || 0}</div>
        </div>
        <div class="stat-card">
          <div class="label">New (24h)</div>
          <div class="value" style="color: #d4edda; text-shadow: 0 0 10px rgba(0,0,0,0.2);">\${stats.newCount || 0}</div>
        </div>
        <div class="stat-card">
          <div class="label">Changed (24h)</div>
          <div class="value">\${stats.changedCount || 0}</div>
        </div>
        <div class="stat-card">
          <div class="label">Avg Price</div>
          <div class="value">\${stats.avgPrice ? '€' + stats.avgPrice.toLocaleString() : 'N/A'}</div>
        </div>
      \`;
      document.getElementById('stats').innerHTML = html;
    }

    function renderListings(listings) {
      if (!listings || listings.length === 0) {
        document.getElementById('listings').innerHTML = '<div class="empty-state"><h3>No listings found</h3><p>Run the scraper first to populate data.</p></div>';
        return;
      }

      let html = '<table><thead><tr>';
      html += '<th onclick="sortBy(\\'title\\')">Title</th>';
      html += '<th onclick="sortBy(\\'location\\')">Location</th>';
      html += '<th onclick="sortBy(\\'price\\')">Price</th>';
      html += '<th onclick="sortBy(\\'last_seen\\')">Last Seen</th>';
      html += '<th>Link</th>';
      html += '</tr></thead><tbody>';

      listings.forEach(l => {
        const lastSeen = new Date(l.last_seen).toLocaleDateString();
        html += \`<tr>
          <td>\${l.title || 'N/A'}</td>
          <td>\${l.location || 'N/A'}</td>
          <td>\${l.price || 'N/A'}</td>
          <td>\${lastSeen}</td>
          <td><a href="\${l.url}" target="_blank">View →</a></td>
        </tr>\`;
      });

      html += '</tbody></table>';
      document.getElementById('listings').innerHTML = html;
    }

    function renderChanges(changes) {
      if (!changes || changes.length === 0) {
        document.getElementById('changes').innerHTML = '<div class="empty-state"><h3>No changes yet</h3><p>Changes will appear here as the scraper finds them.</p></div>';
        return;
      }

      let html = '<table><thead><tr>';
      html += '<th>Listing ID</th>';
      html += '<th>Type</th>';
      html += '<th>Details</th>';
      html += '<th>Date</th>';
      html += '</tr></thead><tbody>';

      changes.forEach(c => {
        const date = new Date(c.created_at).toLocaleString();
        const badge = getBadgeClass(c.change_type);
        let details = 'N/A';
        
        try {
          const diff = JSON.parse(c.diff_json || '[]');
          if (Array.isArray(diff) && diff.length > 0) {
            details = diff.map(d => \`\${d.field}: \${d.old} → \${d.new}\`).join(', ');
          }
        } catch (e) {
          // Ignore
        }

        html += \`<tr>
          <td>\${c.id}</td>
          <td><span class="change-badge \${badge}">\${c.change_type}</span></td>
          <td>\${details}</td>
          <td>\${date}</td>
        </tr>\`;
      });

      html += '</tbody></table>';
      document.getElementById('changes').innerHTML = html;
    }

    function getBadgeClass(type) {
      if (type === 'new') return 'change-new';
      if (type === 'price_changed') return 'change-price';
      if (type === 'attributes_changed') return 'change-attr';
      if (type === 'removed') return 'change-removed';
      return 'change-new';
    }

    function sortBy(field) {
      sortField = field;
      sortAsc = !sortAsc;
      loadData();
    }

    // Load data on page load
    loadData();

    // Refresh every 30 seconds
    setInterval(loadData, 30000);
  </script>
</body>
</html>
  `;
}
