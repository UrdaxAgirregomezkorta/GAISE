/**
 * Dashboard with enhanced features:
 * - Filtering by price, site, location
 * - Watchlist/Favorites
 * - Price history sparklines
 * - Map view with Leaflet
 */

import express from 'express';
import { initTursoDb } from './db.js';
import {
  getAllListings,
  getRecentChanges,
  getSummaryStats,
  getPriceDistribution,
  getPriceHistory,
  getChangesByType,
  getTrendData,
  getTopPriceDrops,
  initWatchlistTable,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist
} from './dashboard-db.js';

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

  app.get('/api/price-history/:id', async (req, res) => {
    try {
      const history = await getPriceHistory(tursoInstance, req.params.id);
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/charts/changes-by-type', async (req, res) => {
    try {
      const data = await getChangesByType(tursoInstance);
      res.json({ data });
    } catch (err) {
      console.error('[dashboard] Chart error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/charts/trends', async (req, res) => {
    try {
      const data = await getTrendData(tursoInstance);
      res.json({ data });
    } catch (err) {
      console.error('[dashboard] Chart error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/top-price-drops', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 8;
      const drops = await getTopPriceDrops(tursoInstance, limit);
      res.json({ drops });
    } catch (err) {
      console.error('[dashboard] Price drops error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/watchlist', async (req, res) => {
    try {
      const watchlist = await getWatchlist(tursoInstance);
      res.json({ watchlist });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/watchlist', async (req, res) => {
    try {
      const { listing_id, siteId, title } = req.body;
      await addToWatchlist(tursoInstance, listing_id, siteId, title);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/watchlist/:id', async (req, res) => {
    try {
      await removeFromWatchlist(tursoInstance, req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Initialize watchlist table
  await initWatchlistTable(tursoInstance);

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
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f8f9fa;
      padding: 0;
      color: #333;
    }

    .container {
      max-width: 1600px;
      margin: 0 auto;
      background: white;
      box-shadow: 0 0 0 1px #e0e0e0;
    }

    header {
      background: linear-gradient(135deg, #1a237e 0%, #0d47a1 100%);
      color: white;
      padding: 40px 30px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    header h1 {
      font-size: 2em;
      margin-bottom: 8px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    header p {
      font-size: 0.95em;
      opacity: 0.85;
      font-weight: 300;
    }

    .tabs {
      display: flex;
      gap: 5px;
      background: white;
      padding: 0 30px;
      border-bottom: 1px solid #e0e0e0;
      flex-wrap: wrap;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .tab-btn {
      padding: 14px 20px;
      border: none;
      background: none;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.9em;
      transition: all 0.2s;
      border-bottom: 3px solid transparent;
      color: #666;
    }

    .tab-btn:hover {
      color: #1a237e;
      background: #f5f5f5;
    }

    .tab-btn.active {
      color: #0d47a1;
      border-bottom-color: #0d47a1;
    }

    .content {
      padding: 30px;
      background: white;
      min-height: 500px;
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .stat-card {
      background: white;
      border-left: 4px solid #0d47a1;
      padding: 20px;
      border-radius: 4px;
      text-align: left;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      transition: all 0.2s;
    }

    .stat-card:hover {
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    }

    .stat-card .value {
      font-size: 2em;
      font-weight: 700;
      margin: 8px 0 0 0;
      color: #0d47a1;
    }

    .stat-card .label {
      font-size: 0.85em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
    }

    .filter-input,
    .filter-btn {
      padding: 10px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 0.9em;
    }

    .filter-btn {
      background: #0d47a1;
      color: white;
      border: none;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }

    .filter-btn:hover {
      background: #1a237e;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      background: white;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    table th {
      background: #f5f5f5;
      padding: 14px 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
      cursor: pointer;
      color: #333;
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    table th:hover {
      background: #efefef;
    }

    table td {
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
      font-size: 0.95em;
    }

    table tr:hover {
      background: #fafafa;
    }

    .btn-favorite {
      background: none;
      border: none;
      font-size: 1.2em;
      cursor: pointer;
      padding: 5px;
      color: #ccc;
      transition: all 0.2s;
    }

    .btn-favorite:hover {
      color: #ffc107;
    }

    .btn-favorite.active {
      color: #ffc107;
    }

    a {
      color: #0d47a1;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
      color: #1a237e;
    }

    .sparkline {
      width: 100px;
      height: 30px;
      display: inline-block;
      border: 1px solid #e0e0e0;
      border-radius: 3px;
      padding: 2px;
    }

    #mapContainer {
      width: 100%;
      height: 600px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      border: 1px solid #e0e0e0;
    }

    .change-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 0.8em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .change-new {
      background: #c8e6c9;
      color: #1b5e20;
    }

    .change-price {
      background: #fff9c4;
      color: #f57f17;
    }

    .change-removed {
      background: #ffcdd2;
      color: #b71c1c;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #999;
    }

    .loading .spinner {
      border: 2px solid #f0f0f0;
      border-top: 2px solid #0d47a1;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }

    .empty-state h3 {
      margin-bottom: 8px;
      font-size: 1.1em;
      color: #666;
    }

    .empty-state p {
      font-size: 0.9em;
      color: #aaa;
    }

    .spinner {
      border: 2px solid #f0f0f0;
      border-top: 2px solid #0d47a1;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .charts-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .chart-card {
      background: white;
      padding: 20px;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .chart-card h3 {
      margin: 0 0 15px 0;
      color: #1a237e;
      font-size: 1em;
    }

    .chart-card canvas {
      max-width: 100%;
    }

    .mini-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88em;
    }

    .mini-table th,
    .mini-table td {
      padding: 8px 6px;
      border-bottom: 1px solid #efefef;
      text-align: left;
      vertical-align: top;
    }

    .mini-table th {
      color: #555;
      font-weight: 600;
      font-size: 0.82em;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }

    .drop-value {
      color: #b71c1c;
      font-weight: 700;
      white-space: nowrap;
    }

    .muted {
      color: #777;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Real Estate Monitoring System</h1>
      <p>Property Management & Change Tracking Dashboard</p>
    </header>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab(event, 'dashboard')">Dashboard</button>
      <button class="tab-btn" onclick="switchTab(event, 'listings')">Listings</button>
      <button class="tab-btn" onclick="switchTab(event, 'watchlist')">Watchlist</button>
      <button class="tab-btn" onclick="switchTab(event, 'map')">Map View</button>
      <button class="tab-btn" onclick="switchTab(event, 'changes')">Change Log</button>
    </div>

    <div class="content">
      <!-- Dashboard Tab -->
      <div id="dashboard" class="tab-content active">
        <div class="stats-grid" id="stats">
          <div class="loading"><div class="spinner"></div>Loading...</div>
        </div>

        <div class="charts-container">
          <div class="chart-card">
            <h3>Price Distribution</h3>
            <canvas id="priceDistributionChart" height="120"></canvas>
          </div>
          <div class="chart-card">
            <h3>Changes by Type</h3>
            <canvas id="changesByTypeChart" height="120"></canvas>
          </div>
          <div class="chart-card">
            <h3>Changes Trend (30 Days)</h3>
            <canvas id="changesTrendChart" height="120"></canvas>
          </div>
          <div class="chart-card">
            <h3>Top Price Drops</h3>
            <div id="topPriceDrops" class="loading"><div class="spinner"></div>Loading...</div>
          </div>
        </div>
      </div>

      <!-- Listings Tab -->
      <div id="listings" class="tab-content">
        <div class="filters">
          <input type="number" id="minPrice" class="filter-input" placeholder="Minimum Price">
          <input type="number" id="maxPrice" class="filter-input" placeholder="Maximum Price">
          <select id="siteFilter" class="filter-input">
            <option value="">All Properties</option>
            <option value="iparralde">Iparralde</option>
          </select>
          <button class="filter-btn" onclick="filterListings()">Apply Filters</button>
        </div>
        <div id="listings-table"></div>
      </div>

      <!-- Watchlist Tab -->
      <div id="watchlist" class="tab-content">
        <div id="watchlist-table"></div>
      </div>

      <!-- Map Tab -->
      <div id="map" class="tab-content">
        <div id="mapContainer"></div>
      </div>

      <!-- Changes Tab -->
      <div id="changes" class="tab-content">
        <div id="changes-table"></div>
      </div>
    </div>
  </div>

  <script>
    let allListings = [];
    let watchlistItems = [];
    let mapInstance = null;
    let priceChart = null;
    let changesChart = null;
    let trendChart = null;

    function parsePriceValue(raw) {
      if (raw === null || raw === undefined) return null;
      if (typeof raw === 'number') return raw;
      const digits = String(raw).replace(/[^0-9]/g, '');
      if (!digits) return null;
      return Number(digits);
    }

    function switchTab(evt, tabName) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      evt.currentTarget.classList.add('active');
      if (tabName === 'map') setTimeout(initMap, 100);
    }

    async function loadData() {
      try {
        const statsRes = await fetch('/api/stats');
        if (!statsRes.ok) throw new Error('Stats API error: ' + statsRes.status);
        const stats = await statsRes.json();
        renderStats(stats);

        const listingsRes = await fetch('/api/listings');
        if (!listingsRes.ok) throw new Error('Listings API error: ' + listingsRes.status);
        const { listings } = await listingsRes.json();
        allListings = listings || [];
        renderListings(allListings);

        const watchRes = await fetch('/api/watchlist');
        if (!watchRes.ok) throw new Error('Watchlist API error: ' + watchRes.status);
        const { watchlist } = await watchRes.json();
        watchlistItems = watchlist || [];
        renderWatchlist();

        const changesRes = await fetch('/api/changes?limit=50');
        if (!changesRes.ok) throw new Error('Changes API error: ' + changesRes.status);
        const { changes } = await changesRes.json();
        renderChanges(changes || []);

        const priceDistRes = await fetch('/api/price-distribution');
        if (priceDistRes.ok) {
          const { distribution } = await priceDistRes.json();
          renderPriceDistributionChart(distribution || []);
        }

        const changesTypeRes = await fetch('/api/charts/changes-by-type');
        if (changesTypeRes.ok) {
          const { data } = await changesTypeRes.json();
          renderChangesByTypeChart(data || []);
        }

        const trendsRes = await fetch('/api/charts/trends');
        if (trendsRes.ok) {
          const { data } = await trendsRes.json();
          renderTrendsChart(data || []);
        }

        const dropsRes = await fetch('/api/top-price-drops?limit=8');
        if (dropsRes.ok) {
          const { drops } = await dropsRes.json();
          renderTopPriceDrops(drops || []);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        document.getElementById('listings-table').innerHTML = \`<div class="empty-state"><h3>Error</h3><p>\${err.message}</p></div>\`;
      }
    }

    function renderStats(stats) {
      const html = \`
        <div class="stat-card"><div class="label">Active Listings</div><div class="value">\${stats.totalActive || 0}</div></div>
        <div class="stat-card"><div class="label">New (24h)</div><div class="value">\${stats.newCount || 0}</div></div>
        <div class="stat-card"><div class="label">Modified (24h)</div><div class="value">\${stats.changedCount || 0}</div></div>
        <div class="stat-card"><div class="label">Average Price</div><div class="value">€\${stats.avgPrice ? stats.avgPrice.toLocaleString() : '—'}</div></div>
      \`;
      document.getElementById('stats').innerHTML = html;
    }

    function renderListings(listings) {
      if (!listings?.length) {
        document.getElementById('listings-table').innerHTML = '<div class="empty-state"><h3>No Listings Found</h3><p>No properties match the current filters.</p></div>';
        return;
      }

      let html = '<table><thead><tr><th>Title</th><th>Location</th><th>Price</th><th>Last Updated</th><th>Saved</th><th>Link</th></tr></thead><tbody>';
      listings.forEach(l => {
        const isWatched = watchlistItems.some(w => w.listing_id === l.id);
        let lastSeen = '—';
        try {
          if (l.last_seen) {
            lastSeen = new Date(l.last_seen).toLocaleDateString();
          }
        } catch (e) {
          lastSeen = '—';
        }
        const parsedPrice = parsePriceValue(l.price);
        const priceLabel = parsedPrice !== null ? '€' + parsedPrice.toLocaleString() : (l.price || '—');
        html += \`<tr>
          <td>\${l.title || '—'}</td>
          <td>\${l.location || '—'}</td>
          <td>\${priceLabel}</td>
          <td>\${lastSeen}</td>
          <td><button class="btn-favorite \${isWatched ? 'active' : ''}" onclick="toggleWatchlist('\${l.id}', '\${l.siteId}', '\${(l.title || '').replace(/'/g, "\\\\'")}')">★</button></td>
          <td><a href="\${l.url}" target="_blank">View</a></td>
        </tr>\`;
      });
      html += '</tbody></table>';
      document.getElementById('listings-table').innerHTML = html;
    }

    function renderWatchlist() {
      if (!watchlistItems?.length) {
        document.getElementById('watchlist-table').innerHTML = '<div class="empty-state"><h3>Watchlist is Empty</h3><p>Save properties from the Listings tab to view them here.</p></div>';
        return;
      }

      let html = '<table><thead><tr><th>Property</th><th>Site</th><th>Date Added</th><th>Action</th></tr></thead><tbody>';
      watchlistItems.forEach(w => {
        const added = new Date(w.added_at).toLocaleDateString();
        html += \`<tr>
          <td>\${w.title || '—'}</td>
          <td>\${w.siteId || '—'}</td>
          <td>\${added}</td>
          <td><button class="filter-btn" onclick="removeFromWatchlist('\${w.listing_id}')" style="padding: 5px 10px; font-size: 12px;">Remove</button></td>
        </tr>\`;
      });
      html += '</tbody></table>';
      document.getElementById('watchlist-table').innerHTML = html;
    }

    function renderChanges(changes) {
      if (!changes?.length) {
        document.getElementById('changes-table').innerHTML = '<div class="empty-state"><h3>No Recent Changes</h3><p>Property changes will appear here as they are detected.</p></div>';
        return;
      }

      let html = '<table><thead><tr><th>Property ID</th><th>Type</th><th>Details</th><th>Date & Time</th></tr></thead><tbody>';
      changes.forEach(c => {
        const date = new Date(c.created_at).toLocaleString();
        const badge = getBadgeClass(c.change_type);
        const changeId = c.id ?? c.change_id ?? c.listing_id ?? '—';
        let details = 'N/A';
        try {
          const diff = JSON.parse(c.diff_json || '[]');
          if (Array.isArray(diff) && diff.length > 0) {
            details = diff.map(d => \`\${d.field}: \${d.old} → \${d.new}\`).join(', ');
          }
        } catch (e) {}
        html += \`<tr>
          <td><code style="font-size: 0.85em; color: #666;">\${String(changeId).substring(0, 8)}</code></td>
          <td><span class="change-badge \${badge}">\${c.change_type}</span></td>
          <td>\${details}</td>
          <td>\${date}</td>
        </tr>\`;
      });
      html += '</tbody></table>';
      document.getElementById('changes-table').innerHTML = html;
    }

    function getBadgeClass(type) {
      if (type === 'new') return 'change-new';
      if (type === 'price_changed') return 'change-price';
      if (type === 'removed') return 'change-removed';
      return 'change-new';
    }

    async function toggleWatchlist(id, siteId, title) {
      const isWatched = watchlistItems.some(w => w.listing_id === id);
      try {
        if (isWatched) {
          await fetch(\`/api/watchlist/\${id}\`, { method: 'DELETE' });
        } else {
          await fetch('/api/watchlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ listing_id: id, siteId, title })
          });
        }
        loadData();
      } catch (err) {
        console.error('Error:', err);
      }
    }

    async function removeFromWatchlist(id) {
      try {
        await fetch(\`/api/watchlist/\${id}\`, { method: 'DELETE' });
        loadData();
      } catch (err) {
        console.error('Error:', err);
      }
    }

    function filterListings() {
      const minRaw = document.getElementById('minPrice').value;
      const maxRaw = document.getElementById('maxPrice').value;
      const minPrice = minRaw === '' ? null : Number(minRaw);
      const maxPrice = maxRaw === '' ? null : Number(maxRaw);
      const site = document.getElementById('siteFilter').value;
      
      let filtered = allListings.filter(l => {
        const price = parsePriceValue(l.price);
        const matchesMin = minPrice === null || (price !== null && price >= minPrice);
        const matchesMax = maxPrice === null || (price !== null && price <= maxPrice);
        const matchesSite = !site || String(l.siteId || '').toLowerCase() === String(site).toLowerCase();
        const matchesPrice = matchesMin && matchesMax;
        return matchesPrice && matchesSite;
      });
      
      renderListings(filtered);
    }

    function renderPriceDistributionChart(distribution) {
      const ctx = document.getElementById('priceDistributionChart')?.getContext('2d');
      if (!ctx) return;

      if (priceChart) priceChart.destroy();

      const labels = distribution.map(d => d.range || 'Unknown');
      const counts = distribution.map(d => Number(d.count) || 0);
      const hasData = counts.some(v => v > 0);

      priceChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: hasData ? labels : ['No data'],
          datasets: [{
            label: 'Properties',
            data: hasData ? counts : [0],
            backgroundColor: hasData
              ? ['#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#2196f3']
              : ['#cfd8dc'],
            borderColor: '#0d47a1',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 }
            }
          }
        }
      });
    }

    function renderChangesByTypeChart(data) {
      const ctx = document.getElementById('changesByTypeChart')?.getContext('2d');
      if (!ctx) return;

      if (changesChart) changesChart.destroy();

      const labels = data.map(d => {
        const type = d.change_type || 'unknown';
        return type.charAt(0).toUpperCase() + type.slice(1);
      });
      const counts = data.map(d => Number(d.count) || 0);
      const hasData = counts.some(v => v > 0);

      changesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: hasData ? labels : ['No data'],
          datasets: [{
            data: hasData ? counts : [1],
            backgroundColor: hasData
              ? ['#0d47a1', '#ff6b6b', '#ffd93d', '#6bcf7f', '#4d96ff']
              : ['#cfd8dc'],
            borderColor: 'white',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { padding: 15, font: { size: 12 } }
            }
          }
        }
      });
    }

    function renderTrendsChart(data) {
      const ctx = document.getElementById('changesTrendChart')?.getContext('2d');
      if (!ctx) return;

      if (trendChart) trendChart.destroy();

      const labels = data.map(d => d.date || '');
      const counts = data.map(d => Number(d.count) || 0);
      const hasData = counts.length > 0;

      trendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: hasData ? labels : ['No data'],
          datasets: [{
            label: 'Changes',
            data: hasData ? counts : [0],
            fill: false,
            borderColor: '#0d47a1',
            backgroundColor: '#0d47a1',
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { precision: 0 }
            }
          }
        }
      });
    }

    function renderTopPriceDrops(drops) {
      const container = document.getElementById('topPriceDrops');
      if (!container) return;

      if (!drops?.length) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px 10px;"><h3>No Price Drops</h3><p class="muted">No valid downward changes were detected.</p></div>';
        return;
      }

      let html = '<table class="mini-table"><thead><tr><th>Property</th><th>Drop</th><th>Now</th><th>Date</th></tr></thead><tbody>';
      for (const drop of drops) {
        const title = drop.title || drop.listing_id || 'Property';
        const location = drop.location ? '<div class="muted">' + drop.location + '</div>' : '';
        const url = drop.url ? '<a href="' + drop.url + '" target="_blank">' + title + '</a>' : title;
        const when = drop.created_at ? new Date(drop.created_at).toLocaleDateString() : '—';
        const newPrice = Number.isFinite(Number(drop.newPrice)) ? '€' + Number(drop.newPrice).toLocaleString() : '—';
        const amount = Number.isFinite(Number(drop.dropAmount)) ? '-€' + Number(drop.dropAmount).toLocaleString() : '—';
        const pct = Number.isFinite(Number(drop.dropPercent)) ? ' (' + Number(drop.dropPercent).toFixed(2) + '%)' : '';

        html += '<tr>'
          + '<td>' + url + location + '</td>'
          + '<td class="drop-value">' + amount + pct + '</td>'
          + '<td>' + newPrice + '</td>'
          + '<td>' + when + '</td>'
          + '</tr>';
      }
      html += '</tbody></table>';
      container.innerHTML = html;
    }

    function initMap() {
      if (mapInstance) return;
      const container = document.getElementById('mapContainer');
      if (!container) return;
      
      mapInstance = L.map(container).setView([43.5, -1.5], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
      }).addTo(mapInstance);
      
      const coordMap = {
        'hendaye': [43.3662, -1.7902],
        'irun': [43.3428, -1.8099],
        'hondarribia': [43.2829, -1.8047],
        'bidart': [43.4303, -1.6027],
        'guethary': [43.3936, -1.6658]
      };
      
      const locations = Object.keys(coordMap);
      allListings.forEach(l => {
        let found = false;
        for (let loc of locations) {
          if (l.location?.toLowerCase().includes(loc)) {
            const [lat, lng] = coordMap[loc];
            const offset = Math.random() * 0.005;
            const parsedPrice = parsePriceValue(l.price);
            const popupPrice = parsedPrice !== null ? ('€' + parsedPrice.toLocaleString()) : (l.price || '—');
            L.marker([lat + offset, lng + offset])
              .bindPopup(\`<b>\${l.title || 'Property'}</b><br>\${popupPrice}\`)
              .addTo(mapInstance);
            found = true;
            break;
          }
        }

        // Fallback marker near Hendaye when location text doesn't match known keys.
        if (!found) {
          const [lat, lng] = coordMap.hendaye;
          const offsetLat = (Math.random() - 0.5) * 0.02;
          const offsetLng = (Math.random() - 0.5) * 0.02;
          const parsedPrice = parsePriceValue(l.price);
          const popupPrice = parsedPrice !== null ? ('€' + parsedPrice.toLocaleString()) : (l.price || '—');
          L.marker([lat + offsetLat, lng + offsetLng])
            .bindPopup(\`<b>\${l.title || 'Property'}</b><br>\${popupPrice}<br>\${l.location || ''}\`)
            .addTo(mapInstance);
        }
      });
    }

    loadData();
    setInterval(loadData, 30000);
  </script>
</body>
</html>
  `;
}
