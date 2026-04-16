/**
 * Dashboard with enhanced features:
 * - Filtering by price, site, location
 * - Watchlist/Favorites
 * - Price history sparklines
 * - Map view with Leaflet
 */

import express from 'express';
import { initTursoDb } from './db.js';
import { getAllListings, getRecentChanges, getSummaryStats, getPriceDistribution, getPriceHistory, initWatchlistTable, getWatchlist, addToWatchlist, removeFromWatchlist } from './dashboard-db.js';

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

  // ==================== API Endpoints ====================
  
  app.get('/api/listings', async (req, res) => {
    try {
      let listings = await getAllListings(tursoInstance);
      
      // Filtering
      const { minPrice, maxPrice, site } = req.query;
      
      if (minPrice) listings = listings.filter(l => l.priceNum >= parseInt(minPrice));
      if (maxPrice) listings = listings.filter(l => l.priceNum <= parseInt(maxPrice));
      if (site) listings = listings.filter(l => l.siteId === site);
      
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

  app.get('/api/watchlist', async (req, res) => {
    try {
      const watchlist = await getWatchlist(tursoInstance);
      res.json({ watchlist });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/watchlist', express.json(), async (req, res) => {
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }

    .container {
      max-width: 1600px;
      margin: 0 auto;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 30px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    }

    header h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }

    header p {
      font-size: 1.1em;
      opacity: 0.9;
    }

    .tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .tab-btn {
      padding: 12px 24px;
      border: none;
      background: white;
      cursor: pointer;
      border-radius: 8px;
      font-weight: 600;
      transition: all 0.3s;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .tab-btn.active {
      background: #667eea;
      color: white;
    }

    .tab-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
    }

    .tab-content {
      display: none;
      background: white;
      border-radius: 10px;
      padding: 30px;
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
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

    .filters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }

    .filter-input {
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 14px;
    }

    .filter-btn {
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-weight: 600;
    }

    .filter-btn:hover {
      background: #764ba2;
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
      border-bottom: 2px solid #ddd;
    }

    table td {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }

    table tr:hover {
      background: #f9f9f9;
    }

    .btn-favorite {
      background: none;
      border: none;
      font-size: 1.5em;
      cursor: pointer;
      padding: 5px;
    }

    .btn-favorite.active {
      color: #ff6b6b;
    }

    a {
      color: #667eea;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .sparkline {
      width: 100px;
      height: 40px;
      display: inline-block;
    }

    #map {
      width: 100%;
      height: 600px;
      border-radius: 8px;
      margin-bottom: 20px;
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

    .change-removed {
      background: #f8d7da;
      color: #721c24;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: #999;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏠 Real Estate Monitor</h1>
      <p>Advanced property scraping with filtering, watchlist & price tracking</p>
    </header>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('dashboard')">📊 Dashboard</button>
      <button class="tab-btn" onclick="switchTab('listings')">📋 Listings</button>
      <button class="tab-btn" onclick="switchTab('watchlist')">❤️ Watchlist</button>
      <button class="tab-btn" onclick="switchTab('map')">🗺️ Map</button>
      <button class="tab-btn" onclick="switchTab('changes')">📊 Changes</button>
    </div>

    <!-- Dashboard Tab -->
    <div id="dashboard" class="tab-content active">
      <div class="stats-grid" id="stats">
        <div class="loading">Loading statistics...</div>
      </div>
    </div>

    <!-- Listings Tab -->
    <div id="listings" class="tab-content">
      <div class="filters">
        <input type="number" id="minPrice" class="filter-input" placeholder="Min Price">
        <input type="number" id="maxPrice" class="filter-input" placeholder="Max Price">
        <select id="siteFilter" class="filter-input">
          <option value="">All Sites</option>
          <option value="iparralde">Iparralde</option>
        </select>
        <button class="filter-btn" onclick="filterListings()">Filter</button>
      </div>
      <div id="listings-table"></div>
    </div>

    <!-- Watchlist Tab -->
    <div id="watchlist" class="tab-content">
      <div id="watchlist-table"></div>
    </div>

    <!-- Map Tab -->
    <div id="map" class="tab-content" style="padding: 0;">
      <div id="mapContainer" style="width: 100%; height: 600px; border-radius: 8px;"></div>
    </div>

    <!-- Changes Tab -->
    <div id="changes" class="tab-content">
      <div id="changes-table"></div>
    </div>
  </div>

  <script>
    let allListings = [];
    let watchlistItems = [];
    let mapInstance = null;

    function switchTab(tabName) {
      // Hide all tabs
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      
      // Show selected tab
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');
      
      // Load map if needed
      if (tabName === 'map') {
        setTimeout(initMap, 100);
      }
    }

    async function loadData() {
      try {
        // Load stats
        const statsRes = await fetch('/api/stats');
        const stats = await statsRes.json();
        renderStats(stats);

        // Load listings
        const listingsRes = await fetch('/api/listings');
        const { listings } = await listingsRes.json();
        allListings = listings;
        renderListings(listings);

        // Load watchlist
        const watchRes = await fetch('/api/watchlist');
        const { watchlist } = await watchRes.json();
        watchlistItems = watchlist;
        renderWatchlist();

        // Load changes
        const changesRes = await fetch('/api/changes?limit=50');
        const { changes } = await changesRes.json();
        renderChanges(changes);
      } catch (err) {
        console.error('Error loading data:', err);
      }
    }

    function renderStats(stats) {
      const html = \`
        <div class="stat-card">
          <div class="label">Active Listings</div>
          <div class="value">\${stats.totalActive}</div>
        </div>
        <div class="stat-card">
          <div class="label">Average Price</div>
          <div class="value">€\${stats.avgPrice.toLocaleString()}</div>
        </div>
        <div class="stat-card">
          <div class="label">In Watchlist</div>
          <div class="value">\${watchlistItems.length}</div>
        </div>
      \`;
      document.getElementById('stats').innerHTML = html;
    }

    function renderListings(listings) {
      if (!listings || listings.length === 0) {
        document.getElementById('listings-table').innerHTML = '<div class="empty-state"><h3>No listings found</h3></div>';
        return;
      }

      let html = '<table><thead><tr>';
      html += '<th>Title</th><th>Location</th><th>Price</th><th>Last Seen</th><th>Watch</th><th>Link</th>';
      html += '</tr></thead><tbody>';

      listings.forEach(l => {
        const isWatched = watchlistItems.some(w => w.listing_id === l.id);
        const lastSeen = new Date(l.last_seen).toLocaleDateString();
        html += \`<tr>
          <td>\${l.title}</td>
          <td>\${l.location}</td>
          <td>€\${parseInt(l.price).toLocaleString()}</td>
          <td>\${lastSeen}</td>
          <td><button class="btn-favorite \${isWatched ? 'active' : ''}" onclick="toggleWatchlist('\${l.id}', '\${l.siteId}', \`\${l.title.replace(/'/g, "\\\\'")}.\`)">❤️</button></td>
          <td><a href="\${l.url}" target="_blank">View →</a></td>
        </tr>\`;
      });

      html += '</tbody></table>';
      document.getElementById('listings-table').innerHTML = html;
    }

    function renderWatchlist() {
      if (!watchlistItems || watchlistItems.length === 0) {
        document.getElementById('watchlist-table').innerHTML = '<div class="empty-state"><h3>No items in watchlist</h3></div>';
        return;
      }

      let html = '<table><thead><tr>';
      html += '<th>Title</th><th>Site</th><th>Added</th><th>Action</th>';
      html += '</tr></thead><tbody>';

      watchlistItems.forEach(w => {
        const added = new Date(w.added_at).toLocaleDateString();
        html += \`<tr>
          <td>\${w.title}</td>
          <td>\${w.siteId}</td>
          <td>\${added}</td>
          <td><button class="filter-btn" onclick="removeFromWatchlist('\${w.listing_id}')">Remove</button></td>
        </tr>\`;
      });

      html += '</tbody></table>';
      document.getElementById('watchlist-table').innerHTML = html;
    }

    function renderChanges(changes) {
      if (!changes || changes.length === 0) {
        document.getElementById('changes-table').innerHTML = '<div class="empty-state"><h3>No changes yet</h3></div>';
        return;
      }

      let html = '<table><thead><tr>';
      html += '<th>Listing</th><th>Type</th><th>Details</th><th>Date</th>';
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
    }

    async function removeFromWatchlist(id) {
      await fetch(\`/api/watchlist/\${id}\`, { method: 'DELETE' });
      loadData();
    }

    function filterListings() {
      const minPrice = parseInt(document.getElementById('minPrice').value) || 0;
      const maxPrice = parseInt(document.getElementById('maxPrice').value) || 999999999;
      const site = document.getElementById('siteFilter').value;
      
      let filtered = allListings.filter(l => 
        l.priceNum >= minPrice && 
        l.priceNum <= maxPrice &&
        (!site || l.siteId === site)
      );
      
      renderListings(filtered);
    }

    function initMap() {
      if (mapInstance) return;
      
      const mapContainer = document.getElementById('mapContainer');
      if (!mapContainer) return;
      
      mapInstance = L.map('mapContainer').setView([43.5, -1.5], 8);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(mapInstance);
      
      // Add markers for listings (basic geocoding based on location text)
      const locations = ['Hendaye', 'Irun', 'Hondarribia'];
      const coords = [
        [43.3662, -1.7902], // Hendaye
        [43.3428, -1.8099], // Irun
        [43.2829, -1.8047]  // Hondarribia
      ];
      
      allListings.forEach((l, i) => {
        const location = locations.find(loc => l.location?.includes(loc)) || 'Hendaye';
        const idx = locations.indexOf(location);
        if (idx >= 0) {
          const [lat, lng] = coords[idx];
          L.marker([lat + Math.random() * 0.01, lng + Math.random() * 0.01])
            .bindPopup(\`<b>\${l.title}</b><br>€\${parseInt(l.price).toLocaleString()}\`)
            .addTo(mapInstance);
        }
      });
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

export { startDashboard };
