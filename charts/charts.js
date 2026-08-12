// ============================================================
// MICKKK.com Charts — Professional Terminal Engine
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

// WATCHLIST STATE
let watchlists = [];
let activeWatchlistName = '';
let collapsedWatchSections = {};
let symbolCandleCache = {};
let symbolCandlePromiseCache = {};
let aggregateCache = new WeakMap();
let gridFormat = '1x1'; 
let panelsArray = [];
let searchTargetPanelIndex = -1;

let currentInterval = 'D';
let currentChartType = 'candle'; 
let currentScaleMode = 'log'; 
let currentTheme = 'dark';

// PROFESSIONAL DEFAULT INDICATORS
const DEFAULT_EMA_CONFIGS = [
  { id: 1, enabled: false, len: 9, color: '#ffffff', width: 1 },
  { id: 2, enabled: false, len: 21, color: '#c58b1b', width: 1 },
  { id: 3, enabled: false, len: 55, color: '#4b55a2', width: 1 },
  { id: 4, enabled: false, len: 200, color: '#f87171', width: 1 }
];

let emaConfigs = JSON.parse(JSON.stringify(DEFAULT_EMA_CONFIGS));
let emaEnvelopeEnabled = false;

let volMAConfig = { enabled: false, len: 30, color: '#ff9800', width: 1 };

let rsiConfig = {
  enabled: false, len: 14, color: '#9c27b0', width: 2,
  showThresholds: true, upperVal: 60, lowerVal: 40
};
let rsiMAConfig = { enabled: false, len: 9, color: '#ffab00', width: 1 };
let rsConfig = { enabled: false, avgEnabled: false, avgLen: 20, avgColor: '#ffab00', avgWidth: 1 };

let smartBarConfig = {
  enabled: false, bodyEnabled: false, bodyThreshold: 4.0, bodyColor: '#2196f3',
  rangeEnabled: false, rangeThreshold: 3.0, rangeColor: '#ffffff',
  nr7Enabled: false, nr7Color: '#ff9900'
};

let ibMaxMotherBarRange = 8.0;
let mcpConfig = { enabled: false, r1: 8.0, lastOnly: false };
let gapConfig = { enabled: false, minGapPct: 1.0, maxGaps: 5 };
let atrExtConfig = { enabled: false, threshold: 5.0 };

let activeIndicators = {
  ppv: true, tables: true, tablesEmaDist: false,
  candleClr: false, ibLabel: false, wtc: false, ema9Sell: false,
  sellClimax: false, buyClimax: false
};

let userDrawings = [];
let activeTool = 'cursor';
let drawingState = { isDrawing: false, startPoint: null, currentPoint: null };
let selectedDrawingIdx = -1;
let modalHighlightIdx = -1;

let volVisible = true;
let currentRange = '1Y';
let currentSymbol = '20MICRONS', currentName = '20 Microns Limited';
let isLiveActive = false;
let livePollTimer = null;
const LIVE_POLL_MS = 45000;

/* ============ FAST STATIC DATA / CDN ENGINE ============ */
const STATIC_DATA_ROOT = './data';
const MICKKK_IDB = { name:'mickkk-fast-cache', version:1, store:'kv' };

