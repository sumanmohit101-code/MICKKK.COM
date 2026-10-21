javascript
const SPREADSHEET_ID = "13SG0bcfTGXLQfq14hb_rRrTUALq5GYUQuNegP_AH42Y";

const CACHE_KEYS = {
  MASTER: 'MICKKK_CACHE_MASTER_DATA',
  HEADERS: 'MICKKK_CACHE_HEADERS',
  UPDATED: 'MICKKK_CACHE_UPDATED',
  BENCHMARK: 'MICKKK_CACHE_BENCHMARK',
  RANKING: 'MICKKK_CACHE_RANKING',
  EARLY: 'MICKKK_CACHE_EARLY',
  HISTORY: 'MICKKK_CACHE_HISTORY',
  SCANNERS: 'MICKKK_CACHE_SCANNERS'
};

function getLocalCache(key) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch(e) { return null; }
}

function setLocalCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch(e) {
    try { localStorage.clear(); localStorage.setItem(key, JSON.stringify(data)); } catch(err) {}
  }
}

const SHEET_NAME = "Chartink Data";
const GVIZ_BASE = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;
const GVIZ_URL = `${GVIZ_BASE}&sheet=${encodeURIComponent(SHEET_NAME)}`;
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwyf03hzfg05WOcl_TImieFbqTb7djfEuAmM5v31CVqMS2Du1-2GYX72xd26e4jsbFm8g/exec";
const SCANNER_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzVL6f0CG_zF7c19DscTYxgAaDgKpS7ZQJc3NESbtdvwcyNESl08H3b-QoKuJfqFSOdXg/exec";

let currentAppView = 'master'; 
let currentRelativeSheet = 'Relative Returns (CNX SMALLCAP)';
let currentRelativeBenchmarkName = 'CNX SMALLCAP';

let rawHeaders = [];
let availableColumns = [];
let visibleColumnsSet = new Set();
let displayHeaders = [];
let rawDataset = [];
let filteredDataset = [];

let relativeCache = {};
let benchmarkIndexData = {};
let rawRelativeDataset = [];
let filteredRelativeDataset = [];
let activeOutperformChips = new Set();
let relativeSortCol = 'Daily Relative % Change';
let relativeSortAsc = false;

let rawRankingDataset = [];
let filteredRankingDataset = [];
let activeRSTopChips = new Set();
let rankingSortCol = 'OVERALL_RANK';
let rankingSortAsc = true;

let chartinkScanners = {};         
let stockToScannersMap = {};       
let activeScannerChips = new Set(); 

let activeChips = new Set();
let autoRefreshTimer = null;
let refreshCountdown = 300;
let currentSortCol = 'D';
let currentSortAsc = false;
let masterSelectedRsType = 'overall';
let symbolRsRatingMap = {};
let activeMatrixView = 'all';

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const mainContent = document.getElementById("mainContent");
  const arrow = document.getElementById("collapseArrow");
  sidebar.classList.toggle("sidebar-collapsed");
  const isCollapsed = sidebar.classList.contains("sidebar-collapsed");
  if (isCollapsed) {
    mainContent.classList.remove("ml-60");
    mainContent.classList.add("ml-[4.2rem]");
    if (arrow) arrow.setAttribute("data-lucide", "chevron-right");
  } else {
    mainContent.classList.remove("ml-[4.2rem]");
    mainContent.classList.add("ml-60");
    if (arrow) arrow.setAttribute("data-lucide", "chevron-left");
  }
  try { localStorage.setItem("mickkk_sidebar_collapsed", isCollapsed ? "true" : "false"); } catch (e) {}
  if (window.lucide) lucide.createIcons();
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle("dark");
  syncThemeIcons(isDark);
  try { localStorage.setItem("theme", isDark ? "dark" : "light"); } catch (e) {}
}

function syncThemeIcons(isDark) {
  const sunSide = document.getElementById("sunIconSide");
  const moonSide = document.getElementById("moonIconSide");
  const sunMini = document.getElementById("sunIconMini");
  const moonMini = document.getElementById("moonIconMini");
  if (sunSide) sunSide.classList.toggle("hidden", isDark);
  if (moonSide) moonSide.classList.toggle("hidden", !isDark);
  if (sunMini) sunMini.classList.toggle("hidden", isDark);
  if (moonMini) moonMini.classList.toggle("hidden", !isDark);
}

function openProModal() {
  document.getElementById('proModal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeProModal() {
  document.getElementById('proModal').classList.add('hidden');
}

function openWhatsAppTrialModal() {
  const num = "917086054184";
  const msg = encodeURIComponent(`Hi Mickkk Team! Please activate my 7-day Pro Free Trial for Universal Stock Terminal.`);
  window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
  closeProModal();
}

function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '-';
  return str.toLowerCase().replace(/[-_]/g, ' ').split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function renderStockWith3Links(sym, name) {
  const s = String(sym || '').toUpperCase();
  return `
    <div style="display:flex; align-items:center; gap:4px;">
      <span style="font-weight:800; font-family:'JetBrains Mono'; font-size:11px; color:#38bdf8;">${s}</span>
      <span class="stock-action-links">
        <a href="charts.html?symbol=${s}" target="_blank" class="chart-icon-link link-mickkk" title="MICKKK Chart"><i data-lucide="line-chart" style="width:11px; height:11px;"></i></a>
        <a href="https://www.tradingview.com/chart/?symbol=NSE:${s}" target="_blank" class="chart-icon-link link-tv" title="TradingView"><i data-lucide="external-link" style="width:10px; height:10px;"></i></a>
        <a href="https://chartink.com/stocks/${s}.html" target="_blank" class="chart-icon-link link-chartink" title="Chartink"><i data-lucide="candlestick-chart" style="width:11px; height:11px;"></i></a>
      </span>
    </div>
    <div class="company-name" title="${name}">${name}</div>
  `;
}

function changeMasterRsType(val) {
  masterSelectedRsType = val;
  renderMasterTable();
}

function getScannerIcon(scannerKey) {
  const k = scannerKey.toUpperCase();
  if (k.includes('DOUBLE BOTTOM')) return '📈';
  if (k.includes('HEAD & SHOULDER')) return '📉';
  if (k.includes('CUP & HANDLE')) return '☕';
  if (k.includes('BULL FLAG')) return '🚩';
  if (k.includes('PULLBACK')) return '🎯';
  if (k.includes('VOLUME SHOCKER') || k.includes('VOL >')) return '🌊';
  if (k.includes('GAP & GO') || k.includes('GAP')) return '🚀';
  if (k.includes('52 WEEK') || k.includes('52WH')) return '🎯';
  return '⚡';
}

function formatPatternPills(scannerList) {
  if (!scannerList || scannerList.length === 0) return '<span style="color:#475569;">-</span>';
  const pillsHTML = scannerList.map(item => {
    const sc = item.toUpperCase();
    if (sc.includes('DOUBLE BOTTOM')) return `<span class="pat-pill pat-blue">📈 DB</span>`;
    if (sc.includes('HEAD & SHOULDER')) return `<span class="pat-pill pat-purple">📉 H&S</span>`;
    if (sc.includes('CUP & HANDLE')) return `<span class="pat-pill pat-orange">☕ C&H</span>`;
    if (sc.includes('PULLBACK')) return `<span class="pat-pill pat-yellow">🎯 Pullback</span>`;
    if (sc.includes('VOLUME SHOCKER') || sc.includes('VOL >')) return `<span class="pat-pill pat-orange">📢 Vol 50D</span>`;
    if (sc.includes('GAP & GO') || sc.includes('GAP')) return `<span class="pat-pill pat-cyan">⚡ Gap 50D</span>`;
    if (sc.includes('52 WEEK') || sc.includes('52WH')) return `<span class="pat-pill pat-green">🎯 52WH</span>`;
    const shortName = item.replace(/\(\d+\)/g, '').trim().slice(0, 12);
    return `<span class="pat-pill pat-cyan">${shortName}</span>`;
  }).join('');
  return `<div class="pattern-badges-row">${pillsHTML}</div>`;
}

window.onload = function() {
  syncThemeIcons(document.documentElement.classList.contains("dark"));
  if (localStorage.getItem("mickkk_sidebar_collapsed") === "true") toggleSidebar();
  lucide.createIcons();

  const cachedMaster = getLocalCache(CACHE_KEYS.MASTER);
  const cachedHeaders = getLocalCache(CACHE_KEYS.HEADERS);
  const cachedUpdated = getLocalCache(CACHE_KEYS.UPDATED);
  const cachedBenchmark = getLocalCache(CACHE_KEYS.BENCHMARK);
  const cachedRanking = getLocalCache(CACHE_KEYS.RANKING);
  const cachedScanners = getLocalCache(CACHE_KEYS.SCANNERS);

  if (cachedBenchmark) benchmarkIndexData = cachedBenchmark;
  if (cachedRanking) {
    rawRankingDataset = cachedRanking;
    cachedRanking.forEach(item => { symbolRsRatingMap[item.SYMBOL] = item; });
  }
  if (cachedScanners) {
    chartinkScanners = cachedScanners.scanners || {};
    stockToScannersMap = cachedScanners.stockToScannersMap || {};
    renderScannerChips();
  }
  if (cachedMaster && cachedHeaders && cachedMaster.length > 0) {
    rawHeaders = cachedHeaders;
    handleMasterDataSuccess(cachedMaster, cachedUpdated || 'Cached');
    document.getElementById('loader').style.display = 'none';
  }

  loadMasterStockData();
  loadBenchmarkIndexData();
  setupAutoRefreshTimer();
};

function switchAppView(viewName) {
  currentAppView = viewName;
  document.querySelectorAll('.page-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.app-view-container').forEach(v => v.style.display = 'none');

  const titleEl = document.getElementById('main-view-title');
  const subTitleEl = document.getElementById('main-view-subtitle');

  if (viewName === 'master') {
    document.getElementById('tab-master').classList.add('active');
    document.getElementById('view-master').style.display = 'block';
    titleEl.innerHTML = `⚙️ Stock Master Screener`;
    subTitleEl.innerText = `NSE Stock Universe — Complete Technical, Fundamental, Shareholding & Valuation Matrix`;
  } else if (viewName === 'relative') {
    document.getElementById('tab-relative').classList.add('active');
    document.getElementById('view-relative-returns').style.display = 'block';
    titleEl.innerHTML = `⚖️ Relative Returns Analysis`;
    subTitleEl.innerText = `Stock Alpha Performance Relative to Selected Benchmark (+% Outperforming / -% Underperforming)`;
    loadRelativeReturnsData(currentRelativeSheet);
  } else if (viewName === 'ranking') {
    document.getElementById('tab-ranking').classList.add('active');
    document.getElementById('view-ranking').style.display = 'block';
    titleEl.innerHTML = `🏆 RS Ranking Matrix`;
    subTitleEl.innerText = `Relative Strength Ranks Across 5 Multi-Timeframe Scoring Models (Calculated Live)`;
    loadRSRankingData();
  } else if (viewName === 'gainers') {
    document.getElementById('tab-gainers').classList.add('active');
    document.getElementById('view-gainers').style.display = 'block';
    titleEl.innerHTML = `📈 RS Gainers & Momentum Trends`;
    subTitleEl.innerText = `Top 100 Short-Term RS Gainers, Leadership Velocity and Momentum Igniters`;
    loadGainersData();
  } else if (viewName === 'early') {
    document.getElementById('tab-early').classList.add('active');
    document.getElementById('view-early').style.display = 'block';
    titleEl.innerHTML = `🚀 Early Trend & RS Turnarounds`;
    subTitleEl.innerText = `Ground-Floor RS Breakouts & Fresh Uptrend Ignition Detector`;
    loadEarlyTrendData();
  } else if (viewName === 'history') {
    document.getElementById('tab-history').classList.add('active');
    document.getElementById('view-history').style.display = 'block';
    titleEl.innerHTML = `📁 RS History`;
    subTitleEl.innerText = `1-Year Rolling Historical RS Leaderboards & Archive`;
    loadHistoryLogData();
  }
  lucide.createIcons();
}

function selectRelativeBenchmark(sheetName, displayName) {
  currentRelativeSheet = sheetName;
  currentRelativeBenchmarkName = displayName;
  
  document.querySelectorAll('.bench-tile').forEach(t => {
    t.classList.remove('active');
    t.querySelector('.bench-badge-tag').style.display = 'none';
  });

  if (displayName.includes('500')) {
    const el = document.getElementById('tile-n500');
    el.classList.add('active');
    el.querySelector('.bench-badge-tag').style.display = 'block';
  } else if (displayName.includes('SMALLCAP')) {
    const el = document.getElementById('tile-cnxsmall');
    el.classList.add('active');
    el.querySelector('.bench-badge-tag').style.display = 'block';
  } else if (displayName.includes('MIDSMALL')) {
    const el = document.getElementById('tile-midsmall');
    el.classList.add('active');
    el.querySelector('.bench-badge-tag').style.display = 'block';
  }

  loadRelativeReturnsData(sheetName);
}

function triggerActiveViewRefresh() {
  if (currentAppView === 'master') loadMasterStockData();
  else if (currentAppView === 'relative') {
    delete relativeCache[currentRelativeSheet];
    loadRelativeReturnsData(currentRelativeSheet);
    loadBenchmarkIndexData();
  } else if (currentAppView === 'ranking' || currentAppView === 'gainers') loadRSRankingData();
  else if (currentAppView === 'early') loadEarlyTrendData();
  else if (currentAppView === 'history') loadHistoryLogData();
}

function openRSWeightModal() { document.getElementById('rsWeightModal').style.display = 'flex'; }
function closeRSWeightModal() { document.getElementById('rsWeightModal').style.display = 'none'; }

async function loadBenchmarkIndexData() {
  try {
    const res = await fetch(`${WEBAPP_URL}?action=getBenchmarkIndex`);
    const json = await res.json();
    if (json && json.success && json.data) {
      parseBenchmarkRows(json.data);
      return;
    }
  } catch (e) {}

  try {
    const gvizRes = await fetch(`${GVIZ_BASE}&sheet=${encodeURIComponent('NIFTY 500 Index')}`);
    const text = await gvizRes.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const gviz = JSON.parse(jsonString);
    if (gviz && gviz.table && gviz.table.rows) {
      const raw = gviz.table.rows.map(r => r.c.map(cell => cell ? (cell.v !== null ? cell.v : cell.f) : ''));
      parseBenchmarkRows(raw.slice(1).map(r => ({
        'Index': r[0], 'Daily % Change': r[1], 'Weekly % Change': r[2], '15 Days % Change': r[3],
        '1 Month % Change': r[4], 'Quarterly % Change': r[5], 'Half Yearly % Change': r[6], 'Yearly % Change': r[7]
      })));
    }
  } catch (err) {}
}

function parseBenchmarkRows(rows) {
  rows.forEach(r => {
    const idxName = String(r['Index'] || '').trim().toUpperCase();
    const getPct = (val) => {
      if (val === undefined || val === null || val === '') return 0;
      const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[%,\s]/g, ''));
      return (Math.abs(num) <= 1 && num !== 0) ? num * 100 : (num || 0);
    };

    const metrics = {
      d: getPct(r['Daily % Change']),
      w: getPct(r['Weekly % Change']),
      d15: getPct(r['15 Days % Change']),
      m: getPct(r['1 Month % Change']),
      q: getPct(r['Quarterly % Change']),
      h: getPct(r['Half Yearly % Change']),
      y: getPct(r['Yearly % Change'])
    };

    if (idxName.includes('500')) benchmarkIndexData['NIFTY 500'] = metrics;
    if (idxName.includes('MIDSMALL')) benchmarkIndexData['MIDSMALL 400'] = metrics;
    if (idxName.includes('SMALLCAP')) benchmarkIndexData['CNX SMALLCAP'] = metrics;
  });

  setLocalCache(CACHE_KEYS.BENCHMARK, benchmarkIndexData);
  renderBenchmarkBanner();
}

