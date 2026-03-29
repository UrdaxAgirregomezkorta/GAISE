#!/usr/bin/env python3
"""
Script to scrape property listings from inmobiliariaiparralde.com
Filters: tipo de inmueble = piso, municipio = Hendaye
Outputs results as JSON array with deduplication by stableId
"""

import subprocess
import json
import re
import sys
import datetime
import hashlib
from html.parser import HTMLParser

def run_agent_browser(cmd: str) -> str:
    """Execute agent-browser command and return output"""
    full_cmd = f'agent-browser {cmd}'
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"Error: {full_cmd}", file=sys.stderr)
        if result.stderr:
            print(f"  stderr: {result.stderr[:200]}", file=sys.stderr)
        return ""
    
    return result.stdout.strip()

def extract_properties_from_html(html_body: str, timestamp: str) -> list:
    """Parse property data from HTML"""
    properties = []
    
    # Find all media divs containing properties
    media_pattern = r'<div class="media">(.*?)</div>\s*</div>\s*</section>'
    media_matches = re.findall(media_pattern, html_body, re.DOTALL)
    
    # Actually, let's search for the media-body divs instead
    # Pattern: <a href="...inmueble_detalles/XXX">Title</a>
    # Followed by location and price
    
    property_blocks = re.findall(
        r'<a href="(https://[^"]*inmueble_detalles/(\d+))">\s*([^<]+?)\s*</a>.*?<p>([^<]+)</p>(.*?)(?=</div>\s*</div>\s*<div class="media"|<section)',
        html_body,
        re.DOTALL
    )
    
    # Better approach: find media sections
    media_sections = re.findall(
        r'<div class="media">.*?<h4 class="media-heading"><a href="([^"]+)">([^<]+)</a></h4>\s*<p>([^<]+)</p>\s*([^<]*?€[^<]*)?',
        html_body,
        re.DOTALL | re.IGNORECASE
    )
    
    for url, title, location, price in media_sections:
        if url and '/inmueble_detalles/' in url:
            # Extract ID from URL
            id_match = re.search(r'/inmueble_detalles/(\d+)', url)
            stable_id = id_match.group(1) if id_match else hashlib.md5(url.encode()).hexdigest()[:12]
            
            # Clean title
            title = title.strip()
            
            # Clean location
            location = location.strip()
            
            # Clean price
            price_clean = price.strip() if price else ""
            if price_clean and '€' in price_clean:
                # Extract just the price part
                price_match = re.search(r'[\d.,]+\s*€', price_clean)
                if price_match:
                    price_clean = price_match.group(0).replace('\n', '').replace('\r', '')
            else:
                # Look for "Precio consultar"
                if 'Precio consultar' in html_body[max(0, html_body.find(title)-200):html_body.find(title)+500]:
                    price_clean = "Precio consultar"
            
            properties.append({
                'title': title,
                'price': price_clean,
                'location': location,
                'detailUrl': url,
                'stableId': stable_id,
                'scrapedAt': timestamp
            })
    
    return properties

def get_current_page_properties(timestamp: str) -> list:
    """Get properties from the current page using HTML parsing"""
    html_content = run_agent_browser('get html "body"')
    if not html_content:
        print("Failed to get HTML content", file=sys.stderr)
        return []
    
    properties = extract_properties_from_html(html_content, timestamp)
    return properties

def navigate_to_results_with_filters():
    """Navigate to listing page and apply filters"""
    print("Opening website...", file=sys.stderr)
    run_agent_browser('open https://inmobiliariaiparralde.com/')
    run_agent_browser('wait 2000')
    
    print("Scrolling down to advanced search form...", file=sys.stderr)
    run_agent_browser('scroll down 3')
    run_agent_browser('wait 1000')
    
    print("Selecting property type: Piso", file=sys.stderr)
    # Click on the Tipo de Inmueble dropdown and select Piso
    run_agent_browser('find text "Piso" click')
    run_agent_browser('wait 500')
    
    print("Selecting municipality: Hendaye", file=sys.stderr)
    # Click on the Municipio dropdown and select Hendaye
    run_agent_browser('find text "Hendaye" click')
    run_agent_browser('wait 500')
    
    print("Submitting search...", file=sys.stderr)
    # Find and click the search button (Buscar button in advanced search form)
    run_agent_browser('find role button click --name Buscar')
    run_agent_browser('wait 2000')
    
    current_url = run_agent_browser('get url')
    print(f"Navigated to: {current_url}", file=sys.stderr)

def scrape_all_pages() -> list:
    """Scrape all pages of search results"""
    all_properties = []
    page_num = 1
    max_pages = 4  # Safety limit
    
    while page_num <= max_pages:
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        print(f"\n=== Scraping page {page_num} ===", file=sys.stderr)
        
        # Get properties from current page
        properties = get_current_page_properties(timestamp)
        print(f"Found {len(properties)} properties on page {page_num}", file=sys.stderr)
        
        if not properties:
            print("No properties found, stopping", file=sys.stderr)
            break
        
        all_properties.extend(properties)
        
        # Try to navigate to next page
        print(f"Looking for page {page_num + 1}...", file=sys.stderr)
        next_page_result = run_agent_browser(f'find text "{page_num + 1}" click')
        
        if 'Element not found' in next_page_result or 'not found' in next_page_result.lower():
            print("No next page found", file=sys.stderr)
            break
        
        run_agent_browser('wait 1500')
        page_num += 1
    
    return all_properties

def deduplicate_properties(properties: list) -> list:
    """Remove duplicate properties based on stableId"""
    seen_ids = set()
    unique = []
    
    for prop in properties:
        sid = prop.get('stableId', '')
        if sid and sid not in seen_ids:
            unique.append(prop)
            seen_ids.add(sid)
    
    return unique

def main():
    """Main scraping workflow"""
    try:
        navigate_to_results_with_filters()
        all_properties = scrape_all_pages()
        
        print(f"\nTotal properties before deduplication: {len(all_properties)}", file=sys.stderr)
        
        # Deduplicate
        unique_properties = deduplicate_properties(all_properties)
        
        print(f"Total unique properties: {len(unique_properties)}", file=sys.stderr)
        
        # Sort by price (descending, with "Precio consultar" at the end)
        def sort_key(prop):
            price = prop.get('price', '')
            if 'Precio consultar' in price:
                return (1, 0)  # Sort at end
            # Extract numeric value
            match = re.search(r'([\d.]+)', price.replace('.', ''))
            if match:
                return (0, -int(match.group(1)))
            return (0, 0)
        
        unique_properties.sort(key=sort_key)
        
        # Output as JSON
        output = json.dumps(unique_properties, indent=2, ensure_ascii=False)
        print(output)
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        # Clean up
        run_agent_browser('close --all')

if __name__ == '__main__':
    main()
