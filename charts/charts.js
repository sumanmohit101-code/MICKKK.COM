
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

/* ============ FAST STATIC DATA / CDN ENGINE ============
   Daily data is published by Apps Script into /charts/data/ on GitHub.
   Cloudflare serves these files as static assets; Apps Script remains a fallback.
*/
const STATIC_DATA_ROOT = './data';
let STATIC_DATA_VERSION = '0';
let STATIC_DATA_MANIFEST = null;
let staticManifestPromise = null;
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

function staticShardFor_(symbol){
  const s=String(symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return (s.slice(0,2) || 'XX');
}

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

async function loadStaticManifest_(){
  if (STATIC_DATA_MANIFEST) return STATIC_DATA_MANIFEST;
  if (staticManifestPromise) return staticManifestPromise;
  staticManifestPromise=(async()=>{
    try{
      const r=await fetch(`${STATIC_DATA_ROOT}/manifest.json?v=${Date.now()}`,{cache:'no-store'});
      if(!r.ok) throw new Error('static manifest '+r.status);
      const m=await r.json();
      STATIC_DATA_MANIFEST=m||{}; STATIC_DATA_VERSION=String(m.version||Date.now());
      if(Array.isArray(m.symbols)&&m.symbols.length) allSymbols=m.symbols;
      if(Array.isArray(m.priceBands)){
        priceBandsMap={}; m.priceBands.forEach(b=>{if(b&&b.symbol) priceBandsMap[String(b.symbol).toUpperCase()]=b;});
      }
      return STATIC_DATA_MANIFEST;
    }catch(e){ STATIC_DATA_MANIFEST=null; return null; }
    finally{ staticManifestPromise=null; }
  })();
  return staticManifestPromise;
}

async function fetchStaticCandles_(symbol){
  const m=await loadStaticManifest_();
  const shard=(m&&m.shards&&m.shards[String(symbol).toUpperCase()])||staticShardFor_(symbol);
  const url=`${STATIC_DATA_ROOT}/candles/${encodeURIComponent(shard)}.json?v=${encodeURIComponent(STATIC_DATA_VERSION)}`;
  const r=await fetch(url,{cache:'force-cache'});
  if(!r.ok) throw new Error('static candle '+r.status);
  const payload=await r.json();
  const packed=payload && payload[String(symbol).toUpperCase()];
  if(!packed) throw new Error('static symbol missing');
  return normalizeCandlePayload_({candles:packed});
}

async function refreshStaticCandleInBackground_(symbol){
  try{
    const fresh=await fetchStaticCandles_(symbol);
    if(fresh.length) { symbolCandleCache[symbol]=fresh; await idbSet_(`candles:${symbol}`,{version:STATIC_DATA_VERSION,candles:fresh,savedAt:Date.now()}); }
  }catch(e){}
}

async function bootstrapFastData(){
  const manifestPromise=loadStaticManifest_();
  // Warm the static manifest without blocking chart construction.
  manifestPromise.then(()=>{
    if(Array.isArray(allSymbols)&&allSymbols.length) renderSearchModalResults(allSymbols);
    if(priceBandsMap && Object.keys(priceBandsMap).length && panelsArray[0]?.rawDailyCandles) renderCombinedInfoCard(aggregate(panelsArray[0].rawDailyCandles,'D'));
  }).catch(()=>{});
  // Watchlists are user data: show cached state first, then sync from Apps Script.
  try{
    const saved=localStorage.getItem('MICKKK_WATCHLIST_CACHE');
    if(saved){ const parsed=JSON.parse(saved); if(Array.isArray(parsed.watchlists)){watchlists=parsed.watchlists; if(!activeWatchlistName&&watchlists.length)activeWatchlistName=watchlists[0].name; renderWatchlists();} }
  }catch(e){}
  refreshWatchlists(false).then(()=>{try{localStorage.setItem('MICKKK_WATCHLIST_CACHE',JSON.stringify({watchlists, savedAt:Date.now()}));}catch(e){}}).catch(()=>{});
}

/* ============ FETCH PRICE BANDS & GSM SURVEILLANCE FROM GOOGLE SHEET ============ */
async function fetchPriceBandsData() {
  try {
    const m=await loadStaticManifest_();
    if(m && Array.isArray(m.priceBands)) return;
  } catch(e){}
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

  // EXACTLY ONE date axis: only the bottom-most visible pane owns the x-axis.
  // Non-bottom panes must have their timeScale completely hidden; setting height:0
  // still leaves a rendered axis in Lightweight Charts.
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
    if (!param || !param.point || !instObj.candleSeries || !param.time) {
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
    if (!param || !param.point || !instObj.candleSeries || !param.time) {
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
    if (!param || !param.point || !param.time) {
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

function showSelectiveDeleteBtn(x, y) {
  const btn = document.getElementById('selective-del-btn');
  if (!btn) return;
  btn.style.left = `${x + 15}px`; btn.style.top = `${y - 10}px`; btn.style.display = 'flex';
}

function hideSelectiveDeleteBtn() {
  const btn = document.getElementById('selective-del-btn');
  if (btn) btn.style.display = 'none'; selectedDrawingIdx = -1;
}

function deleteSelectedDrawing() {
  if (selectedDrawingIdx !== -1 && selectedDrawingIdx < userDrawings.length) {
    userDrawings.splice(selectedDrawingIdx, 1);
    saveDrawingsToLocalStorage(); rebuildAllPanels();
  }
  hideSelectiveDeleteBtn();
}

function getTimeFromXCoordinate(x, panel) {
  const data = aggregate(panel.rawDailyCandles, panel.interval);
  if (!data || !data.length) return null;
  let closestTime = data[0].time, minDiff = Infinity;
  for (let i = 0; i < data.length; i++) {
    const cx = panel.priceChart.timeScale().timeToCoordinate(data[i].time);
    if (cx !== null) {
      const diff = Math.abs(cx - x);
      if (diff < minDiff) { minDiff = diff; closestTime = data[i].time; }
    }
  }
  return closestTime;
}

function clearDrawings(){
  userDrawings = []; drawingState.isDrawing = false; drawingState.startPoint = null;
  saveDrawingsToLocalStorage(); hideSelectiveDeleteBtn(); rebuildAllPanels();
}

/* ============ COMPACT OHLC BOX READOUT ============ */
function onCrosshairMove(param, cSeries, vSeries){
  const box = document.getElementById('ohlc-box');
  if (!param || !param.time || !param.seriesData || !param.seriesData.get(cSeries)) {
    box.style.display = 'none'; return;
  }
  const bar = param.seriesData.get(cSeries);
  const volBar = param.seriesData.get(vSeries);
  
  let open = bar.open, high = bar.high, low = bar.low, close = bar.close;
  if (bar.value !== undefined) { open = high = low = close = bar.value; }

  const chg = close - open;
  const chgPct = open ? (chg / open * 100) : 0;
  const cls = chg >= 0 ? 'lg' : 'lr';
  
  box.style.display = 'flex';
  box.innerHTML = `
    <b style="color:var(--text);">${currentSymbol || ''}</b>
    <span style="color:var(--border);">|</span>
    <span>O <b style="color:var(--text);">${open.toFixed(2)}</b></span>
    <span>H <b style="color:var(--text);">${high.toFixed(2)}</b></span>
    <span>L <b style="color:var(--text);">${low.toFixed(2)}</b></span>
    <span>C <b style="color:var(--text);">${close.toFixed(2)}</b></span>
    <span class="${cls}">${chg>=0?'+':''}${chg.toFixed(2)} (${chgPct>=0?'+':''}${chgPct.toFixed(2)}%)</span>
    ${volBar ? '<span style="color:var(--border);">|</span> Vol <b style="color:var(--text);">'+fmtVol(volBar.value)+'</b>' : ''}
  `;
}

function fmtVol(v){
  if (!v) return '0';
  if (v >= 1e7) return (v/1e7).toFixed(2)+'Cr';
  if (v >= 1e5) return (v/1e5).toFixed(2)+'L';
  if (v >= 1e3) return (v/1e3).toFixed(1)+'K';
  return String(v);
}

/* ============ GOOGLE SHEET WATCHLISTS ============ */
async function watchlistApi(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const res = await fetch(`${CHARTS_API_URL}?${qs.toString()}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}

function setWatchlistStatus(msg, ok=false) {
  const el = document.getElementById('watchlist-status');
  if (el) { el.textContent = msg || ''; el.style.color = ok ? 'var(--green)' : 'var(--muted)'; }
}

function toggleWatchlistPanel(force) {
  const panel = document.getElementById('watchlist-panel');
  if (!panel) return;
  const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  const shell = document.querySelector('.shell');
  if (shell) shell.classList.toggle('watchlist-open', open);
  if (open) renderWatchlists();
}

function escapeWatchText(s){ return escapeHtml(s == null ? '' : String(s)); }

function renderWatchlists(){
  const select = document.getElementById('watchlist-select');
  const body = document.getElementById('watchlist-body');
  if (!select || !body) return;
  if (!watchlists.length) {
    select.innerHTML = '<option value="">No watchlists</option>';
    body.innerHTML = '<div class="watch-empty">No watchlist yet.<br>Use <b>＋ Watchlist</b> to create one.</div>';
    return;
  }
  if (!watchlists.some(w => w.name === activeWatchlistName)) activeWatchlistName = watchlists[0].name;
  select.innerHTML = watchlists.map(w => `<option value="${escapeWatchText(w.name)}" ${w.name===activeWatchlistName?'selected':''}>${escapeWatchText(w.name)}</option>`).join('');
  const wl = watchlists.find(w => w.name === activeWatchlistName) || watchlists[0];
  body.innerHTML = '';
  (wl.sections || []).forEach(section => {
    const key = `${wl.name}::${section.name}`;
    const collapsed = !!collapsedWatchSections[key];
    const wrap = document.createElement('div');
    wrap.className = 'watch-section';
    const head = document.createElement('div');
    head.className = 'watch-section-head';
    head.innerHTML = `<span class="watch-chevron">${collapsed?'▶':'▼'}</span><span class="watch-section-name">${escapeWatchText(section.name)}</span><button type="button" class="watch-section-menu" title="Edit / Delete section">⋮</button>`;
    head.onclick = () => { collapsedWatchSections[key] = !collapsedWatchSections[key]; renderWatchlists(); };
    head.querySelector('.watch-section-menu').onclick = (e) => {
      e.stopPropagation();
      sectionMenuUI(section.name);
    };
    head.oncontextmenu = (e) => { e.preventDefault(); sectionMenuUI(section.name); };
    wrap.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      wrap.classList.add('drag-over');
      head.classList.add('drop-target');
    });
    wrap.addEventListener('dragleave', e => {
      if (!wrap.contains(e.relatedTarget)) {
        wrap.classList.remove('drag-over');
        head.classList.remove('drop-target');
      }
    });
    wrap.addEventListener('drop', async e => {
      e.preventDefault();
      wrap.classList.remove('drag-over');
      head.classList.remove('drop-target');
      let payload = null;
      try { payload = JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch(err) {}
      if (!payload || !payload.symbol || !payload.sourceSection || payload.sourceSection === section.name) return;
      await mutateWatchlist('moveSymbol', {
        watchlist: wl.name,
        fromSection: payload.sourceSection,
        toSection: section.name,
        symbol: payload.symbol
      });
    });
    wrap.appendChild(head);
    if (!collapsed) {
      const items = document.createElement('div');
      items.className = 'watch-items';
      (section.items || []).forEach(item => {
        const row = document.createElement('div');
        row.className = 'watch-item' + (item.symbol === currentSymbol ? ' active' : '');
        row.draggable = true;
        row.dataset.symbol = item.symbol;
        row.dataset.sourceSection = section.name;
        row.innerHTML = `<span class="watch-sym">${escapeWatchText(item.symbol)}</span><span class="watch-name">${escapeWatchText(item.name || '')}</span><button class="watch-remove" title="Remove from section">×</button>`;
        row.onclick = () => loadSymbol(item.symbol, item.name || item.symbol, -1);
        row.querySelector('.watch-remove').onclick = async (e) => {
          e.stopPropagation();
          await mutateWatchlist('removeSymbol', {watchlist: wl.name, section: section.name, symbol: item.symbol});
        };
        row.addEventListener('dragstart', e => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify({ symbol:item.symbol, name:item.name||item.symbol, sourceSection:section.name }));
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        items.appendChild(row);
      });
      if (!(section.items || []).length) {
        items.innerHTML = '<div class="watch-empty" style="padding:8px 4px;text-align:left;">Empty section</div>';
      }
      wrap.appendChild(items);
    }
    body.appendChild(wrap);
  });
}

function selectWatchlist(name){ activeWatchlistName = name; renderWatchlists(); }

async function refreshWatchlists(open=false){
  try {
    const data = await watchlistApi('getWatchlists');
    watchlists = Array.isArray(data.watchlists) ? data.watchlists : [];
    if (!activeWatchlistName && watchlists.length) activeWatchlistName = watchlists[0].name;
    renderWatchlists();
    if (open) toggleWatchlistPanel(true);
  } catch(e) { setWatchlistStatus('Watchlists unavailable: ' + e.message); }
}

async function mutateWatchlist(action, params){
  try {
    setWatchlistStatus('Saving…');
    await watchlistApi(action, params);
    await refreshWatchlists(false);
    setWatchlistStatus('Saved', true);
    setTimeout(() => setWatchlistStatus(''), 1200);
  } catch(e) { setWatchlistStatus('Error: ' + e.message); }
}

async function addWatchlistUI(){
  const name = prompt('New watchlist name:');
  if (!name || !name.trim()) return;
  await mutateWatchlist('addWatchlist', {name: name.trim()});
  activeWatchlistName = name.trim();
  renderWatchlists();
}

async function renameCurrentWatchlist(){
  if (!activeWatchlistName) return;
  const name = prompt('Rename watchlist:', activeWatchlistName);
  if (!name || !name.trim() || name.trim() === activeWatchlistName) return;
  const old = activeWatchlistName;
  await mutateWatchlist('renameWatchlist', {oldName: old, newName: name.trim()});
  activeWatchlistName = name.trim();
  renderWatchlists();
}

async function deleteCurrentWatchlist(){
  if (!activeWatchlistName) return;
  if (!confirm(`Delete watchlist “${activeWatchlistName}”?`)) return;
  const old = activeWatchlistName;
  await mutateWatchlist('deleteWatchlist', {name: old});
  activeWatchlistName = watchlists[0] ? watchlists[0].name : '';
  renderWatchlists();
}

async function addSectionUI(){
  if (!activeWatchlistName) { await addWatchlistUI(); if (!activeWatchlistName) return; }
  const name = prompt('New section name:');
  if (!name || !name.trim()) return;
  await mutateWatchlist('addSection', {watchlist: activeWatchlistName, section: name.trim()});
}

async function renameSectionUI(section){
  const name = prompt('Rename section:', section);
  if (!name || !name.trim() || name.trim() === section) return;
  await mutateWatchlist('renameSection', {watchlist: activeWatchlistName, oldSection: section, newSection: name.trim()});
}

async function deleteSectionUI(section){
  if (!confirm(`Delete section “${section}”?`)) return;
  await mutateWatchlist('deleteSection', {watchlist: activeWatchlistName, section});
}

function sectionMenuUI(section){
  const action = prompt(`Section: ${section}\nType R to rename or D to delete:`, 'R');
  if (!action) return;
  if (action.toUpperCase() === 'R') renameSectionUI(section);
  else if (action.toUpperCase() === 'D') deleteSectionUI(section);
}

async function addStockUI(){
  if (!activeWatchlistName) {
    await addWatchlistUI();
    if (!activeWatchlistName) return;
  }

  if (!allSymbols || !allSymbols.length) {
    try {
      const res = await fetch(`${CHARTS_API_URL}?action=getSymbols`);
      const data = await res.json();
      if (data && Array.isArray(data.symbols) && data.symbols.length) allSymbols = data.symbols;
    } catch(e) {}
  }
  if (!allSymbols || !allSymbols.length) {
    alert('Stock list could not be loaded from Google Sheet.');
    return;
  }

  let wl = watchlists.find(w => w.name === activeWatchlistName);
  let sections = wl && Array.isArray(wl.sections) ? wl.sections : [];

  if (!sections.length) {
    await mutateWatchlist('addSection', {watchlist: activeWatchlistName, section:'General'});
    wl = watchlists.find(w => w.name === activeWatchlistName);
    sections = wl && Array.isArray(wl.sections) ? wl.sections : [];
  }

  const selectHtml = allSymbols.map((x,i)=>
    `<option value="${i}">${escapeWatchText(String(x.symbol))} — ${escapeWatchText(String(x.name||''))}</option>`
  ).join('');
  const sectionHtml = sections.map(s=>
    `<option value="${escapeWatchText(String(s.name))}">${escapeWatchText(String(s.name))}</option>`
  ).join('');

  const picker=document.createElement('div');
  picker.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:flex;align-items:center;justify-content:center;';
  picker.innerHTML=`
    <div style="width:min(500px,92vw);background:var(--surface,#111827);border:1px solid var(--border,#334155);border-radius:10px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.45);">
      <div style="font-size:14px;font-weight:700;margin-bottom:12px;">Add Stock</div>
      <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:5px;">Section</label>
      <select id="watch-section-picker" style="width:100%;box-sizing:border-box;background:var(--card,#0f172a);color:var(--text,#fff);border:1px solid var(--border,#334155);border-radius:6px;padding:8px;font-size:12px;margin-bottom:12px;">${sectionHtml}</select>
      <label style="display:block;font-size:11px;color:var(--muted);margin-bottom:5px;">Stock</label>
      <input id="watch-stock-search" type="text" placeholder="Search symbol or company name..." autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--card,#0f172a);color:var(--text,#fff);border:1px solid var(--border,#334155);border-radius:6px;padding:8px;font-size:12px;margin-bottom:8px;">
      <select id="watch-stock-picker" size="10" style="width:100%;background:var(--card,#0f172a);color:var(--text,#fff);border:1px solid var(--border,#334155);border-radius:6px;padding:7px;font-family:var(--mono,monospace);font-size:12px;">${selectHtml}</select>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
        <button id="watch-stock-cancel" style="padding:7px 12px;">Cancel</button>
        <button id="watch-stock-add" style="padding:7px 14px;">Add Stock</button>
      </div>
    </div>`;
  document.body.appendChild(picker);

  const stockPicker=picker.querySelector('#watch-stock-picker');
  const searchInput=picker.querySelector('#watch-stock-search');
  searchInput.oninput=()=>{
    const q=searchInput.value.trim().toLowerCase();
    [...stockPicker.options].forEach(opt=>{
      const s=allSymbols[Number(opt.value)]||{};
      opt.hidden=!!q&&!`${s.symbol||''} ${s.name||''}`.toLowerCase().includes(q);
    });
    const first=[...stockPicker.options].find(o=>!o.hidden);
    if(first) stockPicker.value=first.value;
  };

  const close=()=>picker.remove();
  picker.querySelector('#watch-stock-cancel').onclick=close;
  picker.onclick=e=>{if(e.target===picker)close();};

  picker.querySelector('#watch-stock-add').onclick=async()=>{
    const found=allSymbols[Number(stockPicker.value)];
    const section=String(picker.querySelector('#watch-section-picker').value||'').trim();
    if(!found){alert('Please select a stock.');return;}
    if(!section){alert('Please select a section.');return;}
    close();
    await mutateWatchlist('addSymbol',{
      watchlist:activeWatchlistName,
      section,
      symbol:String(found.symbol).trim().toUpperCase(),
      name:String(found.name||found.symbol).trim()
    });
  };
}

async function loadSymbolList(){
  try{
    const m=await loadStaticManifest_();
    if(m && Array.isArray(m.symbols) && m.symbols.length){
      allSymbols=m.symbols;
      refreshWatchlists(false);
      return;
    }
  }catch(e){}
  try{
    const cached=await idbGet_('symbols');
    if(cached && Array.isArray(cached.symbols) && cached.symbols.length){ allSymbols=cached.symbols; renderSearchModalResults(allSymbols); }
  }catch(e){}
  try{
    const res = await fetch(`${CHARTS_API_URL}?action=getSymbols`);
    const data = await res.json();
    if (data.error) return;
    const fetched = data.symbols || [];
    if (fetched.length) { allSymbols = fetched; await idbSet_('symbols',{symbols:fetched,savedAt:Date.now()}); }
    if (allSymbols.length > 0 && !currentSymbol) loadSymbol(allSymbols[0].symbol, allSymbols[0].name, -1);
    refreshWatchlists(false);
  }catch(e){ refreshWatchlists(false); }
}

function openSearchModal(targetPanelIdx){
  searchTargetPanelIndex = targetPanelIdx !== undefined ? targetPanelIdx : -1;
  document.getElementById('search-modal').classList.add('open');
  modalHighlightIdx = -1;
  const input = document.getElementById('modal-search-input');
  if (input) { input.value = ''; input.focus(); }
  renderSearchModalResults(allSymbols);
}

function closeSearchModal(){ document.getElementById('search-modal').classList.remove('open'); modalHighlightIdx = -1; }

function filterSearchModal(){
  modalHighlightIdx = -1;
  const input = document.getElementById('modal-search-input');
  const q = input ? input.value.toLowerCase().trim() : '';
  let list = allSymbols;
  if (q) {
    list = list.filter(s => (s.name && s.name.toLowerCase().includes(q)) || (s.symbol && s.symbol.toLowerCase().includes(q)));
  }
  renderSearchModalResults(list.slice(0, 100));
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderSearchModalResults(list) {
  const el = document.getElementById('modal-search-results');
  if (!el) return;
  if (!list || !list.length) { el.innerHTML = `<div class="symbol-empty">No stocks found</div>`; return; }

  el.innerHTML = list.map(s => `
    <div class="search-row-item" data-sym="${escapeHtml(s.symbol)}">
      <span class="s-name">${escapeHtml(s.name)}</span>
      <span class="s-sym">${escapeHtml(s.symbol)}</span>
    </div>
  `).join('');

  el.querySelectorAll('.search-row-item').forEach(item => {
    item.addEventListener('click', () => {
      const sym = item.getAttribute('data-sym');
      const found = allSymbols.find(x => x.symbol === sym);
      if (found) loadSymbol(found.symbol, found.name, searchTargetPanelIndex);
    });
  });
}

/* ============ FAST FETCH WITH CLEAN DATE PARSING ============ */
async function fetchSymbolCandles(symbol) {
  symbol=String(symbol||'').trim().toUpperCase();
  if (symbolCandleCache[symbol]) return symbolCandleCache[symbol];
  if (symbolCandlePromiseCache[symbol]) return symbolCandlePromiseCache[symbol];

  // 1) IndexedDB: instant local chart on repeat visits.
  try{
    const local=await idbGet_(`candles:${symbol}`);
    if(local && Array.isArray(local.candles) && local.candles.length){
      symbolCandleCache[symbol]=local.candles;
      // Revalidate from Cloudflare static data in the background; never block the chart.
      refreshStaticCandleInBackground_(symbol);
      return local.candles;
    }
  }catch(e){}

  // 2) Static Cloudflare/GitHub data: primary source.
  symbolCandlePromiseCache[symbol]=(async()=>{
    try{
      const candles=await fetchStaticCandles_(symbol);
      symbolCandleCache[symbol]=candles;
      await idbSet_(`candles:${symbol}`,{version:STATIC_DATA_VERSION,candles,savedAt:Date.now()});
      return candles;
    }catch(staticErr){
      // 3) Existing Apps Script API remains a safe fallback.
      const res=await fetch(`${CHARTS_API_URL}?action=getOHLC&symbol=${encodeURIComponent(symbol)}`);
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      const candles=normalizeCandlePayload_(data);
      symbolCandleCache[symbol]=candles;
      await idbSet_(`candles:${symbol}`,{version:'api',candles,savedAt:Date.now()});
      return candles;
    }
  })();
  try{return await symbolCandlePromiseCache[symbol];}finally{delete symbolCandlePromiseCache[symbol];}
}

/* ============ LOAD SYMBOL ============ */
async function loadSymbol(symbol, name, targetIdx){
  stopLivePoll();
  if (targetIdx === -1 || targetIdx === undefined) {
    currentSymbol = symbol; currentName = name;
    const btnLbl = document.getElementById('top-stock-btn-label');
    if (btnLbl) btnLbl.innerText = `🔍 ${symbol}`;
  }

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';

  loadDrawingsFromLocalStorage(symbol);

  try{
    if (targetIdx >= 0 && panelsArray[targetIdx]) {
      panelsArray[targetIdx]._pendingViewState = null;
      panelsArray[targetIdx]._viewInitialized = false;
      panelsArray[targetIdx].symbol = symbol;
      panelsArray[targetIdx].symbolName = name;
      const label = document.getElementById(`panel-sym-label-${targetIdx}`);
      if (label) label.innerText = symbol;
      await rebuildPanelChart(panelsArray[targetIdx]);
    } else {
      panelsArray.forEach(p => {
        p._pendingViewState = null;
        p._viewInitialized = false;
        p.symbol = symbol; p.symbolName = name;
        const label = document.getElementById(`panel-sym-label-${p.index}`);
        if (label) label.innerText = symbol;
      });
      await rebuildAllPanels();
    }
    updateHeader();
    renderWatchlists();
    startLivePoll();
  }catch(e){ showChartError(e.message); }
  finally{
    document.getElementById('loading').style.display = 'none';
    closeSearchModal();
  }
}

function showChartError(msg){
  document.getElementById('loading').style.display = 'none';
  const es = document.getElementById('empty-state');
  es.style.display = 'flex'; es.innerHTML = `<div class="big">⚠️</div><div>${msg}</div>`;
}

function updateHeader(){
  const primary = panelsArray[0];
  if (!primary || !primary.rawDailyCandles || !primary.rawDailyCandles.length) return;
  const last = primary.rawDailyCandles[primary.rawDailyCandles.length-1];
  const prev = primary.rawDailyCandles.length>1 ? primary.rawDailyCandles[primary.rawDailyCandles.length-2] : last;
  const displayClose = (typeof last.close === 'number') ? last.close : prev.close;
  const chg = displayClose - prev.close;
  const chgPct = prev.close ? (chg/prev.close*100) : 0;
  const cls = chg>=0?'pos':'neg';
  const liveTag = isLiveActive ? `<span style="font-size:10px;font-weight:700;color:var(--red);border:1px solid var(--red);padding:2px 7px;border-radius:20px;">● LIVE</span>` : '';
  
  document.getElementById('symbol-header').innerHTML = `
    <div class="sym-top-line">
      <span class="sym-name">${currentSymbol || '—'}</span>
      <span class="sym-price">₹${displayClose.toFixed(2)}</span>
      <span class="sym-chg ${cls}">${chg>=0?'+':''}${chg.toFixed(2)} (${chgPct>=0?'+':''}${chgPct.toFixed(2)}%)</span>
      ${liveTag}
    </div>
    <div class="sym-full">${currentName||''}</div>
  `;
}

/* ============ AGGREGATION ============ */
function aggregate(candles, interval){
  if (!candles || !candles.length) return [];
  if (interval === 'D') return candles;
  let byInterval = aggregateCache.get(candles);
  if (!byInterval) { byInterval = new Map(); aggregateCache.set(candles, byInterval); }
  const cached = byInterval.get(interval);
  if (cached) return cached;
  const groups = {}, order = [];
  candles.forEach(c => {
    const d = new Date(c.time);
    let key;
    if (interval === 'W'){
      const day = d.getDay();
      const monday = new Date(d); monday.setDate(d.getDate() - ((day+6)%7));
      key = formatToDateOnly(monday);
    } else { key = c.time.slice(0,7)+'-01'; }
    if (!groups[key]){ groups[key] = { time:key, open:c.open, high:c.high, low:c.low, close:c.close, volume:0 }; order.push(key); }
    const g = groups[key];
    g.high = Math.max(g.high, c.high);
    g.low = Math.min(g.low, c.low);
    g.close = c.close;
    g.volume += (c.volume||0);
  });
  const result = order.map(k => groups[k]);
  byInterval.set(interval, result);
  return result;
}

/* ============ PARALLEL ASYNC REBUILD ALL PANELS ============ */
async function rebuildAllPanels() {
  await Promise.all(panelsArray.map(p => rebuildPanelChart(p)));
  const primary = panelsArray[0];
  if (primary && primary.rawDailyCandles && primary.rawDailyCandles.length) {
    const dailyData = aggregate(primary.rawDailyCandles, 'D');
    renderCombinedInfoCard(dailyData);
    renderPocketPivotStatsWidget(dailyData);
  }
}

async function rebuildPanelChart(panel) {
  if (!panel || !panel.symbol) return;
  try {
    const currentView = capturePanelView(panel);
    if (currentView) {
      panel._pendingViewState = currentView;
      panel._viewDataLength = panel.rawDailyCandles ? aggregate(panel.rawDailyCandles, panel.interval).length : Math.max(1, currentView.to + 1);
    }
    const rawCandles = await fetchSymbolCandles(panel.symbol);
    panel.rawDailyCandles = rawCandles;
    if (!rawCandles || !rawCandles.length) return;

    const data = aggregate(rawCandles, panel.interval);
    if (!data || !data.length) return;

    ensureSeriesType(panel);

    if (currentChartType === 'line') {
      const lineData = data.map(d => ({ time: d.time, value: d.close }));
      panel.candleSeries.setData(lineData);
    } else {
      const formatted = processCandleColoringAndIB(data, panel, panel.interval);
      panel.candleSeries.setData(formatted);
    }

    if (volVisible) {
      renderPocketPivotVolume(data, panel);
    } else {
      panel.volumeSeries.setData([]);
    }

    renderEditableEMAs(data, panel);
    renderRSIPane(data, panel);
    await renderRelativeStrengthPane(panel, data);

    updateTimeScaleVisibility(panel);
    if (!restorePanelView(panel, data)) applyRangeToPanel(panel, data, false);
    drawPanelOverlays(panel);
  } catch (err) {
    console.error("Panel rebuild error:", err);
  }
}

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
    if (customColor) { cObj.color = customColor; cObj.borderColor = customColor; cObj.wickColor = customColor; }
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

/* ============ DYNAMIC PANEL CANVAS OVERLAYS ============ */
function drawPanelOverlays(panel) {
  if (!panel || !panel.overlayCanvas || !panel.priceChart || !panel.candleSeries) return;
  const canvas = panel.overlayCanvas;
  const parent = canvas.parentElement;
  if (!parent) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = parent.getBoundingClientRect();

  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);

  const data = aggregate(panel.rawDailyCandles, panel.interval);
  if (!data || !data.length) return;

  if (emaEnvelopeEnabled && emaConfigs[0].enabled && emaConfigs[1].enabled) {
    try {
      const e9Val = calculateEMAValues(data, emaConfigs[0].len);
      const e21Val = calculateEMAValues(data, emaConfigs[1].len);

      for (let i = 1; i < data.length; i++) {
        const x1 = panel.priceChart.timeScale().timeToCoordinate(data[i - 1].time);
        const x2 = panel.priceChart.timeScale().timeToCoordinate(data[i].time);
        if (x1 === null || x2 === null) continue;

        const y9_1 = panel.candleSeries.priceToCoordinate(e9Val[i - 1]);
        const y21_1 = panel.candleSeries.priceToCoordinate(e21Val[i - 1]);
        const y9_2 = panel.candleSeries.priceToCoordinate(e9Val[i]);
        const y21_2 = panel.candleSeries.priceToCoordinate(e21Val[i]);

        if (y9_1 === null || y21_1 === null || y9_2 === null || y21_2 === null) continue;

        const isBullish = e9Val[i] >= e21Val[i];
        ctx.fillStyle = isBullish ? 'rgba(8, 153, 129, 0.18)' : 'rgba(242, 54, 69, 0.18)';

        ctx.beginPath();
        ctx.moveTo(x1, y9_1);
        ctx.lineTo(x2, y9_2);
        ctx.lineTo(x2, y21_2);
        ctx.lineTo(x1, y21_1);
        ctx.closePath();
        ctx.fill();
      }
    } catch(e){}
  }

  if (gapConfig.enabled) {
    try {
      const gaps = calculateGapsForData(data);
      gaps.forEach(gap => {
        const x1 = panel.priceChart.timeScale().timeToCoordinate(gap.startTime);
        let x2;
        if (gap.fillTime) {
          x2 = panel.priceChart.timeScale().timeToCoordinate(gap.fillTime);
        } else {
          const lastX = panel.priceChart.timeScale().timeToCoordinate(data[data.length - 1].time);
          x2 = lastX !== null ? (lastX + 15) : rect.width;
        }

        const yTop = panel.candleSeries.priceToCoordinate(gap.top);
        const yBottom = panel.candleSeries.priceToCoordinate(gap.bottom);

        if (x1 === null || yTop === null || yBottom === null) return;

        const boxLeft = Math.min(x1, x2 || rect.width);
        const boxRight = Math.max(x1, x2 || rect.width);
        const boxWidth = Math.max(boxRight - boxLeft, 2);
        const boxY = Math.min(yTop, yBottom);
        const boxHeight = Math.abs(yBottom - yTop);

        ctx.fillStyle = gap.isUp ? 'rgba(76, 175, 80, 0.16)' : 'rgba(255, 82, 82, 0.16)';
        ctx.strokeStyle = gap.isUp ? 'rgba(76, 175, 80, 0.7)' : 'rgba(255, 82, 82, 0.7)';
        ctx.lineWidth = 1;
        ctx.fillRect(boxLeft, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxLeft, boxY, boxWidth, boxHeight);
      });
    } catch(e){}
  }

  if (mcpConfig.enabled) {
    try {
      const coils = calculateMCPForData(data);
      coils.forEach(mcp => {
        const x1 = panel.priceChart.timeScale().timeToCoordinate(mcp.startTime);
        let x2;
        if (mcp.endTime) {
          const nextX = panel.priceChart.timeScale().timeToCoordinate(mcp.endTime);
          x2 = nextX !== null ? nextX : rect.width;
        } else {
          const lastX = panel.priceChart.timeScale().timeToCoordinate(data[data.length - 1].time);
          x2 = lastX !== null ? Math.max(lastX + 40, rect.width) : rect.width;
        }

        const yTop = panel.candleSeries.priceToCoordinate(mcp.high);
        const yBottom = panel.candleSeries.priceToCoordinate(mcp.low);

        if (x1 === null || yTop === null || yBottom === null) return;

        const boxLeft = Math.min(x1, x2);
        const boxRight = Math.max(x1, x2);
        const boxWidth = Math.max(boxRight - boxLeft, 2);
        const boxY = Math.min(yTop, yBottom);
        const boxHeight = Math.abs(yBottom - yTop);

        ctx.fillStyle = 'rgba(245, 240, 220, 0.22)';
        ctx.strokeStyle = 'rgba(200, 190, 140, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);

        ctx.fillRect(boxLeft, boxY, boxWidth, boxHeight);
        ctx.strokeRect(boxLeft, boxY, boxWidth, boxHeight);
        ctx.setLineDash([]);
      });
    } catch(e){}
  }

  if (panel.index === 0) {
    userDrawings.forEach(d => {
      try {
        if (d.type === 'hline') {
          const y = panel.candleSeries.priceToCoordinate(d.price);
          if (y !== null) {
            ctx.strokeStyle = d.color || '#00d4ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); ctx.setLineDash([]);
          }
        } else if (d.type === 'vline') {
          const x = panel.priceChart.timeScale().timeToCoordinate(d.time);
          if (x !== null) {
            ctx.strokeStyle = d.color || '#00d4ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); ctx.setLineDash([]);
          }
        } else if (d.type === 'trendline' && d.p1 && d.p2) {
          const x1 = panel.priceChart.timeScale().timeToCoordinate(d.p1.time);
          const y1 = panel.candleSeries.priceToCoordinate(d.p1.price);
          const x2 = panel.priceChart.timeScale().timeToCoordinate(d.p2.time);
          const y2 = panel.candleSeries.priceToCoordinate(d.p2.price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            ctx.strokeStyle = d.color || '#00d4ff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
        } else if (d.type === 'rectangle' && d.p1 && d.p2) {
          const x1 = panel.priceChart.timeScale().timeToCoordinate(d.p1.time);
          const y1 = panel.candleSeries.priceToCoordinate(d.p1.price);
          const x2 = panel.priceChart.timeScale().timeToCoordinate(d.p2.time);
          const y2 = panel.candleSeries.priceToCoordinate(d.p2.price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const bx = Math.min(x1, x2), by = Math.min(y1, y2);
            const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
            ctx.fillStyle = 'rgba(0, 212, 255, 0.12)'; ctx.strokeStyle = d.color || '#00d4ff'; ctx.lineWidth = 1.5;
            ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
          }
        } else if (d.type === 'fibonacci' && d.p1 && d.p2) {
          const x1 = panel.priceChart.timeScale().timeToCoordinate(d.p1.time);
          const y1 = panel.candleSeries.priceToCoordinate(d.p1.price);
          const x2 = panel.priceChart.timeScale().timeToCoordinate(d.p2.time);
          const y2 = panel.candleSeries.priceToCoordinate(d.p2.price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
            const fibColors = ['#ff3d5a', '#ff9800', '#ffeb3b', '#00e676', '#00bcd4', '#2196f3', '#9c27b0'];
            const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            fibLevels.forEach((level, idx) => {
              const levelPrice = d.p1.price + (d.p2.price - d.p1.price) * level;
              const ly = panel.candleSeries.priceToCoordinate(levelPrice);
              if (ly !== null) {
                ctx.strokeStyle = fibColors[idx]; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
                ctx.beginPath(); ctx.moveTo(minX, ly); ctx.lineTo(maxX, ly); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = fibColors[idx]; ctx.font = '10px JetBrains Mono, monospace';
                ctx.fillText(`${(level * 100).toFixed(1)}% (${levelPrice.toFixed(2)})`, maxX + 4, ly + 3);
              }
            });
          }
        } else if (d.type === 'measure' && d.p1 && d.p2) {
          const x1 = panel.priceChart.timeScale().timeToCoordinate(d.p1.time);
          const y1 = panel.candleSeries.priceToCoordinate(d.p1.price);
          const x2 = panel.priceChart.timeScale().timeToCoordinate(d.p2.time);
          const y2 = panel.candleSeries.priceToCoordinate(d.p2.price);
          if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
            const bx = Math.min(x1, x2), by = Math.min(y1, y2);
            const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
            ctx.fillStyle = 'rgba(255, 171, 0, 0.15)'; ctx.strokeStyle = '#ffab00'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh); ctx.setLineDash([]);
            const priceDiff = d.p2.price - d.p1.price;
            const pct = d.p1.price ? (priceDiff / d.p1.price) * 100 : 0;
            ctx.fillStyle = '#ffab00'; ctx.font = '11px JetBrains Mono, monospace';
            ctx.fillText(`₹${priceDiff.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, bx + 6, by + 16);
          }
        } else if (d.type === 'text' && d.time && d.price) {
          const x = panel.priceChart.timeScale().timeToCoordinate(d.time);
          const y = panel.candleSeries.priceToCoordinate(d.price);
          if (x !== null && y !== null) {
            ctx.fillStyle = d.color || '#00d4ff'; ctx.font = '12px JetBrains Mono, monospace';
            ctx.fillText(`💬 ${d.text}`, x, y);
          }
        }
      } catch(e){}
    });

    if (drawingState.isDrawing && drawingState.startPoint && drawingState.currentPoint) {
      try {
        const p1 = drawingState.startPoint, p2 = drawingState.currentPoint;
        const x1 = panel.priceChart.timeScale().timeToCoordinate(p1.time);
        const y1 = panel.candleSeries.priceToCoordinate(p1.price);
        const x2 = panel.priceChart.timeScale().timeToCoordinate(p2.time);
        const y2 = panel.candleSeries.priceToCoordinate(p2.price);
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.5;
          if (activeTool === 'trendline') {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          } else if (activeTool === 'rectangle' || activeTool === 'measure') {
            const bx = Math.min(x1, x2), by = Math.min(y1, y2);
            const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
            ctx.fillStyle = 'rgba(0, 212, 255, 0.15)'; ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx, by, bw, bh);
          }
        }
      } catch(e){}
    }
  }
}

