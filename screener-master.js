/* =========================================================================
   MICKKK STOCK SCREENER — MASTER VIEW
   Data load (worker -> direct fallback), exact column mapping for the
   "Chartink Data" sheet, filters (dropdowns, ranges, chips, scanners,
   custom), column selector and fast table rendering.
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
function titleCase(s) { return String(s || '').toLowerCase().replace(/(^|[\s\/(&-])([a-z])/g, (m, a, b) => a + b.toUpperCase()); }
const SEC_FIX = { 'it': 'IT', 'i.t': 'IT', 'fmcg': 'FMCG', 'n/a': 'N/A' };
function prettySector(s) { const k = String(s == null ? '' : s).trim().toLowerCase(); if (!k || k === '-') return ''; return SEC_FIX[k] || titleCase(k); }

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
// COLUMN MAP — exact headers of the "Chartink Data" sheet (+ safe aliases)
// =========================================================================
const ALIASES = {
  close: ['close', 'ltp', 'cmp', 'price', 'lastprice', 'closeprice'],
  volume: ['volume', 'vol'],
  mcap: ['marketcap', 'mcap', 'marketcapcr'],
  capcat: ['marketcapcategory', 'mcapcategory', 'capcategory', 'captype'],
  sector: ['sector'], industry: ['industry'],
  turn20: ['20davgturnover'], turn30: ['30davgturnover'],
  d: ['d', '1d'], w: ['w', '1w'], d15: ['15d'], m: ['m', '1m'], q: ['q', '3m'], h: ['h', '6m'], y: ['y', '1y'],
  away52: ['52whaway'], high52: ['52whigh'], low52: ['52wlow'],
  rsi: ['rsi', 'rsi14'], awayEma200: ['awayema200', 'awayfromema200'],
  drange: ['drange'], range3: ['3drange'], range5: ['5drange'], range10: ['10drange'], range20: ['20drange'], range30: ['30drange'],
  vwap: ['vwap'], ema5: ['5ema'], ema10: ['10ema'], ema20: ['20ema'], ema50: ['50ema'], ema100: ['100ema'], ema150: ['150ema'], ema200: ['200ema'],
  high15: ['15dagohigh', '15dhigh'], highW: ['1wagohigh', '1whigh'], highM: ['1magohigh', '1mhigh'], highQ: ['1qagohigh', '1qhigh'], highY: ['1yagohigh', '1yhigh'],
  roce: ['roce'], cr: ['currentratio'], eps: ['eps'], de: ['debttoequity'], pe: ['yearlype', 'pe'], pb: ['pb'], bv: ['bookvalue'], opm: ['opm'],
  salesQ: ['qsales'], salesQ4: ['sales4qago'], npQ: ['netprofitq'], npQ4: ['netprofit4qago'],
  fii: ['totalfii'], fii1: ['totalfii1qago'], dii: ['totaldii'], dii1: ['totaldii1qago'], promo: ['totalpromoter']
};
const RET_KEYS = ['d', 'w', 'd15', 'm', 'q', 'h', 'y'];
const RANGE_KEYS = ['drange', 'range3', 'range5', 'range10', 'range20', 'range30'];
// default columns, in the order you asked for
const DEFAULT_KEYS = ['capcat', 'close', 'volume', 'mcap', 'turn30', 'd', 'w', 'd15', 'm', 'q', 'h', 'y', 'away52', 'rsi', 'awayEma200', 'drange', 'range5', 'range10', 'range30'];
const FRIENDLY = {
  capcat: 'CAP CATEGORY', close: 'LTP', volume: 'VOLUME', mcap: 'MARKET CAP (Cr)', turn20: '20D TURNOVER (Cr)', turn30: '30D TURNOVER (Cr)',
  d: 'D %', w: 'W %', d15: '15D %', m: 'M %', q: 'Q %', h: 'H %', y: 'Y %', away52: '52WH AWAY', rsi: 'RSI', awayEma200: 'AWAY EMA 200',
  drange: 'D RANGE', range3: '3D RANGE', range5: '5D RANGE', range10: '10D RANGE', range20: '20D RANGE', range30: '30D RANGE'
};
let COL = {};            // canonical -> actual header text in the sheet
let HDR_LABEL = {};      // header text -> friendly label
let DEFAULT_COLS = [];
let COLMETA = { pct: [] };   // headers whose cells were formatted as % in the sheet

function resolveColumns() {
  COL = {}; HDR_LABEL = {};
  const normMap = new Map();
  rawHeaders.forEach(h => { const k = NORM(h); if (!normMap.has(k)) normMap.set(k, h); });
  Object.keys(ALIASES).forEach(k => { for (const a of ALIASES[k]) { if (normMap.has(a)) { COL[k] = normMap.get(a); break; } } });
  Object.keys(FRIENDLY).forEach(k => { if (COL[k]) HDR_LABEL[COL[k]] = FRIENDLY[k]; });
  HDR_LABEL['RS RATING'] = 'RS RAW'; HDR_LABEL['RS RATING_M'] = 'RS RAW (M)';
  DEFAULT_COLS = DEFAULT_KEYS.map(k => COL[k]).filter(Boolean);
  DEFAULT_COLS.push('Detected Patterns');
  HDR_LABEL['Detected Patterns'] = 'DETECTED PATTERNS';
  const missing = DEFAULT_KEYS.filter(k => !COL[k]);
  if (missing.length) console.warn('[Screener] columns not found in sheet:', missing.join(', '));
  console.info('[Screener] column map', COL);
}
function orderCols(list) {
  const idx = c => { const i = DEFAULT_COLS.indexOf(c); return i >= 0 ? i : 1000 + availableColumns.indexOf(c); };
  return list.slice().sort((a, b) => idx(a) - idx(b));
}
// numeric value of a canonical column, or null when blank / not a number
const nv = (r, k) => { const h = COL[k]; if (!h) return null; const v = r[h]; return (typeof v === 'number' && isFinite(v)) ? v : null; };
const mcapCr = r => { let v = nv(r, 'mcap'); if (v == null) return null; return v > 1e9 ? v / 1e7 : v; };
const turnCr = r => { let v = nv(r, 'turn30'); if (v == null) v = nv(r, 'turn20'); if (v == null) return null; return v >= 1e6 ? v / 1e7 : v; };
const growth = (r, a, b) => { const x = nv(r, a), y = nv(r, b); if (x == null || y == null || y === 0) return null; return (x - y) / Math.abs(y) * 100; };

// =========================================================================
// DATA LOAD
// =========================================================================
const HEADER_KEYS = ['nsesymbol', 'symbol', 'stockname', 'close', 'volume', 'rsi', 'sector', 'industry', 'marketcap', 'marketcapcategory', '52whaway'];
function cellText(c) { return (c && c.v !== null && c.v !== undefined) ? String(c.f != null ? c.f : c.v).trim() : ''; }

function parseGVizMasterData(gviz) {
  if (!gviz || !gviz.table || !gviz.table.rows) return null;
  const cols = (gviz.table.cols || []).map(c => (c && c.label ? String(c.label).trim() : ''));
  const rows = gviz.table.rows;
  const score = arr => arr.filter(v => HEADER_KEYS.includes(NORM(v))).length;
  let best = { s: score(cols), arr: cols, dataStart: 0 };
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const arr = (rows[i].c || []).map(cellText);
    const s = score(arr);
    if (s > best.s) best = { s, arr, dataStart: i + 1 };
  }
  const names = best.arr;                                  // keeps column POSITIONS (blank headers stay blank)
  const symIdx = (() => { let i = names.findIndex(n => NORM(n) === 'nsesymbol'); if (i < 0) i = names.findIndex(n => NORM(n) === 'symbol'); return i; })();
  if (symIdx < 0 || best.s < 2) return null;
  const nameIdx = names.findIndex(n => ['stockname', 'companyname', 'nameofcompany'].includes(NORM(n)));
  const idxs = [], headers = [];
  names.forEach((n, i) => { if (n) { idxs.push(i); headers.push(n); } });

  const pct = new Set(), out = [];
  for (let i = best.dataStart; i < rows.length; i++) {
    const c = rows[i].c; if (!c) continue;
    const sym = cellText(c[symIdx]).toUpperCase();
    if (!sym || sym === 'NSE SYMBOL' || sym === 'SYMBOL') continue;
    const row = { 'Symbol': sym, 'Stock Name': nameIdx >= 0 ? (cellText(c[nameIdx]) || sym) : sym, 'NSE Symbol': sym };
    for (let k = 0; k < idxs.length; k++) {
      const cell = c[idxs[k]], h = headers[k];
      if (!cell || cell.v === null || cell.v === undefined) { row[h] = ''; continue; }
      if (typeof cell.v === 'number') {
        // sheet cells formatted as "-2.49%" arrive as the fraction -0.0249 => use the formatted number instead
        if (typeof cell.f === 'string' && /%\s*$/.test(cell.f)) {
          const p = parseFloat(cell.f.replace(/[,%\s]/g, ''));
          row[h] = isNaN(p) ? cell.v * 100 : p; pct.add(h);
        } else row[h] = cell.v;
        continue;
      }
      const sv = String(cell.f != null ? cell.f : cell.v).trim();
      const clean = sv.replace(/[,%\s₹]/g, '');
      if (sv !== '' && /^[-+]?\d+(\.\d+)?$/.test(clean)) { row[h] = parseFloat(clean); if (/%$/.test(sv)) pct.add(h); }
      else row[h] = sv;
    }
    out.push(row);
  }
  return out.length ? { headers, rows: out, pct: [...pct] } : null;
}

async function tryGviz(res) {
  const text = await res.text();
  if (!/setResponse\s*\(|"table"\s*:/.test(text)) return null;
  const gj = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return parseGVizMasterData(gj);
}

async function loadMasterStockData() {
  let parsed = null, updated = null;
  try { parsed = await tryGviz(await MKC.gviz('Chartink Data')); } catch (e) { console.warn('[Screener] sheet read failed', e); }

  if (!parsed) {                                             // last resort: Apps Script web app
    try {
      const res = await MKC.fetch('screener', { action: 'getMasterStockList' });
      const j = await res.json();
      if (j && j.success && j.data && j.data.length) { parsed = { headers: j.headers || Object.keys(j.data[0]), rows: j.data, pct: [] }; updated = j.updatedAt; console.warn('[Screener] using web-app fallback (fewer columns)'); }
    } catch (e) { console.warn('[Screener] web-app fallback failed', e); }
  }
  if (!parsed || !parsed.rows.length) { $id('loader').style.display = 'none'; mkToast('Could not load stock data. Please refresh.'); return false; }
  rawHeaders = parsed.headers;
  COLMETA = { pct: parsed.pct || [] };
  MKC.set('MICKKK_CACHE_COLMETA', COLMETA);
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
  } else { const m = MKC.get('MICKKK_CACHE_COLMETA'); if (m) COLMETA = m; }
  $id('total-count').innerText = rawDataset.length;

  resolveColumns();
  const excluded = new Set(['sno', 'bsecode', 'nsesymbol', 'symbol', 'stockname', 'sector', 'industry', 'detectedpatterns']);
  availableColumns = rawHeaders.filter(h => !excluded.has(NORM(h)));
  availableColumns.push('Detected Patterns');

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('mickkk_screener_cols_v2') || 'null'); } catch (e) {}
  const valid = Array.isArray(saved) ? saved.filter(c => availableColumns.includes(c)) : [];
  visibleColumnsSet = new Set(valid.length ? valid : DEFAULT_COLS);
  if (!window.__matrixInit) { activeMatrixView = valid.length ? 'custom' : 'default'; window.__matrixInit = true; }
  syncMatrixButtons(); filterDisplayHeadersByMatrix();
  if (!availableColumns.includes(currentSortCol)) currentSortCol = COL.d || 'Symbol';

  enrichDataset();
  initRangeFilters();
  buildCustomFilterColumns();
  buildFilterOptions();
  applyAllFilters();
}

// sector / industry / cap category on every row (master sheet first, RS Ranking sheet as backup)
function enrichDataset() {
  if (!rawDataset.length) return;
  const capFromMcap = r => { const v = mcapCr(r); if (!v) return ''; return v >= 20000 ? 'Large Cap' : v >= 5000 ? 'Mid Cap' : v >= 500 ? 'Small Cap' : 'Micro Cap'; };
  rawDataset.forEach(r => {
    const rk = symbolRsRatingMap[r.Symbol];
    let sec = prettySector(COL.sector ? r[COL.sector] : r['Sector']);
    let ind = prettySector(COL.industry ? r[COL.industry] : r['Industry']);
    if (!sec && rk) sec = prettySector(rk.Sector);
    if (!ind && rk) ind = prettySector(rk.Industry);
    r.__sec = sec; r.__ind = ind;
    const raw = COL.capcat ? String(r[COL.capcat] || '').toLowerCase() : '';
    r.__cap = raw.includes('large') ? 'Large Cap' : raw.includes('mid') ? 'Mid Cap' : raw.includes('small') ? 'Small Cap' : raw.includes('micro') ? 'Micro Cap'
      : (raw.trim() ? titleCase(raw) : capFromMcap(r));
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
  list.addEventListener('change', e => { const v = e.target.value; if (e.target.checked) sel.add(v); else sel.delete(v); paintLabel(); onChange(); });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    list.querySelectorAll('.msel-opt').forEach(l => l.classList.toggle('hide', !!q && !l.querySelector('.nm').textContent.toLowerCase().includes(q)));
  });
  root.querySelector('.msel-sa').addEventListener('click', () => { list.querySelectorAll('.msel-opt:not(.hide) input').forEach(i => { i.checked = true; sel.add(i.value); }); paintLabel(); onChange(); });
  root.querySelector('.msel-cl').addEventListener('click', () => { sel.clear(); paintList(); paintLabel(); onChange(); });
  return {
    get selected() { return sel; },
    setOptions(list2) { opts = list2; const valid = new Set(list2.map(o => o.v)); [...sel].forEach(v => { if (!valid.has(v)) sel.delete(v); }); paintLabel(); if (!panel.hidden) paintList(); },
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
function countBy(rows, key) { const m = new Map(); rows.forEach(r => { const v = r[key]; if (v && v !== '-') m.set(v, (m.get(v) || 0) + 1); }); return m; }
function buildFilterOptions() {
  initMultiSelects();
  const sec = countBy(rawDataset, '__sec');
  msSector.setOptions([...sec].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ v, n })));
  buildIndustryOptions();
  const capOrder = ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap'];
  const cap = countBy(rawDataset, '__cap');
  msCap.setOptions([...cap].sort((a, b) => (capOrder.indexOf(a[0]) + 1 || 99) - (capOrder.indexOf(b[0]) + 1 || 99)).map(([v, n]) => ({ v, n })));
}
function buildIndustryOptions() {
  const rows = msSector.selected.size ? rawDataset.filter(r => msSector.selected.has(r.__sec)) : rawDataset;
  const ind = countBy(rows, '__ind');
  msIndustry.setOptions([...ind].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ v, n })));
}
function populateSectorsDropdown() { buildFilterOptions(); }
function populateIndustriesDropdown() { if (msSector) buildIndustryOptions(); }

// =========================================================================
// RANGE FILTERS (min – max)
// =========================================================================
const RANGE_DEFS = [
  { g: 'Price & Volume', items: [
    { id: 'price', label: 'Price (₹)', need: 'close', get: r => nv(r, 'close') },
    { id: 'vol', label: 'Volume', need: 'volume', get: r => nv(r, 'volume') },
    { id: 'mcap', label: 'Market Cap (Cr)', need: 'mcap', get: mcapCr },
    { id: 'turn', label: '30D Turnover (Cr)', need: 'turn30', get: turnCr } ] },
  { g: 'Momentum', items: [
    { id: 'chg', label: 'Day Change %', need: 'd', get: r => nv(r, 'd') },
    { id: 'rsi', label: 'RSI (14)', need: 'rsi', get: r => nv(r, 'rsi') },
    { id: 'rs', label: 'RS Rating', need: '__rs', get: r => rsOf(r.Symbol) },
    { id: 'wk', label: 'Week %', need: 'w', get: r => nv(r, 'w') } ] },
  { g: 'Trend & Highs', items: [
    { id: 'away52', label: '52W High Away %', need: 'away52', get: r => nv(r, 'away52') },
    { id: 'ema200', label: 'Away EMA 200 %', need: 'awayEma200', get: r => nv(r, 'awayEma200') },
    { id: 'mon', label: 'Month %', need: 'm', get: r => nv(r, 'm') },
    { id: 'qtr', label: 'Quarter %', need: 'q', get: r => nv(r, 'q') } ] },
  { g: 'Volatility (Range %)', items: [
    { id: 'r1', label: 'Day Range', need: 'drange', get: r => nv(r, 'drange') },
    { id: 'r5', label: '5D Range', need: 'range5', get: r => nv(r, 'range5') },
    { id: 'r10', label: '10D Range', need: 'range10', get: r => nv(r, 'range10') },
    { id: 'r30', label: '30D Range', need: 'range30', get: r => nv(r, 'range30') } ] }
];
const RANGE_FLAT = RANGE_DEFS.flatMap(g => g.items);
let rfInit = false;
function initRangeFilters() {
  const box = $id('rangeFilters'); if (!box) return;
  if (!rfInit) {
    box.innerHTML = RANGE_DEFS.map(g => `<div class="rf-col"><div class="rf-title">${g.g}</div>${g.items.map(f =>
      `<div class="rf-row" data-rf-row="${f.id}"><label>${f.label}</label><span class="rf-pair"><input type="number" class="rf-in" data-rf="${f.id}" data-end="min" placeholder="Min" step="any"><i>–</i><input type="number" class="rf-in" data-rf="${f.id}" data-end="max" placeholder="Max" step="any"></span></div>`).join('')}</div>`).join('');
    let t = null;
    box.addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyAllFilters, 220); });
    rfInit = true;
  }
  RANGE_FLAT.forEach(f => {                                 // grey out filters whose column is missing in the sheet
    const ok = f.need === '__rs' || !!COL[f.need];
    const row = box.querySelector(`[data-rf-row="${f.id}"]`); if (!row) return;
    row.classList.toggle('na', !ok); row.querySelectorAll('input').forEach(i => i.disabled = !ok);
    row.title = ok ? '' : 'This column is not in the sheet';
  });
}
function activeRanges() {
  const out = [];
  RANGE_FLAT.forEach(f => {
    const a = document.querySelector(`.rf-in[data-rf="${f.id}"][data-end="min"]`), b = document.querySelector(`.rf-in[data-rf="${f.id}"][data-end="max"]`);
    if (!a) return;
    const mn = a.value === '' ? null : parseFloat(a.value), mx = b.value === '' ? null : parseFloat(b.value);
    if (mn != null && !isNaN(mn) || mx != null && !isNaN(mx)) out.push({ f, mn: isNaN(mn) ? null : mn, mx: isNaN(mx) ? null : mx });
  });
  return out;
}

// =========================================================================
// CUSTOM FILTERS (any numeric column)
// =========================================================================
let customFilters = [];
function buildCustomFilterColumns() {
  const sel = $id('cfCol'); if (!sel) return;
  const sample = rawDataset.slice(0, 80);
  const numeric = availableColumns.filter(h => h !== 'Detected Patterns' && sample.filter(r => typeof r[h] === 'number').length > sample.length * 0.4);
  const prev = sel.value;
  sel.innerHTML = numeric.map(h => `<option value="${esc(h)}">${esc(HDR_LABEL[h] || h)}</option>`).join('');
  if (prev && numeric.includes(prev)) sel.value = prev;
}
function addCustomFilter() {
  const col = $id('cfCol').value, op = $id('cfOp').value, val = parseFloat($id('cfVal').value);
  if (!col || isNaN(val)) { mkToast('Choose a column and type a number'); return; }
  customFilters.push({ col, op, val }); $id('cfVal').value = '';
  renderCustomFilters(); applyAllFilters();
}
function removeCustomFilter(i) { customFilters.splice(i, 1); renderCustomFilters(); applyAllFilters(); }
function renderCustomFilters() {
  const box = $id('cfList'); if (!box) return;
  box.innerHTML = customFilters.map((c, i) => `<span class="cf-chip"><b>${esc(HDR_LABEL[c.col] || c.col)}</b> ${esc(c.op)} ${c.val}<button type="button" onclick="removeCustomFilter(${i})" aria-label="Remove">×</button></span>`).join('');
}
const OPS = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b };

// =========================================================================
// SCANNER CHIPS (Patterns & Scanners)
// =========================================================================
let scannerMode = 'all', scanExpanded = false;
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
  const total = $id('scanTotal'); if (total) total.textContent = keys.length ? keys.length : '';
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
  if (activeScannerChips.has(k)) { activeScannerChips.delete(k); chip.classList.remove('active'); } else { activeScannerChips.add(k); chip.classList.add('active'); }
  applyAllFilters();
});
function toggleScannerChip() { /* handled by delegated click */ }
function setScannerMode(mode) { scannerMode = mode; document.querySelectorAll('#scanMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode)); applyAllFilters(); }
function toggleScanExpand() { scanExpanded = !scanExpanded; $id('chartinkScannersRow').classList.toggle('collapsed', !scanExpanded); $id('scanToggle').textContent = scanExpanded ? 'Show less' : 'Show all'; }

// =========================================================================
// FILTERS
// =========================================================================
function toggleChip(el, key) { if (activeChips.has(key)) { activeChips.delete(key); el.classList.remove('active'); } else { activeChips.add(key); el.classList.add('active'); } applyAllFilters(); }
function clearAllFilterChips() {
  activeChips.clear(); activeScannerChips.clear();
  document.querySelectorAll('.chip, .chip-scanner-vip').forEach(c => c.classList.remove('active'));
  applyAllFilters();
}
function resetAllFilters() {
  $id('search-input').value = '';
  if (msSector) { msSector.clear(); buildIndustryOptions(); msIndustry.clear(); msCap.clear(); }
  document.querySelectorAll('.rf-in').forEach(i => i.value = '');
  customFilters = []; renderCustomFilters();
  const defs = { 'param-pullback': 1.5, 'param-roce': 15, 'param-eps': 0, 'param-pe': 40, 'param-pb': 5, 'param-de': 1, 'param-cr': 1.5, 'param-sg': 15, 'param-pg': 15, 'param-opm': 15, 'param-promo': 50 };
  Object.keys(defs).forEach(id => { const el = $id(id); if (el) el.value = defs[id]; });
  clearAllFilterChips();
}

function applyAllFilters() {
  if (!rawDataset.length) return;
  const q = $id('search-input').value.trim().toLowerCase();
  const secs = msSector ? msSector.selected : new Set(), inds = msIndustry ? msIndustry.selected : new Set(), caps = msCap ? msCap.selected : new Set();
  const A = activeChips, scn = [...activeScannerChips], anyMode = scannerMode === 'any';
  const ranges = activeRanges(), cfs = customFilters;
  const P = { pull: paramNum('param-pullback', 1.5), roce: paramNum('param-roce', 15), eps: paramNum('param-eps', 0), pe: paramNum('param-pe', 40), pb: paramNum('param-pb', 5),
    de: paramNum('param-de', 1), cr: paramNum('param-cr', 1.5), sg: paramNum('param-sg', 15), pg: paramNum('param-pg', 15), opm: paramNum('param-opm', 15), promo: paramNum('param-promo', 50) };

  filteredDataset = rawDataset.filter(r => {
    if (q) { const s = r.Symbol.toLowerCase(), n = String(r['Stock Name'] || '').toLowerCase(); if (!s.includes(q) && !n.includes(q)) return false; }
    if (secs.size && !secs.has(r.__sec)) return false;
    if (inds.size && !inds.has(r.__ind)) return false;
    if (caps.size && !caps.has(r.__cap)) return false;
    if (scn.length) { const st = stockToScannersMap[r.Symbol] || []; if (anyMode ? !scn.some(s => st.includes(s)) : !scn.every(s => st.includes(s))) return false; }

    for (const x of ranges) { const v = x.f.get(r); if (v == null) return false; if (x.mn != null && v < x.mn) return false; if (x.mx != null && v > x.mx) return false; }
    for (const c of cfs) { const v = r[c.col]; if (typeof v !== 'number' || !OPS[c.op](v, c.val)) return false; }
    if (!A.size) return true;

    const close = nv(r, 'close'), rsi = nv(r, 'rsi');
    if (A.has('rsi60') && !(rsi != null && rsi >= 60)) return false;
    if (A.has('rsi70') && !(rsi != null && rsi >= 70)) return false;
    if (A.has('rsiLow') && !(rsi != null && rsi <= 30)) return false;
    if (A.has('near52wh')) { const a = nv(r, 'away52'); if (a == null || a < -5) return false; }

    for (const [chip, key] of [['closeEma10', 'ema10'], ['closeEma20', 'ema20'], ['closeEma50', 'ema50'], ['closeEma200', 'ema200'], ['closeVwap', 'vwap']]) {
      if (A.has(chip)) { const e = nv(r, key); if (close == null || e == null || close < e) return false; }
    }
    if (A.has('emaStack')) { const e = [nv(r, 'ema10'), nv(r, 'ema20'), nv(r, 'ema50'), nv(r, 'ema200')]; if (e.some(x => x == null) || !(e[0] > e[1] && e[1] > e[2] && e[2] > e[3])) return false; }
    for (const [chip, key] of [['pullback10ema', 'ema10'], ['pullback20ema', 'ema20']]) {
      if (A.has(chip)) { const e = nv(r, key); if (close == null || e == null || e === 0 || (Math.abs(close - e) / e * 100) > P.pull) return false; }
    }
    for (const [chip, key] of [['near15D', 'high15'], ['nearWeek', 'highW'], ['nearMonth', 'highM'], ['nearQuarter', 'highQ'], ['nearYear', 'highY']]) {
      if (A.has(chip)) { const hi = nv(r, key); if (close == null || hi == null || hi <= 0 || ((hi - close) / hi * 100) > 3) return false; }
    }

    if (A.has('roceFilter')) { const v = nv(r, 'roce'); if (v == null || v < P.roce) return false; }
    if (A.has('epsFilter')) { const v = nv(r, 'eps'); if (v == null || v <= P.eps) return false; }
    if (A.has('peFilter')) { const v = nv(r, 'pe'); if (v == null || v <= 0 || v > P.pe) return false; }
    if (A.has('pbFilter')) { const v = nv(r, 'pb'); if (v == null || v <= 0 || v >= P.pb) return false; }
    if (A.has('undervaluedBV')) { const v = nv(r, 'bv'); if (v == null || close == null || v < close) return false; }
    if (A.has('lowDebt')) { const v = nv(r, 'de'); if (v == null || v > P.de) return false; }
    if (A.has('currentRatioMin')) { const v = nv(r, 'cr'); if (v == null || v < P.cr) return false; }
    if (A.has('salesGrowth')) { const g = growth(r, 'salesQ', 'salesQ4'); if (g == null || g < P.sg) return false; }
    if (A.has('profitGrowth')) { const g = growth(r, 'npQ', 'npQ4'); if (g == null || g < P.pg) return false; }
    if (A.has('opmFilter')) { const v = nv(r, 'opm'); if (v == null || v < P.opm) return false; }
    if (A.has('promoFilter')) { const v = nv(r, 'promo'); if (v == null || v < P.promo) return false; }
    if (A.has('fiiRising')) { const a = nv(r, 'fii'), b = nv(r, 'fii1'); if (a == null || b == null || a <= b) return false; }
    if (A.has('diiRising')) { const a = nv(r, 'dii'), b = nv(r, 'dii1'); if (a == null || b == null || a <= b) return false; }
    return true;
  });

  updateActiveCount();
  sortDataset();
  renderMasterTable();
}
function updateActiveCount() {
  let n = activeChips.size + activeScannerChips.size + customFilters.length + activeRanges().length;
  if (msSector) n += msSector.selected.size + msIndustry.selected.size + msCap.selected.size;
  if ($id('search-input').value.trim()) n++;
  const el = $id('activeFilterCount'); if (el) { el.textContent = n ? `${n} active` : 'No filters'; el.classList.toggle('on', n > 0); }
}

// =========================================================================
// SORT / RS RATING (rating comes straight from the RS Ranking sheet)
// =========================================================================
const RS_FIELD = { overall: 'OVERALL_RATING', st: 'ST_RATING', snt: 'SELF_NT_RATING', sdef: 'SELF_DEF_RATING', rnt: 'REL_NT_RATING', rdef: 'REL_DEF_RATING' };
const RS_RANK_FIELD = { overall: 'OVERALL_RANK', st: 'ST_RANK', snt: 'SELF_NT_RANK', sdef: 'SELF_DEF_RANK', rnt: 'REL_NT_RANK', rdef: 'REL_DEF_RANK' };
function rsOf(sym) {
  const m = symbolRsRatingMap[sym]; if (!m) return null;
  let v = m[RS_FIELD[masterSelectedRsType]];
  if (v == null || isNaN(v) || v <= 0) {
    const rk = m[RS_RANK_FIELD[masterSelectedRsType]], N = rawRankingDataset.length || 1200;
    if (!rk || rk >= 999) return null; v = 100 * (1 - (rk - 1) / N);
  }
  return Math.max(1, Math.min(99, Math.round(v)));
}
function sortValue(r, key) {
  if (key === '__RS') return rsOf(r.Symbol);
  if (key === '__SECTOR') return r.__sec;
  if (key === 'Detected Patterns') return (stockToScannersMap[r.Symbol] || []).length;
  if (key === COL.capcat) return r.__cap;
  return r[key];
}
function sortTable(colKey) {
  if (currentSortCol === colKey) currentSortAsc = !currentSortAsc; else { currentSortCol = colKey; currentSortAsc = (colKey === 'Symbol' || colKey === '__SECTOR'); }
  sortDataset(); renderMasterTable();
}
function sortDataset() {
  const k = currentSortCol, asc = currentSortAsc;
  filteredDataset.sort((a, b) => {
    const x = sortValue(a, k), y = sortValue(b, k);
    const ex = x === undefined || x === null || x === '', ey = y === undefined || y === null || y === '';
    if (ex && ey) return 0; if (ex) return 1; if (ey) return -1;
    if (typeof x === 'string' && typeof y === 'string') return asc ? x.localeCompare(y) : y.localeCompare(x);
    return asc ? Number(x) - Number(y) : Number(y) - Number(x);
  });
}
function changeMasterRsType(val) { masterSelectedRsType = val; if (currentSortCol === '__RS') sortDataset(); renderMasterTable(); }

// =========================================================================
// MATRIX VIEWS + COLUMN SELECTOR (add / remove / hide)
// =========================================================================
function syncMatrixButtons() {
  document.querySelectorAll('.matrix-btn').forEach(b => b.classList.toggle('active', b.dataset.view === activeMatrixView));
  const all = document.querySelector('.matrix-btn[data-view="all"] .mcount'); if (all) all.textContent = availableColumns.length || '';
}
function switchMatrixView(el, viewKey) { activeMatrixView = viewKey; syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable(); }
function filterDisplayHeadersByMatrix() {
  const all = availableColumns;
  const fund = /Sales|Profit|^PE$|Yearly PE|P\/E|^PB$|P\/B|ROCE|ROE|Debt|Networth|EPS|FII|DII|Promoter|Book|OPM|EV\/|Ratio|Assets|MMS/i;
  if (activeMatrixView === 'default') displayHeaders = orderCols(DEFAULT_COLS.filter(c => all.includes(c)));
  else if (activeMatrixView === 'custom') displayHeaders = orderCols(all.filter(h => visibleColumnsSet.has(h)));
  else if (activeMatrixView === 'all') displayHeaders = orderCols(all);
  else if (activeMatrixView === 'technicals') displayHeaders = orderCols(all.filter(h => !fund.test(h) && !/^(BSE Code|Market Cap Category)$/i.test(h)));
  else if (activeMatrixView === 'valuation') displayHeaders = orderCols(all.filter(h => /Market Cap|Yearly PE|^PB$|P\/B|ROCE|Networth|Debt|Book|EPS|Ratio|EV\/|Return on|Cap Category/i.test(h)));
  else if (activeMatrixView === 'sales_profit') displayHeaders = orderCols(all.filter(h => /Sales|Profit|OPM|TURNOVER/i.test(h)));
  else if (activeMatrixView === 'shareholding') displayHeaders = orderCols(all.filter(h => /FII|DII|Promoter/i.test(h)));
}
function saveCols(list) { try { localStorage.setItem('mickkk_screener_cols_v2', JSON.stringify(list)); } catch (e) {} }

function openColumnModal() {
  const list = $id('columnCheckboxesList'), modal = $id('columnModal');
  const current = new Set(displayHeaders);
  list.innerHTML = availableColumns.map(col => `<label class="col-checkbox-label"><input type="checkbox" value="${esc(col)}"${current.has(col) ? ' checked' : ''}><span>${esc(HDR_LABEL[col] || col)}</span></label>`).join('');
  const s = $id('colSearch'); if (s) s.value = '';
  updateColCount(); modal.style.display = 'flex';
}
function closeColumnModal() { $id('columnModal').style.display = 'none'; }
function filterColumnList(q) { q = q.trim().toLowerCase(); document.querySelectorAll('#columnCheckboxesList .col-checkbox-label').forEach(l => l.style.display = (!q || l.textContent.toLowerCase().includes(q)) ? '' : 'none'); }
function updateColCount() { const n = document.querySelectorAll('#columnCheckboxesList input:checked').length; const el = $id('colSelCount'); if (el) el.textContent = `${n} selected`; }
function toggleAllColumns(select) { document.querySelectorAll('#columnCheckboxesList .col-checkbox-label').forEach(l => { if (l.style.display !== 'none') l.querySelector('input').checked = select; }); updateColCount(); }
function selectDefaultColumns() { const def = new Set(DEFAULT_COLS); document.querySelectorAll('#columnCheckboxesList input').forEach(cb => cb.checked = def.has(cb.value)); updateColCount(); }
function applyCustomColumns() {
  const chosen = [...document.querySelectorAll('#columnCheckboxesList input:checked')].map(cb => cb.value);
  if (!chosen.length) { mkToast('Select at least one column'); return; }
  visibleColumnsSet = new Set(chosen); activeMatrixView = 'custom'; saveCols(chosen);
  syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable(); closeColumnModal();
}
document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#columnCheckboxesList')) updateColCount(); });
function hideColumn(h) {
  const left = displayHeaders.filter(c => c !== h);
  if (!left.length) { mkToast('At least one column must stay'); return; }
  visibleColumnsSet = new Set(left); activeMatrixView = 'custom'; saveCols(left);
  syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable();
}
function resetColumnsToDefault() {
  try { localStorage.removeItem('mickkk_screener_cols_v2'); } catch (e) {}
  visibleColumnsSet = new Set(DEFAULT_COLS); activeMatrixView = 'default';
  syncMatrixButtons(); filterDisplayHeadersByMatrix(); renderMasterTable();
}

// =========================================================================
// CELL FORMATTING
// =========================================================================
const fmtPct = (v, signed = true) => { if (typeof v !== 'number') return esc(v); return `<span class="${v > 0 ? 'val-pos' : v < 0 ? 'val-neg' : ''}">${signed && v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`; };
const fmtPrice = v => (typeof v !== 'number') ? esc(v) : '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kindCache = new Map();
function kindOf(h) {
  if (kindCache.has(h)) return kindCache.get(h);
  let k = 'num';
  if (h === 'Detected Patterns') k = 'pat';
  else if (h === COL.capcat) k = 'cap';
  else if (h === COL.mcap) k = 'mcap';
  else if (h === COL.volume) k = 'vol';
  else if (/turnover/i.test(h)) k = 'turn';
  else if (RANGE_KEYS.some(x => COL[x] === h)) k = 'range';
  else if (RET_KEYS.concat(['away52', 'awayEma200']).some(x => COL[x] === h) || (COLMETA.pct || []).includes(h)) k = 'pct';
  else if (h === COL.rsi) k = 'rsi';
  else if (/^(RS RATING|Abs RS)/i.test(h)) k = 'rsraw';
  else if (h === COL.close || h === COL.vwap || /ema$|^52W (High|Low)|ago high$|^ATR/i.test(h)) k = 'price';
  else if (/^(ROCE|OPM|Total (FII|DII|Promoter)|Return on)/i.test(h)) k = 'pctPlain';
  else if (/^(Current Ratio|Debt to equity|PB|P\/B|Yearly PE|EV\/EBITDA|EPS|Prev Year EPS|ADX|Book Value|MMS)/i.test(h)) k = 'num2';
  kindCache.set(h, k); return k;
}
function cellHTML(r, h, sym) {
  const val = r[h], k = kindOf(h);
  if (k === 'pat') return `<td class="pat-cell">${formatPatternPills(stockToScannersMap[sym] || [])}</td>`;
  if (k === 'cap') { const c = r.__cap || '-'; const cls = c.includes('Large') ? 'cap-large' : c.includes('Small') ? 'cap-small' : c.includes('Micro') ? 'cap-micro' : 'cap-mid'; return `<td>${c === '-' ? '-' : `<span class="cap-badge ${cls}">${esc(c)}</span>`}</td>`; }
  if (val === '' || val == null) return '<td class="nil">–</td>';
  if (typeof val !== 'number') return `<td>${esc(val)}</td>`;
  switch (k) {
    case 'mcap': { const n = val > 1e9 ? val / 1e7 : val; return `<td class="num-strong">${n.toLocaleString('en-IN', { maximumFractionDigits: n >= 1000 ? 0 : 1 })}</td>`; }
    case 'vol': return `<td>${val.toLocaleString('en-IN')}</td>`;
    case 'turn': { const cr = val >= 1e6 ? val / 1e7 : val; return `<td><span class="val-turnover">₹${cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr</span></td>`; }
    case 'pct': return `<td>${fmtPct(val)}</td>`;
    case 'pctPlain': return `<td>${fmtPct(val, false)}</td>`;
    case 'range': return `<td><span class="val-range">${val.toFixed(2)}%</span></td>`;
    case 'rsi': return `<td><span class="rsi-v ${val >= 70 ? 'rsi-hot' : val <= 30 ? 'rsi-cold' : ''}">${val.toFixed(1)}</span></td>`;
    case 'rsraw': return `<td><span class="rs-pill ${val >= 0 ? 'rs-pill-pos' : 'rs-pill-neg'}">${val >= 0 ? '+' : ''}${val.toFixed(2)}</span></td>`;
    case 'price': return `<td><span class="val-price">${fmtPrice(val)}</span></td>`;
    case 'num2': return `<td class="num-strong">${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>`;
    default: return `<td class="num-strong">${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>`;
  }
}

// =========================================================================
// TABLE RENDER (first rows instantly, rest streamed on scroll)
// =========================================================================
const CHUNK = 120;
let renderedCount = 0, scrollBound = false;
function rowHTML(r) {
  const sym = r.Symbol, rs = rsOf(sym);
  const pill = rs == null ? '<span class="rs-pill rs-pill-na">–</span>' : `<span class="rs-pill ${rs >= 70 ? 'rs-pill-pos' : rs >= 40 ? 'rank-p-top50' : 'rs-pill-neg'}">${rs}</span>`;
  let h = `<tr><td class="sticky-col">${renderStockWith3Links(sym, r['Stock Name'])}</td><td class="sticky-rs">${pill}</td>
    <td><div class="sector-wrap"><span class="sec-txt" title="${esc(r.__sec)}">${esc(r.__sec || '–')}</span><span class="ind-txt" title="${esc(r.__ind)}">${esc(r.__ind || '–')}</span></div></td>`;
  for (let i = 0; i < displayHeaders.length; i++) h += cellHTML(r, displayHeaders[i], sym);
  return h + '</tr>';
}
function renderMasterTable() {
  const headerRow = $id('master-table-headers'), tbody = $id('master-table-body');
  if (!headerRow) return;
  $id('shown-count').innerText = filteredDataset.length;
  if (!displayHeaders.length && availableColumns.length) filterDisplayHeadersByMatrix();
  kindCache.clear();

  const arrow = k => currentSortCol === k ? (currentSortAsc ? '▲' : '▼') : '⇅';
  let hh = `<th class="sticky-col" data-sort="Symbol">STOCK / SYMBOL ${arrow('Symbol')}</th>
    <th class="sticky-rs"><div class="rs-th"><span data-sort="__RS" class="rs-th-t">RS RATING ${arrow('__RS')}</span>
      <select class="master-rs-select" onchange="changeMasterRsType(this.value)">
        ${[['overall', 'Overall RS'], ['st', 'Short Term RS'], ['snt', 'Self RS (NT)'], ['sdef', 'Self RS (Def)'], ['rnt', 'Rel RS (NT)'], ['rdef', 'Rel RS (Def)']].map(([v, t]) => `<option value="${v}"${masterSelectedRsType === v ? ' selected' : ''}>${t}</option>`).join('')}
      </select></div></th>
    <th data-sort="__SECTOR">SECTOR / INDUSTRY ${arrow('__SECTOR')}</th>`;
  hh += displayHeaders.map(h => `<th data-sort="${esc(h)}"><span class="th-t">${esc(HDR_LABEL[h] || h)} ${arrow(h)}</span><i class="th-x" data-hide="${esc(h)}" title="Hide this column">×</i></th>`).join('');
  hh += '<th class="th-add" title="Add / remove columns" onclick="openColumnModal()">＋</th>';
  headerRow.innerHTML = hh;

  if (!filteredDataset.length) {
    tbody.innerHTML = `<tr><td colspan="${displayHeaders.length + 4}" class="empty-row">No stocks match the selected filters.</td></tr>`;
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
document.addEventListener('click', e => {
  const x = e.target.closest && e.target.closest('#master-table-headers .th-x');
  if (x) { e.stopPropagation(); hideColumn(x.dataset.hide); return; }
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
  let csv = cols.map(c => q(HDR_LABEL[c] || c)).join(',') + '\n';
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
function setupAutoRefreshTimer() { if (typeof autoRefreshTimer !== 'undefined' && autoRefreshTimer) clearInterval(autoRefreshTimer); }

// collapse / expand the big filter area (remembered)
function toggleFilterPanel(force) {
  const card = document.querySelector('.flt-card'); if (!card) return;
  const hide = typeof force === 'boolean' ? force : !card.classList.contains('flt-collapsed');
  card.classList.toggle('flt-collapsed', hide);
  $id('fltToggle').textContent = hide ? 'Show filters ▾' : 'Hide filters ▴';
  try { localStorage.setItem('mickkk_filters_hidden', hide ? '1' : '0'); } catch (e) {}
}
document.addEventListener('DOMContentLoaded', () => { try { if (localStorage.getItem('mickkk_filters_hidden') === '1') toggleFilterPanel(true); } catch (e) {} });
