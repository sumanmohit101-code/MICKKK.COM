/* =========================================================================
   MICKKK STOCK SCREENER — MASTER VIEW
   Data load (worker + cache), column detection, multi-select filters,
   scanner chips, column selector and fast table rendering.
   Shares globals with screener.js (rawDataset, symbolRsRatingMap, ...).
   ========================================================================= */

// ---------- small helpers ----------
const NORM = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function $id(id) { return document.getElementById(id); }
function paramNum(id, def) { const el = $id(id); const v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? def : v; }
function mkToast(msg) {
  let t = $id('mkToast');
  if (!t) { t = document.createElement('div'); t.id = 'mkToast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- 3-link stock cell (inline SVG: no icon scan needed => fast) ----------
const SVG_CHART = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>';
const SVG_EXT = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
const SVG_CANDLE = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/></svg>';
function renderStockWith3Links(sym, name) {
  const s = esc(String(sym || '').toUpperCase());
  const n = esc(name || s);
  return `<div class="stk-line"><span class="stk-sym">${s}</span><span class="stock-action-links">
      <a href="charts.html?symbol=${s}" target="_blank" rel="noopener" class="chart-icon-link link-mickkk" title="Open MICKKK Chart">${SVG_CHART}</a>
      <a href="https://www.tradingview.com/chart/?symbol=NSE:${s}" target="_blank" rel="noopener" class="chart-icon-link link-tv" title="Open TradingView Chart">${SVG_EXT}</a>
      <a href="https://chartink.com/stocks/${s}.html" target="_blank" rel="noopener" class="chart-icon-link link-chartink" title="Open Chartink Chart">${SVG_CANDLE}</a>
    </span></div><div class="company-name" title="${n}">${n}</div>`;
}

// =========================================================================
// COLUMN DETECTION (header names differ between sheets -> match by alias)
// =========================================================================
const ALIASES = {
  close: ['close', 'ltp', 'cmp', 'price', 'lastprice', 'closeprice'],
  volume: ['volume', 'vol', 'tradedvolume'],
  mcap: ['marketcap', 'mcap', 'mktcap', 'marketcapcr', 'marketcapincr'],
  capcat: ['marketcapcategory', 'mcapcategory', 'capcategory', 'marketcapcat', 'captype', 'cap'],
  d: ['d', '1d', 'day', 'daily', 'dchange', 'daychange', '1day', 'dpct'],
  w: ['w', '1w', 'week', 'weekly', 'wchange', '1week'],
  d15: ['15d', '15day', '15days', '15dchange'],
  m: ['m', '1m', 'month', 'monthly', '1month'],
  q: ['q', '3m', 'quarter', 'quarterly', '1q', '3month'],
  h: ['h', '6m', 'half', 'halfyearly', 'halfyear', '6month'],
  y: ['y', '1y', 'year', 'yearly', '12m', '1year'],
  away52: ['52whaway', '52wkhaway', 'away52wh', 'awayfrom52wh', '52whawaypct'],
  rsi: ['rsi', 'rsi14'],
  drange: ['drange', 'dayrange', '1drange', 'dailyrange'],
  range3d: ['3drange', '3dayrange', 'range3d'],
  sector: ['sector'], industry: ['industry'],
  vwap: ['vwap'], ema10: ['10ema', 'ema10', '10dema'], ema20: ['20ema', 'ema20', '20dema'],
  ema50: ['50ema', 'ema50', '50dema'], ema200: ['200ema', 'ema200', '200dema'],
  turn20: ['20davgturnover', '20davgturn', 'avgturnover20d', '20dayavgturnover'],
  high15: ['15dhigh', '15dagohigh'], highW: ['1whigh', 'whigh', 'wagohigh'], highM: ['1mhigh', 'mhigh', 'magohigh'],
  highQ: ['1qhigh', 'qhigh', 'qagohigh'], highY: ['1yhigh', 'yhigh', 'yagohigh'],
  roce: ['roce', 'roce%'], cr: ['currentratio', 'cr'], eps: ['eps', 'ttmeps'],
  de: ['debttoequity', 'de', 'debtequity'], pe: ['pe', 'peratio'], pb: ['pb', 'pbratio'], bv: ['bookvalue', 'bv'],
  rsRatingSheet: ['rsrating']
};
let COL = {};            // canonical -> actual header text in the sheet
let HDR_LABEL = {};      // header text -> friendly label
const DEFAULT_KEYS = ['capcat', 'mcap', 'close', 'volume', 'd', 'w', 'd15', 'm', 'q', 'h', 'y', 'away52', 'rsi', 'drange', 'range3d'];
const FRIENDLY = { capcat: 'CAP CATEGORY', mcap: 'MARKET CAP (Cr)', close: 'LTP', volume: 'VOLUME', d: 'D %', w: 'W %', d15: '15D %', m: 'M %', q: 'Q %', h: 'H %', y: 'Y %', away52: '52WH AWAY', rsi: 'RSI', drange: 'D RANGE', range3d: '3D RANGE' };
let DEFAULT_COLS = [];

function resolveColumns() {
  COL = {}; HDR_LABEL = {};
  const normMap = new Map();
  rawHeaders.forEach(h => { const k = NORM(h); if (!normMap.has(k)) normMap.set(k, h); });
  Object.keys(ALIASES).forEach(k => {
    for (const a of ALIASES[k]) { if (normMap.has(a)) { COL[k] = normMap.get(a); break; } }
  });
  // fuzzy fallback for range columns
  if (!COL.range3d) COL.range3d = rawHeaders.find(h => /3\s*d.*range|range.*3\s*d/i.test(h));
  if (!COL.drange) COL.drange = rawHeaders.find(h => /range/i.test(h) && h !== COL.range3d && !/3/.test(h));
  if (!COL.away52) COL.away52 = rawHeaders.find(h => /52\s*w.*away|away.*52/i.test(h));
  if (!COL.volume) COL.volume = rawHeaders.find(h => /^volume/i.test(h));
  Object.keys(FRIENDLY).forEach(k => { if (COL[k]) HDR_LABEL[COL[k]] = FRIENDLY[k]; });
  DEFAULT_COLS = DEFAULT_KEYS.map(k => COL[k]).filter(Boolean);
  DEFAULT_COLS.push('Detected Patterns');
  HDR_LABEL['Detected Patterns'] = 'DETECTED PATTERNS';
  console.info('[Screener] column map', COL);
}
function orderCols(list) {
  const idx = c => { const i = DEFAULT_COLS.indexOf(c); return i >= 0 ? i : 1000 + availableColumns.indexOf(c); };
  return list.slice().sort((a, b) => idx(a) - idx(b));
}
const gv = (r, k) => { const h = COL[k]; const v = h ? r[h] : undefined; return (v === '' || v == null || isNaN(Number(v))) ? 0 : Number(v); };

// =========================================================================
// DATA LOAD (worker -> cache). Header row is auto-located; no column shifting.
// =========================================================================
const HEADER_KEYS = ['symbol', 'nsesymbol', 'stockname', 'close', 'ltp', 'volume', 'rsi', 'sector', 'industry', 'marketcap', 'marketcapcategory', '52whaway', 'companyname'];
function cellText(c) { return (c && c.v !== null && c.v !== undefined) ? String(c.f != null ? c.f : c.v).trim() : ''; }

function parseGVizMasterData(gviz) {
  if (!gviz || !gviz.table || !gviz.table.rows) return null;
  const cols = (gviz.table.cols || []).map(c => (c && c.label ? String(c.label).trim() : ''));
  const rows = gviz.table.rows;
  const score = arr => arr.filter(v => HEADER_KEYS.includes(NORM(v))).length;
  let best = { s: score(cols), arr: cols, dataStart: 0 };
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const arr = (rows[i].c || []).map(cellText);
    const s = score(arr);
    if (s > best.s) best = { s, arr, dataStart: i + 1 };
  }
  if (best.s < 3) return null;

  const names = best.arr;                                  // keeps column POSITIONS (blank headers stay blank)
  const idxs = []; const headers = [];
  names.forEach((n, i) => { if (n) { idxs.push(i); headers.push(n); } });
  const symIdx = (() => { let i = names.findIndex(n => NORM(n) === 'nsesymbol'); if (i < 0) i = names.findIndex(n => NORM(n) === 'symbol'); return i; })();
  let nameIdx = names.findIndex(n => ['stockname', 'companyname', 'nameofcompany', 'name'].includes(NORM(n)));
  if (symIdx < 0) return null;

  const out = [];
  for (let i = best.dataStart; i < rows.length; i++) {
    const c = rows[i].c; if (!c) continue;
    const sym = cellText(c[symIdx]).toUpperCase();
    if (!sym || sym === 'NSE SYMBOL' || sym === 'SYMBOL' || sym.includes('NOTE')) continue;
    const row = { 'Symbol': sym, 'Stock Name': nameIdx >= 0 ? (cellText(c[nameIdx]) || sym) : sym, 'NSE Symbol': sym };
    for (let k = 0; k < idxs.length; k++) {
      const cell = c[idxs[k]], h = headers[k];
      if (!cell || cell.v === null || cell.v === undefined) { row[h] = ''; continue; }
      if (typeof cell.v === 'number') { row[h] = cell.v; continue; }
      const sv = String(cell.f != null ? cell.f : cell.v).trim();
      const num = parseFloat(sv.replace(/[%,\s₹]/g, ''));
      row[h] = (sv !== '' && isFinite(num) && /^[-+]?\d+(\.\d+)?%?$/.test(sv.replace(/[,\s₹]/g, ''))) ? num : sv;
    }
    out.push(row);
  }
  return { headers, rows: out };
}

async function loadMasterStockData() {
  let parsed = null, updated = null;
  try {
    const res = await MKC.gviz('Chartink Data');
    const text = await res.text();
    if (!/^\s*<(!doctype|html)/i.test(text)) {
      const gj = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
      parsed = parseGVizMasterData(gj);
    }
  } catch (e) { console.warn('[Screener] gviz master failed', e); }

  if (!parsed) {
    try {
      const res = await MKC.fetch('screener', { action: 'getMasterStockList' });
      const j = await res.json();
      if (j && j.success && j.data && j.data.length) { parsed = { headers: j.headers || Object.keys(j.data[0]), rows: j.data }; updated = j.updatedAt; }
    } catch (e) { console.warn('[Screener] webapp master failed', e); }
  }
  if (!parsed || !parsed.rows.length) { $id('loader').style.display = 'none'; return false; }
  rawHeaders = parsed.headers;
  handleMasterDataSuccess(parsed.rows, updated || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), true);
  return true;
}