/* ============ POCKET PIVOT VOLUME ENGINE ============ */
function renderPocketPivotVolume(data, panel) {
  if (!data || !data.length) return;
  if (!activeIndicators.ppv) {
    panel.volumeSeries.setData(data.map(c => ({ time: c.time, value: Number(c.volume||0), color: (c.close>=c.open?'#00e67655':'#ff3d5a55') })));
    try { panel.volumeSeries.setMarkers([]); } catch(e){}
    renderVolumeMALine(data, panel, []);
    return;
  }

  try {
    let highestEver = 0; const volData = [], markers = [];
    const volSMA = computeSMA(data.map(d=>Number(d.volume||0)), volMAConfig.len || 30);

    for(let i=0; i<data.length; i++){
      const v = Number(data[i].volume || 0), close = Number(data[i].close || 0);
      const prevClose = i>0 ? Number(data[i-1].close || close) : close;
      if (v > highestEver) highestEver = v;

      let max252 = 0, max63 = 0, min252 = Infinity, min63 = Infinity, max10P = 0, max5P = 0;
      for(let j = Math.max(0, i-251); j <= i; j++){ const jv = Number(data[j].volume || 0); if (jv > max252) max252 = jv; if (jv < min252) min252 = jv; }
      for(let j = Math.max(0, i-62); j <= i; j++){ const jv = Number(data[j].volume || 0); if (jv > max63) max63 = jv; if (jv < min63) min63 = jv; }
      for(let j = Math.max(0, i-9); j < i; j++){ const jv = Number(data[j].volume || 0); if (jv > max10P) max10P = jv; }
      for(let j = Math.max(0, i-4); j < i; j++){ const jv = Number(data[j].volume || 0); if (jv > max5P) max5P = jv; }

      const ma = volSMA[i] || v;
      const isHighVol = v > (ma * 5), is10P = v > max10P, is5P = v > max5P;
      let color = close >= prevClose ? '#00e67688' : '#ff3d5a88', tagText = null;
      const vM = (v / 1000000).toFixed(2);

      if (v === highestEver && v > 0) { color = '#00e676'; tagText = 'HEV: ' + vM; }
      else if (v < ma * 0.5) { color = '#1e2d3d'; }
      else if (v === max252 && v > 0) { color = '#ffab00'; tagText = 'HVY: ' + vM; }
      else if (v === max63 && v > 0) { color = '#ffab00'; tagText = 'HVQ: ' + vM; }
      else if (v === min252 && min252 !== Infinity) { color = '#800000'; tagText = 'Y'; }
      else if (v === min63 && min63 !== Infinity) { color = '#800000'; tagText = 'Q'; }
      else if (isHighVol) { color = '#00d4ff'; tagText = '>5x: ' + vM; }
      else if (is10P) { color = '#00bcd4'; tagText = '10P'; }
      else if (is5P) { color = '#00bcd4'; tagText = '5P'; }

      volData.push({ time: data[i].time, value: v, color: color });
      if(tagText && i >= data.length - 80){
        markers.push({ time: data[i].time, position: 'aboveBar', color: close >= prevClose ? '#00d4ff' : '#ff3d5a', shape: 'none', text: tagText });
      }
    }

    panel.volumeSeries.setData(volData);
    try { panel.volumeSeries.setMarkers(markers); } catch(me){}
    renderVolumeMALine(data, panel, volSMA);
  } catch(e){}
}