function openMickkkIDB(){
  return new Promise((resolve,reject)=>{
    try{
      const req=indexedDB.open(MICKKK_IDB.name,MICKKK_IDB.version);
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(MICKKK_IDB.store)) db.createObjectStore(MICKKK_IDB.store); };
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    }catch(e){ reject(e); }
  });
}
async function idbGet_(key){ try{ const db=await openMickkkIDB(); return await new Promise((res,rej)=>{const r=db.transaction(MICKKK_IDB.store,'readonly').objectStore(MICKKK_IDB.store).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); }catch(e){return null;} }
async function idbSet_(key,value){ try{ const db=await openMickkkIDB(); await new Promise((res,rej)=>{const r=db.transaction(MICKKK_IDB.store,'readwrite').objectStore(MICKKK_IDB.store).put(value,key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error);}); }catch(e){} }

function normalizeCandlePayload_(payload){
  if (!payload) return [];
  let raw = payload.candles || payload.data || payload;
  if (typeof raw === 'string') {
    return raw.split('|').map(b=>{
      const p=b.split(',');
      return {time:formatToDateOnly(p[0]),open:Number(p[1])||0,high:Number(p[2])||0,low:Number(p[3])||0,close:Number(p[4])||0,volume:Number(p[5])||0};
    }).filter(c=>c.time && c.close>0);
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(c=>c&&c.time&&!isNaN(Number(c.close))&&Number(c.close)>0).map(c=>({
    time:formatToDateOnly(c.time),open:Number(c.open||c.close),high:Number(c.high||c.close),low:Number(c.low||c.close),close:Number(c.close),volume:Number(c.volume||0)
  })).sort((a,b)=>a.time<b.time?-1:1);
}

async function refreshStaticCandleInBackground_(symbol){
  try{
    const url=`${STATIC_DATA_ROOT}/${encodeURIComponent(symbol)}.json?v=${Date.now()}`;
    const r=await fetch(url);
    if(!r.ok) return;
    const payload=await r.json();
    const fresh=normalizeCandlePayload_(payload);
    if(fresh.length) {
      symbolCandleCache[symbol]=fresh;
      await idbSet_(`candles:${symbol}`,{version:'1',candles:fresh,savedAt:Date.now()});
    }
  }catch(e){}
}

async function bootstrapFastData(){
  try{
    const saved=localStorage.getItem('MICKKK_WATCHLIST_CACHE');
    if(saved){ const parsed=JSON.parse(saved); if(Array.isArray(parsed.watchlists)){watchlists=parsed.watchlists; if(!activeWatchlistName&&watchlists.length)activeWatchlistName=watchlists[0].name; renderWatchlists();} }
  }catch(e){}
  refreshWatchlists(false).then(()=>{try{localStorage.setItem('MICKKK_WATCHLIST_CACHE',JSON.stringify({watchlists, savedAt:Date.now()}));}catch(e){}}).catch(()=>{});
}

/* ============ FETCH PRICE BANDS & GSM SURVEILLANCE FROM GOOGLE SHEET ============ */
async function fetchPriceBandsData() {
  try {
    const res = await fetch(`${CHARTS_API_URL}?action=getPriceBands`);
    const data = await res.json();
    if (data.priceBands && Array.isArray(data.priceBands)) {
      priceBandsMap = {};
      data.priceBands.forEach(b => { if (b.symbol) priceBandsMap[b.symbol.toUpperCase()] = b; });
      if (panelsArray[0] && panelsArray[0].rawDailyCandles) renderCombinedInfoCard(aggregate(panelsArray[0].rawDailyCandles, 'D'));
    }
  } catch(e) { console.warn("Price bands fetch error:", e); }
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

/* ============ DUAL PRICE ALERTS ENGINE ============ */
let activeAlerts = [];

function openPriceAlertModal() {
  if (!currentSymbol) return;
  document.getElementById('alert-stock-name').innerText = currentSymbol;
  const statusEl = document.getElementById('alert-save-status');
  if (statusEl) statusEl.textContent = '';
  const primary = panelsArray[0];
  if (primary && primary.rawDailyCandles && primary.rawDailyCandles.length) {
    const last = primary.rawDailyCandles[primary.rawDailyCandles.length - 1];
    document.getElementById('alert-price-input').value = last.close ? last.close.toFixed(2) : '';
  }
  document.getElementById('alert-modal').classList.add('open');
}

function closePriceAlertModal() {
  document.getElementById('alert-modal').classList.remove('open');
}

async function savePriceAlert() {
  const price = parseFloat(document.getElementById('alert-price-input').value);
  const condition = document.getElementById('alert-condition-input').value;
  const statusEl = document.getElementById('alert-save-status');
  const btn = document.getElementById('alert-save-btn');
  if (!price || isNaN(price)) { if(statusEl) statusEl.textContent = 'Valid price enter karein.'; return; }

  activeAlerts.push({ symbol: currentSymbol, targetPrice: price, condition: condition, triggered: false });

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  if (statusEl) { statusEl.style.color = 'var(--muted)'; statusEl.textContent = 'Saving to Server & Telegram…'; }

  try {
    const url = `${CHARTS_API_URL}?action=addAlert&symbol=${encodeURIComponent(currentSymbol)}&price=${price}&condition=${condition}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (statusEl) { statusEl.style.color = 'var(--green)'; statusEl.textContent = '✓ Alert set! Sound + Telegram ready.'; }
    setTimeout(closePriceAlertModal, 900);
  } catch (e) {
    if (statusEl) { statusEl.style.color = 'var(--amber)'; statusEl.textContent = '✓ Saved locally (Sound Alert active).'; }
    setTimeout(closePriceAlertModal, 1200);
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Set Alert'; }
}

function checkPriceAlerts(symbol, currentPrice) {
  activeAlerts.forEach(alt => {
    if (alt.symbol === symbol && !alt.triggered) {
      let isTriggered = false;
      if (alt.condition === 'ABOVE' && currentPrice >= alt.targetPrice) isTriggered = true;
      if (alt.condition === 'BELOW' && currentPrice <= alt.targetPrice) isTriggered = true;

      if (isTriggered) {
        alt.triggered = true;
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          osc.connect(audioCtx.destination);
          osc.frequency.value = 880;
          osc.start(); osc.stop(audioCtx.currentTime + 0.6);
        } catch(e){}
        alert(`🚨 PRICE ALERT: ${symbol} has reached ₹${currentPrice.toFixed(2)} (Target: ₹${alt.targetPrice.toFixed(2)})!`);
      }
    }
  });
}

async function openMyAlertsModal() {
  document.getElementById('my-alerts-modal').classList.add('open');
  const listEl = document.getElementById('my-alerts-list');
  if (!listEl) return;
  listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:16px;">Loading…</div>`;

  try {
    const res = await fetch(`${CHARTS_API_URL}?action=getAlerts`);
    const data = await res.json();
    if (data.alerts) {
      renderMyAlerts(data.alerts);
      return;
    }
  } catch (e){}
  renderMyAlerts(activeAlerts);
}

function closeMyAlertsModal() {
  document.getElementById('my-alerts-modal').classList.remove('open');
}

function renderMyAlerts(alerts) {
  const listEl = document.getElementById('my-alerts-list');
  if (!listEl) return;
  if (!alerts || !alerts.length) {
    listEl.innerHTML = `<div style="color:var(--muted);text-align:center;padding:16px;">Koi active alert nahi hai.</div>`;
    return;
  }
  listEl.innerHTML = alerts.map((a, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:8px 12px;">
      <div>
        <b style="color:var(--accent)">${a.symbol}</b>
        <span style="color:var(--muted)"> ${a.condition === 'ABOVE' ? '≥' : '≤'} ₹${Number(a.targetPrice).toFixed(2)}</span>
      </div>
      <button class="tbtn" style="padding:4px 10px;font-size:11px;" onclick="deleteMyAlert('${a.id || idx}', this)">🗑 Delete</button>
    </div>
  `).join('');
}

async function deleteMyAlert(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await fetch(`${CHARTS_API_URL}?action=deleteAlert&id=${encodeURIComponent(id)}`);
  } catch (e){}
  activeAlerts = activeAlerts.filter(a => a.id !== id);
  openMyAlertsModal();
}

/* ============ LOCALSTORAGE PERSISTENCE ============ */
function saveDrawingsToLocalStorage() {
  if (!currentSymbol) return;
  try { localStorage.setItem(`MICKKK_DRAWINGS_${currentSymbol}`, JSON.stringify(userDrawings)); } catch(e){}
}

function loadDrawingsFromLocalStorage(symbol) {
  if (!symbol) return;
  try {
    const saved = localStorage.getItem(`MICKKK_DRAWINGS_${symbol}`);
    userDrawings = saved ? JSON.parse(saved) : [];
  } catch(e) { userDrawings = []; }
}

/* ============ TOOLBAR COLLAPSE TOGGLE ============ */
function toggleDrawingToolbar() {
  const bar = document.getElementById('drawing-toolbar');
  const main = document.querySelector('.main');
  const toggleBtn = document.getElementById('floating-draw-toggle');
  if (!bar || !toggleBtn) return;
  if (bar.classList.contains('collapsed')) {
    bar.classList.remove('collapsed');
    if (main) main.classList.remove('tools-collapsed');
    toggleBtn.style.display = 'none';
  } else {
    bar.classList.add('collapsed');
    if (main) main.classList.add('tools-collapsed');
    toggleBtn.style.display = 'block';
  }
}

/* ============ PROFESSIONAL VIEW CONTROLS ============ */
function zoomChart(multiplier){
  panelsArray.forEach(panel => {
    try {
      const ts = panel.priceChart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const center = (range.from + range.to) / 2;
      const half = Math.max(3, (range.to - range.from) * multiplier / 2);
      ts.setVisibleLogicalRange({ from: center - half, to: center + half });
    } catch(e){}
  });
}

function resetChartView(){
  panelsArray.forEach(panel => {
    try {
      const data = aggregate(panel.rawDailyCandles || [], panel.interval);
      applyRangeToPanel(panel, data);
    } catch(e){}
  });
}

/* ============ CHART TYPE SWITCHER ============ */
function setChartType(type, btn) {
  currentChartType = type;
  ['btn-type-candle', 'btn-type-bar', 'btn-type-line'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('active');
  });
  if (btn) btn.classList.add('active');
  
  panelsArray.forEach(p => ensureSeriesType(p));
  if (currentSymbol) rebuildAllPanels();
}

function ensureSeriesType(panel) {
  if (panel.seriesType === currentChartType && panel.candleSeries) return;

  if (panel.candleSeries) {
    try { panel.priceChart.removeSeries(panel.candleSeries); } catch(e){}
    panel.candleSeries = null;
  }

  if (currentChartType === 'bar') {
    panel.candleSeries = panel.priceChart.addBarSeries({
      upColor: '#00e676', downColor: '#ff3d5a',
      thinBars: false
    });
  } else if (currentChartType === 'line') {
    panel.candleSeries = panel.priceChart.addLineSeries({ color: '#00d4ff', lineWidth: 2 });
  } else {
    panel.candleSeries = panel.priceChart.addCandlestickSeries({
      upColor: '#00e676', downColor: '#ff3d5a',
      borderUpColor: '#00e676', borderDownColor: '#ff3d5a',
      wickUpColor: '#00e67699', wickDownColor: '#ff3d5a99',
    });
  }

  panel.seriesType = currentChartType;
  panel.candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.02, bottom: 0.30 }, autoScale: true });
}

/* ============ PRICE SCALE MODE SWITCHER ============ */
function setPriceScaleMode(mode, btn) {
  currentScaleMode = mode;
  ['btn-scale-reg', 'btn-scale-log', 'btn-scale-pct'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('active');
  });
  if (btn) btn.classList.add('active');

  let scaleMode = LightweightCharts.PriceScaleMode.Normal;
  if (mode === 'log') scaleMode = LightweightCharts.PriceScaleMode.Logarithmic;
  else if (mode === 'pct') scaleMode = LightweightCharts.PriceScaleMode.Percentage;

  panelsArray.forEach(p => {
    if (p.priceChart) {
      p.priceChart.priceScale('right').applyOptions({ mode: scaleMode });
    }
  });
}

/* ============ FULLSCREEN & SCREENSHOT CAPTURE ============ */
function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.error(err));
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function captureChartScreenshot() {
  if (!panelsArray.length || !panelsArray[0].priceChart) return;
  try {
    const canvas = panelsArray[0].priceChart.takeScreenshot();
    const link = document.createElement('a');
    link.download = `MICKKK_${currentSymbol || 'Chart'}_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch(e) {}
}

/* ============ MAIN TOOLBAR INTERVAL SWITCHER ============ */
function setInterval_(interval, btn){
  currentInterval = interval;
  ['btn-daily','btn-weekly','btn-monthly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  if (btn) btn.classList.add('active');

  panelsArray.forEach(p => {
    p.interval = interval;
  });
  if (currentSymbol) rebuildAllPanels();
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
  fetchPriceBandsData(); // FETCH PRICE BANDS & SURVEILLANCE STAGES ON INIT

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

/* ============ DRAWINGS ENGINE ============ */
function setTool(tool, btn){
  activeTool = tool;
  document.querySelectorAll('.draw-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  drawingState.isDrawing = false; drawingState.startPoint = null; hideSelectiveDeleteBtn();
}

function handleChartMouseDown(e) {
  if (!panelsArray.length) return;
  const primary = panelsArray[0];
  if (!primary || !primary.candleSeries || !primary.priceChart) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;

  const price = primary.candleSeries.coordinateToPrice(y);
  const time = getTimeFromXCoordinate(x, primary);

  if (!price || !time) return;

  if (activeTool === 'eraser') {
    const foundIdx = findDrawingAtPoint(x, y, primary);
    if (foundIdx !== -1) { userDrawings.splice(foundIdx, 1); saveDrawingsToLocalStorage(); rebuildAllPanels(); }
    setTool('cursor', document.getElementById('tool-cursor')); return;
  }

  if (activeTool === 'cursor') {
    const foundIdx = findDrawingAtPoint(x, y, primary);
    if (foundIdx !== -1) { selectedDrawingIdx = foundIdx; showSelectiveDeleteBtn(x, y); }
    else hideSelectiveDeleteBtn();
    return;
  }

  if (activeTool === 'hline') {
    userDrawings.push({ id: Date.now(), type: 'hline', price: price, color: '#00d4ff' }); finalizeDrawing(); return;
  }
  if (activeTool === 'vline') {
    userDrawings.push({ id: Date.now(), type: 'vline', time: time, color: '#00d4ff' }); finalizeDrawing(); return;
  }
  if (activeTool === 'text') {
    const textNote = prompt("Enter Text Note:", "Support Level");
    if (textNote) { userDrawings.push({ id: Date.now(), type: 'text', time: time, price: price, text: textNote, color: '#00d4ff' }); finalizeDrawing(); }
    return;
  }

  if (!drawingState.isDrawing) {
    drawingState.startPoint = { time: time, price: price, x: x, y: y };
    drawingState.currentPoint = { time: time, price: price, x: x, y: y };
    drawingState.isDrawing = true;
  } else {
    userDrawings.push({
      id: Date.now(), type: activeTool, p1: drawingState.startPoint,
      p2: { time: time, price: price, x: x, y: y }, color: activeTool === 'measure' ? '#ffab00' : '#00d4ff'
    });
    drawingState.isDrawing = false; drawingState.startPoint = null; finalizeDrawing();
  }
}

function finalizeDrawing() {
  saveDrawingsToLocalStorage();
  rebuildAllPanels();
  setTool('cursor', document.getElementById('tool-cursor'));
}

function handleChartMouseMove(e) {
  if (!drawingState.isDrawing || !panelsArray.length) return;
  const primary = panelsArray[0];
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;

  const price = primary.candleSeries.coordinateToPrice(y);
  const time = getTimeFromXCoordinate(x, primary);

  if (price && time) {
    drawingState.currentPoint = { time: time, price: price, x: x, y: y };
    panelsArray.forEach(p => drawPanelOverlays(p));
  }
}

function findDrawingAtPoint(x, y, panel) {
  for (let i = userDrawings.length - 1; i >= 0; i--) {
    const d = userDrawings[i];
    if (d.type === 'hline') {
      const ly = panel.candleSeries.priceToCoordinate(d.price);
      if (ly !== null && Math.abs(y - ly) < 12) return i;
    } else if (d.type === 'vline') {
      const lx = panel.priceChart.timeScale().timeToCoordinate(d.time);
      if (lx !== null && Math.abs(x - lx) < 12) return i;
    } else if (d.type === 'trendline' && d.p1 && d.p2) {
      const x1 = panel.priceChart.timeScale().timeToCoordinate(d.p1.time);
      const y1 = panel.candleSeries.priceToCoordinate(d.p1.price);
      const x2 = panel.priceChart.timeScale().timeToCoordinate(d.p2.time);
      const y2 = panel.candleSeries.priceToCoordinate(d.p2.price);
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        if (distToSegment({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 }) < 12) return i;
      }
    } else if ((d.type === 'rectangle' || d.type === 'measure' || d.type === 'fibonacci') && d.p1 && d.p2) {
      const x1 = panel.priceChart.timeScale().timeToCoordinate(d.p1.time);
      const y1 = panel.candleSeries.priceToCoordinate(d.p1.price);
      const x2 = panel.priceChart.timeScale().timeToCoordinate(d.p2.time);
      const y2 = panel.candleSeries.priceToCoordinate(d.p2.price);
      if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
        const bx = Math.min(x1, x2), by = Math.min(y1, y2);
        const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
        if (x >= bx - 8 && x <= bx + bw + 8 && y >= by - 8 && y <= by + bh + 8) return i;
      }
    }
  }
  return -1;
}

function distToSegment(p, v, w) {
  const l2 = (w.x - v.x)*(w.x - v.x) + (w.y - v.y)*(w.y - v.y);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

// ... etc
