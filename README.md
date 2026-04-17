# Real Estate Monitoring Project - Final Report

## Who I am and what I did
I am Urdax and I am the developer of this repository. I built a complete real-estate monitoring pipeline across the milestones. The project scrapes listings, stores historical data, detects changes, sends Telegram alerts, and provides a dashboard for monitoring.

Main work delivered:
- Implemented scraping pipeline with adapter-based architecture (Milestone 1).
- Added persistence in SQLite (local) and Turso (cloud) (Milestone 2).
- Implemented monitoring for new/changed/removed listings (Milestone 3).
- Added Telegram notifications for change events (Milestone 4).
- Added scheduler for periodic execution (Milestone 5).
- Built a web dashboard with live stats, charts, change log, and insights (Milestone 6).

## Milestones completed
- Milestone 1: Base scraping and extraction.
- Milestone 2: Data persistence (SQLite + Turso).
- Milestone 3: Monitoring tables and change detection.
- Milestone 4: Telegram bot notifications.
- Milestone 5: Scheduled execution and automation.
- Milestone 6: Dashboard website and analytics features.

Optional milestone completed:
- Extra Telegram alerting validation and delivery evidence (Milestone 4 feature).

## Domain name / IP
No public domain was deployed because DNS access was not granted to me.
The project was validated locally using:
- http://localhost:3000
- http://127.0.0.1:3000

Deployment-related work was completed up to the DNS step; DNS assignment/configuration remained outside my access permissions.

## Adapters implemented
The project uses an adapter registry design so each website has an independent scraper implementation while the CLI stays uniform.

Implemented adapters:
- `iparralde` adapter:
  - Implemented with Playwright.
  - Supports filters (property type and municipality).
  - Handles pagination across result pages.
  - Generates stable listing IDs from detail URLs.
  - Normalizes extracted title, location, and price text.

Adapter architecture summary:
- Adapter registry maps `siteId -> scraper function`.
- CLI resolves an adapter by `--site` and executes it.
- New websites can be added by creating a new adapter module and registering it in the adapter index.

## Problems encountered
Main issues during implementation:
- Dynamic website behavior and pagination synchronization.
- European price format parsing (`16.000,00 EUR`) causing numeric inconsistencies.
- False positive `price_changed` records due legacy normalization.
- Duplicate listing entries in top price-drop insights.
- Missing local Telegram credentials in `.env`.

How they were solved:
- Improved parsing and normalization for European prices.
- Added cleanup and noise filtering for historical change events.
- Added deduplication logic by listing ID in dashboard insights.
- Added tests for parser and normalization-noise filters.
- Validated Telegram configuration with test command.

## Additional comments
- Dashboard includes live stats, price distribution, change-type chart, trend chart, and top price drops.
- Telegram notifications were tested end-to-end.
- The codebase is modular and ready for adding more adapters/sites.
- Requirement 8 is currently problematic in my environment due to deployment/DNS access limitations.
- Requirement 9 was not completed.

## Screenshots (highlighted features)

### Dashboard (Milestone 6, localhost)
- Overview:
  - ![Dashboard Overview](docs/screenshots/dashboard-overview.png)
- Listings tab:
  - ![Dashboard Listings](docs/screenshots/listings.png)
- Map view:
  - ![Dashboard Map View](docs/screenshots/map-view.png)

### Telegram bot (Milestone 4, optional evidence)
- Telegram alert example (Milestone 4):
  - ![Telegram Alert](docs/screenshots/telegram-alert.png)

Note: additional screenshots can be added in docs/screenshots if you want to highlight more sections (for example, a dedicated Change Log close-up).
