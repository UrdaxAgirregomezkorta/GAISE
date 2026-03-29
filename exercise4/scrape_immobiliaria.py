#!/usr/bin/env python3
"""
Scrape property listings from inmobiliariaiparralde.com
Filters: tipo de inmueble = piso, municipio = Hendaye
Output: JSON array with results

Usage: python3 scrape_immobiliaria.py
"""

import subprocess
import json
import re
from datetime import datetime, timezone

def run_agent_browser(cmd: str) -> str:
    """Execute agent-browser command"""
    result = subprocess.run(f'agent-browser {cmd}', shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return result.stdout.strip() if result.returncode == 0 else ""

def extract_properties(html: str) -> list:
    """Parse property listings from HTML"""
    properties = []
    timestamp = datetime.now(timezone.utc).isoformat()
    
    # Split by media divs
    media_sections = re.split(r'<div class="media">', html)
    
    for section in media_sections[1:]:  # Skip first empty split
        # Extract URL and property ID
        url_match = re.search(r'href="(https://[^"]*inmueble_detalles/(\d+))"', section)
        if not url_match:
            continue
        
        url = url_match.group(1)
        prop_id = url_match.group(2)
        
        # Extract title from h4
        title_match = re.search(r'<h4[^>]*><a[^>]*>([^<]+?)</a></h4>', section)
        title = title_match.group(1).strip() if title_match else ""
        
        # Extract location from first <p> tag
        location_match = re.search(r'<p>([^<]+?)</p>', section)
        location = location_match.group(1).strip() if location_match else ""
        
        # Only include Hendaye properties
        if location and 'Hendaye' not in location and 'Hendaia' not in location:
            continue
        
        # Extract price after location - look for number followed by €
        # Price can be on a new line after the location
        price_section = section[section.find(location):section.find('</div>')+10] if location else section
        price_match = re.search(r'([\d.,]+\s*€|Precio\s+consultar)', price_section)
        price = price_match.group(1).strip() if price_match else "Precio consultar"
        
        # Clean price
        price = price.replace('&nbsp;', ' ').replace('\n', ' ').strip()
        price = re.sub(r'\s+', ' ', price)  # Normalize whitespace
        
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
    """Scrape a single page of results"""
    # For page 1, use the base piso URL
    #For subsequent pages, append page number to URL
    if page_num == 1:
        url = "https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles/compra/piso"
    else:
        url = f"https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles/compra/piso?page={page_num}"
    
    # Navigate and get HTML
    run_agent_browser(f'open "{url}"')
    run_agent_browser('wait 2000')
    html = run_agent_browser('get html "body"')
    
    if not html:
        return []
    
    return extract_properties(html)

def main():
    """Main scraping workflow"""
    all_properties = []
    seen_ids = set()
    
    # Scrape up to 3 pages (typical pagination limit mentioned)
    for page_num in range(1, 4):
        print(f"Scraping page {page_num}...", flush=True)
        
        properties = scrape_page(page_num)
        if not properties:
            print(f"No properties found on page {page_num}, stopping.", flush=True)
            break
        
        print(f"  Found {len(properties)} properties", flush=True)
        
        # Add unique properties
        for prop in properties:
            prop_id = prop['stableId']
            if prop_id not in seen_ids:
                all_properties.append(prop)
                seen_ids.add(prop_id)
    
    # Output as JSON
    output = json.dumps(all_properties, indent=2, ensure_ascii=False)
    print(output)
    
    # Cleanup
    run_agent_browser('close --all')

if __name__ == '__main__':
    main()
