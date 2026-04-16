#!/usr/bin/env python3
"""
Scraper for inmobiliariaiparralde.com Property Listings

Scrapes property listings for "piso" (apartment) type in Hendaye municipality.
Uses agent-browser for automated web navigation and HTML parsing.

USAGE:
    python3 scrape_immobiliaria.py > results.json

OUTPUT:
    JSON array with property objects containing:
    - title: Property title/description
    - price: Listed price (or "Precio consultar")
    - location: City and country code (e.g., "64700 Hendaye, FR")
    - detailUrl: Full URL to property details page
    - stableId: Unique ID derived from property detail URL (for deduplication)
    - scrapedAt: ISO timestamp of when property was scraped

WORKFLOW STEPS:
    1. Navigate to piso listing page: /inmuebles/listado_de_inmuebles/compra/piso
    2. Wait for page to load fully
    3. Extract HTML body content
    4. Parse media divs to find property elements
    5. Filter for Hendaye/Hendaia location
    6. Extract title, price, location, URL, and generate stable ID
    7. Check pagination for additional pages (up to 3 pages)
    8. Deduplicate by stableId
    9. Output as JSON array

SCRIPT CAN BE RUN REPEATEDLY to:
    - Track price changes
    - Monitor new listings
    - Generate updated reports
    - Archive historical data

Dependencies:
    - agent-browser CLI tool (https://agent-browser.com)
    - Python 3.6+
    - Standard library only (re, json, subprocess, datetime)
"""

import subprocess
import json
import re
from datetime import datetime, timezone

def run_agent_browser(cmd: str) -> str:
    """Execute agent-browser command with proper encoding handling."""
    result = subprocess.run(
        f'agent-browser {cmd}',
        shell=True,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    return result.stdout.strip() if result.returncode == 0 else ""

def extract_properties(html: str) -> list:
    """
    Parse property listings from HTML.
    
    Extracts data from media sections with this structure:
    <div class="media">
        <h4 class="media-heading"><a href="...inmueble_detalles/###">TITLE</a></h4>
        <p>LOCATION</p>
        PRICE€ or "Precio consultar"
    </div>
    
    Returns only properties in Hendaye or Hendaia.
    """
    properties = []
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Split by media divs to process each listing independently
    media_sections = re.split(r'<div class="media">', html)
    
    for section in media_sections[1:]:  # Skip first empty split
        # Extract detail URL and property ID
        url_match = re.search(r'href="(https://[^"]*inmueble_detalles/(\d+))"', section)
        if not url_match:
            continue
        
        url = url_match.group(1)
        prop_id = url_match.group(2)
        
        # Extract title from h4 heading
        title_match = re.search(r'<h4[^>]*><a[^>]*>([^<]+?)</a></h4>', section)
        title = title_match.group(1).strip() if title_match else ""
        
        # Extract location from first <p> tag
        location_match = re.search(r'<p>([^<]+?)</p>', section)
        location = location_match.group(1).strip() if location_match else ""
        
        # Filter: Only include Hendaye properties
        if location and 'Hendaye' not in location and 'Hendaia' not in location:
            continue
        
        # Extract price - look for currency symbol or "Precio consultar"
        price_section = section if not location else section[section.find(location):]
        price_match = re.search(r'([\d.,]+\s*€|Precio\s+consultar)', price_section)
        price = price_match.group(1).strip() if price_match else "Precio consultar"
        
        # Clean price string
        price = price.replace('&nbsp;', ' ').replace('\n', ' ').strip()
        price = re.sub(r'\s+', ' ', price)
        
        if title and location:
            properties.append({
                'title': title,
                'price': price,
                'location': location,
                'detailUrl': url,
                'stableId': prop_id,
                'scrapedAt': timestamp
            })
    
    return properties

def scrape_page(page_num: int) -> list:
    """
    Scrape a single page of results.
    
    Page 1: Uses base piso URL
    Pages 2+: Appends ?page=N parameter
    """
    # Construct URL
    if page_num == 1:
        url = "https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles/compra/piso"
    else:
        url = f"https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles/compra/piso?page={page_num}"
    
    # Navigate to page
    run_agent_browser(f'open "{url}"')
    run_agent_browser('wait 2000')
    
    # Get HTML and parse
    html = run_agent_browser('get html "body"')
    
    if not html:
        return []
    
    return extract_properties(html)

def main():
    """Main scraping workflow: iterate pages, deduplicate, output JSON."""
    all_properties = []
    seen_ids = set()  # Track IDs for deduplication
    
    # Scrape up to 3 pages (typical pagination limit)
    for page_num in range(1, 4):
        print(f"Scraping page {page_num}...", flush=True)
        
        properties = scrape_page(page_num)
        
        if not properties:
            print(f"No properties found on page {page_num}, stopping.", flush=True)
            break
        
        print(f"  Found {len(properties)} properties", flush=True)
        
        # Add unique properties (by stableId)
        for prop in properties:
            prop_id = prop['stableId']
            if prop_id not in seen_ids:
                all_properties.append(prop)
                seen_ids.add(prop_id)
    
    # Output results as JSON to stdout
    output = json.dumps(all_properties, indent=2, ensure_ascii=False)
    print(output)
    
    # Cleanup
    run_agent_browser('close --all')

if __name__ == '__main__':
    main()