/* ============ POCKET PIVOT STATS WIDGET ============ */
function renderPocketPivotStatsWidget(data){
  const statsWidget = document.getElementById('ppv-stats-widget');
  if (!activeIndicators.ppv || !data || !data.length) {
    if (statsWidget) statsWidget.style.display = 'none';
    return;
  }
  statsWidget.style.display = 'flex';

  try {
    const last = data[data.length - 1];
    let upVolSum = 0, downVolSum = 0;
    const len21 = Math.min(data.length, 21);
    let volSum21 = 0, priceSum21 = 0;

    for(let i = data.length - len21; i < data.length; i++){
      const v = Number(data[i].volume || 0);
      volSum21 += v; priceSum21 += Number(data[i].close);
      if(data[i].close > data[i].open) upVolSum += v;
      else if(data[i].close < data[i].open) downVolSum += v;
    }

    const udRatio = downVolSum !== 0 ? (upVolSum / downVolSum) : 1;
    const avgVolMA = volSum21 / len21;
    const avgPriceMA = priceSum21 / len21;
    const avgVolCr = (avgVolMA * avgPriceMA) / 10000000;
    const relVol = avgVolMA ? (((Number(last.volume||0)) / avgVolMA) - 1) * 100 : 0;

    statsWidget.innerHTML = `
      <div class="ppv-table-row">
        <div class="ppv-cell ${udRatio >= 1 ? 'bg-green' : 'bg-red'}">
          U/D Volume Ratio: ${udRatio.toFixed(2)}
        </div>
        <div class="ppv-cell bg-neutral">
          Avg Volume (Cr): ${avgVolCr.toFixed(1)}
        </div>
        <div class="ppv-cell ${relVol >= 0 ? 'bg-green' : 'bg-red'}">
          Rel Volume: ${relVol >= 0 ? '+' : ''}${relVol.toFixed(2)}%
        </div>
      </div>
    `;
  } catch(e){}
  requestAnimationFrame(() => positionPocketPivotStatsWidget(panelsArray[0]));
}