function handleMasterDataSuccess(dataList, updatedAt, fresh) {
  $id('loader').style.display = 'none';
  if (!dataList || !dataList.length) return;
  rawDataset = dataList;
  if (fresh) {
    MKC.set(CACHE_KEYS.MASTER, dataList);
    MKC.set(CACHE_KEYS.HEADERS, rawHeaders);
    MKC.set(CACHE_KEYS.UPDATED, updatedAt);
  }
  $id('total-count').innerText = rawDataset.length;
  const lu = $id('last-updated-time'); if (lu) lu.textContent = updatedAt || '';

  resolveColumns();
  const excluded = new Set(['sno', 'bsecode', 'nsesymbol', 'symbol', 'stockname', 'sector', 'industry', 'detectedpatterns']);
  availableColumns = rawHeaders.filter(h => !excluded.has(NORM(h)));
  availableColumns.push('Detected Patterns');

  // default / saved column selection
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('mickkk_screener_cols') || 'null'); } catch (e) {}
  const valid = Array.isArray(saved) ? saved.filter(c => availableColumns.includes(c)) : [];
  visibleColumnsSet = new Set(valid.length ? valid : DEFAULT_COLS);
  if (!window.__matrixInit) { activeMatrixView = valid.length ? 'custom' : 'default'; window.__matrixInit = true; }
  syncMatrixButtons(); filterDisplayHeadersByMatrix();
  if (!availableColumns.includes(currentSortCol)) currentSortCol = COL.d || 'Symbol';

  enrichDataset();
  buildFilterOptions();
  applyAllFilters();
}

