// ============================================================
// MICKKK.com Charts — Professional Terminal Engine (CORE)
// ============================================================

const CHARTS_API_URL = 'https://script.google.com/macros/s/AKfycbx65jssEWWjfjj53X6x8twwZ83kGoEwVOVA6ms_OHS7u9FDRn56U2sYbfW1SvisibwI/exec';

// FALLBACK PRE-POPULATED POPULAR INDIAN STOCKS
const FALLBACK_SYMBOLS = [
  { symbol: "20MICRONS", name: "20 Microns Limited" },
  { symbol: "ABBOTINDIA", name: "Abbott India Limited" },
  { symbol: "DMART", name: "Avenue Supermarts Limited" },
  { symbol: "SPARC", name: "Sun Pharma Advanced Research Company Limited" },
  { symbol: "SANDHAR", name: "Sandhar Technologies Limited" },
  { symbol: "RELIANCE", name: "Reliance Industries Limited" },
  { symbol: "TCS", name: "Tata Consultancy Services Limited" },
  { symbol: "INFY", name: "Infosys Limited" },
  { symbol: "HDFCBANK", name: "HDFC Bank Limited" },
  { symbol: "ICICIBANK", name: "ICICI Bank Limited" }
];

let allSymbols = [...FALLBACK_SYMBOLS];

// PRICE BANDS & SURVEILLANCE MAP
let priceBandsMap = {};

// CHART GRID & PANELS ARRAY
let gridFormat = '1x1'; 
let panelsArray = [];
let searchTargetPanelIndex = -1;

let currentInterval = 'D';
let currentChartType = 'candle'; 
let currentScaleMode = 'log'; 
let currentTheme = 'dark';

let volVisible = true;
let currentRange = '1Y';
let currentSymbol = '20MICRONS', currentName = '20 Microns Limited';
let isLiveActive = false;
let livePollTimer = null;
const LIVE_POLL_MS = 45000;

let symbolCandleCache = {};
let symbolCandlePromiseCache = {};
let aggregateCache = new WeakMap();

/* ============ FETCH PRICE BANDS & GSM SURVEILLANCE FROM GOOGLE SHEET ============ */
async function fetchPriceBandsData() {
  try {
    const res = await fetch(`${CHARTS_API_URL}?action=getPriceBands`);
    const data = await res.json();
    if (data.priceBands && Array.isArray(data.priceBands)) {
      priceBandsMap = {};
      data.priceBands.forEach(b => {
        if (b.symbol) priceBandsMap[b.symbol.toUpperCase()] = b;
      });
      if (panelsArray[0] && panelsArray[0].rawDailyCandles) {
        renderCombinedInfoCard(aggregate(panelsArray[0].rawDailyCandles, 'D'));
      }
    }
  } catch(e) {
    console.warn("Price bands fetch error:", e);
  }
}

/* ============ DATE FORMATTER UTILITY ============ */
function formatToDateOnly(dateStr) {
  if (!dateStr) return '';
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatXAxisDate(time) {
  let year, month, day;

  if (time && typeof time === 'object' && !Array.isArray(time)) {
    if (Number.isFinite(Number(time.year)) && Number.isFinite(Number(time.month)) && Number.isFinite(Number(time.day))) {
      year = Number(time.year);
      month = Number(time.month);
      day = Number(time.day);
    }
  } else if (typeof time === 'string') {
    const m = time.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      year = Number(m[1]);
      month = Number(m[2]);
      day = Number(m[3]);
    }
  } else if (typeof time === 'number') {
    const d = new Date(time * 1000);
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  }

  if (!year || !month || !day) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(day).padStart(2,'0')} ${months[month - 1]} '${String(year).slice(-2)}`;
}

function positionPocketPivotStatsWidget(panel) {
  const widget = document.getElementById('ppv-stats-widget');
  const wrap = document.querySelector('.chart-wrap');
  const pane = panel && document.getElementById(`pane-price-${panel.index}`);
  if (!widget || !wrap || !pane || widget.style.display === 'none') return;
  const wrapRect = wrap.getBoundingClientRect();
  const paneRect = pane.getBoundingClientRect();
  const volumeStart = paneRect.top + paneRect.height * 0.70;
  const widgetHeight = widget.offsetHeight || 22;
  const top = Math.max(4, volumeStart - wrapRect.top - widgetHeight + 2);
  widget.style.top = `${Math.round(top)}px`;
}

/* ============ MULTI-GRID SWITCHER ============ */
function changeGridFormat(fmt) {
  gridFormat = fmt;
  const container = document.getElementById('chart-grid-container');
  if (container) container.className = `chart-grid grid-${fmt}`;
  rebuildGridSystem();
}

function getPanelCountForFormat(fmt) {
  if (fmt === '1x1') return 1;
  if (fmt === '1x2') return 2;
  if (fmt === '2x2') return 4;
  if (fmt === '3x2') return 6;
  if (fmt === '4x2') return 8;
  return 1;
}

function rebuildGridSystem() {
  destroyPanels();
  const container = document.getElementById('chart-grid-container');
  if (!container) return;
  container.innerHTML = '';

  const count = getPanelCountForFormat(gridFormat);
  const tfDefaults = ['D', 'W', 'M', 'D', 'W', 'M', 'D', 'W'];

  for (let i = 0; i < count; i++) {
    const panelElem = document.createElement('div');
    panelElem.className = 'chart-panel';
    panelElem.id = `panel-elem-${i}`;

    const initialTf = count === 1 ? currentInterval : tfDefaults[i];

    const topBar = document.createElement('div');
    topBar.className = 'panel-top-bar';
    topBar.innerHTML = `
      <button class="panel-stock-btn" onclick="openSearchModal(${i})">
        🔍 <span id="panel-sym-label-${i}">${currentSymbol || 'Select Stock'}</span> ▼
      </button>
      <div class="panel-tf-group">
        <button class="panel-tf-btn ${initialTf==='D'?'active':''}" onclick="setPanelInterval(${i}, 'D', this)">D</button>
        <button class="panel-tf-btn ${initialTf==='W'?'active':''}" onclick="setPanelInterval(${i}, 'W', this)">W</button>
        <button class="panel-tf-btn ${initialTf==='M'?'active':''}" onclick="setPanelInterval(${i}, 'M', this)">M</button>
      </div>
    `;

    const chartContainer = document.createElement('div');
    chartContainer.className = 'panel-chart-container';
    chartContainer.id = `panel-chart-${i}`;

    chartContainer.innerHTML = `
      <div class="pane-box pane-price" id="pane-price-${i}">
        <canvas class="panel-overlay-canvas" id="panel-canvas-${i}"></canvas>
      </div>
      <div class="pane-splitter" id="splitter-1-${i}"></div>
      <div class="pane-box pane-rsi" id="pane-rsi-${i}"></div>
      <div class="pane-splitter" id="splitter-2-${i}"></div>
      <div class="pane-box pane-rs" id="pane-rs-${i}"></div>
    `;

    panelElem.appendChild(topBar);
    panelElem.appendChild(chartContainer);
    container.appendChild(panelElem);

    const inst = createPanelChartInstance(i, initialTf);
    panelsArray.push(inst);

    initPaneSplitterDrag(i);
  }

  if (currentSymbol) {
    rebuildAllPanels();
  }
}

