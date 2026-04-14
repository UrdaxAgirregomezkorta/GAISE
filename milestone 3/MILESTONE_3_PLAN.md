## Milestone 3 Plan - Monitoring: Detect new / changed / removed

### Deliverable
Store a full audit trail of changes detected on each scrape run.

### Architecture

#### 1. New Tables (in Turso)
```sql
-- Track each scrape execution
scrape_runs (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  siteId TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  listings_found INTEGER,
  status TEXT ('ok', 'partial', 'failed')
)

-- Latest state per listing
listings_current (
  id TEXT PRIMARY KEY,
  siteId TEXT NOT NULL,
  title TEXT,
  price TEXT,
  priceNum INTEGER,
  location TEXT,
  url TEXT,
  active BOOLEAN,
  miss_count INTEGER DEFAULT 0,
  first_seen TEXT,
  last_seen TEXT
)

-- Immutable snapshot of each listing in each run
listings_snapshot (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  listing_id TEXT NOT NULL,
  title TEXT,
  price TEXT,
  priceNum INTEGER,
  location TEXT,
  url TEXT,
  scrapedAt TEXT,
  FOREIGN KEY (run_id) REFERENCES scrape_runs(run_id)
)

-- Change events with structured diff
listing_changes (
  change_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  listing_id TEXT NOT NULL,
  change_type TEXT ('new', 'price_changed', 'attributes_changed', 'removed'),
  diff_json TEXT,  -- JSON array of {field, old, new}
  created_at TEXT,
  FOREIGN KEY (run_id) REFERENCES scrape_runs(run_id)
)
```

#### 2. Change Detection Logic
- **new**: listing.id not in listings_current
- **price_changed**: abs(new_priceNum - old_priceNum) > 0
- **attributes_changed**: title, location, or other fields differ (normalized)
- **removed**: listing missing for MAX_MISS_COUNT consecutive runs

#### 3. Normalization Rules
- **Price**: Strip currency symbols, thousand separators, parse to integer
  - Store both price (string) and priceNum (integer)
- **Text fields**: Trim whitespace, collapse multiple spaces
  - Compare normalized versions to avoid spurious changes

#### 4. Implementation Files
- `src/monitoring.js`: Change detection, snapshots, audit trail
  - `trackRunStart(siteId)` → returns run_id
  - `trackRunFinish(run_id, status, count)`
  - `detectChanges(current_listings, run_id)` → generates snapshots + changes
  - `markRemoved()` → check miss_count thresholds
  
- Update `src/db.js`: Add monitoring tables to schema
  
- Update `scrape.js`: 
  - Call `trackRunStart()` at beginning
  - Call `detectChanges()` after scraping
  - Call `trackRunFinish()` at end
  - Add `--dry-run` flag to skip DB writes

#### 5. Constants
- `MAX_MISS_COUNT = 2` (or 3 for daily runs)
- `REMOVED_STATUS = 'removed'`

### Acceptance Checks
✓ First run: all listings marked as "new"
✓ Second run (no changes): no price_changed/attributes_changed (only last_seen updated)
✓ Missing listing: not marked removed until MAX_MISS_COUNT threshold
✓ Removed & reappeared listing: new "new" event, miss_count reset to 0
✓ scrape_runs table: can reconstruct full listing state for any run

### Implementation Steps
1. Create new tables in Turso schema
2. Implement monitoring.js module
3. Update db.js with new table initializations
4. Update scrape.js CLI to track runs and detect changes
5. Test with multiple consecutive runs
6. Verify all acceptance checks

### Estimated Complexity
- Schema: straightforward SQL
- Logic: moderate (normalization + comparison)
- Testing: requires multiple runs to verify behavior