// attach sector / industry / cap category to every row (sector comes from RS Ranking sheet if master lacks it)
function enrichDataset() {
  if (!rawDataset.length) return;
  const capFromMcap = r => {
    let v = gv(r, 'mcap'); if (!v) return '';
    if (v > 1e9) v = v / 1e7;                       // raw rupees -> Cr
    return v >= 20000 ? 'Large Cap' : v >= 5000 ? 'Mid Cap' : v >= 500 ? 'Small Cap' : 'Micro Cap';
  };
  rawDataset.forEach(r => {
    const rk = symbolRsRatingMap[r.Symbol];
    let sec = COL.sector ? r[COL.sector] : r['Sector'];
    let ind = COL.industry ? r[COL.industry] : r['Industry'];
    if (!sec || sec === '-') sec = rk ? rk.Sector : '';
    if (!ind || ind === '-') ind = rk ? rk.Industry : '';
    r.__sec = toTitleCase(sec || ''); r.__ind = toTitleCase(ind || '');
    const raw = COL.capcat ? String(r[COL.capcat] || '').toLowerCase() : '';
    r.__cap = raw.includes('large') ? 'Large Cap' : raw.includes('mid') ? 'Mid Cap' : raw.includes('small') ? 'Small Cap' : raw.includes('micro') ? 'Micro Cap'
      : (raw.trim() ? toTitleCase(raw) : capFromMcap(r));
  });
}

// =========================================================================
// MULTI-SELECT DROPDOWN
// =========================================================================
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
function MultiSelect(rootId, allLabel, onChange) {
  const root = $id(rootId); const sel = new Set(); let opts = [];
  root.classList.add('msel');
  root.innerHTML = `<button type="button" class="msel-btn"><span class="msel-label">${allLabel}</span><span class="msel-cnt" hidden></span>${CHEV}</button>
    <div class="msel-panel" hidden>
      <div class="msel-tools"><input class="msel-search" type="text" placeholder="Search…" autocomplete="off">
        <button type="button" class="msel-sa">Select all</button><button type="button" class="msel-cl">Clear</button></div>
      <div class="msel-list"></div></div>`;
  const btn = root.querySelector('.msel-btn'), panel = root.querySelector('.msel-panel'), list = root.querySelector('.msel-list');
  const search = root.querySelector('.msel-search'), lbl = root.querySelector('.msel-label'), cnt = root.querySelector('.msel-cnt');

  function paintLabel() {
    if (sel.size === 0) { lbl.textContent = allLabel; cnt.hidden = true; root.classList.remove('has-sel'); return; }
    lbl.textContent = sel.size === 1 ? [...sel][0] : `${sel.size} selected`;
    cnt.hidden = sel.size < 2; cnt.textContent = sel.size; root.classList.add('has-sel');
  }
  function paintList() {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = opts.map(o => `<label class="msel-opt${q && !o.v.toLowerCase().includes(q) ? ' hide' : ''}"><input type="checkbox" value="${esc(o.v)}"${sel.has(o.v) ? ' checked' : ''}><span class="nm">${esc(o.v)}</span><em>${o.n}</em></label>`).join('') || '<div class="msel-empty">No options</div>';
  }
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.hidden;
    document.querySelectorAll('.msel-panel').forEach(p => p.hidden = true);
    panel.hidden = !open; if (open) { search.value = ''; paintList(); setTimeout(() => search.focus(), 0); }
  });
  panel.addEventListener('click', e => e.stopPropagation());
  list.addEventListener('change', e => {
    const v = e.target.value; if (e.target.checked) sel.add(v); else sel.delete(v);
    paintLabel(); onChange();
  });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll('.msel-opt').forEach(l => l.classList.toggle('hide', !!q && !l.querySelector('.nm').textContent.toLowerCase().includes(q)));
  });
  root.querySelector('.msel-sa').addEventListener('click', () => {
    list.querySelectorAll('.msel-opt:not(.hide) input').forEach(i => { i.checked = true; sel.add(i.value); });
    paintLabel(); onChange();
  });
  root.querySelector('.msel-cl').addEventListener('click', () => { sel.clear(); paintList(); paintLabel(); onChange(); });

  return {
    get selected() { return sel; },
    setOptions(list2) {                                    // [{v, n}] ; drops selections that no longer exist
      opts = list2; const valid = new Set(list2.map(o => o.v));
      [...sel].forEach(v => { if (!valid.has(v)) sel.delete(v); });
      paintLabel(); if (!panel.hidden) paintList();
    },
    clear() { sel.clear(); paintLabel(); if (!panel.hidden) paintList(); }
  };
}
document.addEventListener('click', () => document.querySelectorAll('.msel-panel').forEach(p => p.hidden = true));