function destroyPanels() {
  panelsArray.forEach(p => {
    if (p.priceChart) { try { p.priceChart.remove(); } catch(e){} }
    if (p.rsiChart) { try { p.rsiChart.remove(); } catch(e){} }
    if (p.rsChart) { try { p.rsChart.remove(); } catch(e){} }
  });
  panelsArray = [];
}

function updateTimeScaleVisibility(panel) {
  const showRsi = rsiConfig.enabled;
  const showRs = rsConfig.enabled;
  const paneRsi = document.getElementById(`pane-rsi-${panel.index}`);
  const splitter1 = document.getElementById(`splitter-1-${panel.index}`);
  const paneRs = document.getElementById(`pane-rs-${panel.index}`);
  const splitter2 = document.getElementById(`splitter-2-${panel.index}`);
  const isDark = currentTheme === 'dark';

  if (paneRsi) paneRsi.style.display = showRsi ? 'block' : 'none';
  if (splitter1) splitter1.style.display = showRsi ? 'block' : 'none';
  if (paneRs) paneRs.style.display = showRs ? 'block' : 'none';
  if (splitter2) splitter2.style.display = showRs && showRsi ? 'block' : 'none';

  const bottomChart = showRs ? panel.rsChart : (showRsi ? panel.rsiChart : panel.priceChart);
  const common = {
    timeVisible: false,
    secondsVisible: false,
    uniformDistribution: true,
    rightOffset: 0,
    tickMarkFormatter: (time) => formatXAxisDate(time),
    borderColor: isDark ? '#1e2d3d' : '#e0e3eb'
  };
  [panel.priceChart, panel.rsiChart, panel.rsChart].forEach(c => {
    try { c.timeScale().applyOptions({ ...common, visible: false, ticksVisible: false }); } catch(e) {}
  });
  try { bottomChart.timeScale().applyOptions({ ...common, visible: true, ticksVisible: true }); } catch(e) {}
}