function renderVolumeMALine(data, panel, volSMA) {
  if (!data || !data.length) return;
  if (volMAConfig.enabled && activeIndicators.ppv && volSMA && volSMA.length) {
    const maData = [];
    for (let i = 0; i < data.length; i++) {
      if (volSMA[i] !== undefined) maData.push({ time: data[i].time, value: +volSMA[i].toFixed(2) });
    }
    if (!panel.volMASeries) {
      panel.volMASeries = panel.priceChart.addLineSeries({
        priceScaleId: 'vol', color: volMAConfig.color, lineWidth: volMAConfig.width, priceLineVisible: false, lastValueVisible: false
      });
    } else {
      panel.volMASeries.applyOptions({ color: volMAConfig.color, lineWidth: volMAConfig.width });
    }
    panel.volMASeries.setData(maData);
  } else if (panel.volMASeries) {
    panel.priceChart.removeSeries(panel.volMASeries);
    panel.volMASeries = null;
  }
}

function updateVolMAConfig(){
  volMAConfig.enabled = document.getElementById('volma-en').checked;
  volMAConfig.len = parseInt(document.getElementById('volma-len').value) || 30;
  volMAConfig.color = document.getElementById('volma-color').value;
  volMAConfig.width = parseInt(document.getElementById('volma-width').value) || 1;
  if (currentSymbol) rebuildAllPanels();
  requestAnimationFrame(() => positionPocketPivotStatsWidget(panelsArray[0]));
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
        panel.rsiMASeries.applyOptions({ color: rsiMAConfig.color, lineWidth: rsiMAConfig.width });
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

/* ============ RELATIVE STRENGTH ENGINE ============ */
function normalizeSymbolKey(v){
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function fetchNifty500Candles(){
  // Resolve the benchmark from the same Symbols list used by the chart.
  // This avoids assuming the sheet/API uses exactly one spelling such as
  // "NIFTY500" vs "NIFTY 500".
  const candidates = [];
  const pushCandidate = (v) => {
    if (v && !candidates.includes(v)) candidates.push(v);
  };

  pushCandidate('NIFTY500');
  pushCandidate('NIFTY 500');
  pushCandidate('NIFTY_500');

  if (Array.isArray(allSymbols)) {
    const exact = allSymbols.find(x => normalizeSymbolKey(x.symbol) === 'NIFTY500');
    if (exact) pushCandidate(exact.symbol);

    const named = allSymbols.find(x => {
      const sym = normalizeSymbolKey(x.symbol);
      const name = normalizeSymbolKey(x.name);
      return sym === 'NIFTY500' || name.includes('NIFTY500');
    });
    if (named) pushCandidate(named.symbol);
  }

  let lastError = null;
  for (const symbol of candidates) {
    try {
      const candles = await fetchSymbolCandles(symbol);
      if (candles && candles.length) return candles;
    } catch(e) {
      lastError = e;
    }
  }

  if (lastError) throw lastError;
  return [];
}

function buildBenchmarkCloseMap(candles){
  const map = new Map();
  (candles || []).forEach(c => {
    const t = String(c.time);
    const close = Number(c.close);
    if (t && isFinite(close) && close > 0) map.set(t, close);
  });
  return map;
}

function getAsOfBenchmarkClose(sortedCandles, targetTime, startIndexObj){
  // Use the latest benchmark close on or before the stock candle.
  // This keeps RS working even when the two series have a missing/non-trading day.
  let i = Number(startIndexObj.value || 0);
  while (i < sortedCandles.length && String(sortedCandles[i].time) <= String(targetTime)) i++;
  startIndexObj.value = Math.max(0, i - 1);
  const c = sortedCandles[startIndexObj.value];
  return c ? Number(c.close) : NaN;
}

async function renderRelativeStrengthPane(panel, data) {
  if (!panel || !data || !data.length || !rsConfig.enabled) {
    if (panel && panel.rsSeries) { try { panel.rsChart.removeSeries(panel.rsSeries); } catch(e){} panel.rsSeries = null; }
    if (panel && panel.rsMASeries) { try { panel.rsChart.removeSeries(panel.rsMASeries); } catch(e){} panel.rsMASeries = null; }
    if (panel) panel.rsValueByTime = [];
    return;
  }

  try {
    const niftyRaw = await fetchNifty500Candles();
    const niftyData = aggregate(niftyRaw, panel.interval);
    if (!niftyData || !niftyData.length) {
      console.warn('Relative Strength: NIFTY500 benchmark data not available.');
      return;
    }

    const niftyMap = buildBenchmarkCloseMap(niftyData);
    const sortedNifty = [...niftyData].sort((a,b) => String(a.time).localeCompare(String(b.time)));
    const asOfIndex = { value: 0 };
    const rsData = [];

    data.forEach(c => {
      const stockClose = Number(c.close);
      let niftyClose = niftyMap.get(String(c.time));

      // Exact date match first; if it is absent, use the latest benchmark close
      // available on/before that stock candle.
      if (!isFinite(niftyClose) || niftyClose <= 0) {
        niftyClose = getAsOfBenchmarkClose(sortedNifty, c.time, asOfIndex);
      }

      if (isFinite(stockClose) && stockClose > 0 && isFinite(niftyClose) && niftyClose > 0) {
        rsData.push({ time: c.time, value: +(stockClose / niftyClose).toFixed(6) });
      }
    });

    if (!rsData.length) {
      console.warn('Relative Strength: no overlapping stock/NIFTY500 dates found.');
      return;
    }

    if (!panel.rsSeries) {
      panel.rsSeries = panel.rsChart.addLineSeries({
        color: '#00d4ff',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true
      });
    }
    panel.rsSeries.setData(rsData);
    panel.rsValueByTime = rsData;

    if (rsConfig.avgEnabled && rsData.length) {
      const len = Math.max(1, Number(rsConfig.avgLen) || 20);
      const avgData = [];
      let sum = 0;

      for (let i = 0; i < rsData.length; i++) {
        sum += rsData[i].value;
        if (i >= len) sum -= rsData[i - len].value;
        if (i >= len - 1) {
          avgData.push({
            time: rsData[i].time,
            value: +(sum / len).toFixed(6)
          });
        }
      }

      if (!panel.rsMASeries) {
        panel.rsMASeries = panel.rsChart.addLineSeries({
          color: rsConfig.avgColor,
          lineWidth: rsConfig.avgWidth,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false
        });
      } else {
        panel.rsMASeries.applyOptions({
          color: rsConfig.avgColor,
          lineWidth: rsConfig.avgWidth
        });
      }
      panel.rsMASeries.setData(avgData);
    } else if (panel.rsMASeries) {
      panel.rsChart.removeSeries(panel.rsMASeries);
      panel.rsMASeries = null;
    }

    panel.rsChart.applyOptions({
      localization: { priceFormatter: value => Number(value).toFixed(4) }
    });

    // Resize only. Do not fitContent here because that resets a user's horizontal pan.
    requestAnimationFrame(() => {
      try { panel.rsChart.resize(panel.rsChartContainerWidth || document.getElementById(`pane-rs-${panel.index}`)?.clientWidth || 0, document.getElementById(`pane-rs-${panel.index}`)?.clientHeight || 0); } catch(e){}
    });
  } catch(e) {
    console.error('Relative Strength error:', e);
  }
}

function updateRSIConfig(){
  rsiConfig.enabled = document.getElementById('rsi-en').checked;
  rsiConfig.len = parseInt(document.getElementById('rsi-len').value) || 14;
  rsiConfig.color = document.getElementById('rsi-color').value;
  rsiConfig.width = parseInt(document.getElementById('rsi-width').value) || 2;
  rsiMAConfig.enabled = document.getElementById('rsima-en').checked;
  rsiMAConfig.len = parseInt(document.getElementById('rsima-len').value) || 9;
  rsiMAConfig.color = document.getElementById('rsima-color').value;
  rsiMAConfig.width = parseInt(document.getElementById('rsima-width').value) || 1;
  rsiConfig.showThresholds = document.getElementById('rsi-thresh-en').checked;
  rsiConfig.upperVal = parseFloat(document.getElementById('rsi-upper').value) || 60;
  rsiConfig.lowerVal = parseFloat(document.getElementById('rsi-lower').value) || 40;
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
        color: cfg.color, lineWidth: cfg.width, priceLineVisible: false, lastValueVisible: false
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

function resetToDefaults(){
  document.getElementById('ema1-en').checked = false; document.getElementById('ema1-len').value = 9;
  document.getElementById('ema2-en').checked = false; document.getElementById('ema2-len').value = 21;
  document.getElementById('ema3-en').checked = false; document.getElementById('ema3-len').value = 55;
  document.getElementById('ema4-en').checked = false; document.getElementById('ema4-len').value = 200;
  document.getElementById('ema-env-en').checked = false;
  document.getElementById('candle-clr-en').checked = false;
  document.getElementById('ib-label-en').checked = false;
  document.getElementById('mcp-en').checked = false;
  document.getElementById('rsi-en').checked = false;
  document.getElementById('rsima-en').checked = false;
  document.getElementById('rsi-thresh-en').checked = false;
  document.getElementById('rs-en').checked = false;
  document.getElementById('rs-avg-en').checked = false;
  document.getElementById('ind-ppv').checked = true;
  document.getElementById('ind-tables').checked = true;

  document.getElementById('wtc-en').checked = false;
  document.getElementById('ema9sell-en').checked = false;
  document.getElementById('sellclimax-en').checked = false;
  document.getElementById('buyclimax-en').checked = false;
  document.getElementById('atr-ext-en').checked = false;

  currentScaleMode = 'log';
  const logBtn = document.getElementById('btn-scale-log'); const regBtn = document.getElementById('btn-scale-reg'); const pctBtn = document.getElementById('btn-scale-pct');
  if (logBtn) logBtn.classList.add('active'); if (regBtn) regBtn.classList.remove('active'); if (pctBtn) pctBtn.classList.remove('active');
  updateEMAConfig(); updateSmartBarConfig(); updateVolMAConfig(); updateRSIConfig(); updateRSConfig(); updateGapConfig(); updateMCPConfig(); updateATRExtConfig();
}

/* ============ MERGED INFO CARD (52W + EMAs + ATR + CIRCUIT BANDS + GSM SURVEILLANCE) ============ */
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

    // LOOKUP PRICE BAND & GSM SURVEILLANCE STAGE FROM CACHE
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
      <div class="info-card-footer">
        ATR(9) = ${atr.toFixed(2)} (${atrPct.toFixed(2)}%)
      </div>
    `;
  } catch(e){}
}

/* ============ VIEWPORT ZOOMING ============ */
function capturePanelView(panel) {
  if (!panel || !panel.priceChart) return null;
  try {
    const r = panel.priceChart.timeScale().getVisibleLogicalRange();
    if (!r || !isFinite(r.from) || !isFinite(r.to)) return null;
    return { from: Number(r.from), to: Number(r.to) };
  } catch(e) { return null; }
}

function restorePanelView(panel, data) {
  if (!panel || !data || !data.length || !panel._pendingViewState) return false;
  const saved = panel._pendingViewState;
  try {
    const oldLength = Math.max(1, panel._viewDataLength || data.length);
    const span = Math.max(1, saved.to - saved.from);
    const rightGap = Math.max(0, oldLength - 1 - saved.to);
    const newLast = data.length - 1;
    const to = newLast - rightGap;
    const from = to - span;
    if (to < 0) return false;
    const range = { from: Math.max(0, from), to: Math.min(newLast, to) };
    const applyRange = () => {
      try { panel.priceChart.timeScale().setVisibleLogicalRange(range); } catch(e){}
      try { panel.rsiChart.timeScale().setVisibleLogicalRange(range); } catch(e){}
      try { panel.rsChart.timeScale().setVisibleLogicalRange(range); } catch(e){}
    };
    // setData()/pane resizing can make Lightweight Charts recalculate its range
    // on the next frame. Apply the saved range immediately and once more after
    // layout settles so live refresh cannot snap the chart back to the last candle.
    applyRange();
    requestAnimationFrame(() => { applyRange(); requestAnimationFrame(applyRange); });
    panel._pendingViewState = null;
    panel._viewDataLength = data.length;
    panel._viewInitialized = true;
    return true;
  } catch(e) {
    panel._pendingViewState = null;
    return false;
  }
}

function zoomChart(multiplier){
  panelsArray.forEach(panel => {
    try {
      const ts = panel.priceChart.timeScale();
      const range = ts.getVisibleLogicalRange();
      if (!range) return;
      const center = (range.from + range.to) / 2;
      const half = Math.max(3, (range.to - range.from) * multiplier / 2);
      ts.setVisibleLogicalRange({ from: center - half, to: center + half });
      const next = ts.getVisibleLogicalRange();
      if (next) [panel.rsiChart, panel.rsChart].forEach(c => { try { c.timeScale().setVisibleLogicalRange(next); } catch(e){} });
    } catch(e){}
  });
}

function resetChartView(){
  panelsArray.forEach(panel => {
    try {
      panel._pendingViewState = null;
      panel._viewDataLength = null;
      const data = aggregate(panel.rawDailyCandles || [], panel.interval);
      applyRangeToPanel(panel, data, true);
    } catch(e){}
  });
}

function applyRangeToPanel(panel, data, forceFit=false) {
  if (!panel || !data || !data.length) return;
  if (currentRange === 'ALL') {
    if (forceFit || !panel._viewInitialized) {
      try {
        panel.priceChart.timeScale().fitContent();
        const r = panel.priceChart.timeScale().getVisibleLogicalRange();
        if (r) [panel.rsiChart, panel.rsChart].forEach(c => { try { c.timeScale().setVisibleLogicalRange(r); } catch(e){} });
      } catch(e){}
      panel._viewInitialized = true;
      panel._viewDataLength = data.length;
    }
    return;
  }
  let bars = data.length;
  if (currentRange === '1M') bars = 22;
  else if (currentRange === '3M') bars = 65;
  else if (currentRange === '6M') bars = 130;
  else if (currentRange === '1Y') bars = 252;
  try {
    const range = { from: Math.max(0, data.length - bars), to: data.length - 1 };
    panel.priceChart.timeScale().setVisibleLogicalRange(range);
    [panel.rsiChart, panel.rsChart].forEach(c => { try { c.timeScale().setVisibleLogicalRange(range); } catch(e){} });
    panel._viewInitialized = true;
    panel._viewDataLength = data.length;
  } catch(e){}
}

function setRange(range, btn){
  currentRange = range;
  btn.parentElement.querySelectorAll('.tbtn').forEach(b=>{ if(['1M','3M','6M','1Y','All'].includes(b.textContent)) b.classList.remove('active'); });
  btn.classList.add('active');
  panelsArray.forEach(p => {
    p._pendingViewState = null;
    p._viewDataLength = null;
    applyRangeToPanel(p, aggregate(p.rawDailyCandles, p.interval), true);
  });
}

function toggleVolume(btn){
  volVisible = !volVisible; btn.classList.toggle('active');
  if (currentSymbol) rebuildAllPanels();
}

function openIndicatorsModal(){ document.getElementById('ind-modal').classList.add('open'); }
function closeIndicatorsModal(){ document.getElementById('ind-modal').classList.remove('open'); }

function toggleIndicator(key){
  if (key === 'candleClr') activeIndicators.candleClr = document.getElementById('candle-clr-en').checked;
  else if (key === 'ibLabel') activeIndicators.ibLabel = document.getElementById('ib-label-en').checked;
  else if (key === 'ema9Sell') activeIndicators.ema9Sell = document.getElementById('ema9sell-en').checked;
  else if (key === 'sellClimax') activeIndicators.sellClimax = document.getElementById('sellclimax-en').checked;
  else if (key === 'buyClimax') activeIndicators.buyClimax = document.getElementById('buyclimax-en').checked;
  else if (key === 'wtc') activeIndicators.wtc = document.getElementById('wtc-en').checked;
  else if (key === 'ppv') activeIndicators.ppv = document.getElementById('ind-ppv').checked;
  else if (key === 'tables') activeIndicators.tables = document.getElementById('ind-tables').checked;
  else activeIndicators[key] = !activeIndicators[key];

  if (currentSymbol) rebuildAllPanels();
}

/* ============ LIVE PRICE POLLING & ALERTS CHECK ============ */
function isLikelyMarketHours(){
  const now = new Date(); const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const ist = new Date(istString); const mins = ist.getHours()*60 + ist.getMinutes();
  return mins >= (9*60+15) && mins <= (15*60+30);
}

function startLivePoll(){
  if (!isLikelyMarketHours()) { isLiveActive = false; return; }
  isLiveActive = true; updateHeader(); pollLiveOnce();
  livePollTimer = setInterval(pollLiveOnce, LIVE_POLL_MS);
}

function stopLivePoll(){
  isLiveActive = false;
  if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null; }
}

async function pollLiveOnce(){
  if (!currentSymbol) return;
  if (!isLikelyMarketHours()){ stopLivePoll(); updateHeader(); return; }
  try{
    const res = await fetch(`${CHARTS_API_URL}?action=getLive&symbol=${encodeURIComponent(currentSymbol)}`);
    const data = await res.json();
    if (data.error || typeof data.price !== 'number') return;
    applyLivePrice(data.price);
  }catch(e){}
}

function applyLivePrice(price){
  const primary = panelsArray[0];
  if (!primary || !primary.rawDailyCandles || !primary.rawDailyCandles.length) return;
  const p = Number(price); if (isNaN(p) || p <= 0) return;
  const last = primary.rawDailyCandles[primary.rawDailyCandles.length-1];
  const today = new Date().toISOString().slice(0,10);

  if (last.time === today){
    last.close = p; last.high = Math.max(Number(last.high || p), p); last.low = Math.min(Number(last.low || p), p);
  } else {
    primary.rawDailyCandles.push({ time: today, open: last.close, high: Math.max(last.close, p), low: Math.min(last.close, p), close: p, volume: 0 });
  }
  
  checkPriceAlerts(currentSymbol, p);
  updateHeader();
  // Live refresh must never change the user's horizontal study position.
  // Capture it before rebuilding because the live candle/indicators are redrawn.
  const savedViews = panelsArray.map(panel => ({
    panel,
    view: capturePanelView(panel),
    length: panel.rawDailyCandles ? aggregate(panel.rawDailyCandles, panel.interval).length : 0
  }));
  rebuildAllPanels().then(() => {
    panelsArray.forEach(panel => {
      const saved = savedViews.find(x => x.panel === panel);
      if (!saved || !saved.view) return;
      panel._pendingViewState = saved.view;
      panel._viewDataLength = saved.length || panel._viewDataLength || 1;
      const data = aggregate(panel.rawDailyCandles || [], panel.interval);
      if (data.length) restorePanelView(panel, data);
    });
  }).catch(() => {});
}

/* ============ INIT START ============ */
initSystem();
loadSymbolList();
bootstrapFastData();
