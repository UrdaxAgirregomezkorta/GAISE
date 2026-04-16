$ErrorActionPreference = "Stop"

# 1) Open listing page
$null = & agent-browser --json open "https://inmobiliariaiparralde.com/inmuebles/listado_de_inmuebles" | ConvertFrom-Json
$null = & agent-browser --json wait 4000 | ConvertFrom-Json

# 2) Apply requested filters (matching the screenshot context)
$setFiltersJs = @'
(() => {
  const s = (v) => {
    if (v === null) return "";
    if (v === undefined) return "";
    return String(v);
  };

  const setSelectByOptionText = (wantedText) => {
    const needle = s(wantedText).trim().toLowerCase();
    const selects = Array.from(document.querySelectorAll("select"));
    for (const sel of selects) {
      const opts = Array.from(sel.options ? sel.options : []);
      const match = opts.find((o) => s(o.textContent).trim().toLowerCase() === needle);
      if (match) {
        sel.value = match.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  };

  const tx = setSelectByOptionText("Alquilar");
  const tipo = setSelectByOptionText("Piso");
  const muni = setSelectByOptionText("Hendaye");

  const button = Array.from(document.querySelectorAll("button, input[type='submit'], a")).find((el) => {
    const txt = s(el.textContent).trim().toLowerCase();
    const val = s(el.value).trim().toLowerCase();
    if (txt === "buscar") return true;
    if (val === "buscar") return true;
    return false;
  });

  if (button) button.click();
  return { transaction_set: tx, type_set: tipo, municipality_set: muni, clicked_search: !!button };
})()
'@

$null = & agent-browser --json eval $setFiltersJs | ConvertFrom-Json
$null = & agent-browser --json wait 3000 | ConvertFrom-Json

# 3) Discover pagination
$getPagesJs = @'
(() => {
  const nums = Array.from(document.querySelectorAll("a.page"))
    .map((a) => parseInt(String(a.textContent || "").trim(), 10))
    .filter((n) => Number.isFinite(n));
  const unique = Array.from(new Set(nums)).sort((a, b) => a - b);
  if (unique.length === 0) return { pages: [1] };
  return { pages: unique };
})()
'@

$pagesResp = & agent-browser --json eval $getPagesJs | ConvertFrom-Json
$pages = $pagesResp.data.result.pages
if (-not $pages) { $pages = @(1) }

# 4) Scrape each page
$scrapePageJs = @'
(() => {
  const toAbs = (u) => {
    try { return new URL(u, location.href).href; }
    catch (_) {
      if (u === null) return null;
      if (u === undefined) return null;
      if (u === "") return null;
      return String(u);
    }
  };

  const stableIdFromUrl = (u) => {
    if (!u) return null;
    const m = String(u).match(/inmueble_detalles\/(\d+)/i);
    if (m) return m[1];
    return String(u).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  };

  const cards = Array.from(document.querySelectorAll(".owl-item:not(.cloned) .item"));
  const rows = [];

  for (const card of cards) {
    const detailA = Array.from(card.querySelectorAll("a[href]")).find((a) => String(a.href || "").indexOf("inmueble_detalles") >= 0);
    if (!detailA) continue;

    const hrefAttr = detailA.getAttribute("href");
    const detailUrl = toAbs(hrefAttr ? hrefAttr : detailA.href);
    const titleNode = card.querySelector("h3 a, h4 a, h3, h4");
    const priceNode = card.querySelector(".nav_tag.price, .price");
    const locNode = card.querySelector("p");

    rows.push({
      title: titleNode ? String(titleNode.textContent).trim() : null,
      price: priceNode ? String(priceNode.textContent).replace(/\s+/g, " ").trim() : null,
      location: locNode ? String(locNode.textContent).replace(/\s+/g, " ").trim() : null,
      detail_url: detailUrl,
      stable_id: stableIdFromUrl(detailUrl)
    });
  }

  return rows;
})()
'@

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$allRows = @()

foreach ($p in $pages) {
  if ([int]$p -ne 1) {
    $selector = "a.page[href='#page:$p']"
    $null = & agent-browser --json click $selector | ConvertFrom-Json
    $null = & agent-browser --json wait 1800 | ConvertFrom-Json
  }

  $pageResp = & agent-browser --json eval $scrapePageJs | ConvertFrom-Json
  $pageRows = $pageResp.data.result
  foreach ($r in $pageRows) {
    $r | Add-Member -NotePropertyName scraping_timestamp -NotePropertyValue $timestamp -Force
    $allRows += $r
  }
}

# 5) Deduplicate by detail URL and print JSON array
$dedup = @{}
foreach ($row in $allRows) {
  if (-not $row.detail_url) { continue }
  if (-not $dedup.ContainsKey($row.detail_url)) {
    $dedup[$row.detail_url] = $row
  }
}

$result = @($dedup.Values)
if ($result.Count -eq 0) {
  Write-Output "[]"
} else {
  Write-Output ($result | ConvertTo-Json -Depth 8)
}