function createPanelChartInstance(index, tf) {
  const isDark = currentTheme === 'dark';
  let scaleMode = LightweightCharts.PriceScaleMode.Normal;
  if (currentScaleMode === 'log') scaleMode = LightweightCharts.PriceScaleMode.Logarithmic;
  else if (currentScaleMode === 'pct') scaleMode = LightweightCharts.PriceScaleMode.Percentage;

  const baseChartOpts = {
    layout: { background: { color: 'transparent' }, textColor: isDark ? '#8a9ab0' : '#707a8a', fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
    grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    rightPriceScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      minimumWidth: 68
    },
    timeScale: {
      visible: true,
      timeVisible: false,
      secondsVisible: false,
      ticksVisible: true,
      uniformDistribution: true,
      rightOffset: 0,
      tickMarkFormatter: (time) => formatXAxisDate(time),
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb'
    },
    localization: { dateFormat: 'dd MMM yy' },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    autoSize: true,
  };

  const priceContainer = document.getElementById(`pane-price-${index}`);
  const priceC = LightweightCharts.createChart(priceContainer, {
    ...baseChartOpts,
    rightPriceScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      mode: scaleMode,
      minimumWidth: 68
    }
  });

  const volS = priceC.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
  });
  priceC.priceScale('vol').applyOptions({ scaleMargins: { top: 0.72, bottom: 0.02 }, autoScale: true });

  const rsiContainer = document.getElementById(`pane-rsi-${index}`);
  const rsiC = LightweightCharts.createChart(rsiContainer, {
    ...baseChartOpts,
    timeScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      timeVisible: false,
      secondsVisible: false,
      ticksVisible: true,
      visible: true,
      rightOffset: 0,
      barSpacing: 6,
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true,
      uniformDistribution: true,
      tickMarkFormatter: (time) => formatXAxisDate(time)
    },
    localization: { dateFormat: 'dd MMM yy' }
  });

  const rsContainer = document.getElementById(`pane-rs-${index}`);
  const rsC = LightweightCharts.createChart(rsContainer, {
    ...baseChartOpts,
    rightPriceScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      minimumWidth: 68
    },
    timeScale: {
      borderColor: isDark ? '#1e2d3d' : '#e0e3eb',
      timeVisible: false,
      secondsVisible: false,
      ticksVisible: true,
      visible: true,
      rightOffset: 0,
      barSpacing: 6,
      fixLeftEdge: false,
      lockVisibleTimeRangeOnResize: true,
      uniformDistribution: true,
      tickMarkFormatter: (time) => formatXAxisDate(time)
    },
    localization: { dateFormat: 'dd MMM yy' }
  });

  const canvas = document.getElementById(`panel-canvas-${index}`);

  const instObj = {
    index: index,
    priceChart: priceC,
    rsiChart: rsiC,
    rsChart: rsC,
    chart: priceC,
    candleSeries: null,
    seriesType: null,
    volumeSeries: volS,
    interval: tf,
    symbol: currentSymbol,
    symbolName: currentName,
    rawDailyCandles: [],
    overlayCanvas: canvas,
    emaSeriesList: [],
    volMASeries: null,
    rsiSeries: null, rsiMASeries: null, rsiThresholdLines: [],
    rsSeries: null, rsMASeries: null, rsValueByTime: []
  };

  ensureSeriesType(instObj);

  const getNearestCandle = (candles, targetTime) => {
    if (!candles || !candles.length || targetTime == null) return null;
    let lo = 0, hi = candles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Number(candles[mid].time) < Number(targetTime)) lo = mid + 1;
      else hi = mid;
    }
    const a = candles[lo];
    const b = candles[Math.max(0, lo - 1)];
    return Math.abs(Number(a.time) - Number(targetTime)) <
      Math.abs(Number(b.time) - Number(targetTime)) ? a : b;
  };

  const getNearestRSIValue = (inst, targetTime) => {
    const values = inst.rsiValueByTime;
    if (!values || !values.length || targetTime == null) return 50;
    const c = getNearestCandle(values, targetTime);
    return c && typeof c.value === 'number' ? c.value : 50;
  };

  let isSyncingCrosshair = false;

  const clearSyncedCrosshair = () => {
    try { priceC.clearCrosshairPosition(); } catch(e) {}
    try { rsiC.clearCrosshairPosition(); } catch(e) {}
    try { rsC.clearCrosshairPosition(); } catch(e) {}
  };

  const syncCrosshairAtX = (sourceChart, targetChart, param, targetSeries, targetValueFn) => {
    if (isSyncingCrosshair || !param || !param.point || !targetSeries) return;
    if (param.point.x == null || param.point.y == null) return;
    try {
      isSyncingCrosshair = true;
      const x = param.point.x;
      const targetTime = targetChart.timeScale().coordinateToTime(x);
      if (targetTime == null) return;
      const targetValue = targetValueFn(targetTime);
      if (typeof targetValue !== 'number' || !isFinite(targetValue)) return;
      targetChart.setCrosshairPosition(targetValue, targetTime, targetSeries);
    } catch(e) {
    } finally {
      isSyncingCrosshair = false;
    }
  };

  const getNearestRSValue = (targetTime) => {
    const values = instObj.rsValueByTime || [];
    if (!values.length || targetTime == null) return null;
    const c = getNearestCandle(values, targetTime);
    return c && typeof c.value === 'number' ? c.value : null;
  };

  const getPriceAt = targetTime => {
    const candleData = aggregate(instObj.rawDailyCandles, instObj.interval) || [];
    const candle = getNearestCandle(candleData, targetTime);
    return candle && typeof candle.close === 'number' ? candle.close : null;
  };

  priceC.subscribeCrosshairMove(param => {
    onCrosshairMove(param, instObj.candleSeries, volS);
    if (!param || !param.sourceEvent) return; // Prevent loop

    if (!param.point || !instObj.candleSeries || !param.time) {
      clearSyncedCrosshair(); return;
    }
    const candle = param.seriesData && param.seriesData.get(instObj.candleSeries);
    const priceValue = candle ? (typeof candle.close === 'number' ? candle.close : candle.value) : null;
    if (typeof priceValue === 'number') {
      try { priceC.setCrosshairPosition(priceValue, param.time, instObj.candleSeries); } catch(e){}
    }
    syncCrosshairAtX(priceC, rsiC, param, instObj.rsiSeries, targetTime => getNearestRSIValue(instObj, targetTime));
    syncCrosshairAtX(priceC, rsC, param, instObj.rsSeries, targetTime => getNearestRSValue(targetTime));
  });

  rsiC.subscribeCrosshairMove(param => {
    if (!param || !param.sourceEvent) return; // Prevent loop

    if (!param.point || !instObj.candleSeries || !param.time) {
      clearSyncedCrosshair(); return;
    }
    const rsiBar = instObj.rsiSeries && param.seriesData && param.seriesData.get(instObj.rsiSeries);
    const rsiValue = rsiBar && typeof rsiBar.value === 'number' ? rsiBar.value : getNearestRSIValue(instObj, param.time);
    if (typeof rsiValue === 'number') {
      try { rsiC.setCrosshairPosition(rsiValue, param.time, instObj.rsiSeries); } catch(e){}
    }
    syncCrosshairAtX(rsiC, priceC, param, instObj.candleSeries, getPriceAt);
    syncCrosshairAtX(rsiC, rsC, param, instObj.rsSeries, targetTime => getNearestRSValue(targetTime));
  });

  rsC.subscribeCrosshairMove(param => {
    if (!param || !param.sourceEvent) return; // Prevent loop

    if (!param.point || !param.time) {
      clearSyncedCrosshair(); return;
    }
    const rsBar = instObj.rsSeries && param.seriesData && param.seriesData.get(instObj.rsSeries);
    const rsValue = rsBar && typeof rsBar.value === 'number' ? rsBar.value : getNearestRSValue(param.time);
    if (typeof rsValue === 'number') {
      try { rsC.setCrosshairPosition(rsValue, param.time, instObj.rsSeries); } catch(e){}
    }
    syncCrosshairAtX(rsC, priceC, param, instObj.candleSeries, getPriceAt);
    syncCrosshairAtX(rsC, rsiC, param, instObj.rsiSeries, targetTime => getNearestRSIValue(instObj, targetTime));
  });

  let isSyncing = false;
  const syncPanes = (source) => {
    source.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (isSyncing || !range) return;
      isSyncing = true;
      [priceC, rsiC, rsC].forEach(c => {
        if (c !== source) { try { c.timeScale().setVisibleLogicalRange(range); } catch(e){} }
      });
      isSyncing = false;
      requestAnimationFrame(() => drawPanelOverlays(instObj));
    });
  };

  syncPanes(priceC); syncPanes(rsiC); syncPanes(rsC);
  updateTimeScaleVisibility(instObj);

  return instObj;
}

function initPaneSplitterDrag(index) {
  const container = document.getElementById(`panel-chart-${index}`);
  const panePrice = document.getElementById(`pane-price-${index}`);
  const splitter1 = document.getElementById(`splitter-1-${index}`);
  const splitter2 = document.getElementById(`splitter-2-${index}`);
  const paneRsi = document.getElementById(`pane-rsi-${index}`);

  if (!container || !panePrice || !splitter1) return;

  let dragMode = null;

  splitter1.addEventListener('mousedown', () => { dragMode = 'price'; splitter1.classList.add('dragging'); });
  if (splitter2) splitter2.addEventListener('mousedown', () => { dragMode = 'rsi'; splitter2.classList.add('dragging'); });

  window.addEventListener('mouseup', () => {
    dragMode = null;
    splitter1.classList.remove('dragging');
    if (splitter2) splitter2.classList.remove('dragging');
  });

  window.addEventListener('mousemove', e => {
    if (!dragMode) return;
    const rect = container.getBoundingClientRect();
    const inst = panelsArray[index];
    if (!inst) return;

    if (dragMode === 'price') {
      const offsetY = e.clientY - rect.top;
      const priceH = Math.max(120, offsetY);
      panePrice.style.flex = `0 0 ${priceH}px`;
    } else if (dragMode === 'rsi' && paneRsi) {
      const rsiTop = paneRsi.getBoundingClientRect().top - rect.top;
      const rsBottom = rect.height;
      const rsiH = Math.max(70, Math.min(220, e.clientY - paneRsi.getBoundingClientRect().top));
      paneRsi.style.flex = `0 0 ${rsiH}px`;
    }

    [inst.priceChart, inst.rsiChart, inst.rsChart].forEach(c => {
      try { c.applyOptions({ width: container.clientWidth }); } catch(err){}
    });
    drawPanelOverlays(inst);
    requestAnimationFrame(() => positionPocketPivotStatsWidget(inst));
  });
}

