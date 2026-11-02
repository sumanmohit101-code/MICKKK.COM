// Mickkk Stock Screener — page logic (unchanged from single-file version except theme-aware chart colors)
// ===== Theme helpers (light/dark) — used by Chart.js =====
function themeChart() {
  const dark = document.documentElement.classList.contains('dark');
  return dark
    ? { tipBg:'rgba(12, 21, 39, 0.95)', tipTitle:'#00f0ff', tipBody:'#f8fafc', tipBorder:'#1a2a44', gridY:'rgba(26, 42, 68, 0.4)', gridX:'rgba(26, 42, 68, 0.3)', tick:'#8da2c0' }
    : { tipBg:'rgba(255, 255, 255, 0.97)', tipTitle:'#0284c7', tipBody:'#0f172a', tipBorder:'#cbd5e1', gridY:'rgba(100, 116, 139, 0.18)', gridX:'rgba(100, 116, 139, 0.14)', tick:'#64748b' };
}
window.addEventListener('mickkk:theme', () => {
  try {
    if (typeof rsTrajectoryChart !== 'undefined' && rsTrajectoryChart) {
      const t = themeChart(), o = rsTrajectoryChart.options;
      o.plugins.tooltip.backgroundColor = t.tipBg; o.plugins.tooltip.titleColor = t.tipTitle;
      o.plugins.tooltip.bodyColor = t.tipBody; o.plugins.tooltip.borderColor = t.tipBorder;
      o.scales.y.grid.color = t.gridY; o.scales.x.grid.color = t.gridX;
      o.scales.y.ticks.color = t.tick; o.scales.x.ticks.color = t.tick;
      rsTrajectoryChart.update();
    }
  } catch (e) { console.warn('chart theme update skipped', e); }
});

const SPREADSHEET_ID = "13SG0bcfTGXLQfq14hb_rRrTUALq5GYUQuNegP_AH42Y";