let msSector = null, msIndustry = null, msCap = null;
function initMultiSelects() {
  if (msSector) return;
  msSector = MultiSelect('ms-sector', 'All Sectors', () => { buildIndustryOptions(); applyAllFilters(); });
  msIndustry = MultiSelect('ms-industry', 'All Industries', applyAllFilters);
  msCap = MultiSelect('ms-cap', 'All Market Caps', applyAllFilters);
}
function countBy(rows, key) {
  const m = new Map(); rows.forEach(r => { const v = r[key]; if (v && v !== '-') m.set(v, (m.get(v) || 0) + 1); });
  return m;
}
function buildFilterOptions() {
  initMultiSelects();
  const sec = countBy(rawDataset, '__sec');
  msSector.setOptions([...sec].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ v, n })));
  buildIndustryOptions();
  const capOrder = ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'];
  const cap = countBy(rawDataset, '__cap');
  const caps = [...cap].sort((a, b) => (capOrder.indexOf(a[0]) + 1 || 99) - (capOrder.indexOf(b[0]) + 1 || 99));
  msCap.setOptions(caps.map(([v, n]) => ({ v, n })));
}
function buildIndustryOptions() {
  const rows = msSector.selected.size ? rawDataset.filter(r => msSector.selected.has(r.__sec)) : rawDataset;
  const ind = countBy(rows, '__ind');
  msIndustry.setOptions([...ind].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ v, n })));
}
// legacy names (other code may call them)
function populateSectorsDropdown() { buildFilterOptions(); }
function populateIndustriesDropdown() { if (msSector) buildIndustryOptions(); }