function setPanelInterval(idx, tf, btn) {
  const panel = panelsArray[idx];
  if (!panel) return;
  panel.interval = tf;
  const parent = btn.parentElement;
  parent.querySelectorAll('.panel-tf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  rebuildPanelChart(panel);
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  const btn = document.getElementById('theme-btn');
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme'); if (btn) btn.innerText = '🌙 Dark';
  } else {
    document.body.classList.remove('light-theme'); if (btn) btn.innerText = '☀️ Light';
  }

  const isDark = currentTheme === 'dark';
  panelsArray.forEach(p => {
    [p.priceChart, p.rsiChart, p.rsChart].forEach(c => {
      if (c) {
        c.applyOptions({
          layout: { textColor: isDark ? '#8a9ab0' : '#707a8a' },
          rightPriceScale: { borderColor: isDark ? '#1e2d3d' : '#e0e3eb' },
          timeScale: { borderColor: isDark ? '#1e2d3d' : '#e0e3eb' }
        });
      }
    });
  });

  if (currentSymbol) rebuildAllPanels();
}

function navigateStockKeyboard(direction) {
  if (!allSymbols || !allSymbols.length) return;
  let currentIdx = allSymbols.findIndex(s => s.symbol === currentSymbol);
  if (currentIdx === -1) currentIdx = 0;

  let newIdx = currentIdx + direction;
  if (newIdx < 0) newIdx = allSymbols.length - 1;
  if (newIdx >= allSymbols.length) newIdx = 0;

  const target = allSymbols[newIdx];
  if (target) {
    loadSymbol(target.symbol, target.name, -1);
  }
}

function initSystem(){
  rebuildGridSystem();
  fetchPriceBandsData(); 

  const container = document.getElementById('chart-grid-container');
  if (container) {
    container.addEventListener('mousedown', handleChartMouseDown);
    container.addEventListener('mousemove', handleChartMouseMove);
  }

  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('resize', () => {
    if (panelsArray[0]) requestAnimationFrame(() => positionPocketPivotStatsWidget(panelsArray[0]));
  });

  window.addEventListener('resize', () => {
    panelsArray.forEach(p => {
      const elem = document.getElementById(`panel-chart-${p.index}`);
      if (elem) {
        [p.priceChart, p.rsiChart, p.rsChart].forEach(c => {
          if (c) c.applyOptions({ width: elem.clientWidth });
        });
        drawPanelOverlays(p);
      }
    });
  });
}

function handleGlobalKeyDown(e) {
  const activeTag = document.activeElement ? document.activeElement.tagName.toUpperCase() : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
    if (document.activeElement.id === 'modal-search-input') handleModalKeyboardNav(e);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault(); navigateStockKeyboard(-1); return;
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); navigateStockKeyboard(1); return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault(); openSearchModal(-1); return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  if (e.key && e.key.length === 1 && !e.repeat && /^[a-zA-Z0-9]$/.test(e.key)) {
    e.preventDefault();
    openSearchModal(-1);
    const input = document.getElementById('modal-search-input');
    if (input) { input.value = e.key; filterSearchModal(); }
  }
}

function handleModalKeyboardNav(e) {
  const modal = document.getElementById('search-modal');
  if (!modal || !modal.classList.contains('open')) return;
  const results = document.querySelectorAll('#modal-search-results .search-row-item');
  if (!results.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault(); modalHighlightIdx = Math.min(modalHighlightIdx + 1, results.length - 1);
    updateModalHighlight(results);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); modalHighlightIdx = Math.max(modalHighlightIdx - 1, 0);
    updateModalHighlight(results);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (modalHighlightIdx >= 0 && modalHighlightIdx < results.length) results[modalHighlightIdx].click();
    else if (results.length > 0) results[0].click();
  } else if (e.key === 'Escape') {
    e.preventDefault(); closeSearchModal();
  }
}

function updateModalHighlight(results) {
  results.forEach((el, i) => {
    if (i === modalHighlightIdx) { el.classList.add('highlighted'); el.scrollIntoView({ block: 'nearest' }); }
    else el.classList.remove('highlighted');
  });
}

/* ============ FAST FETCH WITH CLEAN DATE PARSING & PERSISTENT CACHING ============ */
async function fetchSymbolCandles(symbol) {
  if (symbolCandleCache[symbol]) return symbolCandleCache[symbol];

  // Try to load from persistent localStorage for instant 0ms chart load
  try {
    const cached = localStorage.getItem(`MICKKK_CANDLES_DATA_${symbol}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      symbolCandleCache[symbol] = parsed;
      // Fetch fresh data in the background silently
      refreshCacheInBackground(symbol);
      return parsed;
    }
  } catch(e){}

  return await fetchAndCacheSymbolCandles(symbol);
}

async function fetchAndCacheSymbolCandles(symbol) {
  if (symbolCandlePromiseCache[symbol]) return symbolCandlePromiseCache[symbol];

  symbolCandlePromiseCache[symbol] = (async () => {
    const url = `${CHARTS_API_URL}?action=getOHLC&symbol=${encodeURIComponent(symbol)}&_ts=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Data API HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!Array.isArray(data.candles)) throw new Error('Data API returned no candle array');

    const candles = (data.candles || [])
      .filter(c => c && c.time && !isNaN(Number(c.close)) && Number(c.close) > 0)
      .map(c => ({
        time: formatToDateOnly(c.time),
        open: Number(c.open || c.close),
        high: Number(c.high || c.close),
        low: Number(c.low || c.close),
        close: Number(c.close),
        volume: Number(c.volume || 0)
      }))
      .sort((a,b)=> a.time < b.time ? -1 : 1);

    symbolCandleCache[symbol] = candles;
    try {
      localStorage.setItem(`MICKKK_CANDLES_DATA_${symbol}`, JSON.stringify(candles));
    } catch(e){
      // Fail-Safe Cleanup Safeguard
      for (let key in localStorage) {
        if (key.startsWith('MICKKK_CANDLES_DATA_')) {
          localStorage.removeItem(key);
        }
      }
      try { localStorage.setItem(`MICKKK_CANDLES_DATA_${symbol}`, JSON.stringify(candles)); } catch(err){}
    }
    return candles;
  })();

  try { return await symbolCandlePromiseCache[symbol]; } finally { delete symbolCandlePromiseCache[symbol]; }
}