// =========================================================================
    // ⚡ 0-SECOND INSTANT STALE-WHILE-REVALIDATE CACHE ENGINE
    // =========================================================================
    const CACHE_KEYS = {
      MASTER: 'MICKKK_CACHE_MASTER_V2',
      HEADERS: 'MICKKK_CACHE_HEADERS_V2',
      UPDATED: 'MICKKK_CACHE_UPDATED',
      BENCHMARK: 'MICKKK_CACHE_BENCHMARK',
      RANKING: 'MICKKK_CACHE_RANKING',
      EARLY: 'MICKKK_CACHE_EARLY',
      HISTORY: 'MICKKK_CACHE_HISTORY',
      SCANNERS: 'MICKKK_CACHE_SCANNERS'
    };

    function getLocalCache(key) { return MKC.get(key); }
    function setLocalCache(key, data) { MKC.set(key, data); }
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

    // Relative Returns State
    let relativeCache = {};
    let benchmarkIndexData = {};
    let rawRelativeDataset = [];
    let filteredRelativeDataset = [];
    let activeOutperformChips = new Set();
    let relativeSortCol = 'Daily Relative % Change';
    let relativeSortAsc = false;

    // RS Ranking State
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
    let currentSortCol = 'D'; // Default sort by Day % Change
  let currentSortAsc = false;
  let masterSelectedRsType = 'overall'; // Default Overall RS
  let symbolRsRatingMap = {};
    let activeMatrixView = 'all';

    function toTitleCase(str) {
      if (!str || typeof str !== 'string') return '-';
      return str
        .toLowerCase()
        .replace(/[-_]/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
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
      if (!scannerList || scannerList.length === 0) return '<span style="color:var(--c-slate3);">-</span>';

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

    // ===== START (runs only after Google login — see mickkk-gate.js) =====
    async function startScreener() {
      lucide.createIcons();

      // 1) instant hydration from IndexedDB (0-second paint)
      const cachedMaster = getLocalCache(CACHE_KEYS.MASTER);
      const cachedHeaders = getLocalCache(CACHE_KEYS.HEADERS);
      const cachedUpdated = getLocalCache(CACHE_KEYS.UPDATED);
      const cachedBenchmark = getLocalCache(CACHE_KEYS.BENCHMARK);
      const cachedRanking = getLocalCache(CACHE_KEYS.RANKING);
      const cachedScanners = getLocalCache(CACHE_KEYS.SCANNERS);

      if (cachedBenchmark) benchmarkIndexData = cachedBenchmark;
      if (cachedRanking) { rawRankingDataset = cachedRanking; cachedRanking.forEach(item => { symbolRsRatingMap[item.SYMBOL] = item; }); }
      if (cachedScanners) { chartinkScanners = cachedScanners.scanners || {}; stockToScannersMap = cachedScanners.stockToScannersMap || {}; }
      renderScannerChips();
      if (cachedMaster && cachedHeaders && cachedMaster.length > 0) {
        rawHeaders = cachedHeaders;
        handleMasterDataSuccess(cachedMaster, cachedUpdated || 'Cached', false);
        document.getElementById('loader').style.display = 'none';
      }

      // 2) fresh data (worker edge cache) — all in parallel, swaps in silently
      loadMasterStockData();
      loadRSRankingData(true);
      fetchChartinkScannerData();
      loadBenchmarkIndexData();

      window.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
          const _dd = document.getElementById('relativeDropdownMenu'); if (_dd) _dd.classList.remove('show');
        }
      });
    }
    let __screenerStarted = false;
    async function bootScreener() {
      if (__screenerStarted) return; __screenerStarted = true;
      await MKC.init();
      startScreener();
    }
    if (window.MickkkGate && window.MickkkGate.ready) bootScreener();
    else window.addEventListener('mickkk:authed', bootScreener);

    // =========================================================================
    // 🔀 APP VIEW SWITCHER & NAVIGATION
    // =========================================================================

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

    // Benchmark Tile Switcher (Point 3)
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
      MKC.forceFor(8000);
      if (typeof mkToast === 'function') mkToast('Refreshing data…');
      if (currentAppView === 'master') {
        loadMasterStockData();
      } else if (currentAppView === 'relative') {
        delete relativeCache[currentRelativeSheet];
        loadRelativeReturnsData(currentRelativeSheet);
        loadBenchmarkIndexData();
      } else if (currentAppView === 'ranking' || currentAppView === 'gainers') {
        loadRSRankingData();
      } else if (currentAppView === 'early') {
        loadEarlyTrendData();
      } else if (currentAppView === 'history') {
        loadHistoryLogData();
      }
    }

    // RS Weight Modal Handlers (Point 1)
    function openRSWeightModal() { document.getElementById('rsWeightModal').style.display = 'flex'; }
    function closeRSWeightModal() { document.getElementById('rsWeightModal').style.display = 'none'; }

    // =========================================================================
    // 📊 1. RELATIVE RETURNS & BENCHMARK INDEX ENGINE (100% FAILSAFE)
    // =========================================================================

    async function loadBenchmarkIndexData() {
      try {
        const res = await MKC.fetch('screener', { action: 'getBenchmarkIndex' });
        const json = await res.json();
        if (json && json.success && json.data) {
          parseBenchmarkRows(json.data);
          return;
        }
      } catch (e) {}

      try {
        const gvizRes = await MKC.gviz('NIFTY 500 Index');
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
        const res = await MKC.fetch('screener', { action: 'getRelativeReturns', sheetName: sheetName });
        const json = await res.json();
        if (json && json.success && json.data) {
          fetchedData = json.data;
        }
      } catch (e) {}

      if (!fetchedData) {
        try {
          const gvizRes = await MKC.gviz(sheetName);
          const text = await gvizRes.text();
          const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const gviz = JSON.parse(jsonString);
          if (gviz && gviz.table && gviz.table.rows) {
            const parsed = [];
            const rows = gviz.table.rows;
            for (let i = 0; i < rows.length; i++) {
              const c = rows[i].c;
              if (!c || c.length < 2) continue;
              const nameVal = (c[0] && c[0].v !== null) ? String(c[0].f || c[0].v).trim() : '';
              const symVal = (c[1] && c[1].v !== null) ? String(c[1].f || c[1].v).trim().toUpperCase() : '';
              if (!symVal || symVal === 'SYMBOL' || nameVal.toUpperCase().includes('NAME OF COMPANY')) continue;

              const getPct = (idx) => {
                if (!c[idx] || c[idx].v === null) return 0;
                const v = c[idx].v;
                if (typeof v === 'number') return (Math.abs(v) <= 1 && v !== 0) ? v * 100 : v;
                return parseFloat(String(v).replace(/[%,\s]/g, '')) || 0;
              };

              parsed.push({
                'NAME OF COMPANY': nameVal,
                'SYMBOL': symVal,
                'Sector': (c[2] && c[2].v !== null) ? String(c[2].v).trim() : '-',
                'Industry': (c[3] && c[3].v !== null) ? String(c[3].v).trim() : '-',
                'Daily Relative % Change': getPct(4),
                'Weekly Relative % Change': getPct(5),
                '15 Days Relative % Change': getPct(6),
                '1 Month Relative % Change': getPct(7),
                'Quarterly Relative % Change': getPct(8),
                'Half Yearly Relative % Change': getPct(9),
                'Yearly Relative % Change': getPct(10)
              });
            }
            fetchedData = parsed;
          }
        } catch (err) {}
      }

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
        if (typeof vA === 'string') {
          return relativeSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
        return relativeSortAsc ? (vA - vB) : (vB - vA);
      });
    }

    function renderRelativeTable() {
      const tbody = document.getElementById('relative-table-body');
      document.getElementById('rel-shown-count').innerText = filteredRelativeDataset.length;

      if (filteredRelativeDataset.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding:24px; color:var(--c-slate);">No stocks match your filter.</td></tr>`;
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
            <td class="sticky-col">
  ${renderStockWith3Links(sym, name)}
</td>
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
      navigator.clipboard.writeText(symbols).then(() => {
        alert(`Copied ${filteredRelativeDataset.length} Symbols!`);
      });
    }

    function exportRelativeCSV() {
      if (filteredRelativeDataset.length === 0) return;
      const cols = ['SYMBOL', 'NAME OF COMPANY', 'Sector', 'Industry', 'Daily Relative % Change', 'Weekly Relative % Change', '15 Days Relative % Change', '1 Month Relative % Change', 'Quarterly Relative % Change', 'Half Yearly Relative % Change', 'Yearly Relative % Change'];
      let csv = cols.map(h => `"${h}"`).join(',') + '\n';

      filteredRelativeDataset.forEach(r => {
        const rowVals = cols.map(h => `"${r[h] !== undefined ? r[h] : ''}"`);
        csv += rowVals.join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `${currentRelativeSheet.replace(/[^A-Za-z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // =========================================================================
    // 🏆 2. RS RANKING MATRIX ENGINE (POINT 4: T1-T5 SEQUENCE)
    // =========================================================================

    async function loadRSRankingData(silent) {
      if (!silent) { document.getElementById('loader').style.display = 'flex'; document.getElementById('loader-msg').innerText = 'Loading RS Ranking Matrix...'; }

      let data = null;

      try {
        const res = await MKC.fetch('screener', { action: 'getRSRanking' });
        const json = await res.json();
        if (json && json.success && json.data && json.data.length && json.data[0]['Overall RS Rating'] !== undefined) {
          data = json.data;
        }
      } catch (e) {}

      if (!data) {
        try {
          const gvizRes = await MKC.gviz('RS Ranking');
          const text = await gvizRes.text();
          const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const gviz = JSON.parse(jsonString);
          if (gviz && gviz.table && gviz.table.rows) {
            data = gviz.table.rows.map(r => {
              const c = r.c;
              if (!c || !c[1] || String(c[1].v).toUpperCase() === 'SYMBOL') return null;
              return {
                'NAME OF COMPANY': c[0] ? (c[0].f || c[0].v) : '',
                'SYMBOL': c[1] ? String(c[1].f || c[1].v).toUpperCase() : '',
                'Sector': c[2] ? c[2].v : '-',
                'Industry': c[3] ? c[3].v : '-',
                'Self RS (Near-Term) Score': c[4] ? c[4].v : 0,
                'Self RS (Near-Term) Rank': c[5] ? c[5].v : 999,
                'Self RS (Default) Score': c[7] ? c[7].v : 0,
                'Self RS (Default) Rank': c[8] ? c[8].v : 999,
                'Relative RS (Near-Term) Score': c[10] ? c[10].v : 0,
                'Relative RS (Near-Term) Rank': c[11] ? c[11].v : 999,
                'Relative RS (Default) Score': c[13] ? c[13].v : 0,
                'Relative RS (Default) Rank': c[14] ? c[14].v : 999,
                'Short Term RS Score': c[16] ? c[16].v : 0,
                'Short Term RS Rank': c[17] ? c[17].v : 999,
                'Avg Rank (all 5 types)': c[19] ? c[19].v : 999,
                'Overall RS Rank': c[20] ? c[20].v : 999,
                'Short Term RS Rating': c[18] ? c[18].v : 50,
                'Self RS (Near-Term) Rating': c[6] ? c[6].v : 0,
                'Self RS (Default) Rating': c[9] ? c[9].v : 0,
                'Relative RS (Near-Term) Rating': c[12] ? c[12].v : 0,
                'Relative RS (Default) Rating': c[15] ? c[15].v : 0,
                'Overall RS Rating': c[21] ? c[21].v : 0
              };
            }).filter(Boolean);
          }
        } catch (err) {}
      }

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
            'ST_RATING': num(r['Short Term RS Rating']),
            'SELF_NT_RATING': num(r['Self RS (Near-Term) Rating']),
            'SELF_DEF_RATING': num(r['Self RS (Default) Rating']),
            'REL_NT_RATING': num(r['Relative RS (Near-Term) Rating']),
            'REL_DEF_RATING': num(r['Relative RS (Default) Rating']),
            'OVERALL_RATING': num(r['Overall RS Rating']),
            'AVG_RANK': num(r['Avg Rank (all 5 types)']),
            'OVERALL_RANK': num(r['Overall RS Rank']) || 999
          };
        });

 // ✅ Save RS Ranking Clean Dataset to Local Cache
        setLocalCache(CACHE_KEYS.RANKING, rawRankingDataset);
        rawRankingDataset.forEach(item => { symbolRsRatingMap[item.SYMBOL] = item; });
        if (typeof enrichDataset === 'function' && rawDataset.length) { enrichDataset(); buildFilterOptions(); applyAllFilters(); }

        document.getElementById('rank-total-count').innerText = rawRankingDataset.length;
        renderRSLeadersCards();
        populateRankingDropdowns();
        filterRSRankingTable();
      }

      if (!silent) document.getElementById('loader').style.display = 'none';
    }

   function renderRSLeadersCards() {
      // 1. Top 10 Slice for each category
      const top = (prop) => [...rawRankingDataset].sort((a,b) => a[prop] - b[prop]).slice(0, 10);

      // 2. Clean 3-Column Tabular Alignment (Rank, Symbol, Company Name)
      const renderList = (arr) => arr.map((item, idx) => `
        <div class="rs-leader-row">
          <span class="rs-leader-pos">#${idx+1}</span>
          <span class="rs-leader-sym" title="${item.SYMBOL}">${item.SYMBOL}</span>
          <span class="rs-leader-name" title="${item['NAME OF COMPANY']}">${item['NAME OF COMPANY']}</span>
        </div>
      `).join('');

      // 3. Proper Sequence: Overall -> T1 -> T2 -> T3 -> T4 -> T5
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
        if (typeof vA === 'string') {
          return rankingSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
        return rankingSortAsc ? (vA - vB) : (vB - vA);
      });
    }

    function renderRankingTable() {
      const tbody = document.getElementById('ranking-table-body');
      document.getElementById('rank-shown-count').innerText = filteredRankingDataset.length;

      if (filteredRankingDataset.length === 0) {
        tbody.innerHTML = `<tr><td colspan="14" style="padding:24px; color:var(--c-slate);">No stocks match your filter.</td></tr>`;
        return;
      }

      // Colorful Rank Badge Pills
      const getRankPill = (rnk) => {
        if (!rnk || isNaN(rnk)) return '-';
        let cls = 'rank-p-other';
        if (rnk <= 10) cls = 'rank-p-top10';
        else if (rnk <= 25) cls = 'rank-p-top25';
        else if (rnk <= 50) cls = 'rank-p-top50';
        return `<span class="rank-pill-t ${cls}">${rnk}</span>`;
      };

      // Color-Coded Scores (+in Green, - in Red)
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
            <td class="sticky-col">
  ${renderStockWith3Links(sym, name)}
</td>
            <td class="sticky-sec">
              <div class="sector-wrap">
                <span class="sec-txt" title="${sec}">${sec}</span>
                <span class="ind-txt" title="${ind}">${ind}</span>
              </div>
            </td>
            <td><span class="overall-glow-badge">#${r['OVERALL_RANK']}</span></td>
            <td style="color:var(--c-amber); font-weight:800; font-family:'JetBrains Mono'; font-size:10.5px;">${r['AVG_RANK'].toFixed(1)}</td>
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
      navigator.clipboard.writeText(symbols).then(() => {
        alert(`Copied ${filteredRankingDataset.length} Symbols!`);
      });
    }

    function exportRankingCSV() {
      if (filteredRankingDataset.length === 0) return;
      const cols = ['SYMBOL', 'NAME OF COMPANY', 'Sector', 'Industry', 'OVERALL_RANK', 'AVG_RANK', 'SELF_NT_SCORE', 'SELF_NT_RANK', 'SELF_DEF_SCORE', 'SELF_DEF_RANK', 'REL_NT_SCORE', 'REL_NT_RANK', 'REL_DEF_SCORE', 'REL_DEF_RANK', 'ST_SCORE', 'ST_RANK'];
      let csv = cols.map(h => `"${h}"`).join(',') + '\n';

      filteredRankingDataset.forEach(r => {
        const rowVals = cols.map(h => `"${r[h] !== undefined ? r[h] : ''}"`);
        csv += rowVals.join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `RS_Ranking_Matrix_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // =========================================================================
    // 📈 3. RS GAINERS & TREND (WITH MULTI-COLUMN SORTING)
    // =========================================================================

    let rawGainersDataset = [];
    let gainersSortCol = 'CURRENT_RANK';
    let gainersSortAsc = true;

    async function loadGainersData() {
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loader-msg').innerText = 'Loading Top 100 Short-Term RS Gainers & Leaders...';

      if (rawGainersDataset && rawGainersDataset.length > 0) {
        sortGainersDataset();
        renderGainersTable();
        document.getElementById('loader').style.display = 'none';
        return;
      }

      let parsedGainers = [];

      // Channel 1: Try fetching directly from '📈 RS Gainers & Trend' Sheet
      const sheetNamesToTry = ['📈 RS Gainers & Trend', 'RS Gainers & Trend'];
      for (let sName of sheetNamesToTry) {
        try {
          const gvizRes = await MKC.gviz(sName);
          const text = await gvizRes.text();
          const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
          const gviz = JSON.parse(jsonString);

          if (gviz && gviz.table && gviz.table.rows && gviz.table.rows.length > 2) {
            const rows = gviz.table.rows;
            for (let i = 2; i < rows.length; i++) {
              const c = rows[i].c;
              if (!c || !c[0]) continue;
              const sym = c[0] ? String(c[0].f || c[0].v || '').trim().toUpperCase() : '';
              if (!sym || sym === 'SYMBOL' || sym.includes('TOP') || sym.includes('DATE')) continue;

              const getCleanNum = (cell) => {
                if (!cell || cell.v === null) return 999;
                const v = cell.v;
                return typeof v === 'number' ? v : (parseFloat(String(v).replace(/[^0-9.-]/g, '')) || 999);
              };

              parsedGainers.push({
                SYMBOL: sym,
                COMPANY_NAME: c[1] ? String(c[1].f || c[1].v || '').trim() : sym,
                SECTOR: c[2] ? String(c[2].v || '').trim() : '-',
                PREV_RANK: c[3] ? (c[3].f || c[3].v) : '>300',
                PREV_RANK_NUM: getCleanNum(c[3]),
                CURRENT_RANK: c[4] ? (c[4].v || 999) : 999,
                JUMP: c[5] ? (parseInt(String(c[5].v || '+0').replace(/[^0-9.-]/g, '')) || 0) : 0,
                RATING: c[6] ? (c[6].v || 50) : 50,
                OVERALL_RANK: symbolRsRatingMap[sym] ? symbolRsRatingMap[sym].OVERALL_RANK : 999
              });
            }
            if (parsedGainers.length > 0) break;
          }
        } catch (e) {}
      }

      // Channel 2: Dynamic Fallback from RS Ranking Matrix
      if (parsedGainers.length === 0) {
        if (!rawRankingDataset || rawRankingDataset.length === 0) {
          await loadRSRankingData();
        }

        if (rawRankingDataset && rawRankingDataset.length > 0) {
          const sortedByST = [...rawRankingDataset].sort((a, b) => a.ST_RANK - b.ST_RANK);
          
          parsedGainers = sortedByST.slice(0, 100).map(r => {
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
        }
      }

      if (parsedGainers.length > 0) {
        rawGainersDataset = parsedGainers;
        sortGainersDataset();
        renderGainersTable();
      } else {
        document.getElementById('gainers-table-body').innerHTML = `<tr><td colspan="7" style="padding:24px; color:var(--c-red);">Unable to load RS Gainers data.</td></tr>`;
      }

      document.getElementById('loader').style.display = 'none';
    }

    function sortGainersTable(col) {
      if (gainersSortCol === col) {
        gainersSortAsc = !gainersSortAsc;
      } else {
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

        if (typeof vA === 'string' && typeof vB === 'string') {
          return gainersSortAsc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        }
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
            <td class="sticky-col">
              ${renderStockWith3Links(r.SYMBOL, r.COMPANY_NAME)}
            </td>
            <td class="sticky-sec">
              <span class="sec-txt">${toTitleCase(r.SECTOR)}</span>
            </td>
            <td style="color:var(--text-muted); font-family:'JetBrains Mono';">${r.PREV_RANK}</td>
            <td><b style="color:var(--c-sky); font-family:'JetBrains Mono'; font-size:11px;">#${r.CURRENT_RANK}</b></td>
            <td><span style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.35); padding:2px 7px; border-radius:4px; font-family:'JetBrains Mono'; font-weight:900;">+${jumpNum}</span></td>
            <td><b style="color:var(--c-amber); font-family:'JetBrains Mono';">${r.RATING}</b></td>
            <td><span class="rank-badge">${ovRank}</span></td>
          </tr>
        `;
      }).join('');

      lucide.createIcons();
    }

    // =========================================================================
    // 🚀 4. EARLY TREND BREAKOUTS (COLORFUL & INTERACTIVE ENGINE)
    // =========================================================================

    let rawEarlyDataset = [];
    let filteredEarlyDataset = [];
    let activeEarlySignalChips = new Set();
    let earlySortCol = 'RS_VELOCITY';
    let earlySortAsc = false;

    async function loadEarlyTrendData() {
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loader-msg').innerText = 'Loading Early Trend Breakouts...';

      if (rawEarlyDataset.length > 0) {
        populateEarlyDropdowns();
        filterEarlyTrendTable();
        document.getElementById('loader').style.display = 'none';
        return;
      }

      let parsed = [];

      // Method 1: Fetch via WebApp API (Bypasses Emoji Encoding Issues)
      try {
        const res = await MKC.fetch('screener', { action: 'getEarlyTrend' });
        const json = await res.json();
        if (json && json.success && json.data && json.data.length > 0) {
          parsed = json.data.map(r => {
            const num = (v) => typeof v === 'number' ? v : (parseFloat(String(v || 0).replace(/[%,\s+]/g, '')) || 0);
            const pct = (v) => {
              if (v === undefined || v === null || v === '') return 0;
              const n = typeof v === 'number' ? v : (parseFloat(String(v).replace(/[%,\s+]/g, '')) || 0);
              return (Math.abs(n) <= 1 && n !== 0) ? n * 100 : n;
            };

            const sym = (r['SYMBOL'] || r['Symbol'] || '').trim().toUpperCase();
            if (!sym || sym === 'SYMBOL' || sym.includes('EARLY')) return null;

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
        }
      } catch (e) {
        console.warn("WebApp API fallback to GViz", e);
      }

      // Method 2: Fallback to GViz Multi-Sheet Try
      if (!parsed || parsed.length === 0) {
        const sheetNamesToTry = ['🚀 Early Trend & RS Turnarounds', 'Early Trend & RS Turnarounds'];
        
        for (let sName of sheetNamesToTry) {
          try {
            const gvizRes = await MKC.gviz(sName);
            const text = await gvizRes.text();
            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const gviz = JSON.parse(jsonString);

            if (gviz && gviz.table && gviz.table.rows && gviz.table.rows.length > 0) {
              const rows = gviz.table.rows;
              
              for (let i = 0; i < rows.length; i++) {
                const c = rows[i].c;
                if (!c || !c[0]) continue;
                const sym = c[0] ? String(c[0].f || c[0].v || '').trim().toUpperCase() : '';
                const name = c[1] ? String(c[1].f || c[1].v || '').trim() : sym;
                
                // Skip headers and empty rows
                if (!sym || sym.length > 20 || sym === 'SYMBOL' || sym.includes('EARLY') || sym.includes('NOTE') || sym.includes('DETECT')) continue;

                const getNum = (idx) => {
                  if (!c[idx] || c[idx].v === null) return 0;
                  const v = c[idx].v;
                  return typeof v === 'number' ? v : (parseFloat(String(v).replace(/[%,\s+]/g, '')) || 0);
                };

                const getPct = (idx) => {
                  if (!c[idx] || c[idx].v === null) return 0;
                  const v = c[idx].v;
                  if (typeof v === 'number') return (Math.abs(v) <= 1 && v !== 0) ? v * 100 : v;
                  return parseFloat(String(v).replace(/[%,\s+]/g, '')) || 0;
                };

                parsed.push({
                  'SYMBOL': sym,
                  'COMPANY_NAME': name,
                  'SECTOR': c[2] && c[2].v ? String(c[2].v).trim() : '-',
                  'EARLY_SIGNAL': c[3] && c[3].v ? String(c[3].v).trim() : 'Fresh Uptrend',
                  'NEAR_TERM_RANK': getNum(4) || 999,
                  'DEFAULT_RANK': getNum(5) || 999,
                  'RS_VELOCITY': getNum(6) || 0,
                  'AWAY_200_EMA': getPct(7),
                  'OFF_52W_HIGH': getPct(8),
                  'RSI': getNum(9) || 50,
                  'STAGE': c[10] && c[10].v ? String(c[10].v).trim() : 'Stage Unclear'
                });
              }

              if (parsed.length > 0) break;
            }
          } catch (err) {}
        }
      }

      if (parsed && parsed.length > 0) {
        rawEarlyDataset = parsed;
        populateEarlyDropdowns();
        filterEarlyTrendTable();
      } else {
        document.getElementById('early-tbody').innerHTML = `<tr><td colspan="10" style="padding:24px; color:var(--c-red);">Unable to load Early Trend data. Please verify Google Sheet permissions.</td></tr>`;
      }

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
      if (earlySortCol === col) {
        earlySortAsc = !earlySortAsc;
      } else {
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
        tbody.innerHTML = `<tr><td colspan="10" style="padding:24px; color:var(--c-slate);">No breakout candidates match the filter.</td></tr>`;
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
        return `<span class="stage-pill" style="background:var(--btn-bg); color:var(--c-slate);">${stg}</span>`;
      };

      const getPctColor = (num) => {
        const sign = num > 0 ? '+' : '';
        const cls = num > 0 ? 'val-pos' : (num < 0 ? 'val-neg' : '');
        return `<span class="${cls}">${sign}${num.toFixed(1)}%</span>`;
      };

      tbody.innerHTML = filteredEarlyDataset.map(r => {
        const sym = r['SYMBOL'];
        const name = r['COMPANY_NAME'];
        const sec = toTitleCase(r['SECTOR']);

        return `
          <tr>
            <td class="sticky-col">
  ${renderStockWith3Links(sym, name)}
</td>
            <td class="sticky-sec">
              <span class="sec-txt">${sec}</span>
            </td>
            <td>${getSignalBadge(r['EARLY_SIGNAL'])}</td>
            <td><b>#${r['NEAR_TERM_RANK']}</b></td>
            <td>${r['DEFAULT_RANK']}</td>
            <td><span class="velocity-badge">+${r['RS_VELOCITY']}</span></td>
            <td>${getPctColor(r['AWAY_200_EMA'])}</td>
            <td>${getPctColor(r['OFF_52W_HIGH'])}</td>
            <td><b style="font-family:'JetBrains Mono'; color:var(--c-sky);">${r['RSI'].toFixed(1)}</b></td>
            <td>${getStageBadge(r['STAGE'])}</td>
          </tr>
        `;
      }).join('');

      lucide.createIcons();
    }

    function copyEarlySymbols() {
      if (filteredEarlyDataset.length === 0) return;
      const symbols = filteredEarlyDataset.map(r => r['SYMBOL']).filter(Boolean).join(', ');
      navigator.clipboard.writeText(symbols).then(() => {
        alert(`Copied ${filteredEarlyDataset.length} Symbols to clipboard!`);
      });
    }

    function exportEarlyCSV() {
      if (filteredEarlyDataset.length === 0) return;
      const cols = ['SYMBOL', 'COMPANY_NAME', 'SECTOR', 'EARLY_SIGNAL', 'NEAR_TERM_RANK', 'DEFAULT_RANK', 'RS_VELOCITY', 'AWAY_200_EMA', 'OFF_52W_HIGH', 'RSI', 'STAGE'];
      let csv = cols.map(h => `"${h}"`).join(',') + '\n';

      filteredEarlyDataset.forEach(r => {
        const rowVals = cols.map(h => `"${r[h] !== undefined ? r[h] : ''}"`);
        csv += rowVals.join(',') + '\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `Early_Trend_Breakouts_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

   // =========================================================================
    // 📁 5. RS HISTORY LOG & TRAJECTORY CHART ENGINE (FIXED & FAILSAFE)
    // =========================================================================

    let rawHistoryLogData = null;
    let rsTrajectoryChart = null;
    let historyMaxDays = 365;

    const CHART_PALETTE = [
      '#00f0ff', '#10b981', '#fbbf24', '#c084fc', '#f43f5e',
      '#38bdf8', '#fb923c', '#a855f7', '#4ade80', '#facc15',
      '#60a5fa', '#f472b6', '#2dd4bf', '#fb7185', '#818cf8'
    ];

    async function loadHistoryLogData() {
      document.getElementById('loader').style.display = 'flex';
      document.getElementById('loader-msg').innerText = 'Loading 1-Year Historical Rolling RS Logs...';

      if (rawHistoryLogData) {
        renderHistoryChartAndTable();
        document.getElementById('loader').style.display = 'none';
        return;
      }

      // Method 1: Fetch via GViz (Fastest)
      try {
        const gvizRes = await MKC.gviz('_RS_History_Log_');
        const text = await gvizRes.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const gviz = JSON.parse(jsonString);

        if (gviz && gviz.table) {
          let headers = [];
          let rowData = [];

          // Smart Header Detection: Check if headers are in cols or in rows[0]
          const colLabels = (gviz.table.cols || []).map(c => (c && (c.label || c.id)) ? String(c.label || c.id).trim() : '');
          const hasColHeaders = colLabels.some(l => l.includes('|'));

          if (hasColHeaders) {
            headers = colLabels;
            rowData = (gviz.table.rows || []).map(r => (r && r.c) ? r.c.map(cell => cell ? String(cell.v || cell.f || '').trim().toUpperCase() : '') : []);
          } else if (gviz.table.rows && gviz.table.rows.length > 0) {
            const firstRowCells = gviz.table.rows[0].c || [];
            headers = firstRowCells.map(cell => cell ? String(cell.v || cell.f || '').trim() : '');
            rowData = gviz.table.rows.slice(1).map(r => (r && r.c) ? r.c.map(cell => cell ? String(cell.v || cell.f || '').trim().toUpperCase() : '') : []);
          }

          if (headers.length > 0 && headers.some(h => h.includes('|'))) {
            rawHistoryLogData = { headers: headers, rows: rowData };
            renderHistoryChartAndTable();
            document.getElementById('loader').style.display = 'none';
            return;
          }
        }
      } catch (err) {
        console.warn("GViz history fallback to WebApp API", err);
      }

      // Method 2: Fallback via WebApp API
      try {
        const res = await MKC.fetch('screener', { action: 'getSheetData', sheetName: '_RS_History_Log_' });
        const json = await res.json();
        if (json && json.success && json.data && json.data.length > 0) {
          const headers = json.headers || Object.keys(json.data[0]);
          const rowData = [];
          for (let r = 0; r < json.data.length; r++) {
            const rowArr = headers.map(h => String(json.data[r][h] || '').trim().toUpperCase());
            rowData.push(rowArr);
          }
          rawHistoryLogData = { headers: headers, rows: rowData };
          renderHistoryChartAndTable();
        }
      } catch (err) {
        console.error("History Log All Fetch Failed:", err);
      } finally {
        document.getElementById('loader').style.display = 'none';
        lucide.createIcons();
      }
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

      // 1. Find matching columns for selected RS model with fuzzy matching
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

        if (isMatch) {
          modelCols.push({ dateStr: dateStr, dateObj: parseCustomHistoryDate(dateStr), colIdx: colIdx });
        }
      });

      if (modelCols.length === 0) {
        document.getElementById('historySnapshotCount').innerText = "No snapshots found for this model.";
        return;
      }

      // 2. Sort columns chronologically (Oldest -> Newest for Chart)
      modelCols.sort((a, b) => {
        if (a.dateObj && b.dateObj) return a.dateObj - b.dateObj;
        return a.colIdx - b.colIdx;
      });

      // 3. Filter by Timeframe days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - historyMaxDays);
      const filteredCols = modelCols.filter(c => !c.dateObj || c.dateObj >= cutoffDate);
      const activeCols = filteredCols.length > 0 ? filteredCols : modelCols;

      // 4. Identify Top N stocks from latest snapshot
      const latestCol = activeCols[activeCols.length - 1];
      const topStocks = [];
      for (let r = 0; r < rawHistoryLogData.rows.length; r++) {
        const sym = rawHistoryLogData.rows[r][latestCol.colIdx];
        if (sym && sym !== '' && sym !== 'SYMBOL' && !topStocks.includes(sym)) {
          topStocks.push(sym);
          if (topStocks.length >= topCount) break;
        }
      }

      // 5. Build Trajectory Datasets for Chart
      const dateLabels = activeCols.map(c => c.dateStr);
      const datasets = topStocks.map((sym, idx) => {
        const color = CHART_PALETTE[idx % CHART_PALETTE.length];
        const rankPoints = activeCols.map(col => {
          for (let r = 0; r < rawHistoryLogData.rows.length; r++) {
            if (rawHistoryLogData.rows[r][col.colIdx] === sym) {
              return r + 1; // Rank 1-indexed
            }
          }
          return null; // Out of rank list
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

      // 6. Render Dynamic Legend Chips
      const legendBar = document.getElementById('historyChartLegend');
      legendBar.innerHTML = topStocks.map((sym, idx) => {
        const color = CHART_PALETTE[idx % CHART_PALETTE.length];
        return `<span class="legend-chip" style="background:${color}1a; color:${color}; border:1px solid ${color}4d;">● ${sym}</span>`;
      }).join('');

      // 7. Render Chart.js
      const canvas = document.getElementById('rsTrajectoryCanvas');
      const ctx = canvas.getContext('2d');
      if (rsTrajectoryChart) rsTrajectoryChart.destroy();

      rsTrajectoryChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dateLabels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: themeChart().tipBg,
              titleColor: themeChart().tipTitle,
              bodyColor: themeChart().tipBody,
              borderColor: themeChart().tipBorder,
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: (ctx) => `  ${ctx.dataset.label}: Rank #${ctx.parsed.y}`
              }
            }
          },
          scales: {
            y: {
              reverse: true, // Rank 1 is top
              min: 1,
              suggestedMax: Math.min(topCount + 10, 300),
              grid: { color: themeChart().gridY },
              ticks: {
                color: themeChart().tick,
                font: { family: 'JetBrains Mono', size: 10 },
                callback: (val) => `#${val}`
              }
            },
            x: {
              grid: { color: themeChart().gridX },
              ticks: {
                color: themeChart().tick,
                font: { size: 9 },
                maxRotation: 45,
                autoSkip: true,
                maxTicksLimit: 20
              }
            }
          }
        }
      });

      // 8. Render Date-Wise Matrix Table
      renderHistoryHeatmapTable(activeCols, topStocks);
    }

    function renderHistoryHeatmapTable(activeCols, topStocks) {
      const thead = document.getElementById('history-matrix-thead');
      const tbody = document.getElementById('history-matrix-tbody');
      document.getElementById('historySnapshotCount').innerText = `${activeCols.length} Snapshots Shown`;

      thead.innerHTML = `
        <tr>
          <th class="sticky-col" style="width:120px;">DATE</th>
          ${topStocks.map(s => `<th>${s}</th>`).join('')}
        </tr>
      `;

      // Newest Date at Top for Table
      const revCols = [...activeCols].reverse();

      tbody.innerHTML = revCols.map(col => {
        return `
          <tr>
            <td class="sticky-col" style="font-family:'JetBrains Mono'; font-weight:700; color:var(--c-sky);">${col.dateStr}</td>
            ${topStocks.map(sym => {
              let rank = '-';
              for (let r = 0; r < rawHistoryLogData.rows.length; r++) {
                if (rawHistoryLogData.rows[r][col.colIdx] === sym) {
                  rank = r + 1;
                  break;
                }
              }
              if (rank === '-') return `<td style="color:var(--c-slate3);">-</td>`;
              let badgeCls = 'rank-lower';
              if (rank <= 5) badgeCls = 'rank-top5';
              else if (rank <= 15) badgeCls = 'rank-top15';
              return `<td><span class="rank-cell-pill ${badgeCls}">${rank}</span></td>`;
            }).join('')}
          </tr>
        `;
      }).join('');
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

    // =========================================================================
    // ⚙️ 6. MASTER 100+ COLUMNS SCREENER ENGINE
    // =========================================================================