// =========================================================================
// SCANNER CHIPS (Patterns & Scanners)
// =========================================================================
let scannerMode = 'all';
let scanExpanded = false;
async function fetchChartinkScannerData() {
  try {
    const res = await MKC.fetch('scanners', {});
    const json = await res.json();
    if (json && json.success && json.data) {
      chartinkScanners = json.data.scanners || {};
      stockToScannersMap = json.data.stockToScannersMap || {};
      MKC.set(CACHE_KEYS.SCANNERS, { scanners: chartinkScanners, stockToScannersMap });
      renderScannerChips(); renderMasterTable();
    }
  } catch (err) { console.warn('[Screener] scanners failed', err); }
}
function renderScannerChips() {
  const box = $id('chartinkScannersRow'); if (!box) return;
  const keys = Object.keys(chartinkScanners);
  const total = $id('scanTotal'); if (total) total.textContent = keys.length ? `${keys.length}` : '';
  if (!keys.length) { box.innerHTML = '<span class="flt-hint">Loading live scanners…</span>'; return; }
  const q = ($id('scanSearch') || {}).value ? $id('scanSearch').value.trim().toLowerCase() : '';
  const list = keys.filter(k => !q || k.toLowerCase().includes(q));
  box.innerHTML = list.map(k => {
    const count = chartinkScanners[k].length, cleanName = esc(k.replace(/\(\d+\)/g, '').trim());
    return `<span class="chip-scanner-vip${activeScannerChips.has(k) ? ' active' : ''}" data-scanner="${esc(k)}"><span>${getScannerIcon(k)}</span><span>${cleanName}</span><span class="scanner-count-badge">${count}</span></span>`;
  }).join('') || '<span class="flt-hint">No pattern matches your search.</span>';
}
document.addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('.chip-scanner-vip');
  if (!chip || !chip.dataset.scanner) return;
  const k = chip.dataset.scanner;
  if (activeScannerChips.has(k)) { activeScannerChips.delete(k); chip.classList.remove('active'); }
  else { activeScannerChips.add(k); chip.classList.add('active'); }
  applyAllFilters();
});
function toggleScannerChip(el, name) { /* kept for compatibility; handled by delegated click */ }
function setScannerMode(mode) {
  scannerMode = mode;
  document.querySelectorAll('#scanMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  applyAllFilters();
}
function toggleScanExpand() {
  scanExpanded = !scanExpanded;
  $id('chartinkScannersRow').classList.toggle('collapsed', !scanExpanded);
  $id('scanToggle').textContent = scanExpanded ? 'Show less' : 'Show all';
}

// =========================================================================
// FILTERS
// =========================================================================
function toggleChip(el, key) {
  if (activeChips.has(key)) { activeChips.delete(key); el.classList.remove('active'); }
  else { activeChips.add(key); el.classList.add('active'); }
  applyAllFilters();
}
function clearAllFilterChips() {
  activeChips.clear(); activeScannerChips.clear();
  document.querySelectorAll('.chip, .chip-scanner-vip').forEach(c => c.classList.remove('active'));
  applyAllFilters();
}
function resetAllFilters() {
  $id('search-input').value = '';
  if (msSector) { msSector.clear(); buildIndustryOptions(); msIndustry.clear(); msCap.clear(); }
  const defs = { 'param-pullback': 1.5, 'param-away-52wh': -20, 'param-turnover': 0, 'param-rsi': 60, 'param-roce': 15, 'param-eps': 0, 'param-cr-less': 3.0, 'param-pb-less': 5.0, 'param-de': 1.0, 'param-pe': 40 };
  Object.keys(defs).forEach(id => { const el = $id(id); if (el) el.value = defs[id]; });
  clearAllFilterChips();
}

function applyAllFilters() {
  if (!rawDataset.length) return;
  const q = $id('search-input').value.trim().toLowerCase();
  const secs = msSector ? msSector.selected : new Set(), inds = msIndustry ? msIndustry.selected : new Set(), caps = msCap ? msCap.selected : new Set();
  const pPullback = paramNum('param-pullback', 1.5), pAway52 = paramNum('param-away-52wh', -20), pTurnover = paramNum('param-turnover', 0),
    pRSI = paramNum('param-rsi', 60), pROCE = paramNum('param-roce', 15), pEPS = paramNum('param-eps', 0), pCR = paramNum('param-cr-less', 3),
    pPB = paramNum('param-pb-less', 5), pDE = paramNum('param-de', 1), pPE = paramNum('param-pe', 40);
  const A = activeChips, scn = [...activeScannerChips], anyMode = scannerMode === 'any';

  filteredDataset = rawDataset.filter(r => {
    if (q) { const s = r.Symbol.toLowerCase(), n = String(r['Stock Name'] || '').toLowerCase(); if (!s.includes(q) && !n.includes(q)) return false; }
    if (secs.size && !secs.has(r.__sec)) return false;
    if (inds.size && !inds.has(r.__ind)) return false;
    if (caps.size && !caps.has(r.__cap)) return false;

    if (scn.length) {
      const st = stockToScannersMap[r.Symbol] || [];
      if (anyMode ? !scn.some(s => st.includes(s)) : !scn.every(s => st.includes(s))) return false;
    }

    const close = gv(r, 'close'), rsi = gv(r, 'rsi'), away = gv(r, 'away52'), vwap = gv(r, 'vwap');
    let turn = gv(r, 'turn20'); if (turn > 100000) turn = turn / 1e7;
    if (pTurnover > 0 && turn < pTurnover) return false;

    if (A.has('rsi60') && rsi < pRSI) return false;
    if (A.has('rsi70') && rsi < 70) return false;
    if (A.has('near52wh') && away < pAway52) return false;

    for (const [chip, key] of [['closeEma10', 'ema10'], ['closeEma20', 'ema20'], ['closeEma50', 'ema50'], ['closeEma200', 'ema200']]) {
      if (A.has(chip) && close < gv(r, key)) return false;
    }
    for (const [chip, key] of [['pullback10ema', 'ema10'], ['pullback20ema', 'ema20']]) {
      if (A.has(chip)) { const e = gv(r, key); if (e === 0 || (Math.abs(close - e) / e * 100) > pPullback) return false; }
    }
    if (A.has('closeVwap') && vwap > 0 && close < vwap) return false;
    for (const [chip, key] of [['near15D', 'high15'], ['nearWeek', 'highW'], ['nearMonth', 'highM'], ['nearQuarter', 'highQ'], ['nearYear', 'highY']]) {
      if (A.has(chip)) { const hi = gv(r, key); if (hi > 0 && ((hi - close) / hi * 100) > 3) return false; }
    }

    if (A.has('roceFilter') && gv(r, 'roce') < pROCE) return false;
    if (A.has('epsFilter') && gv(r, 'eps') < pEPS) return false;
    if (A.has('currentRatioLess')) { const v = gv(r, 'cr'); if (v <= 0 || v >= pCR) return false; }
    if (A.has('pbFilter')) { const v = gv(r, 'pb'); if (v <= 0 || v >= pPB) return false; }
    if (A.has('lowDebt') && gv(r, 'de') > pDE) return false;
    if (A.has('peFilter')) { const v = gv(r, 'pe'); if (v <= 0 || v > pPE) return false; }
    if (A.has('undervaluedBV')) { const v = gv(r, 'bv'); if (v <= 0 || v < close) return false; }
    return true;
  });

  updateActiveCount();
  sortDataset();
  renderMasterTable();
}
function updateActiveCount() {
  let n = activeChips.size + activeScannerChips.size;
  if (msSector) n += msSector.selected.size + msIndustry.selected.size + msCap.selected.size;
  if ($id('search-input').value.trim()) n++;
  if (paramNum('param-turnover', 0) > 0) n++;
  const el = $id('activeFilterCount'); if (el) { el.textContent = n ? `${n} active` : 'No filters'; el.classList.toggle('on', n > 0); }
}

// =========================================================================
// SORT
// =========================================================================
const RS_FIELD = { overall: 'OVERALL_RATING', st: 'ST_RATING', snt: 'SELF_NT_RATING', sdef: 'SELF_DEF_RATING', rnt: 'REL_NT_RATING', rdef: 'REL_DEF_RATING' };
const RS_RANK_FIELD = { overall: 'OVERALL_RANK', st: 'ST_RANK', snt: 'SELF_NT_RANK', sdef: 'SELF_DEF_RANK', rnt: 'REL_NT_RANK', rdef: 'REL_DEF_RANK' };
function rsOf(sym) {                                       // rating straight from the RS Ranking sheet
  const m = symbolRsRatingMap[sym]; if (!m) return null;
  let v = m[RS_FIELD[masterSelectedRsType]];
  if (v == null || isNaN(v) || v <= 0) {                   // only if the sheet has no rating column: derive from rank
    const rk = m[RS_RANK_FIELD[masterSelectedRsType]], N = rawRankingDataset.length || 1200;
    if (!rk || rk >= 999) return null; v = 100 * (1 - (rk - 1) / N);
  }
  return Math.max(1, Math.min(99, Math.round(v)));
}
function sortValue(r, key) {
  if (key === '__RS') return rsOf(r.Symbol);
  if (key === '__SECTOR') return r.__sec;
  if (key === 'Detected Patterns') return (stockToScannersMap[r.Symbol] || []).length;
  return r[key];
}
function sortTable(colKey) {
  if (currentSortCol === colKey) currentSortAsc = !currentSortAsc; else { currentSortCol = colKey; currentSortAsc = (colKey === 'Symbol' || colKey === '__SECTOR'); }
  sortDataset(); renderMasterTable();
}
function sortDataset() {
  const k = currentSortCol, asc = currentSortAsc;
  filteredDataset.sort((a, b) => {
    let x = sortValue(a, k), y = sortValue(b, k);
    const ex = x === undefined || x === null || x === '', ey = y === undefined || y === null || y === '';
    if (ex && ey) return 0; if (ex) return 1; if (ey) return -1;
    if (typeof x === 'string' && typeof y === 'string') return asc ? x.localeCompare(y) : y.localeCompare(x);
    return asc ? Number(x) - Number(y) : Number(y) - Number(x);
  });
}
function changeMasterRsType(val) { masterSelectedRsType = val; if (currentSortCol === '__RS') sortDataset(); renderMasterTable(); }

// =========================================================================
// MATRIX VIEWS + COLUMN SELECTOR
// =========================================================================
function syncMatrixButtons() {
  document.querySelectorAll('.matrix-btn').forEach(b => b.classList.toggle('active', b.dataset.view === activeMatrixView));
  const all = document.querySelector('.matrix-btn[data-view="all"] .mcount'); if (all) all.textContent = availableColumns.length || '';
}
function switchMatrixView(el, viewKey) { activeMatrixView = viewKey; syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable(); }
function filterDisplayHeadersByMatrix() {
  const all = availableColumns;
  const notFund = /Sales|Profit|^PE$|P\/E|^PB$|P\/B|ROCE|ROE|Debt|Asset|Networth|EPS|FII|DII|Promoter|Book/i;
  if (activeMatrixView === 'default') displayHeaders = orderCols(DEFAULT_COLS.filter(c => all.includes(c)));
  else if (activeMatrixView === 'custom') displayHeaders = orderCols(all.filter(h => visibleColumnsSet.has(h)));
  else if (activeMatrixView === 'all') displayHeaders = orderCols(all);
  else if (activeMatrixView === 'technicals') displayHeaders = orderCols(all.filter(h => /Detected|Close|LTP|Volume|RS|RSI|ema|high|low|range|Away|VWAP|ATR/i.test(h) || Object.values(COL).includes(h) && ['d', 'w', 'd15', 'm', 'q', 'h', 'y', 'close', 'volume', 'mcap', 'capcat'].some(k => COL[k] === h)).filter(h => !notFund.test(h)));
  else if (activeMatrixView === 'valuation') displayHeaders = orderCols(all.filter(h => /Market Cap|^PE$|P\/E|^PB$|P\/B|ROCE|ROE|Networth|Debt|Asset|Cap Category|Book|EPS|Ratio/i.test(h)));
  else if (activeMatrixView === 'sales_profit') displayHeaders = orderCols(all.filter(h => /Sales|Profit|Revenue|OPM|Margin|TURNOVER|EBIT/i.test(h)));
  else if (activeMatrixView === 'shareholding') displayHeaders = orderCols(all.filter(h => /FII|DII|Promoter|Public|Holding|Shareholding/i.test(h)));
}

function openColumnModal() {
  const list = $id('columnCheckboxesList'), modal = $id('columnModal');
  const current = new Set(displayHeaders);                // what is on screen right now
  list.innerHTML = availableColumns.map(col => `<label class="col-checkbox-label"><input type="checkbox" value="${esc(col)}"${current.has(col) ? ' checked' : ''}><span>${esc(HDR_LABEL[col] || col)}</span></label>`).join('');
  const s = $id('colSearch'); if (s) s.value = '';
  updateColCount();
  modal.style.display = 'flex';
}
function closeColumnModal() { $id('columnModal').style.display = 'none'; }
function filterColumnList(q) {
  q = q.trim().toLowerCase();
  document.querySelectorAll('#columnCheckboxesList .col-checkbox-label').forEach(l => l.style.display = (!q || l.textContent.toLowerCase().includes(q)) ? '' : 'none');
}
function updateColCount() { const n = document.querySelectorAll('#columnCheckboxesList input:checked').length; const el = $id('colSelCount'); if (el) el.textContent = `${n} selected`; }
function toggleAllColumns(select) {
  document.querySelectorAll('#columnCheckboxesList .col-checkbox-label').forEach(l => { if (l.style.display !== 'none') l.querySelector('input').checked = select; });
  updateColCount();
}
function selectDefaultColumns() {
  const def = new Set(DEFAULT_COLS);
  document.querySelectorAll('#columnCheckboxesList input').forEach(cb => cb.checked = def.has(cb.value));
  updateColCount();
}
function applyCustomColumns() {
  const chosen = [...document.querySelectorAll('#columnCheckboxesList input:checked')].map(cb => cb.value);
  if (!chosen.length) { mkToast('Select at least one column'); return; }
  visibleColumnsSet = new Set(chosen);
  activeMatrixView = 'custom';
  try { localStorage.setItem('mickkk_screener_cols', JSON.stringify(chosen)); } catch (e) {}
  syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable(); closeColumnModal();
}
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#columnCheckboxesList')) updateColCount(); });
function resetColumnsToDefault() {
  try { localStorage.removeItem('mickkk_screener_cols'); } catch (e) {}
  visibleColumnsSet = new Set(DEFAULT_COLS); activeMatrixView = 'default';
  syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable();
}

// =========================================================================
// TABLE RENDER (first rows instantly, rest streamed on scroll)
// =========================================================================
const CHUNK = 120;
let renderedCount = 0, scrollBound = false;
const fmtPct = v => { if (v === '' || v == null || isNaN(v)) return '-'; const n = Number(v); return `<span class="${n > 0 ? 'val-pos' : n < 0 ? 'val-neg' : ''}">${n > 0 ? '+' : ''}${n.toFixed(2)}%</span>`; };
const fmtPrice = v => (v === '' || v == null || isNaN(v)) ? '-' : '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RET_KEYS = ['d', 'w', 'd15', 'm', 'q', 'h', 'y'];

function cellHTML(r, h, symUpper) {
  const val = r[h];
  if (h === 'Detected Patterns') return `<td>${formatPatternPills(stockToScannersMap[symUpper] || [])}</td>`;
  if (h === COL.capcat) {
    const c = r.__cap || '-'; const cls = c.includes('Large') ? 'cap-large' : c.includes('Small') ? 'cap-small' : c.includes('Micro') ? 'cap-micro' : 'cap-mid';
    return `<td>${c === '-' ? '-' : `<span class="cap-badge ${cls}">${esc(c)}</span>`}</td>`;
  }
  if (val === '' || val == null) return '<td>-</td>';
  if (h === COL.mcap) { let n = Number(val); if (isNaN(n)) return `<td>${esc(val)}</td>`; if (n > 1e9) n /= 1e7; return `<td class="num-strong">${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>`; }
  if (h === COL.close || h === COL.vwap) return `<td><span class="val-price">${fmtPrice(val)}</span></td>`;
  if (h === COL.volume) return `<td>${typeof val === 'number' ? val.toLocaleString('en-IN') : esc(val)}</td>`;
  if (RET_KEYS.some(k => COL[k] === h) || h === COL.away52 || /^(roce|opm|fii|dii|promoter|public)\b|return|% ?chg|change/i.test(h)) return `<td>${typeof val === 'number' ? fmtPct(val) : esc(val)}</td>`;
  if (h === COL.drange || h === COL.range3d || /range/i.test(h)) return typeof val === 'number' ? `<td><span class="val-range">${val.toFixed(2)}%</span></td>` : `<td>${esc(val)}</td>`;
  if (h === COL.rsi) return `<td class="num-strong">${typeof val === 'number' ? val.toFixed(1) : esc(val)}</td>`;
  if (/^RS RATING|^Abs RS/i.test(h)) { const n = parseFloat(val); if (isNaN(n)) return '<td>-</td>'; return `<td><span class="rs-pill ${n >= 0 ? 'rs-pill-pos' : 'rs-pill-neg'}">${n >= 0 ? '+' : ''}${n.toFixed(2)}</span></td>`; }
  if (/ema|high|low|ATR/i.test(h) && typeof val === 'number') return `<td><span class="val-price">${fmtPrice(val)}</span></td>`;
  if (/TURNOVER|SALES|Profit/i.test(h) && typeof val === 'number') { const cr = val > 10000 ? (val / 1e7).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : val.toFixed(2); return `<td><span class="${/TURNOVER/i.test(h) ? 'val-turnover' : ''}">₹${cr} Cr</span></td>`; }
  if (typeof val === 'number') return `<td class="num-strong">${val.toFixed(2)}</td>`;
  return `<td>${esc(val)}</td>`;
}

function rowHTML(r) {
  const sym = r.Symbol, rs = rsOf(sym);
  const pill = rs == null ? '<span class="rs-pill rs-pill-na">-</span>' : `<span class="rs-pill ${rs >= 70 ? 'rs-pill-pos' : rs >= 40 ? 'rank-p-top50' : 'rs-pill-neg'}">${rs}</span>`;
  let h = `<tr><td class="sticky-col">${renderStockWith3Links(sym, r['Stock Name'])}</td><td class="sticky-rs">${pill}</td>
    <td><div class="sector-wrap"><span class="sec-txt" title="${esc(r.__sec)}">${esc(r.__sec || '-')}</span><span class="ind-txt" title="${esc(r.__ind)}">${esc(r.__ind || '-')}</span></div></td>`;
  for (let i = 0; i < displayHeaders.length; i++) h += cellHTML(r, displayHeaders[i], sym);
  return h + '</tr>';
}

function renderMasterTable() {
  const headerRow = $id('master-table-headers'), tbody = $id('master-table-body');
  if (!headerRow) return;
  $id('shown-count').innerText = filteredDataset.length;
  if (!displayHeaders.length && availableColumns.length) filterDisplayHeadersByMatrix();

  const arrow = k => currentSortCol === k ? (currentSortAsc ? '▲' : '▼') : '⇅';
  let hh = `<th class="sticky-col" data-sort="Symbol">STOCK / SYMBOL ${arrow('Symbol')}</th>
    <th class="sticky-rs"><div class="rs-th"><span data-sort="__RS" class="rs-th-t">RS RATING ${arrow('__RS')}</span>
      <select class="master-rs-select" onchange="changeMasterRsType(this.value)">
        ${[['overall', 'Overall RS'], ['st', 'Short Term RS'], ['snt', 'Self RS (NT)'], ['sdef', 'Self RS (Def)'], ['rnt', 'Rel RS (NT)'], ['rdef', 'Rel RS (Def)']].map(([v, t]) => `<option value="${v}"${masterSelectedRsType === v ? ' selected' : ''}>${t}</option>`).join('')}
      </select></div></th>
    <th data-sort="__SECTOR">SECTOR / INDUSTRY ${arrow('__SECTOR')}</th>`;
  hh += displayHeaders.map(h => `<th data-sort="${esc(h)}">${esc(HDR_LABEL[h] || h)} ${arrow(h)}</th>`).join('');
  headerRow.innerHTML = hh;

  if (!filteredDataset.length) {
    tbody.innerHTML = `<tr><td colspan="${displayHeaders.length + 3}" class="empty-row">No stocks match the selected filters.</td></tr>`;
    renderedCount = 0; return;
  }
  const first = filteredDataset.slice(0, CHUNK);
  tbody.innerHTML = first.map(rowHTML).join('');
  renderedCount = first.length;
  const wrap = $id('masterTableWrapper'); if (wrap) wrap.scrollTop = 0;
  bindScroll();
}
function bindScroll() {
  if (scrollBound) return; const wrap = $id('masterTableWrapper'); if (!wrap) return; scrollBound = true;
  wrap.addEventListener('scroll', () => {
    if (renderedCount >= filteredDataset.length) return;
    if (wrap.scrollTop + wrap.clientHeight < wrap.scrollHeight - 500) return;
    const next = filteredDataset.slice(renderedCount, renderedCount + CHUNK);
    $id('master-table-body').insertAdjacentHTML('beforeend', next.map(rowHTML).join(''));
    renderedCount += next.length;
  }, { passive: true });
}
document.addEventListener('click', e => {                  // header sort (delegated)
  const th = e.target.closest && e.target.closest('#master-table-headers [data-sort]');
  if (!th || e.target.closest('select')) return;
  sortTable(th.dataset.sort);
});

// =========================================================================
// COPY / CSV
// =========================================================================
function copyTableData() {
  if (!filteredDataset.length) return;
  const symbols = filteredDataset.map(r => r.Symbol).join(', ');
  const done = () => mkToast(`Copied ${filteredDataset.length} symbols`);
  if (navigator.clipboard) navigator.clipboard.writeText(symbols).then(done, () => mkToast('Copy blocked by browser')); else mkToast('Copy not supported');
}
function exportToCSV() {
  if (!filteredDataset.length) return;
  const q = s => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const cols = ['Symbol', 'Stock Name', 'Sector', 'Industry', 'RS Rating', ...displayHeaders];
  let csv = cols.map(q).join(',') + '\n';
  filteredDataset.forEach(r => {
    csv += cols.map(h => {
      if (h === 'Sector') return q(r.__sec); if (h === 'Industry') return q(r.__ind); if (h === 'RS Rating') return q(rsOf(r.Symbol));
      if (h === 'Detected Patterns') return q((stockToScannersMap[r.Symbol] || []).join(' | '));
      if (h === COL.capcat) return q(r.__cap);
      return q(r[h]);
    }).join(',') + '\n';
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  link.download = `MICKKK_Master_Screener_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// auto-refresh is removed from the UI; keep a harmless stub for old callers
function setupAutoRefreshTimer() { if (autoRefreshTimer) clearInterval(autoRefreshTimer); }