async function refreshCacheInBackground(symbol) {
  try {
    const candles = await fetchAndCacheSymbolCandles(symbol);
    panelsArray.forEach(panel => {
      if (panel.symbol === symbol) {
        const data = aggregate(candles, panel.interval);
        if (currentChartType === 'line') {
          panel.candleSeries.setData(data.map(d => ({ time: d.time, value: d.close })));
        } else {
          panel.candleSeries.setData(processCandleColoringAndIB(data, panel, panel.interval));
        }
        if (volVisible) renderPocketPivotVolume(data, panel);
        renderEditableEMAs(data, panel);
        renderRSIPane(data, panel);
        renderRelativeStrengthPane(panel, data);
        drawPanelOverlays(panel);
      }
    });
  } catch(e) {
    console.warn("Background refresh failed for", symbol, e);
  }
}

/* ============ FETCH EARNINGS RESULT FROM GOOGLE SHEET ============ */
async function fetchEarningsData(symbol) {
  try {
    const res = await fetch(`${CHARTS_API_URL}?action=getEarnings&symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    if (data && !data.error) {
      currentEarnings = {
        lastResult: data.lastResult || '-',
        upcomingResult: data.upcomingResult || '-'
      };
    } else {
      currentEarnings = { lastResult: '-', upcomingResult: '-' };
    }
  } catch(e) {
    currentEarnings = { lastResult: '-', upcomingResult: '-' };
  }
}

/* ============ INIT START ============ */
initSystem();
loadSymbolList();
```

#### File 2: `indicators.js` (Indicators & Calculations)
Contains indicators logic, EMAs, RSI, RS, MCP, Gap Detector, custom candle coloring wicks preservation, and the info card table renderer.

```javascript
// ============================================================
// MICKKK.com Charts — Professional Terminal Engine (INDICATORS)
// ============================================================

/* ============ HELPER CALCULATIONS ============ */
function calculateEMAValues(data, period) {
  if (!data || !data.length) return [];
  const k = 2 / (period + 1);
  let ema = Number(data[0].close);
  const res = [];
  for (let i = 0; i < data.length; i++) {
    ema = (Number(data[i].close) * k) + (ema * (1 - k));
    res.push(ema);
  }
  return res;
}

function computeSMA(arr, period) {
  const out = []; let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += Number(arr[i] || 0);
    if (i >= period) sum -= Number(arr[i - period] || 0);
    out.push(i >= period - 1 ? sum / period : Number(arr[i] || 0));
  }
  return out;
}

function calculateATRValues(data, period) {
  if (!data || !data.length) return [];
  const trs = [];
  for (let i = 0; i < data.length; i++) {
    const h = Number(data[i].high), l = Number(data[i].low);
    const pc = i > 0 ? Number(data[i - 1].close) : Number(data[i].open);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atr = []; let trSum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period) { trSum += trs[i]; atr.push(trSum / (i + 1)); }
    else { atr.push((atr[i - 1] * (period - 1) + trs[i]) / period); }
  }
  return atr;
}

/* ============ CANDLE COLORING & SIGNALS ============ */
function processCandleColoringAndIB(data, panel, tf) {
  const candles = [];
  const markers = [];

  const ema55Vals = calculateEMAValues(data, 55);
  const ema9Vals = calculateEMAValues(data, 9);
  const ema50Vals = calculateEMAValues(data, 50);
  const ema200Vals = calculateEMAValues(data, 200);
  const volMA30 = computeSMA(data.map(d => Number(d.volume || 0)), 30);
  const atrVals = calculateATRValues(data, 14);

  for (let i = 0; i < data.length; i++) {
    const open = Number(data[i].open), high = Number(data[i].high);
    const low = Number(data[i].low), close = Number(data[i].close);
    const volume = Number(data[i].volume || 0);

    const range = high - low;
    const rangePct = close ? (range / close) * 100 : 0;
    const bodyPct = open ? Math.abs(close - open) / open * 100 : 0;

    let isNR7 = false;
    if (i >= 6) {
      isNR7 = true;
      for (let j = 1; j <= 6; j++) {
        if (range >= (Number(data[i - j].high) - Number(data[i - j].low))) { isNR7 = false; break; }
      }
    }

    let customColor = null;
    if (smartBarConfig.enabled) {
      if (smartBarConfig.bodyEnabled && bodyPct > smartBarConfig.bodyThreshold && close > open) customColor = smartBarConfig.bodyColor;
      else if (smartBarConfig.rangeEnabled && rangePct < smartBarConfig.rangeThreshold) customColor = smartBarConfig.rangeColor;
      else if (smartBarConfig.nr7Enabled && isNR7) customColor = smartBarConfig.nr7Color;
    }

    const cObj = { time: data[i].time, open: open, high: high, low: low, close: close };
    
    // CUSTOM COLOR CANDLE Rules (Up/Down standard borders and wicks preserved)
    if (customColor) { 
      cObj.color = customColor; 
      const standardTvBorderColor = close >= open ? '#089981' : '#f23645';
      cObj.borderColor = standardTvBorderColor; 
      cObj.wickColor = standardTvBorderColor; 
    }
    candles.push(cObj);

    if (activeIndicators.ibLabel && i >= 1) {
      const prevHigh = Number(data[i - 1].high), prevLow = Number(data[i - 1].low);
      const motherBarRange = prevHigh ? ((prevHigh - prevLow) / prevHigh) * 100 : 0;
      const insideBar1 = (high < prevHigh && low > prevLow) && (close > ema55Vals[i]) && (motherBarRange <= ibMaxMotherBarRange);
      let insideBar2 = false;
      if (insideBar1 && i >= 2) insideBar2 = high < Number(data[i - 2].high) && low > Number(data[i - 2].low);

      if (insideBar1 || insideBar2) {
        markers.push({ time: data[i].time, position: 'belowBar', color: isNR7 ? smartBarConfig.nr7Color : smartBarConfig.bodyColor, shape: 'none', text: tf==='W'?'WIB':'IB' });
      }
    }

    if (activeIndicators.wtc && (tf === 'W' || panel.interval === 'W') && i >= 5) {
      const c0 = Number(data[i].close), c1 = Number(data[i-1].close), c2 = Number(data[i-2].close);
      const c3 = Number(data[i-3].close), c4 = Number(data[i-4].close), c5 = Number(data[i-5].close);
      const d1 = c1 ? Math.abs(c0-c1)/c1*100 : 99, d2 = c2 ? Math.abs(c1-c2)/c2*100 : 99;
      const d3 = c3 ? Math.abs(c2-c3)/c3*100 : 99, d4 = c4 ? Math.abs(c3-c4)/c4*100 : 99;
      const d5 = c5 ? Math.abs(c4-c5)/c5*100 : 99;
      const tight3 = d1 < 1.5 && d2 < 1.5 && d3 < 1.5;
      const tight4 = tight3 && d4 < 1.5, tight5 = tight4 && d5 < 1.5;

      if (tight5) markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'circle', text: '5WTC' });
      else if (tight4) markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff52e2', shape: 'circle', text: '4WTC' });
      else if (tight3) markers.push({ time: data[i].time, position: 'belowBar', color: '#52f9ff', shape: 'circle', text: '3WTC' });
    }

    if (activeIndicators.ema9Sell && i >= 1) {
      const prevLow = Number(data[i - 1].low);
      const ema9Curr = ema9Vals[i];
      const ema55Curr = ema55Vals[i];
      if (close < prevLow && prevLow < ema9Curr && close > ema55Curr) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'cross', text: '' });
      }
    }

    const ema200Curr = ema200Vals[i] || close;
    const vMA = volMA30[i] || 1;
    const candleRangePct = open ? ((high - low) / open) * 100 : 0;
    const priceAbove200EMA = close > (ema200Curr * 1.4);
    const priceBelow200EMA = close < (ema200Curr * 0.7);

    if (activeIndicators.sellClimax && i >= 1) {
      if (volume > (3 * vMA) && candleRangePct > 8 && priceBelow200EMA) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#00e676', shape: 'cross', text: 'SC' });
      }
    }

    if (activeIndicators.buyClimax && i >= 1) {
      if (volume > (3 * vMA) && candleRangePct > 8 && priceAbove200EMA) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'arrowDown', text: 'BC' });
      }
    }

    if (atrExtConfig.enabled && i >= 20) {
      const sma50Val = ema50Vals[i] || close, atrVal = atrVals[i] || 1;
      const distFromSMA = close - sma50Val;
      const atrMultiple = atrVal > 0 ? (distFromSMA / atrVal) : 0;

      if (atrMultiple >= (atrExtConfig.threshold || 5.0)) {
        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ff3d5a', shape: 'circle', text: '' });
      }
    }
  }

  markers.sort((a,b) => a.time < b.time ? -1 : (a.time > b.time ? 1 : 0));

  try { panel.candleSeries.setMarkers(markers); } catch(e){}
  return candles;
}

function updateSmartBarConfig() {
  smartBarConfig.enabled = document.getElementById('candle-clr-en').checked;
  smartBarConfig.bodyEnabled = document.getElementById('smart-body-en').checked;
  smartBarConfig.bodyThreshold = parseFloat(document.getElementById('smart-body-pct').value) || 4.0;
  smartBarConfig.bodyColor = document.getElementById('smart-body-color').value;
  smartBarConfig.rangeEnabled = document.getElementById('smart-range-en').checked;
  smartBarConfig.rangeThreshold = parseFloat(document.getElementById('smart-range-pct').value) || 3.0;
  smartBarConfig.rangeColor = document.getElementById('smart-range-color').value;
  smartBarConfig.nr7Enabled = document.getElementById('smart-nr7-en').checked;
  smartBarConfig.nr7Color = document.getElementById('smart-nr7-color').value;
  activeIndicators.candleClr = smartBarConfig.enabled;
  if (currentSymbol) rebuildAllPanels();
}

function updateIBConfig() {
  ibMaxMotherBarRange = parseFloat(document.getElementById('ib-mother-range').value) || 8.0;
  if (currentSymbol) rebuildAllPanels();
}

function updateATRExtConfig() {
  atrExtConfig.enabled = document.getElementById('atr-ext-en').checked;
  atrExtConfig.threshold = parseFloat(document.getElementById('atr-ext-thresh').value) || 5.0;
  if (currentSymbol) rebuildAllPanels();
}

/* ============ MINI COIL PATTERN CALCULATOR ============ */
function calculateMCPForData(data) {
  if (!mcpConfig.enabled || !data || data.length < 4) return [];
  try {
    const r1 = mcpConfig.r1 || 8.0, coils = []; let activeCoil = null;
    for (let i = 3; i < data.length; i++) {
      const h3 = Number(data[i - 3].high), l3 = Number(data[i - 3].low);
      const barRange = h3 ? ((h3 - l3) / h3) * 100 : 999;
      const c1 = h3 >= Number(data[i].high) && h3 >= Number(data[i - 1].high) && h3 >= Number(data[i - 2].high);
      const c2 = l3 <= Number(data[i].low) && l3 <= Number(data[i - 1].low) && l3 <= Number(data[i - 2].low);
      if (!activeCoil && c1 && c2 && barRange <= r1) {
        activeCoil = { startTime: data[i - 3].time, high: h3, low: l3, endTime: null }; coils.push(activeCoil);
      }
      if (activeCoil) {
        if (Number(data[i].high) <= activeCoil.high && Number(data[i].low) >= activeCoil.low) activeCoil.endTime = data[i].time;
        else activeCoil = null;
      }
    }
    return mcpConfig.lastOnly ? coils.slice(-1) : coils;
  } catch(e){ return []; }
}

function updateMCPConfig() {
  mcpConfig.enabled = document.getElementById('mcp-en').checked;
  mcpConfig.r1 = parseFloat(document.getElementById('mcp-r1').value) || 8.0;
  mcpConfig.lastOnly = document.getElementById('mcp-last-only').checked;
  if (currentSymbol) rebuildAllPanels();
}

/* ============ GAP DETECTOR CALCULATOR ============ */
function calculateGapsForData(data) {
  if (!gapConfig.enabled || !data || data.length < 2) return [];
  try {
    const minGapPct = gapConfig.minGapPct || 1.0, maxGaps = gapConfig.maxGaps || 5, gaps = [];
    for (let i = 1; i < data.length; i++) {
      const pHigh = Number(data[i - 1].high), pLow = Number(data[i - 1].low);
      const high = Number(data[i].high), low = Number(data[i].low);
      const gapUpPct = low > pHigh ? ((low - pHigh) / pHigh) * 100 : 0;
      const gapDownPct = high < pLow ? ((pLow - high) / pLow) * 100 : 0;

      if (gapUpPct >= minGapPct) gaps.push({ isUp: true, top: low, bottom: pHigh, startTime: data[i - 1].time, fillTime: null });
      else if (gapDownPct >= minGapPct) gaps.push({ isUp: false, top: pLow, bottom: high, startTime: data[i - 1].time, fillTime: null });

      for (let g = 0; g < gaps.length; g++) {
        if (!gaps[g].fillTime) {
          const justFilled = gaps[g].isUp ? (low <= gaps[g].bottom) : (high >= gaps[g].top);
          if (justFilled) gaps[g].fillTime = data[i].time;
        }
      }
    }
    return gaps.slice(-maxGaps);
  } catch(e){ return []; }
}

function updateGapConfig() {
  gapConfig.enabled = document.getElementById('gap-en').checked;
  gapConfig.minGapPct = parseFloat(document.getElementById('gap-min-pct').value) || 1.0;
  gapConfig.maxGaps = parseInt(document.getElementById('gap-max-count').value) || 5;
  if (currentSymbol) rebuildAllPanels();
}

/* ============ EDITABLE RSI ENGINE ============ */
function renderRSIPane(data, panel) {
  if (!data || !data.length) return;

  if (rsiConfig.enabled) {
    const period = rsiConfig.len || 14, rsiData = [], rsiValuesArr = [];
    let gains = 0, losses = 0;

    for (let i = 0; i < Math.min(period, data.length); i++) {
      rsiData.push({ time: data[i].time });
    }

    for (let i = 1; i <= period && i < data.length; i++) {
      const diff = Number(data[i].close) - Number(data[i - 1].close);
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;

    for (let i = period; i < data.length; i++) {
      if (i > period) {
        const diff = Number(data[i].close) - Number(data[i - 1].close);
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsiVal = +(100 - (100 / (1 + rs))).toFixed(2);
      rsiData.push({ time: data[i].time, value: rsiVal });
      rsiValuesArr.push({ time: data[i].time, val: rsiVal });
    }

    if (!panel.rsiSeries) {
      panel.rsiSeries = panel.rsiChart.addLineSeries({
        color: rsiConfig.color, lineWidth: rsiConfig.width, priceLineVisible: false, lastValueVisible: true
      });
    } else {
      panel.rsiSeries.applyOptions({ color: rsiConfig.color, lineWidth: rsiConfig.width });
    }
    panel.rsiSeries.setData(rsiData);
    panel.rsiValueByTime = rsiData.filter(d => typeof d.value === 'number');

    if (rsiMAConfig.enabled && rsiValuesArr.length) {
      const maLen = rsiMAConfig.len || 9, maData = []; let sum = 0;
      for (let i = 0; i < rsiValuesArr.length; i++) {
        sum += rsiValuesArr[i].val;
        if (i >= maLen) sum -= rsiValuesArr[i - maLen].val;
        if (i >= maLen - 1) maData.push({ time: rsiValuesArr[i].time, value: +(sum / maLen).toFixed(2) });
      }
      if (!panel.rsiMASeries) {
        panel.rsiMASeries = panel.rsiChart.addLineSeries({
          color: rsiMAConfig.color, lineWidth: rsiMAConfig.width, priceLineVisible: false, lastValueVisible: false
        });
      } else {
        panel.rsiMASeries.applyOptions({
          color: rsiMAConfig.color, lineWidth: rsiMAConfig.width
        });
      }
      panel.rsiMASeries.setData(maData);
    } else if (panel.rsiMASeries) {
      panel.rsiChart.removeSeries(panel.rsiMASeries); panel.rsiMASeries = null;
    }

    clearRSIThresholds(panel);
    if (rsiConfig.showThresholds && panel.rsiSeries) {
      try {
        const uLine = panel.rsiSeries.createPriceLine({
          price: rsiConfig.upperVal || 60, color: '#ff3d5a88', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false
        });
        const lLine = panel.rsiSeries.createPriceLine({
          price: rsiConfig.lowerVal || 40, color: '#00e67688', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false
        });
        panel.rsiThresholdLines = [uLine, lLine];
      } catch(e){}
    }

  } else {
    if (panel.rsiSeries) { panel.rsiChart.removeSeries(panel.rsiSeries); panel.rsiSeries = null; }
    if (panel.rsiMASeries) { panel.rsiChart.removeSeries(panel.rsiMASeries); panel.rsiMASeries = null; }
    clearRSIThresholds(panel);
  }
}

function clearRSIThresholds(panel) {
  if (panel.rsiSeries && panel.rsiThresholdLines && panel.rsiThresholdLines.length) {
    panel.rsiThresholdLines.forEach(l => { try { panel.rsiSeries.removePriceLine(l); } catch(e){} });
  }
  panel.rsiThresholdLines = [];
}

/* ============ EDITABLE EMAs ============ */
function renderEditableEMAs(data, panel) {
  if (!data || !data.length) return;

  if (panel.emaSeriesList && panel.emaSeriesList.length) {
    panel.emaSeriesList.forEach(s => { try { panel.priceChart.removeSeries(s); } catch(e){} });
  }
  panel.emaSeriesList = [];

  emaConfigs.forEach(cfg => {
    if (cfg.enabled) {
      const p = cfg.len, k = 2 / (p + 1);
      let ema = Number(data[0].close);
      const emaData = [];
      for (let i = 0; i < data.length; i++) {
        ema = (Number(data[i].close) * k) + (ema * (1 - k));
        emaData.push({ time: data[i].time, value: +ema.toFixed(2) });
      }

      const s = panel.priceChart.addLineSeries({
        color: cfg.color, 
        lineWidth: cfg.width, 
        priceLineVisible: false, 
        lastValueVisible: false,
        crosshairMarkerVisible: false // EMA HOVER DOT MARKER REMOVED
      });
      s.setData(emaData);
      panel.emaSeriesList.push(s);
    }
  });
}

function updateEMAConfig(){
  emaConfigs[0].enabled = document.getElementById('ema1-en').checked;
  emaConfigs[0].len = parseInt(document.getElementById('ema1-len').value) || 9;
  emaConfigs[0].color = document.getElementById('ema1-color').value;
  emaConfigs[0].width = parseInt(document.getElementById('ema1-width').value) || 1;

  emaConfigs[1].enabled = document.getElementById('ema2-en').checked;
  emaConfigs[1].len = parseInt(document.getElementById('ema2-len').value) || 21;
  emaConfigs[1].color = document.getElementById('ema2-color').value;
  emaConfigs[1].width = parseInt(document.getElementById('ema2-width').value) || 1;

  emaConfigs[2].enabled = document.getElementById('ema3-en').checked;
  emaConfigs[2].len = parseInt(document.getElementById('ema3-len').value) || 55;
  emaConfigs[2].color = document.getElementById('ema3-color').value;
  emaConfigs[2].width = parseInt(document.getElementById('ema3-width').value) || 1;

  emaConfigs[3].enabled = document.getElementById('ema4-en').checked;
  emaConfigs[3].len = parseInt(document.getElementById('ema4-len').value) || 200;
  emaConfigs[3].color = document.getElementById('ema4-color').value;
  emaConfigs[3].width = parseInt(document.getElementById('ema4-width').value) || 1;

  emaEnvelopeEnabled = document.getElementById('ema-env-en').checked;
  if (currentSymbol) rebuildAllPanels();
}

function updateRSConfig(){
  rsConfig.enabled = document.getElementById('rs-en').checked;
  rsConfig.avgEnabled = document.getElementById('rs-avg-en').checked;
  rsConfig.avgLen = parseInt(document.getElementById('rs-avg-len').value) || 20;
  rsConfig.avgColor = document.getElementById('rs-avg-color').value;
  rsConfig.avgWidth = parseInt(document.getElementById('rs-avg-width').value) || 1;
  updateTimeScaleVisibilityForAllPanels();
  if (currentSymbol) rebuildAllPanels();
}

function updateTimeScaleVisibilityForAllPanels(){
  panelsArray.forEach(p => updateTimeScaleVisibility(p));
}

/* ============ MERGED INFO CARD (52W + EMAs + ATR + CIRCUIT BANDS + GSM SURVEILLANCE + UPCOMING EARNINGS) ============ */
function renderCombinedInfoCard(data){
  if (!data || !data.length) return;
  const infoCard = document.getElementById('widget-combined-info');
  if (!activeIndicators.tables){ infoCard.style.display = 'none'; return; }
  infoCard.style.display = 'flex';

  try {
    const last = data[data.length-1], close = Number(last.close);
    let high52 = 0, low52 = Infinity;
    const len52 = Math.min(data.length, 252);
    for(let i=data.length-len52; i<data.length; i++){
      if (data[i].high > high52) high52 = data[i].high;
      if (data[i].low < low52) low52 = data[i].low;
    }
    const pHigh52 = high52 ? ((close - high52)/high52)*100 : 0;
    const pLow52 = low52 !== Infinity ? ((close - low52)/low52)*100 : 0;

    const getEMAVal = (p) => {
      const k = 2 / (p + 1); let ema = Number(data[0].close);
      for(let i=0; i<data.length; i++){ ema = (Number(data[i].close) * k) + (ema * (1 - k)); }
      return ema;
    };
    const e10 = getEMAVal(10), e21 = getEMAVal(21), e55 = getEMAVal(55), e200 = getEMAVal(200);
    const d10 = e10 ? ((close - e10) / e10) * 100 : 0;
    const d21 = e21 ? ((close - e21) / e21) * 100 : 0;
    const d55 = e55 ? ((close - e55) / e55) * 100 : 0;
    const d200 = e200 ? ((close - e200) / e200) * 100 : 0;

    const atrPeriod = 9; let trs = [];
    for (let i = 0; i < data.length; i++) {
      const h = Number(data[i].high), l = Number(data[i].low);
      const pc = i > 0 ? Number(data[i - 1].close) : Number(data[i].open);
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    let atr = 0;
    if (trs.length >= atrPeriod) {
      let trSum = 0; for (let i = 0; i < atrPeriod; i++) trSum += trs[i];
      atr = trSum / atrPeriod;
      for (let i = atrPeriod; i < trs.length; i++) atr = (atr * (atrPeriod - 1) + trs[i]) / atrPeriod;
    }
    const atrPct = close ? ((atr / close) * 100) : 0;

    const bandInfo = priceBandsMap[currentSymbol.toUpperCase()];
    const rawBand = bandInfo ? bandInfo.band : '20';
    const bandDisplay = (rawBand === 'NO BAND' || rawBand === '20') ? '20%' : `${rawBand}%`;
    const bandBadgeColor = (rawBand === '2' || rawBand === '5' || rawBand === '10') ? 'bg-amber' : 'bg-pos';

    const remarks = bandInfo ? (bandInfo.remarks || '').trim() : '';
    const isSurveillance = remarks && remarks !== '-' && remarks !== '' && remarks.toUpperCase() !== 'NONE';
    const gsmRowHtml = isSurveillance ? `
      <div class="info-row" style="margin-top:2px;">
        <span>Surveillance:</span> 
        <span class="widget-badge bg-neg" style="font-weight:700;">${escapeHtml(remarks)}</span>
      </div>
    ` : '';

    const upcomingResultDisplay = currentEarnings && currentEarnings.upcomingResult ? currentEarnings.upcomingResult : '-';

    infoCard.innerHTML = `
      <div class="info-card-section">
        <div class="info-row"><span>52W High:</span> <span class="widget-badge ${pHigh52>=0?'bg-pos':'bg-neg'}">${pHigh52.toFixed(2)}%</span></div>
        <div class="info-row"><span>52W Low:</span> <span class="widget-badge ${pLow52>=0?'bg-pos':'bg-neg'}">${pLow52>=0?'+':''}${pLow52.toFixed(2)}%</span></div>
      </div>
      <div class="info-card-divider"></div>
      <div class="info-card-section">
        <div class="info-row"><span>EMA 10:</span> <span class="widget-badge ${d10>=0?'bg-pos':'bg-neg'}">${d10>=0?'+':''}${d10.toFixed(2)}%</span></div>
        <div class="info-row"><span>EMA 21:</span> <span class="widget-badge ${d21>=0?'bg-pos':'bg-neg'}">${d21>=0?'+':''}${d21.toFixed(2)}%</span></div>
        <div class="info-row"><span>EMA 55:</span> <span class="widget-badge ${d55>=0?'bg-pos':'bg-neg'}">${d55>=0?'+':''}${d55.toFixed(2)}%</span></div>
        <div class="info-row"><span>EMA 200:</span> <span class="widget-badge ${d200>=0?'bg-pos':'bg-neg'}">${d200>=0?'+':''}${d200.toFixed(2)}%</span></div>
      </div>
      <div class="info-card-divider"></div>
      <div class="info-card-section">
        <div class="info-row"><span>Circuit Limit:</span> <span class="widget-badge ${bandBadgeColor}">${bandDisplay}</span></div>
        ${gsmRowHtml}
      </div>
      <div class="info-card-divider"></div>
      
      <!-- DYNAMIC UPCOMING EARNINGS RESULT FIELD IN COMBINED TABLE CARD -->
      <div class="info-card-section">
        <div class="info-row"><span>Upcoming Result:</span> <span class="widget-badge bg-amber" style="font-weight:700;">${escapeHtml(upcomingResultDisplay)}</span></div>
      </div>
      <div class="info-card-divider"></div>
      
      <div class="info-card-footer">
        ATR(9) = ${atr.toFixed(2)} (${atrPct.toFixed(2)}%)
      </div>
    `;
  } catch(e){}
}