function renderBenchmarkBanner() {
  const name = currentRelativeBenchmarkName;
  document.getElementById('benchDisplayName').innerText = name;
  document.getElementById('relativeCurrentTabName').innerText = currentRelativeSheet;

  const data = benchmarkIndexData[name] || { d: 0, w: 0, d15: 0, m: 0, q: 0, h: 0, y: 0 };
  const fmt = (v) => {
    const cls = v > 0 ? 'val-pos' : (v < 0 ? 'val-neg' : '');
    const sign = v > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${v.toFixed(2)}%</span>`;
  };

  document.getElementById('bm-d').innerHTML = fmt(data.d);
  document.getElementById('bm-w').innerHTML = fmt(data.w);
  document.getElementById('bm-15d').innerHTML = fmt(data.d15);
  document.getElementById('bm-m').innerHTML = fmt(data.m);
  document.getElementById('bm-q').innerHTML = fmt(data.q);
  document.getElementById('bm-h').innerHTML = fmt(data.h);
  document.getElementById('bm-y').innerHTML = fmt(data.y);
}

async function loadRelativeReturnsData(sheetName) {
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader-msg').innerText = `Loading ${sheetName}...`;
  renderBenchmarkBanner();

  if (relativeCache[sheetName]) {
    rawRelativeDataset = relativeCache[sheetName];
    document.getElementById('rel-total-count').innerText = rawRelativeDataset.length;
    populateRelativeDropdowns();
    filterRelativeReturnsTable();
    document.getElementById('loader').style.display = 'none';
    return;
  }

  let fetchedData = null;
  try {
    const res = await fetch(`${WEBAPP_URL}?action=getRelativeReturns&sheetName=${encodeURIComponent(sheetName)}`);
    const json = await res.json();
    if (json && json.success && json.data) fetchedData = json.data;
  } catch (e) {}

  if (fetchedData && fetchedData.length > 0) {
    const standardized = fetchedData.map(r => {
      const norm = (v) => {
        if (typeof v === 'number') return (Math.abs(v) <= 1 && v !== 0) ? v * 100 : v;
        return parseFloat(String(v).replace(/[%,\s]/g, '')) || 0;
      };
      return {
        'NAME OF COMPANY': r['NAME OF COMPANY'] || r['Stock Name'] || '',
        'SYMBOL': (r['SYMBOL'] || r['NSE Symbol'] || '').toUpperCase(),
        'Sector': r['Sector'] || '-',
        'Industry': r['Industry'] || '-',
        'Daily Relative % Change': norm(r['Daily Relative % Change']),
        'Weekly Relative % Change': norm(r['Weekly Relative % Change']),
        '15 Days Relative % Change': norm(r['15 Days Relative % Change']),
        '1 Month Relative % Change': norm(r['1 Month Relative % Change']),
        'Quarterly Relative % Change': norm(r['Quarterly Relative % Change']),
        'Half Yearly Relative % Change': norm(r['Half Yearly Relative % Change']),
        'Yearly Relative % Change': norm(r['Yearly Relative % Change'])
      };
    });

    relativeCache[sheetName] = standardized;
    rawRelativeDataset = standardized;
    document.getElementById('rel-total-count').innerText = rawRelativeDataset.length;
    populateRelativeDropdowns();
    filterRelativeReturnsTable();
  }
  document.getElementById('loader').style.display = 'none';
}

function populateRelativeDropdowns() {
  const secSel = document.getElementById('relative-sector-select');
  const indSel = document.getElementById('relative-industry-select');

  const sectors = Array.from(new Set(rawRelativeDataset.map(r => toTitleCase(r['Sector'])))).filter(s => s && s !== '-').sort();
  const industries = Array.from(new Set(rawRelativeDataset.map(r => toTitleCase(r['Industry'])))).filter(i => i && i !== '-').sort();

  secSel.innerHTML = `<option value="ALL">All Sectors (${sectors.length})</option>` + sectors.map(s => `<option value="${s}">${s}</option>`).join('');
  indSel.innerHTML = `<option value="ALL">All Industries (${industries.length})</option>` + industries.map(i => `<option value="${i}">${i}</option>`).join('');
}

function toggleOutperformChip(el, chipKey) {
  if (activeOutperformChips.has(chipKey)) {
    activeOutperformChips.delete(chipKey);
    el.classList.remove('active');
  } else {
    activeOutperformChips.add(chipKey);
    el.classList.add('active');
  }
  filterRelativeReturnsTable();
}

function resetRelativeFilters() {
  document.getElementById('relative-search-input').value = '';
  document.getElementById('relative-sector-select').value = 'ALL';
  document.getElementById('relative-industry-select').value = 'ALL';
  activeOutperformChips.clear();
  document.querySelectorAll('.chip-outperform').forEach(c => c.classList.remove('active'));
  filterRelativeReturnsTable();
}

function filterRelativeReturnsTable() {
  const q = document.getElementById('relative-search-input').value.trim().toLowerCase();
  const sec = document.getElementById('relative-sector-select').value;
  const ind = document.getElementById('relative-industry-select').value;

  filteredRelativeDataset = rawRelativeDataset.filter(r => {
    const sym = r['SYMBOL'].toLowerCase();
    const name = r['NAME OF COMPANY'].toLowerCase();
    const secFmt = toTitleCase(r['Sector']);
    const indFmt = toTitleCase(r['Industry']);

    if (q && !sym.includes(q) && !name.includes(q)) return false;
    if (sec !== 'ALL' && secFmt !== sec) return false;
    if (ind !== 'ALL' && indFmt !== ind) return false;

    if (activeOutperformChips.has('beatD') && r['Daily Relative % Change'] <= 0) return false;
    if (activeOutperformChips.has('beatW') && r['Weekly Relative % Change'] <= 0) return false;
    if (activeOutperformChips.has('beat15D') && r['15 Days Relative % Change'] <= 0) return false;
    if (activeOutperformChips.has('beatM') && r['1 Month Relative % Change'] <= 0) return false;
    if (activeOutperformChips.has('beatQ') && r['Quarterly Relative % Change'] <= 0) return false;
    if (activeOutperformChips.has('beatY') && r['Yearly Relative % Change'] <= 0) return false;

    return true;
  });

  sortRelativeDataset();
  renderRelativeTable();
}

function sortRelativeTable(col) {
  if (relativeSortCol === col) {
    relativeSortAsc = !relativeSortAsc;
  } else {
    relativeSortCol = col;
    relativeSortAsc = false;
  }
  sortRelativeDataset();
  renderRelativeTable();
}

function sortRelativeDataset() {
  filteredRelativeDataset.sort((a, b) => {
    let vA = a[relativeSortCol], vB = b[relativeSortCol];
    if (typeof vA === 'string') return relativeSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    return relativeSortAsc ? (vA - vB) : (vB - vA);
  });
}

function renderRelativeTable() {
  const tbody = document.getElementById('relative-table-body');
  document.getElementById('rel-shown-count').innerText = filteredRelativeDataset.length;

  if (filteredRelativeDataset.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="padding:24px; color:#94a3b8;">No stocks match your filter.</td></tr>`;
    return;
  }

  const fmtCell = (val) => {
    const num = Number(val) || 0;
    const sign = num > 0 ? '+' : '';
    const cls = num > 0 ? 'val-pos' : (num < 0 ? 'val-neg' : '');
    return `<td><span class="${cls}">${sign}${num.toFixed(2)}%</span></td>`;
  };

  tbody.innerHTML = filteredRelativeDataset.map(r => {
    const sym = r['SYMBOL'];
    const name = r['NAME OF COMPANY'];
    const sec = toTitleCase(r['Sector']);
    const ind = toTitleCase(r['Industry']);

    return `
      <tr>
        <td class="sticky-col">${renderStockWith3Links(sym, name)}</td>
        <td class="sticky-sec">
          <div class="sector-wrap">
            <span class="sec-txt" title="${sec}">${sec}</span>
            <span class="ind-txt" title="${ind}">${ind}</span>
          </div>
        </td>
        ${fmtCell(r['Daily Relative % Change'])}
        ${fmtCell(r['Weekly Relative % Change'])}
        ${fmtCell(r['15 Days Relative % Change'])}
        ${fmtCell(r['1 Month Relative % Change'])}
        ${fmtCell(r['Quarterly Relative % Change'])}
        ${fmtCell(r['Half Yearly Relative % Change'])}
        ${fmtCell(r['Yearly Relative % Change'])}
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function copyRelativeSymbols() {
  if (filteredRelativeDataset.length === 0) return;
  const symbols = filteredRelativeDataset.map(r => r['SYMBOL']).filter(Boolean).join(', ');
  navigator.clipboard.writeText(symbols).then(() => alert(`Copied ${filteredRelativeDataset.length} Symbols!`));
}

function exportRelativeCSV() {
  if (filteredRelativeDataset.length === 0) return;
  const cols = ['SYMBOL', 'NAME OF COMPANY', 'Sector', 'Industry', 'Daily Relative % Change', 'Weekly Relative % Change', '15 Days Relative % Change', '1 Month Relative % Change', 'Quarterly Relative % Change', 'Half Yearly Relative % Change', 'Yearly Relative % Change'];
  let csv = cols.map(h => `"${h}"`).join(',') + '\n';
  filteredRelativeDataset.forEach(r => {
    csv += cols.map(h => `"${r[h] !== undefined ? r[h] : ''}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `Relative_Returns_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function loadRSRankingData() {
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader-msg').innerText = 'Loading RS Ranking Matrix...';

  let data = null;
  try {
    const res = await fetch(`${WEBAPP_URL}?action=getRSRanking`);
    const json = await res.json();
    if (json && json.success && json.data) data = json.data;
  } catch (e) {}

  if (data && data.length > 0) {
    rawRankingDataset = data.map(r => {
      const num = (v) => typeof v === 'number' ? v : parseFloat(String(v).replace(/[%,\s]/g, '')) || 0;
      return {
        'NAME OF COMPANY': r['NAME OF COMPANY'] || '',
        'SYMBOL': (r['SYMBOL'] || '').toUpperCase(),
        'Sector': r['Sector'] || '-',
        'Industry': r['Industry'] || '-',
        'SELF_NT_SCORE': num(r['Self RS (Near-Term) Score']),
        'SELF_NT_RANK': num(r['Self RS (Near-Term) Rank']) || 999,
        'SELF_DEF_SCORE': num(r['Self RS (Default) Score']),
        'SELF_DEF_RANK': num(r['Self RS (Default) Rank']) || 999,
        'REL_NT_SCORE': num(r['Relative RS (Near-Term) Score']),
        'REL_NT_RANK': num(r['Relative RS (Near-Term) Rank']) || 999,
        'REL_DEF_SCORE': num(r['Relative RS (Default) Score']),
        'REL_DEF_RANK': num(r['Relative RS (Default) Rank']) || 999,
        'ST_SCORE': num(r['Short Term RS Score']),
        'ST_RANK': num(r['Short Term RS Rank']) || 999,
        'ST_RATING': num(r['Short Term RS Rating']) || 50,
        'AVG_RANK': num(r['Avg Rank (all 5 types)']),
        'OVERALL_RANK': num(r['Overall RS Rank']) || 999
      };
    });

    setLocalCache(CACHE_KEYS.RANKING, rawRankingDataset);
    document.getElementById('rank-total-count').innerText = rawRankingDataset.length;
    renderRSLeadersCards();
    populateRankingDropdowns();
    filterRSRankingTable();
  }
  document.getElementById('loader').style.display = 'none';
}

function renderRSLeadersCards() {
  const top = (prop) => [...rawRankingDataset].sort((a,b) => a[prop] - b[prop]).slice(0, 10);
  const renderList = (arr) => arr.map((item, idx) => `
    <div class="rs-leader-row">
      <span class="rs-leader-pos">#${idx+1}</span>
      <span class="rs-leader-sym" title="${item.SYMBOL}">${item.SYMBOL}</span>
      <span class="rs-leader-name" title="${item['NAME OF COMPANY']}">${item['NAME OF COMPANY']}</span>
    </div>
  `).join('');

  document.getElementById('lead-overall').innerHTML = renderList(top('OVERALL_RANK'));
  document.getElementById('lead-snt').innerHTML = renderList(top('SELF_NT_RANK'));
  document.getElementById('lead-sdef').innerHTML = renderList(top('SELF_DEF_RANK'));
  document.getElementById('lead-rnt').innerHTML = renderList(top('REL_NT_RANK'));
  document.getElementById('lead-rdef').innerHTML = renderList(top('REL_DEF_RANK'));
  document.getElementById('lead-st').innerHTML = renderList(top('ST_RANK'));
  lucide.createIcons();
}

function populateRankingDropdowns() {
  const secSel = document.getElementById('ranking-sector-select');
  const indSel = document.getElementById('ranking-industry-select');
  const sectors = Array.from(new Set(rawRankingDataset.map(r => toTitleCase(r['Sector'])))).filter(s => s && s !== '-').sort();
  const industries = Array.from(new Set(rawRankingDataset.map(r => toTitleCase(r['Industry'])))).filter(i => i && i !== '-').sort();

  secSel.innerHTML = `<option value="ALL">All Sectors (${sectors.length})</option>` + sectors.map(s => `<option value="${s}">${s}</option>`).join('');
  indSel.innerHTML = `<option value="ALL">All Industries (${industries.length})</option>` + industries.map(i => `<option value="${i}">${i}</option>`).join('');
}

function toggleRSTopChip(el, chipKey) {
  if (activeRSTopChips.has(chipKey)) {
    activeRSTopChips.delete(chipKey);
    el.classList.remove('active');
  } else {
    activeRSTopChips.add(chipKey);
    el.classList.add('active');
  }
  filterRSRankingTable();
}

function resetRankingFilters() {
  document.getElementById('ranking-search-input').value = '';
  document.getElementById('ranking-sector-select').value = 'ALL';
  document.getElementById('ranking-industry-select').value = 'ALL';
  activeRSTopChips.clear();
  document.querySelectorAll('#view-ranking .chip').forEach(c => c.classList.remove('active'));
  filterRSRankingTable();
}

function filterRSRankingTable() {
  const q = document.getElementById('ranking-search-input').value.trim().toLowerCase();
  const sec = document.getElementById('ranking-sector-select').value;
  const ind = document.getElementById('ranking-industry-select').value;

  filteredRankingDataset = rawRankingDataset.filter(r => {
    const sym = r['SYMBOL'].toLowerCase();
    const name = r['NAME OF COMPANY'].toLowerCase();
    const secFmt = toTitleCase(r['Sector']);
    const indFmt = toTitleCase(r['Industry']);

    if (q && !sym.includes(q) && !name.includes(q)) return false;
    if (sec !== 'ALL' && secFmt !== sec) return false;
    if (ind !== 'ALL' && indFmt !== ind) return false;

    if (activeRSTopChips.has('overall50') && r['OVERALL_RANK'] > 50) return false;
    if (activeRSTopChips.has('overall100') && r['OVERALL_RANK'] > 100) return false;
    if (activeRSTopChips.has('st50') && r['ST_RANK'] > 50) return false;
    if (activeRSTopChips.has('snt50') && r['SELF_NT_RANK'] > 50) return false;
    if (activeRSTopChips.has('sdef50') && r['SELF_DEF_RANK'] > 50) return false;
    if (activeRSTopChips.has('rnt50') && r['REL_NT_RANK'] > 50) return false;
    if (activeRSTopChips.has('rdef50') && r['REL_DEF_RANK'] > 50) return false;

    return true;
  });

  sortRankingDataset();
  renderRankingTable();
}

function sortRankingTable(col) {
  if (rankingSortCol === col) {
    rankingSortAsc = !rankingSortAsc;
  } else {
    rankingSortCol = col;
    rankingSortAsc = col.includes('RANK') ? true : false;
  }
  sortRankingDataset();
  renderRankingTable();
}

function sortRankingDataset() {
  filteredRankingDataset.sort((a, b) => {
    let vA = a[rankingSortCol], vB = b[rankingSortCol];
    if (typeof vA === 'string') return rankingSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    return rankingSortAsc ? (vA - vB) : (vB - vA);
  });
}

function renderRankingTable() {
  const tbody = document.getElementById('ranking-table-body');
  document.getElementById('rank-shown-count').innerText = filteredRankingDataset.length;

  if (filteredRankingDataset.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" style="padding:24px; color:#94a3b8;">No stocks match your filter.</td></tr>`;
    return;
  }

  const getRankPill = (rnk) => {
    if (!rnk || isNaN(rnk)) return '-';
    let cls = 'rank-p-other';
    if (rnk <= 10) cls = 'rank-p-top10';
    else if (rnk <= 25) cls = 'rank-p-top25';
    else if (rnk <= 50) cls = 'rank-p-top50';
    return `<span class="rank-pill-t ${cls}">${rnk}</span>`;
  };

  const getScoreFmt = (val) => {
    const num = Number(val) || 0;
    const cls = num >= 0 ? 'val-pos' : 'val-neg';
    const sign = num > 0 ? '+' : '';
    return `<span class="${cls}">${sign}${num.toFixed(2)}</span>`;
  };

  tbody.innerHTML = filteredRankingDataset.map(r => {
    const sym = r['SYMBOL'];
    const name = r['NAME OF COMPANY'];
    const sec = toTitleCase(r['Sector']);
    const ind = toTitleCase(r['Industry']);

    return `
      <tr>
        <td class="sticky-col">${renderStockWith3Links(sym, name)}</td>
        <td class="sticky-sec">
          <div class="sector-wrap">
            <span class="sec-txt" title="${sec}">${sec}</span>
            <span class="ind-txt" title="${ind}">${ind}</span>
          </div>
        </td>
        <td><span class="overall-glow-badge">#${r['OVERALL_RANK']}</span></td>
        <td style="color:#fbbf24; font-weight:800; font-family:'JetBrains Mono'; font-size:10.5px;">${r['AVG_RANK'].toFixed(1)}</td>
        <td>${getScoreFmt(r['SELF_NT_SCORE'])}</td>
        <td>${getRankPill(r['SELF_NT_RANK'])}</td>
        <td>${getScoreFmt(r['SELF_DEF_SCORE'])}</td>
        <td>${getRankPill(r['SELF_DEF_RANK'])}</td>
        <td>${getScoreFmt(r['REL_NT_SCORE'])}</td>
        <td>${getRankPill(r['REL_NT_RANK'])}</td>
        <td>${getScoreFmt(r['REL_DEF_SCORE'])}</td>
        <td>${getRankPill(r['REL_DEF_RANK'])}</td>
        <td>${getScoreFmt(r['ST_SCORE'])}</td>
        <td>${getRankPill(r['ST_RANK'])}</td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

function copyRankingSymbols() {
  if (filteredRankingDataset.length === 0) return;
  const symbols = filteredRankingDataset.map(r => r['SYMBOL']).filter(Boolean).join(', ');
  navigator.clipboard.writeText(symbols).then(() => alert(`Copied ${filteredRankingDataset.length} Symbols!`));
}

function exportRankingCSV() {
  if (filteredRankingDataset.length === 0) return;
  const cols = ['SYMBOL', 'NAME OF COMPANY', 'Sector', 'Industry', 'OVERALL_RANK', 'AVG_RANK', 'SELF_NT_SCORE', 'SELF_NT_RANK', 'SELF_DEF_SCORE', 'SELF_DEF_RANK', 'REL_NT_SCORE', 'REL_NT_RANK', 'REL_DEF_SCORE', 'REL_DEF_RANK', 'ST_SCORE', 'ST_RANK'];
  let csv = cols.map(h => `"${h}"`).join(',') + '\n';
  filteredRankingDataset.forEach(r => {
    csv += cols.map(h => `"${r[h] !== undefined ? r[h] : ''}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `RS_Ranking_Matrix_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

let rawGainersDataset = [];
let gainersSortCol = 'CURRENT_RANK';
let gainersSortAsc = true;

async function loadGainersData() {
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader-msg').innerText = 'Loading Short-Term RS Gainers...';

  if (!rawRankingDataset || rawRankingDataset.length === 0) await loadRSRankingData();

  if (rawRankingDataset && rawRankingDataset.length > 0) {
    const sortedByST = [...rawRankingDataset].sort((a, b) => a.ST_RANK - b.ST_RANK);
    rawGainersDataset = sortedByST.slice(0, 100).map(r => {
      const prevR = r.SELF_DEF_RANK > 300 ? '>300' : r.SELF_DEF_RANK;
      const jumpVal = Math.max(r.SELF_DEF_RANK - r.ST_RANK, 0);
      return {
        SYMBOL: r.SYMBOL,
        COMPANY_NAME: r['NAME OF COMPANY'] || r.SYMBOL,
        SECTOR: r.Sector || '-',
        PREV_RANK: prevR,
        PREV_RANK_NUM: r.SELF_DEF_RANK || 999,
        CURRENT_RANK: r.ST_RANK,
        JUMP: jumpVal,
        RATING: r.ST_RATING || 50,
        OVERALL_RANK: r.OVERALL_RANK || 999
      };
    });
    sortGainersDataset();
    renderGainersTable();
  }
  document.getElementById('loader').style.display = 'none';
}

function sortGainersTable(col) {
  if (gainersSortCol === col) gainersSortAsc = !gainersSortAsc;
  else {
    gainersSortCol = col;
    gainersSortAsc = (col === 'SYMBOL' || col === 'SECTOR' || col.includes('RANK')) ? true : false;
  }
  sortGainersDataset();
  renderGainersTable();
}

function sortGainersDataset() {
  rawGainersDataset.sort((a, b) => {
    let vA = a[gainersSortCol], vB = b[gainersSortCol];
    if (gainersSortCol === 'PREV_RANK') {
      vA = a.PREV_RANK_NUM;
      vB = b.PREV_RANK_NUM;
    }
    if (typeof vA === 'string' && typeof vB === 'string') return gainersSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    return gainersSortAsc ? (vA - vB) : (vB - vA);
  });
}

function renderGainersTable() {
  const tbody = document.getElementById('gainers-table-body');
  if (!rawGainersDataset || rawGainersDataset.length === 0) return;

  tbody.innerHTML = rawGainersDataset.map(r => {
    const jumpNum = parseInt(r.JUMP) || 0;
    const ovRank = r.OVERALL_RANK !== 999 && r.OVERALL_RANK !== '-' ? '#' + r.OVERALL_RANK : '-';
    return `
      <tr>
        <td class="sticky-col">${renderStockWith3Links(r.SYMBOL, r.COMPANY_NAME)}</td>
        <td class="sticky-sec"><span class="sec-txt">${toTitleCase(r.SECTOR)}</span></td>
        <td style="color:#8da2c0; font-family:'JetBrains Mono';">${r.PREV_RANK}</td>
        <td><b style="color:#38bdf8; font-family:'JetBrains Mono'; font-size:11px;">#${r.CURRENT_RANK}</b></td>
        <td><span style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.35); padding:2px 7px; border-radius:4px; font-family:'JetBrains Mono'; font-weight:900;">+${jumpNum}</span></td>
        <td><b style="color:#fbbf24; font-family:'JetBrains Mono';">${r.RATING}</b></td>
        <td><span class="rank-badge">${ovRank}</span></td>
      </tr>
    `;
  }).join('');
  lucide.createIcons();
}

let rawEarlyDataset = [];
let filteredEarlyDataset = [];
let activeEarlySignalChips = new Set();
let earlySortCol = 'RS_VELOCITY';
let earlySortAsc = false;

async function loadEarlyTrendData() {
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader-msg').innerText = 'Loading Early Trend Breakouts...';

  try {
    const res = await fetch(`${WEBAPP_URL}?action=getEarlyTrend`);
    const json = await res.json();
    if (json && json.success && json.data && json.data.length > 0) {
      rawEarlyDataset = json.data.map(r => {
        const num = (v) => typeof v === 'number' ? v : (parseFloat(String(v || 0).replace(/[%,\s+]/g, '')) || 0);
        const pct = (v) => {
          if (v === undefined || v === null || v === '') return 0;
          const n = typeof v === 'number' ? v : (parseFloat(String(v).replace(/[%,\s+]/g, '')) || 0);
          return (Math.abs(n) <= 1 && n !== 0) ? n * 100 : n;
        };
        const sym = (r['SYMBOL'] || r['Symbol'] || '').trim().toUpperCase();
        return {
          'SYMBOL': sym,
          'COMPANY_NAME': r['COMPANY NAME'] || r['COMPANY_NAME'] || r['Stock Name'] || sym,
          'SECTOR': r['SECTOR'] || r['Sector'] || '-',
          'EARLY_SIGNAL': r['EARLY SIGNAL'] || r['EARLY_SIGNAL'] || 'Fresh Uptrend',
          'NEAR_TERM_RANK': num(r['NEAR-TERM RS RANK'] || r['NEAR_TERM_RANK']) || 999,
          'DEFAULT_RANK': num(r['DEFAULT RS RANK'] || r['DEFAULT_RANK']) || 999,
          'RS_VELOCITY': num(r['RS VELOCITY (🔼)'] || r['RS_VELOCITY']) || 0,
          'AWAY_200_EMA': pct(r['AWAY 200 EMA'] || r['AWAY_200_EMA']),
          'OFF_52W_HIGH': pct(r['% OFF 52W HIGH'] || r['OFF_52W_HIGH']),
          'RSI': num(r['RSI (14)'] || r['RSI']) || 50,
          'STAGE': r['STAGE'] || r['Stage'] || 'Stage Unclear'
        };
      }).filter(Boolean);

      populateEarlyDropdowns();
      filterEarlyTrendTable();
    }
  } catch (e) {}

  document.getElementById('loader').style.display = 'none';
  lucide.createIcons();
}

function populateEarlyDropdowns() {
  const secSel = document.getElementById('early-sector-select');
  const sectors = Array.from(new Set(rawEarlyDataset.map(r => toTitleCase(r['SECTOR'])))).filter(s => s && s !== '-').sort();
  secSel.innerHTML = `<option value="ALL">All Sectors (${sectors.length})</option>` + sectors.map(s => `<option value="${s}">${s}</option>`).join('');
}

function toggleEarlySignalChip(el, chipKey) {
  if (activeEarlySignalChips.has(chipKey)) {
    activeEarlySignalChips.delete(chipKey);
    el.classList.remove('active');
  } else {
    activeEarlySignalChips.add(chipKey);
    el.classList.add('active');
  }
  filterEarlyTrendTable();
}

function resetEarlyFilters() {
  document.getElementById('early-search-input').value = '';
  document.getElementById('early-sector-select').value = 'ALL';
  document.getElementById('early-stage-select').value = 'ALL';
  activeEarlySignalChips.clear();
  document.querySelectorAll('#view-early .chip').forEach(c => c.classList.remove('active'));
  filterEarlyTrendTable();
}

function filterEarlyTrendTable() {
  const q = document.getElementById('early-search-input').value.trim().toLowerCase();
  const sec = document.getElementById('early-sector-select').value;
  const stg = document.getElementById('early-stage-select').value;

  filteredEarlyDataset = rawEarlyDataset.filter(r => {
    const sym = r['SYMBOL'].toLowerCase();
    const name = r['COMPANY_NAME'].toLowerCase();
    const secFmt = toTitleCase(r['SECTOR']);
    const sig = r['EARLY_SIGNAL'].toLowerCase();

    if (q && !sym.includes(q) && !name.includes(q)) return false;
    if (sec !== 'ALL' && secFmt !== sec) return false;
    if (stg !== 'ALL' && !r['STAGE'].includes(stg)) return false;
    if (activeEarlySignalChips.has('stage2') && !sig.includes('stage 2')) return false;
    if (activeEarlySignalChips.has('stage1') && !sig.includes('stage 1')) return false;
    if (activeEarlySignalChips.has('fresh') && !sig.includes('fresh')) return false;
    return true;
  });

  sortEarlyDataset();
  renderEarlyTable();
}

function sortEarlyTable(col) {
  if (earlySortCol === col) earlySortAsc = !earlySortAsc;
  else {
    earlySortCol = col;
    earlySortAsc = col.includes('RANK') ? true : false;
  }
  sortEarlyDataset();
  renderEarlyTable();
}

function sortEarlyDataset() {
  filteredEarlyDataset.sort((a, b) => {
    let vA = a[earlySortCol], vB = b[earlySortCol];
    if (typeof vA === 'string') return earlySortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    return earlySortAsc ? (vA - vB) : (vB - vA);
  });
}

function renderEarlyTable() {
  const tbody = document.getElementById('early-tbody');
  document.getElementById('early-shown-count').innerText = filteredEarlyDataset.length;

  if (filteredEarlyDataset.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:24px; color:#94a3b8;">No breakout candidates match the filter.</td></tr>`;
    return;
  }

  const getSignalBadge = (sig) => {
    const s = String(sig || '').toLowerCase();
    if (s.includes('stage 2')) return `<span class="early-signal-pill sig-stage2"><i data-lucide="rocket" style="width:11px;height:11px;"></i> Early Stage 2 Breakout</span>`;
    if (s.includes('stage 1')) return `<span class="early-signal-pill sig-stage1"><i data-lucide="sprout" style="width:11px;height:11px;"></i> Stage 1 Base Turnaround</span>`;
    return `<span class="early-signal-pill sig-fresh"><i data-lucide="zap" style="width:11px;height:11px;"></i> Fresh Uptrend Ignition</span>`;
  };

  const getStageBadge = (stg) => {
    const s = String(stg || '').toLowerCase();
    if (s.includes('stage 2')) return `<span class="stage-pill stg-2">Stage 2 - Advancing</span>`;
    if (s.includes('stage 1')) return `<span class="stage-pill stg-1">Stage 1 - Basing</span>`;
    if (s.includes('stage 3')) return `<span class="stage-pill stg-3">Stage 3 - Topping</span>`;
    if (s.includes('stage 4')) return `<span class="stage-pill stg-4">Stage 4 - Declining</span>`;
    return `<span class="stage-pill" style="background:#1e293b; color:#94a3b8;">${stg}</span>`;
  };

  const getPctColor = (num) => {
    const sign = num > 0 ? '+' : '';
    const cls = num > 0 ? 'val-pos' : (num < 0 ? 'val-neg' : '');
    return `<span class="${cls}">${sign}${num.toFixed(1)}%</span>`;
  };

  tbody.innerHTML = filteredEarlyDataset.map(r => `
    <tr>
      <td class="sticky-col">${renderStockWith3Links(r['SYMBOL'], r['COMPANY_NAME'])}</td>
      <td class="sticky-sec"><span class="sec-txt">${toTitleCase(r['SECTOR'])}</span></td>
      <td>${getSignalBadge(r['EARLY_SIGNAL'])}</td>
      <td><b>#${r['NEAR_TERM_RANK']}</b></td>
      <td>${r['DEFAULT_RANK']}</td>
      <td><span class="velocity-badge">+${r['RS_VELOCITY']}</span></td>
      <td>${getPctColor(r['AWAY_200_EMA'])}</td>
      <td>${getPctColor(r['OFF_52W_HIGH'])}</td>
      <td><b style="font-family:'JetBrains Mono'; color:#38bdf8;">${r['RSI'].toFixed(1)}</b></td>
      <td>${getStageBadge(r['STAGE'])}</td>
    </tr>
  `).join('');
  lucide.createIcons();
}

function copyEarlySymbols() {
  if (filteredEarlyDataset.length === 0) return;
  const symbols = filteredEarlyDataset.map(r => r['SYMBOL']).filter(Boolean).join(', ');
  navigator.clipboard.writeText(symbols).then(() => alert(`Copied ${filteredEarlyDataset.length} Symbols!`));
}

function exportEarlyCSV() {
  if (filteredEarlyDataset.length === 0) return;
  const cols = ['SYMBOL', 'COMPANY_NAME', 'SECTOR', 'EARLY_SIGNAL', 'NEAR_TERM_RANK', 'DEFAULT_RANK', 'RS_VELOCITY', 'AWAY_200_EMA', 'OFF_52W_HIGH', 'RSI', 'STAGE'];
  let csv = cols.map(h => `"${h}"`).join(',') + '\n';
  filteredEarlyDataset.forEach(r => {
    csv += cols.map(h => `"${r[h] !== undefined ? r[h] : ''}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `Early_Trend_Breakouts_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

let rawHistoryLogData = null;
let rsTrajectoryChart = null;
let historyMaxDays = 365;
const CHART_PALETTE = ['#00f0ff', '#10b981', '#fbbf24', '#c084fc', '#f43f5e', '#38bdf8', '#fb923c', '#a855f7', '#4ade80', '#facc15', '#60a5fa', '#f472b6', '#2dd4bf', '#fb7185', '#818cf8'];

async function loadHistoryLogData() {
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader-msg').innerText = 'Loading 1-Year Historical Rolling RS Logs...';

  try {
    const gvizRes = await fetch(`${GVIZ_BASE}&sheet=${encodeURIComponent('_RS_History_Log_')}`);
    const text = await gvizRes.text();
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const gviz = JSON.parse(jsonString);

    if (gviz && gviz.table) {
      const colLabels = (gviz.table.cols || []).map(c => (c && (c.label || c.id)) ? String(c.label || c.id).trim() : '');
      const hasColHeaders = colLabels.some(l => l.includes('|'));
      let headers = [];
      let rowData = [];

      if (hasColHeaders) {
        headers = colLabels;
        rowData = (gviz.table.rows || []).map(r => (r && r.c) ? r.c.map(cell => cell ? String(cell.v || cell.f || '').trim().toUpperCase() : '') : []);
      } else if (gviz.table.rows && gviz.table.rows.length > 0) {
        headers = (gviz.table.rows[0].c || []).map(cell => cell ? String(cell.v || cell.f || '').trim() : '');
        rowData = gviz.table.rows.slice(1).map(r => (r && r.c) ? r.c.map(cell => cell ? String(cell.v || cell.f || '').trim().toUpperCase() : '') : []);
      }

      if (headers.length > 0 && headers.some(h => h.includes('|'))) {
        rawHistoryLogData = { headers: headers, rows: rowData };
        renderHistoryChartAndTable();
      }
    }
  } catch (err) {}

  document.getElementById('loader').style.display = 'none';
  lucide.createIcons();
}

function changeHistoryTF(btn, days) {
  document.querySelectorAll('.tf-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  historyMaxDays = days;
  renderHistoryChartAndTable();
}

function renderHistoryChartAndTable() {
  if (!rawHistoryLogData || !rawHistoryLogData.headers) return;

  const selectedModelFilter = document.getElementById('historyModelSelect').value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const topCount = parseInt(document.getElementById('historyTopCountSelect').value) || 10;
  const modelCols = [];

  rawHistoryLogData.headers.forEach((h, colIdx) => {
    if (!h || !h.includes('|')) return;
    const parts = h.split('|');
    const dateStr = parts[0].trim();
    const modelStr = parts[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    let isMatch = false;
    if (selectedModelFilter.includes('overall') && modelStr.includes('overall')) isMatch = true;
    else if (selectedModelFilter.includes('short') && (modelStr.includes('short') || modelStr.includes('st'))) isMatch = true;
    else if (selectedModelFilter.includes('selfnear') && (modelStr.includes('selfnear') || modelStr.includes('selfnt'))) isMatch = true;
    else if (selectedModelFilter.includes('selfdef') && (modelStr.includes('selfdef') || modelStr.includes('selfdefault'))) isMatch = true;
    else if (selectedModelFilter.includes('relnear') && (modelStr.includes('relnear') || modelStr.includes('relnt'))) isMatch = true;
    else if (selectedModelFilter.includes('reldef') && (modelStr.includes('reldef') || modelStr.includes('reldefault'))) isMatch = true;

    if (isMatch) modelCols.push({ dateStr: dateStr, dateObj: parseCustomHistoryDate(dateStr), colIdx: colIdx });
  });

  if (modelCols.length === 0) {
    document.getElementById('historySnapshotCount').innerText = "No snapshots found for this model.";
    return;
  }

  modelCols.sort((a, b) => {
    if (a.dateObj && b.dateObj) return a.dateObj - b.dateObj;
    return a.colIdx - b.colIdx;
  });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - historyMaxDays);
  const filteredCols = modelCols.filter(c => !c.dateObj || c.dateObj >= cutoffDate);
  const activeCols = filteredCols.length > 0 ? filteredCols : modelCols;

  const latestCol = activeCols[activeCols.length - 1];
  const topStocks = [];
  for (let r = 0; r < rawHistoryLogData.rows.length; r++) {
    const sym = rawHistoryLogData.rows[r][latestCol.colIdx];
    if (sym && sym !== '' && sym !== 'SYMBOL' && !topStocks.includes(sym)) {
      topStocks.push(sym);
      if (topStocks.length >= topCount) break;
    }
  }

  const dateLabels = activeCols.map(c => c.dateStr);
  const datasets = topStocks.map((sym, idx) => {
    const color = CHART_PALETTE[idx % CHART_PALETTE.length];
    const rankPoints = activeCols.map(col => {
      for (let r = 0; r < rawHistoryLogData.rows.length; r++) {
        if (rawHistoryLogData.rows[r][col.colIdx] === sym) return r + 1;
      }
      return null;
    });

    return {
      label: sym,
      data: rankPoints,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.2,
      pointRadius: activeCols.length > 35 ? 1.5 : 3.5,
      pointHoverRadius: 6,
      tension: 0.3,
      spanGaps: true
    };
  });

  const legendBar = document.getElementById('historyChartLegend');
  legendBar.innerHTML = topStocks.map((sym, idx) => {
    const color = CHART_PALETTE[idx % CHART_PALETTE.length];
    return `<span class="legend-chip" style="background:${color}1a; color:${color}; border:1px solid ${color}4d;">● ${sym}</span>`;
  }).join('');

  const canvas = document.getElementById('rsTrajectoryCanvas');
  const ctx = canvas.getContext('2d');
  if (rsTrajectoryChart) rsTrajectoryChart.destroy();

  rsTrajectoryChart = new Chart(ctx, {
    type: 'line',
    data: { labels: dateLabels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(12, 21, 39, 0.95)',
          titleColor: '#00f0ff',
          bodyColor: '#f8fafc',
          borderColor: '#1a2a44',
          borderWidth: 1,
          padding: 10,
          callbacks: { label: (ctx) => `  ${ctx.dataset.label}: Rank #${ctx.parsed.y}` }
        }
      },
      scales: {
        y: {
          reverse: true,
          min: 1,
          suggestedMax: Math.min(topCount + 10, 300),
          grid: { color: 'rgba(26, 42, 68, 0.4)' },
          ticks: { color: '#8da2c0', font: { family: 'JetBrains Mono', size: 10 }, callback: (val) => `#${val}` }
        },
        x: {
          grid: { color: 'rgba(26, 42, 68, 0.3)' },
          ticks: { color: '#8da2c0', font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 }
        }
      }
    }
  });

  renderHistoryHeatmapTable(activeCols, topStocks);
}

function renderHistoryHeatmapTable(activeCols, topStocks) {
  const thead = document.getElementById('history-matrix-thead');
  const tbody = document.getElementById('history-matrix-tbody');
  document.getElementById('historySnapshotCount').innerText = `${activeCols.length} Snapshots Shown`;

  thead.innerHTML = `<tr><th class="sticky-col" style="width:120px;">DATE</th>${topStocks.map(s => `<th>${s}</th>`).join('')}</tr>`;
  const revCols = [...activeCols].reverse();

  tbody.innerHTML = revCols.map(col => `
    <tr>
      <td class="sticky-col" style="font-family:'JetBrains Mono'; font-weight:700; color:#38bdf8;">${col.dateStr}</td>
      ${topStocks.map(sym => {
        let rank = '-';
        for (let r = 0; r < rawHistoryLogData.rows.length; r++) {
          if (rawHistoryLogData.rows[r][col.colIdx] === sym) {
            rank = r + 1;
            break;
          }
        }
        if (rank === '-') return `<td style="color:#475569;">-</td>`;
        let badgeCls = 'rank-lower';
        if (rank <= 5) badgeCls = 'rank-top5';
        else if (rank <= 15) badgeCls = 'rank-top15';
        return `<td><span class="rank-cell-pill ${badgeCls}">${rank}</span></td>`;
      }).join('')}
    </tr>
  `).join('');
}

function parseCustomHistoryDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const months = { "Jan":0, "Feb":1, "Mar":2, "Apr":3, "May":4, "Jun":5, "Jul":6, "Aug":7, "Sep":8, "Oct":9, "Nov":10, "Dec":11 };
  const day = parseInt(parts[0], 10), month = months[parts[1]], year = parseInt(parts[2], 10);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

function loadMasterStockData() {
  document.getElementById('loader').style.display = 'flex';
  document.getElementById('loader-msg').innerText = 'Loading Stock Master Universe...';

  fetch(GVIZ_URL)
    .then(res => res.text())
    .then(text => {
      try {
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const gvizData = JSON.parse(jsonString);
        parseGVizMasterData(gvizData);
      } catch(e) {
        fetchFromWebAppAPI();
      }
    })
    .catch(() => fetchFromWebAppAPI());
}

function fetchFromWebAppAPI() {
  fetch(WEBAPP_URL + "?action=getMasterStockList")
    .then(res => res.json())
    .then(res => {
      if (res && res.success && res.data) {
        rawHeaders = res.headers;
        handleMasterDataSuccess(res.data, res.updatedAt);
      }
    })
    .catch(() => { document.getElementById('loader').style.display = 'none'; });
}

function parseGVizMasterData(gviz) {
  if (!gviz || !gviz.table || !gviz.table.rows) {
    document.getElementById('loader').style.display = 'none';
    return;
  }
  const rows = gviz.table.rows;
  const headerCells = rows[2].c;
  rawHeaders = headerCells.map(c => (c && c.v !== null) ? String(c.f || c.v).trim() : '').filter(Boolean);
  const parsed = [];

  for (let i = 3; i < rows.length; i++) {
    const c = rows[i].c;
    if (!c || c.length < 2) continue;
    let symVal = (c[1] && c[1].v !== null) ? String(c[1].f || c[1].v).trim().toUpperCase() : '';
    let nameVal = (c[2] && c[2].v !== null) ? String(c[2].f || c[2].v).trim() : symVal;
    if (!symVal || symVal === 'NSE SYMBOL' || symVal === 'SYMBOL' || symVal.includes('NOTE')) continue;

    const rowObj = { 'Symbol': symVal, 'Stock Name': nameVal, 'NSE Symbol': symVal };
    for (let colIdx = 0; colIdx < rawHeaders.length; colIdx++) {
      const hName = rawHeaders[colIdx];
      const cell = c[colIdx];
      if (!cell || cell.v === null) rowObj[hName] = '';
      else if (typeof cell.v === 'number') rowObj[hName] = cell.v;
      else {
        const strVal = String(cell.f || cell.v).trim();
        const num = parseFloat(strVal.replace(/[%,\s₹]/g, ''));
        rowObj[hName] = (strVal !== '' && !isNaN(num) && isFinite(num) && (/^[-+]?\d+(\.\d+)?%?$/.test(strVal))) ? num : strVal;
      }
    }
    parsed.push(rowObj);
  }
  handleMasterDataSuccess(parsed, new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
}

function handleMasterDataSuccess(dataList, updatedAt) {
  document.getElementById('loader').style.display = 'none';
  if (!dataList || dataList.length === 0) return;

  rawDataset = dataList;
  setLocalCache(CACHE_KEYS.MASTER, dataList);
  setLocalCache(CACHE_KEYS.HEADERS, rawHeaders);
  setLocalCache(CACHE_KEYS.UPDATED, updatedAt);

  document.getElementById('total-count').innerText = rawDataset.length;
  document.getElementById('last-updated-time').innerHTML = `<i data-lucide="clock" style="width:11px;height:11px;"></i> ${updatedAt || 'Just Now'}`;

  const excluded = ['S.No', 'BSE Code', 'NSE Symbol', 'Stock Name', 'Sector', 'Industry', 'Detected Patterns'];
  availableColumns = rawHeaders.filter(h => !excluded.includes(h));
  availableColumns.push('Detected Patterns');

  if (visibleColumnsSet.size === 0) availableColumns.forEach(c => visibleColumnsSet.add(c));

  filterDisplayHeadersByMatrix();
  populateSectorsDropdown();
  populateIndustriesDropdown();
  applyAllFilters();
  lucide.createIcons();

  loadRSRankingData().then(() => {
    if (rawRankingDataset && rawRankingDataset.length > 0) {
      rawRankingDataset.forEach(item => { symbolRsRatingMap[item.SYMBOL] = item; });
      renderMasterTable();
    }
  });

  fetchChartinkScannerData();
}

async function fetchChartinkScannerData() {
  try {
    const res = await fetch(SCANNER_WEBAPP_URL);
    const json = await res.json();
    if (json && json.success && json.data) {
      chartinkScanners = json.data.scanners || {};
      stockToScannersMap = json.data.stockToScannersMap || {};
      setLocalCache(CACHE_KEYS.SCANNERS, { scanners: chartinkScanners, stockToScannersMap: stockToScannersMap });
      renderScannerChips();
      renderMasterTable();
    }
  } catch (err) {}
}

function renderScannerChips() {
  const container = document.getElementById('chartinkScannersRow');
  const keys = Object.keys(chartinkScanners);
  if (keys.length === 0) return;

  let html = `<span class="filter-group-title scanner-title-glow"><i data-lucide="sparkles" style="width:11px;height:11px;display:inline-block;"></i> PATTERNS & SCANNERS</span>`;
  keys.forEach(k => {
    const count = chartinkScanners[k].length;
    const icon = getScannerIcon(k);
    const cleanName = k.replace(/\(\d+\)/g, '').trim();
    html += `
      <span class="chip-scanner-vip" data-scanner="${k}" onclick="toggleScannerChip(this, '${k}')">
        <span>${icon}</span>
        <span>${cleanName}</span>
        <span class="scanner-count-badge">${count}</span>
      </span>
    `;
  });
  container.innerHTML = html;
  lucide.createIcons();
}

function toggleScannerChip(el, scannerName) {
  if (activeScannerChips.has(scannerName)) {
    activeScannerChips.delete(scannerName);
    el.classList.remove('active');
  } else {
    activeScannerChips.add(scannerName);
    el.classList.add('active');
  }
  applyAllFilters();
}

function switchMatrixView(el, viewKey) {
  document.querySelectorAll('.matrix-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  activeMatrixView = viewKey;
  filterDisplayHeadersByMatrix();
  renderMasterTable();
}

function filterDisplayHeadersByMatrix() {
  const base = availableColumns.filter(h => visibleColumnsSet.has(h));
  if (activeMatrixView === 'all') displayHeaders = base;
  else if (activeMatrixView === 'technicals') displayHeaders = base.filter(h => /Detected Patterns|Close|Volume|TURNOVER|RS|RSI|ema|high|low|D|W|15D|M|Q|H|Y|range|Away|VWAP|ATR/i.test(h) && !/Sales|Profit|PE|PB|ROCE|ROE|Debt|Ratio/i.test(h));
  else if (activeMatrixView === 'valuation') displayHeaders = base.filter(h => /Market Cap|PE|P\/E|PB|P\/B|ROCE|ROE|Networth|Debt|Asset|Cap Category|Book|EPS|Ratio/i.test(h));
  else if (activeMatrixView === 'sales_profit') displayHeaders = base.filter(h => /Sales|Profit|Revenue|OPM|Margin|TURNOVER|EBIT/i.test(h));
  else if (activeMatrixView === 'shareholding') displayHeaders = base.filter(h => /FII|DII|Promoter|Public|Holding|Shareholding/i.test(h));
}

function openColumnModal() {
  const modal = document.getElementById('columnModal');
  const list = document.getElementById('columnCheckboxesList');
  modal.style.display = 'flex';
  list.innerHTML = availableColumns.map(col => `
    <label class="col-checkbox-label">
      <input type="checkbox" value="${col}" ${visibleColumnsSet.has(col) ? 'checked' : ''}>
      <span>${col}</span>
    </label>
  `).join('');
  lucide.createIcons();
}

function closeColumnModal() { document.getElementById('columnModal').style.display = 'none'; }
function toggleAllColumns(select) { document.querySelectorAll('#columnCheckboxesList input[type="checkbox"]').forEach(cb => { cb.checked = select; }); }
function applyCustomColumns() {
  visibleColumnsSet.clear();
  document.querySelectorAll('#columnCheckboxesList input[type="checkbox"]:checked').forEach(cb => { visibleColumnsSet.add(cb.value); });
  filterDisplayHeadersByMatrix();
  renderMasterTable();
  closeColumnModal();
}

function populateSectorsDropdown() {
  const select = document.getElementById('sector-select');
  const sectors = Array.from(new Set(rawDataset.map(r => toTitleCase(r['Sector'])))).filter(s => s && s !== '-').sort();
  select.innerHTML = `<option value="ALL">All Sectors (${sectors.length})</option>` + sectors.map(s => `<option value="${s}">${s}</option>`).join('');
}

function populateIndustriesDropdown() {
  const select = document.getElementById('industry-select');
  const selectedSec = document.getElementById('sector-select').value;
  let filtered = selectedSec !== 'ALL' ? rawDataset.filter(r => toTitleCase(r['Sector']) === selectedSec) : rawDataset;
  const industries = Array.from(new Set(filtered.map(r => toTitleCase(r['Industry'])))).filter(i => i && i !== '-').sort();
  select.innerHTML = `<option value="ALL">All Industries (${industries.length})</option>` + industries.map(ind => `<option value="${ind}">${ind}</option>`).join('');
}

function toggleChip(el, chipKey) {
  if (activeChips.has(chipKey)) {
    activeChips.delete(chipKey);
    el.classList.remove('active');
  } else {
    activeChips.add(chipKey);
    el.classList.add('active');
  }
  applyAllFilters();
}

function clearAllFilterChips() {
  activeChips.clear();
  activeScannerChips.clear();
  document.querySelectorAll('.chip, .chip-scanner-vip').forEach(c => c.classList.remove('active'));
  applyAllFilters();
}

function resetAllFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('sector-select').value = 'ALL';
  document.getElementById('industry-select').value = 'ALL';
  document.getElementById('marketcap-select').value = 'ALL';
  
  document.getElementById('param-pullback').value = '1.5';
  document.getElementById('param-away-52wh').value = '-20';
  document.getElementById('param-turnover').value = '0';
  document.getElementById('param-rsi').value = '60';
  document.getElementById('param-roce').value = '15';
  document.getElementById('param-eps').value = '0';
  document.getElementById('param-cr-less').value = '3.0';
  document.getElementById('param-pb-less').value = '5.0';
  document.getElementById('param-de').value = '1.0';
  document.getElementById('param-pe').value = '40';
  clearAllFilterChips();
}

function applyAllFilters() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  const sec = document.getElementById('sector-select').value;
  const ind = document.getElementById('industry-select').value;
  const cap = document.getElementById('marketcap-select').value;

  const pPullback = parseFloat(document.getElementById('param-pullback').value) || 1.5;
  const pAway52 = parseFloat(document.getElementById('param-away-52wh').value) || -20;
  const pTurnover = parseFloat(document.getElementById('param-turnover').value) || 0;
  const pRSI = parseFloat(document.getElementById('param-rsi').value) || 60;
  const pROCE = parseFloat(document.getElementById('param-roce').value) || 15;
  const pEPS = parseFloat(document.getElementById('param-eps').value) || 0;
  const pCRLess = parseFloat(document.getElementById('param-cr-less').value) || 3.0;
  const pPBLess = parseFloat(document.getElementById('param-pb-less').value) || 5.0;
  const pDE = parseFloat(document.getElementById('param-de').value) || 1.0;
  const pPE = parseFloat(document.getElementById('param-pe').value) || 40;

  filteredDataset = rawDataset.filter(r => {
    const sym = String(r['Symbol'] || r['NSE Symbol'] || '').toLowerCase();
    const symUpper = sym.toUpperCase();
    const name = String(r['Stock Name'] || '').toLowerCase();
    const sectorFormatted = toTitleCase(r['Sector']);
    const industryFormatted = toTitleCase(r['Industry']);

    if (q && !sym.includes(q) && !name.includes(q)) return false;
    if (sec !== 'ALL' && sectorFormatted !== sec) return false;
    if (ind !== 'ALL' && industryFormatted !== ind) return false;
    if (cap !== 'ALL' && String(r['Market Cap Category'] || '').toLowerCase() !== cap.toLowerCase()) return false;

    if (activeScannerChips.size > 0) {
      const stockScanners = stockToScannersMap[symUpper] || [];
      for (let sc of activeScannerChips) {
        if (!stockScanners.includes(sc)) return false;
      }
    }

    const close = Number(r['Close']) || 0;
    const rsiVal = Number(r['RSI']) || 0;
    const turn20 = (Number(r['20D AVG TURNOVER']) > 100000 ? Number(r['20D AVG TURNOVER']) / 10000000 : Number(r['20D AVG TURNOVER'])) || 0;
    const away52 = Number(r['52WH Away']) || 0;
    const vwap = Number(r['VWAP']) || 0;
    const ema10 = Number(r['10ema']) || 0;
    const ema20 = Number(r['20ema']) || 0;
    const ema50 = Number(r['50ema']) || 0;
    const ema200 = Number(r['200ema']) || 0;

    const roce = Number(r['ROCE'] || r['ROCE %']) || 0;
    const currentRatio = Number(r['Current Ratio'] || r['CR']) || 0;
    const eps = Number(r['EPS'] || r['TTM EPS']) || 0;
    const debtToEq = Number(r['Debt to Equity'] || r['D/E'] || r['Debt/Equity']) || 0;
    const pe = Number(r['P/E'] || r['PE']) || 0;
    const pb = Number(r['P/B'] || r['PB']) || 0;
    const bookValue = Number(r['Book Value'] || r['BV']) || 0;

    if (pTurnover > 0 && turn20 < pTurnover) return false;
    if (activeChips.has('rsi60') && rsiVal < pRSI) return false;
    if (activeChips.has('rsi70') && rsiVal < 70) return false;
    if (activeChips.has('near52wh') && away52 < pAway52) return false;

    if (activeChips.has('closeEma10') && close < ema10) return false;
    if (activeChips.has('closeEma20') && close < ema20) return false;
    if (activeChips.has('closeEma50') && close < ema50) return false;
    if (activeChips.has('closeEma200') && close < ema200) return false;

    if (activeChips.has('pullback10ema') && (ema10 === 0 || (Math.abs(close - ema10) / ema10 * 100) > pPullback)) return false;
    if (activeChips.has('pullback20ema') && (ema20 === 0 || (Math.abs(close - ema20) / ema20 * 100) > pPullback)) return false;
    if (activeChips.has('closeVwap') && vwap > 0 && close < vwap) return false;

    if (activeChips.has('roceFilter') && roce < pROCE) return false;
    if (activeChips.has('epsFilter') && eps < pEPS) return false;
    if (activeChips.has('currentRatioLess') && (currentRatio <= 0 || currentRatio >= pCRLess)) return false;
    if (activeChips.has('pbFilter') && (pb <= 0 || pb >= pPBLess)) return false;
    if (activeChips.has('lowDebt') && debtToEq > pDE) return false;
    if (activeChips.has('peFilter') && (pe <= 0 || pe > pPE)) return false;
    if (activeChips.has('undervaluedBV') && (bookValue <= 0 || bookValue < close)) return false;

    return true;
  });

  sortDataset();
  renderMasterTable();
}

function sortTable(colKey) {
  if (currentSortCol === colKey) currentSortAsc = !currentSortAsc;
  else {
    currentSortCol = colKey;
    currentSortAsc = false;
  }
  sortDataset();
  renderMasterTable();
}

function sortDataset() {
  filteredDataset.sort((a, b) => {
    let vA = a[currentSortCol], vB = b[currentSortCol];
    if (vA === undefined || vA === '') return 1;
    if (vB === undefined || vB === '') return -1;
    if (typeof vA === 'string' && typeof vB === 'string') {
      return currentSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
    }
    return currentSortAsc ? (Number(vA) - Number(vB)) : (Number(vB) - Number(vA));
  });
}

function renderMasterTable() {
  const headerRow = document.getElementById('master-table-headers');
  const tbody = document.getElementById('master-table-body');
  document.getElementById('shown-count').innerText = filteredDataset.length;

  let headersHTML = `
    <th class="sticky-col" onclick="sortTable('Symbol')">STOCK / SYMBOL ⇅</th>
    <th style="min-width: 90px; text-align:center;">
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
        <span>RS RATING 🏆</span>
        <select class="master-rs-select" onchange="changeMasterRsType(this.value)">
          <option value="overall" ${masterSelectedRsType==='overall'?'selected':''}>Overall RS</option>
          <option value="st" ${masterSelectedRsType==='st'?'selected':''}>Short Term RS</option>
          <option value="snt" ${masterSelectedRsType==='snt'?'selected':''}>Self RS (NT)</option>
          <option value="sdef" ${masterSelectedRsType==='sdef'?'selected':''}>Self RS (Def)</option>
          <option value="rnt" ${masterSelectedRsType==='rnt'?'selected':''}>Rel RS (NT)</option>
          <option value="rdef" ${masterSelectedRsType==='rdef'?'selected':''}>Rel RS (Def)</option>
        </select>
      </div>
    </th>
    <th class="sticky-sec" onclick="sortTable('Sector')">SECTOR / INDUSTRY ⇅</th>
  `;
  
  headersHTML += displayHeaders.map(h => `<th onclick="sortTable('${h}')">${h} ${currentSortCol === h ? (currentSortAsc ? '▲' : '▼') : '⇅'}</th>`).join('');
  headerRow.innerHTML = headersHTML;

  if (filteredDataset.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${displayHeaders.length + 3}" style="padding: 24px; color: #94a3b8; font-size: 12px;">No stocks match the selected filter criteria.</td></tr>`;
    return;
  }

  const displayRows = filteredDataset.slice(0, 300);

  const fmtPct = (val) => {
    if (val === '' || val === null || isNaN(val)) return '-';
    const num = Number(val);
    const sign = num > 0 ? '+' : '';
    const cls = num > 0 ? 'val-pos' : (num < 0 ? 'val-neg' : '');
    return `<span class="${cls}">${sign}${num.toFixed(2)}%</span>`;
  };

  const fmtPrice = (val) => {
    if (val === '' || val === null || isNaN(val)) return '-';
    return '₹' + Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getMasterRSPill = (sym, fallbackVal) => {
    const s = sym.toUpperCase();
    let rating = 50;
    if (symbolRsRatingMap[s]) {
      const m = symbolRsRatingMap[s];
      if (masterSelectedRsType === 'overall') rating = m.OVERALL_RATING || (100 - m.OVERALL_RANK / 20);
      else if (masterSelectedRsType === 'st') rating = m.ST_RATING || (100 - m.ST_RANK / 20);
      else if (masterSelectedRsType === 'snt') rating = 100 - (m.SELF_NT_RANK / 20);
      else if (masterSelectedRsType === 'sdef') rating = 100 - (m.SELF_DEF_RANK / 20);
      else if (masterSelectedRsType === 'rnt') rating = 100 - (m.REL_NT_RANK / 20);
      else if (masterSelectedRsType === 'rdef') rating = 100 - (m.REL_DEF_RANK / 20);
    } else {
      rating = parseFloat(fallbackVal) || 50;
    }

    rating = Math.max(1, Math.min(99, Math.round(rating)));
    let pillCls = 'rs-pill-neg';
    if (rating >= 70) pillCls = 'rs-pill-pos';
    else if (rating >= 40) pillCls = 'rank-p-top50';

    return `<span class="rs-pill ${pillCls}">${rating}</span>`;
  };

  tbody.innerHTML = displayRows.map(r => {
    const sym = r['Symbol'] || r['NSE Symbol'] || 'STOCK';
    const symUpper = sym.toUpperCase();
    const name = r['Stock Name'] || sym;
    const sec = toTitleCase(r['Sector']);
    const ind = toTitleCase(r['Industry']);

    let rowHTML = `
      <tr>
        <td class="sticky-col">${renderStockWith3Links(sym, name)}</td>
        <td>${getMasterRSPill(sym, r['RS RATING'])}</td>
        <td class="sticky-sec">
          <div class="sector-wrap">
            <span class="sec-txt" title="${sec}">${sec}</span>
            <span class="ind-txt" title="${ind}">${ind}</span>
          </div>
        </td>
    `;

    rowHTML += displayHeaders.map(h => {
      const val = r[h];
      if (h === 'Detected Patterns') {
        const scList = stockToScannersMap[symUpper] || [];
        return `<td>${formatPatternPills(scList)}</td>`;
      }
      if (h === 'Sector' || h === 'Industry') {
        return `<td><span style="font-family:'Inter', sans-serif; font-weight:600; color:#cbd5e1;">${toTitleCase(val)}</span></td>`;
      }
      if (/^RS RATING|^Abs RS/i.test(h)) {
        if (val === '' || val === null || isNaN(val)) return `<td>-</td>`;
        const numVal = parseFloat(val);
        const sign = numVal >= 0 ? '+' : '';
        const pillCls = numVal >= 0 ? 'rs-pill-pos' : 'rs-pill-neg';
        return `<td><span class="rs-pill ${pillCls}">${sign}${numVal.toFixed(2)}</span></td>`;
      }
      if (h === 'Market Cap Category') {
        const capStr = String(val || 'Mid Cap');
        let capClass = 'cap-mid';
        if (capStr.includes('Large')) capClass = 'cap-large';
        else if (capStr.includes('Small')) capClass = 'cap-small';
        else if (capStr.includes('Micro')) capClass = 'cap-micro';
        return `<td><span class="cap-badge ${capClass}">${val}</span></td>`;
      }
      if (h === 'Close' || h === 'VWAP' || /ema|ago high|high|low|ATR/i.test(h)) {
        return `<td><span class="val-price">${fmtPrice(val)}</span></td>`;
      }
      if (h === 'Volume') {
        return `<td><span>${typeof val === 'number' ? val.toLocaleString('en-IN') : (val || '-')}</span></td>`;
      }
      if (h === 'Market Cap') {
        return `<td style="color:#e2e8f0; font-weight:600;">${typeof val === 'number' ? val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (val || '-')}</td>`;
      }
      if (/TURNOVER|SALES|Sales|Profit/i.test(h)) {
        if (typeof val === 'number') {
          const crVal = val > 10000 ? (val / 10000000).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : val.toFixed(2);
          return `<td><span class="${h.includes('TURNOVER') ? 'val-turnover' : ''}">₹${crVal} Cr</span></td>`;
        }
        return `<td>${val || '-'}</td>`;
      }
      if (/D|W|15D|M|Q|H|Y|Away|ROCE|Ratio|Return|OPM|FII|DII|Promoter|Networth|Assets|range/i.test(h) && typeof val === 'number' && !h.includes('TURNOVER')) {
        if (h.includes('range')) return `<td><span class="val-range">+${val.toFixed(2)}%</span></td>`;
        return `<td>${fmtPct(val)}</td>`;
      }
      if (/PE|P\/E|PB|P\/B|EPS|Debt|Current Ratio/i.test(h) && typeof val === 'number') {
        return `<td style="color:#e2e8f0; font-weight:600;">${val.toFixed(2)}</td>`;
      }
      return `<td>${typeof val === 'number' ? val.toFixed(2) : (val || '-')}</td>`;
    }).join('');

    rowHTML += `</tr>`;
    return rowHTML;
  }).join('');
  lucide.createIcons();
}

function setupAutoRefreshTimer() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  const intervalSec = parseInt(document.getElementById('auto-refresh-interval').value);
  const badge = document.getElementById('timer-badge');

  if (intervalSec === 0) {
    badge.innerText = '';
    return;
  }
  refreshCountdown = intervalSec;
  badge.innerText = `(${refreshCountdown}s)`;

  autoRefreshTimer = setInterval(() => {
    refreshCountdown--;
    badge.innerText = `(${refreshCountdown}s)`;
    if (refreshCountdown <= 0) {
      refreshCountdown = intervalSec;
      triggerActiveViewRefresh();
    }
  }, 1000);
}

function copyTableData() {
  if (filteredDataset.length === 0) return;
  const symbols = filteredDataset.map(r => r['Symbol']).filter(Boolean).join(', ');
  navigator.clipboard.writeText(symbols).then(() => alert(`Copied ${filteredDataset.length} Symbols!`));
}

function exportToCSV() {
  if (filteredDataset.length === 0) return;
  const exportCols = ['Symbol', 'Stock Name', 'Sector', 'Industry', ...displayHeaders];
  let csv = exportCols.map(h => `"${h}"`).join(',') + '\n';
  filteredDataset.forEach(r => {
    csv += exportCols.map(h => `"${r[h] !== undefined ? String(r[h]).replace(/"/g, '""') : ''}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `MICKKK_Master_Screener_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}