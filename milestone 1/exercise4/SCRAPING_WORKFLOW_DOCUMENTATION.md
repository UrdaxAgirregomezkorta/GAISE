# Inmobiliaria Iparralde Web Scraping Workflow

## Overview

This document describes the complete workflow for scraping property listings from **inmobiliariaiparralde.com** using the **agent-browser** automation tool. The script filters listings for "piso" (apartment) type properties located in **Hendaye**, France.

## Workflow Steps

### Step 1: Verify agent-browser Installation
```bash
agent-browser --help
```
This displays all available commands and options.

### Step 2: Open the Website
```bash
agent-browser open https://inmobiliariaiparralde.com/
```
Navigates to the main website homepage.

### Step 3: Navigate to Filtered Listing Page
Instead of filling out the search form interactively, we can navigate directly to the URL pattern for filtered results:
```bash
agent-browser open "https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles/compra/piso"
```

This URL already filters for "piso" (apartment) type properties in buying mode.

### Step 4: Wait for Page Load
```bash
agent-browser wait 2000
```
Waits 2 seconds to ensure JavaScript rendering is complete.

### Step 5: Extract HTML Content
```bash
agent-browser get html "body"
```
Retrieves the full HTML body content for parsing.

### Step 6: Parse and Filter Results
The HTML is parsed to extract:
- **Title**: Property description/headline
- **Price**: Listed price (or "Precio consultar" if not available)
- **Location**: City, postal code, country (e.g., "64700 Hendaye, FR")
- **Detail URL**: Link to full property details
- **Stable ID**: Numeric ID extracted from the detail URL for deduplication

**Filter**: Only properties with "Hendaye" or "Hendaia" in the location are included.

### Step 7: Handle Pagination
The script checks for additional pages (up to 3 pages):
- Page 1: `/inmuebles/listado_de_inmuebles/compra/piso`
- Page 2: `/inmuebles/listado_de_inmuebles/compra/piso?page=2`
- Page 3: `/inmuebles/listado_de_inmuebles/compra/piso?page=3`

### Step 8: Deduplica by Stable ID
Properties are deduplicated using their stable ID to avoid duplicate entries when running the script multiple times.

### Step 9: Output as JSON
Results are formatted as a JSON array and output to stdout, which can be redirected to a file.

### Step 10: Close Browser
```bash
agent-browser close --all
```
Cleans up the browser session.

## Using the Scraping Script

### Prerequisites
- **agent-browser** CLI tool installed (https://agent-browser.com)
- Python 3.6 or later
- Bash/shell environment

### Running the Script
```bash
python3 scrape_inmobiliaria_final.py > results.json
```

### Output Format
The script outputs a JSON array where each object represents a property:

```json
[
  {
    "title": "Villa señorial en Hendaya – Zona de standing de Lissardy",
    "price": "748,900.00 €",
    "location": "64700 Hendaye, FR",
    "detailUrl": "https://inmobiliariaiparralde.com/inmuebles/inmueble_detalles/770",
    "stableId": "770",
    "scrapedAt": "2026-03-29T15:03:54.600552+00:00"
  },
  ...
]
```

### Fields Explained
- **title**: Property description/listing title
- **price**: Listed price in EUR with formatting (or "Precio consultar" if price not listed)
- **location**: Full location including postal code and country
- **detailUrl**: Full URL to property details page
- **stableId**: Unique numeric identifier derived from the property ID in the URL (used for deduplication)
- **scrapedAt**: ISO 8601 timestamp of when the property was scraped

## Scripting for Reuse

The provided Python script (`scrape_inmobiliaria_final.py`) automates the entire workflow:

1. Creates a timestamped snapshot of current listings
2. Deduplicates by property ID
3. Outputs clean JSON for further processing
4. Can be run on a schedule (cron, task scheduler) for monitoring price changes and new listings

### Example: Schedule Daily Scraping
**Linux/macOS** - Add to crontab:
```bash
0 9 * * * python3 /path/to/scrape_inmobiliaria_final.py > /var/log/inmobiliaria/data_$(date +\%Y\%m\%d).json
```

**Windows** - Task Scheduler:
- Action: `python3 C:\path\to\scrape_inmobiliaria_final.py > C:\logs\inmobiliaria_results.json`
- Trigger: Daily at 9:00 AM

## Data Analysis Ideas

With the JSON output, you can:
1. **Price Analysis**: Track price trends over time
2. **Availability**: Monitor listing frequency and vacancy
3. **Price Comparison**: Compare across properties and zones
4. **Time Series**: Create visualizations of market changes

Example Python analysis:
```python
import json
import pandas as pd

with open('results.json') as f:
    properties = json.load(f)

df = pd.DataFrame(properties)
print(df[['title', 'price', 'location', 'stableId']])
```

## Troubleshooting

### Issue: "agent-browser not found"
**Solution**: Ensure agent-browser is installed and in your PATH:
```bash
npm install -g agent-browser
# or
brew install agent-browser
```

### Issue: Timeout errors
**Solution**: Increase the wait time in the script:
```python
run_agent_browser('wait 5000')  # Wait 5 seconds instead of 2
```

### Issue: Encoding errors after scraping
**Solution**: The script handles this with `encoding='utf-8', errors='replace'`. If still issues, verify your terminal encoding:
```bash
chcp 65001  # Windows: Set to UTF-8
export LC_ALL=en_US.UTF-8  # Linux/macOS
```

### Issue: No properties found
**Probable causes**:
- Website structure changed (CSS selectors differ)
- Location filtering too strict
- Network connectivity issue

**Debug steps**:
1. Run `agent-browser open "..." && agent-browser screenshot page.png` to visualize the page
2. Check if "Hendaye" spelling matches (note: both "Hendaye" and "Hendaia" are valid)
3. Verify the target URL is accessible manually in a browser

## File Locations

- **Script**: `/tmp/scrape_inmobiliaria_final.py`
- **Results**: `/tmp/inmobiliaria_hendaye_pisos_results.json`
- **Documentation**: This file

## Legal Note

This web scraper is designed for data collection and analysis. Ensure compliance with:
- Website's `robots.txt` and Terms of Service
- Local data protection laws (GDPR, CCPA, etc.)
- Rate limiting to avoid server overload

## Modifications and Extensions

### Filtering by Additional Parameters
To filter by price range, modify the extraction logic:
```python
# In extract_properties(), add:
if price and '€' in price:
    price_num = int(price.replace('.', '').replace(',', ''))
    if price_num < 200000 or price_num > 800000:
        continue
```

### Extracting Additional Data
The HTML contains more data (number of rooms, square footage, amenities). To extract:
1. Inspect the page HTML structure
2. Update regex patterns in `extract_properties()`
3. Add new fields to the JSON output

### Using Different Property Types
Replace "piso" in the URL with other types:
- "casa" (houses)
- "local" (commercial spaces)  
- "oficina" (offices)
- "parking" (parking spaces)

Example:
```python
url = "https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles/compra/casa"  # For houses
```

---

**Last Updated**: March 29, 2026  
**Script Version**: 1.0  
**Status**: Tested and Working
