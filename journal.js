const BROKERAGE = 40;
let PORTFOLIO_CAPITAL = 300000;
let analyticsTimeframe = "1M";

window.journalUserRole = window.journalUserRole || 'free';
window.sellProfitTargets = window.sellProfitTargets || {};

// -------------------- Capital Management --------------------
function editPortfolioCapital(){ 
  const current = PORTFOLIO_CAPITAL; 
  const raw = prompt("Enter total portfolio capital (₹):", String(current)); 
  if(raw === null) return; 
  const n = Number(String(raw).replace(/[,₹\s]/g,"")); 
  if(!Number.isFinite(n) || n <= 0){ showToast("Enter a valid capital amount.", true); return; } 
  PORTFOLIO_CAPITAL = n; 
  const uid = window.journalUser?.uid || "guest"; 
  try { localStorage.setItem("mickkk_portfolio_capital_" + uid, String(n)); } catch(e){} 
  updateCapitalDisplay(); 
  renderPositionsTable(); 
  renderPerformanceMetrics(); 
  renderAnalyticsView(); 
  showToast("Portfolio capital updated.");
}

function updateCapitalDisplay(){
  const e = document.getElementById("portfolioCapitalDisplay");
  if(e) e.textContent = "₹" + PORTFOLIO_CAPITAL.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// -------------------- Performance Timeframe (Free Lock) --------------------
function handlePerformanceTimeframe(tf) {
  if (window.journalUserRole !== 'pro' && tf !== '1M') {
    openProModal();
    return;
  }
  setAnalyticsTimeframe(tf);
}

function setAnalyticsTimeframe(tf){
  analyticsTimeframe = tf;
  document.querySelectorAll(".timeframe-btn").forEach(b => {
    const on = b.dataset.timeframe === tf;
    b.classList.toggle("bg-emerald-500", on);
    b.classList.toggle("text-white", on);
    b.classList.toggle("border-emerald-500", on);
  });
  renderPerformanceMetrics();
  renderAnalyticsView();
}

function timeframeTrades(list){
  const now = new Date();
  let start = null;
  if(analyticsTimeframe === "1M") start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  else if(analyticsTimeframe === "3M") start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  else if(analyticsTimeframe === "1Y") start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  else if(analyticsTimeframe === "YTD") start = new Date(now.getFullYear(), 0, 1);
  if(!start) return list;
  return list.filter(t => {
    const d = new Date(isoDate(t.xdate || t.edate) + "T12:00:00");
    return !isNaN(d) && d >= start;
  });
}

function handleComputeMFEMAE() {
  if (window.journalUserRole !== 'pro') {
    openProModal();
    return;
  }
  computeMFEMAEForTrades();
}

async function computeMFEMAEForTrades(){
  const eligible = trades.filter(t => outcome(t) !== 'OPEN' && t.symbol && safeNum(t.entry) > 0 && isoDate(t.edate) && isoDate(t.xdate));
  if(!eligible.length){ showToast('Closed trades with symbol, entry price, entry date and exit date required.', true); return; }
  const btns = [...document.querySelectorAll('button[onclick="handleComputeMFEMAE()"], #btnComputeMFEToolbar')];
  btns.forEach(b => { b.disabled = true; b.dataset.oldText = b.innerText; b.innerText = 'Computing…'; });
  let updated = 0, failed = 0;
  try {
    for(let i = 0; i < eligible.length; i++){
      const t = eligible[i];
      try {
        const result = await requestHistoricalExcursion(t);
        if(result && result.success && Number.isFinite(Number(result.mfePct)) && Number.isFinite(Number(result.maePct))){
          t.mfe = Number(result.mfePct).toFixed(2);
          t.mae = Number(result.maePct).toFixed(2);
          await window.journalStore.saveTrade(t);
          updated++;
        } else failed++;
      } catch(e){ failed++; console.warn('MFE/MAE failed for', t.symbol, e); }
    }
    renderTradesTable(); computeMFEMAE(); renderAnalyticsCharts();
    showToast(`MFE/MAE updated for ${updated} trades${failed ? `; ${failed} unavailable` : ''}.`, failed > 0 && updated === 0);
  } finally {
    btns.forEach(b => { b.disabled = false; b.innerText = b.dataset.oldText || 'Compute MFE/MAE'; });
  }
}

function requestHistoricalExcursion(t){
  return new Promise((resolve, reject) => {
    if(!LTP_WEB_APP_URL) return reject(new Error('Apps Script URL missing'));
    const callback = 'mfeCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const params = new URLSearchParams({ action:'mfe', symbol:String(t.symbol).toUpperCase(), entry:String(safeNum(t.entry)), direction:t.dir || 'B', entryDate:isoDate(t.edate), exitDate:isoDate(t.xdate), callback });
    const script = document.createElement('script');
    let finished = false;
    const cleanup = () => { if(finished) return; finished = true; clearTimeout(timer); delete window[callback]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Apps Script timeout')); }, 45000);
    window[callback] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error('Apps Script request failed')); };
    script.src = LTP_WEB_APP_URL + '?' + params.toString();
    document.head.appendChild(script);
  });
}

// -------------------- Stores & Globals --------------------
let trades = [];
let watchlist = [];
let ltpCache = {};
let chartInstances = {};
let activeFilter = 'all';
let sortField = 'edate';
let sortAsc = false;
let currentPage = 1;
const PAGE_SIZE = 50;
const LTP_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwTO-Cu6ZFADy0HS563bj73xXuV49dFQo5leiOVQcUahGU0AYIZv0TMdfk9Fh6qlLdumQ/exec";
let ltpLastUpdated = null;

function populateNSETickerList() {
  const list = document.getElementById("nseTickerList");
  const items = (typeof NSE_TICKERS !== "undefined" && Array.isArray(NSE_TICKERS)) ? NSE_TICKERS : (Array.isArray(window.NSE_TICKERS) ? window.NSE_TICKERS : []);
  if (!list || !items.length) return;
  list.innerHTML = items.map(row => `<option value="${String(row[0]).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" label="${String(row[1]).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></option>`).join("");
}

function tickerCompanyName(symbol) {
  const rows = (typeof NSE_TICKERS !== "undefined" && Array.isArray(NSE_TICKERS)) ? NSE_TICKERS : [];
  const key = String(symbol || "").trim().toUpperCase();
  const found = rows.find(row => String(row[0]).toUpperCase() === key);
  return found ? found[1] : "";
}

function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  const icon = document.getElementById("toastIcon");
  const text = document.getElementById("toastMsg");
  if (!toast) return;
  text.innerText = msg;
  icon.setAttribute("data-lucide", isError ? "alert-triangle" : "check-circle");
  icon.className = `w-4 h-4 ${isError ? 'text-rose-400' : 'text-emerald-400'}`;
  toast.classList.remove("translate-y-20", "opacity-0");
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { toast.classList.add("translate-y-20", "opacity-0"); }, 3500);
}

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
  renderPerformanceCharts();
}

function syncThemeIcons(isDark) {
  const sunIconSide = document.getElementById("sunIconSide");
  const moonIconSide = document.getElementById("moonIconSide");
  const sunIconMini = document.getElementById("sunIconMini");
  const moonIconMini = document.getElementById("moonIconMini");
  if (sunIconSide) sunIconSide.classList.toggle("hidden", isDark);
  if (moonIconSide) moonIconSide.classList.toggle("hidden", !isDark);
  if (sunIconMini) sunIconMini.classList.toggle("hidden", isDark);
  if (moonIconMini) moonIconMini.classList.toggle("hidden", !isDark);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
  const targetPane = document.getElementById("pane-" + tabId);
  if (targetPane) targetPane.classList.remove("hidden");

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.className = "tab-btn px-4 py-2 rounded-xl bg-white dark:bg-cardDark text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-borderDark hover:text-emerald-500 flex items-center gap-2 transition-all cursor-pointer";
  });

  const activeBtn = document.getElementById("tab-btn-" + tabId);
  if (activeBtn) {
    activeBtn.className = "tab-btn px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500 flex items-center gap-2 transition-all font-bold cursor-pointer";
  }

  if (tabId === 'positions') renderPositionsTable();
  if (tabId === 'trades') renderTradesTable();
  if (tabId === 'performance') renderPerformanceMetrics();
  if (tabId === 'analytics') renderAnalyticsView();
  if (tabId === 'watchlist') renderWatchlist();
  if (tabId === 'tools') { runSizingCalc(); runRLadder(); }
}

function updateUserHeaderBadge() {
  const user = window.journalUser || null;
  if (!user) return;
  const email = user.email || "";
  const display = user.displayName || (email ? email.split("@")[0] : "Trader");
  
  const btnLabel = document.getElementById("btnAccountEmail");
  const userNameLabel = document.getElementById("userNameLabel");
  const badge = document.getElementById("userInitialBadge");
  const avatarMini = document.getElementById("sideUserAvatarMini");

  if (btnLabel) btnLabel.innerText = email || display;
  if (userNameLabel) userNameLabel.innerText = display;
  if (badge) {
    if (user.photoURL) {
      badge.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="w-full h-full object-cover" referrerpolicy="no-referrer" />`;
    } else {
      badge.innerText = display.charAt(0).toUpperCase();
    }
  }
  if (avatarMini) {
    if (user.photoURL) {
      avatarMini.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="w-full h-full object-cover" referrerpolicy="no-referrer" />`;
    } else {
      avatarMini.innerText = display.charAt(0).toUpperCase();
    }
  }
}

// -------------------- Pro vs Free Visual Rules --------------------
function applyJournalRoleRules(role) {
  window.journalUserRole = role || 'free';
  const isPro = (window.journalUserRole === 'pro');

  const tierBadge = document.getElementById('tierBadge');
  const sidePlanBadge = document.getElementById('sidePlanBadge');
  const sideUpgradeLink = document.getElementById('sideUpgradeLink');
  const sideCollapsedWrap = document.getElementById('sideCollapsedUserWrap');
  const sidePlanDotMini = document.getElementById('sidePlanDotMini');
  const perfChartsOverlay = document.getElementById('perfChartsLockOverlay');
  const analyticsOverlay = document.getElementById('analyticsLockOverlay');
  const analyticsWrap = document.getElementById('analyticsContentWrap');
  const proIcons = document.querySelectorAll('.pro-lock-icon');
  const proColLocks = document.querySelectorAll('.pro-col-lock');
  const computeLockBadge = document.getElementById('computeLockBadge');

  if (isPro) {
    if (tierBadge) {
      tierBadge.innerText = 'PRO INSTITUTIONAL ⚡';
      tierBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
    }
    if (sidePlanBadge) {
      sidePlanBadge.innerText = 'Pro Plan ⚡';
      sidePlanBadge.className = 'text-[9px] font-bold text-emerald-500 uppercase tracking-wider truncate';
    }
    if (sideUpgradeLink) sideUpgradeLink.style.display = 'none';
    if (sideCollapsedWrap) sideCollapsedWrap.setAttribute('data-title', 'Plan: Pro Institutional ⚡');
    if (sidePlanDotMini) sidePlanDotMini.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-cardDark absolute -top-1 -right-1';

    if (perfChartsOverlay) perfChartsOverlay.style.display = 'none';
    if (analyticsOverlay) analyticsOverlay.style.display = 'none';
    if (analyticsWrap) analyticsWrap.classList.remove('row-locked-blur');
    proIcons.forEach(ic => ic.style.display = 'none');
    proColLocks.forEach(l => l.style.display = 'none');
    if (computeLockBadge) computeLockBadge.style.display = 'none';
  } else {
    if (tierBadge) {
      tierBadge.innerText = 'Starter • Free Plan';
      tierBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20';
    }
    if (sidePlanBadge) {
      sidePlanBadge.innerText = 'Starter • Free';
      sidePlanBadge.className = 'text-[9px] font-bold text-amber-500 truncate';
    }
    if (sideUpgradeLink) sideUpgradeLink.style.display = 'inline';
    if (sideCollapsedWrap) sideCollapsedWrap.setAttribute('data-title', 'Plan: Free (Upgrade to Pro)');
    if (sidePlanDotMini) sidePlanDotMini.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white dark:border-cardDark absolute -top-1 -right-1';

    if (perfChartsOverlay) perfChartsOverlay.style.display = 'flex';
    if (analyticsOverlay) analyticsOverlay.style.display = 'flex';
    if (analyticsWrap) analyticsWrap.classList.add('row-locked-blur');
    proIcons.forEach(ic => ic.style.display = 'inline');
    proColLocks.forEach(l => l.style.display = 'inline');
    if (computeLockBadge) computeLockBadge.style.display = 'inline';
  }

  renderTradesTable();
}

function openProModal() {
  const m = document.getElementById('proModal');
  if (m) m.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeProModal() {
  const m = document.getElementById('proModal');
  if (m) m.classList.add('hidden');
}

function openWhatsAppTrialModal() {
  const myWhatsAppNumber = "917086054184";
  const user = window.journalUser;
  const emailText = user?.email ? ` for my email: ${user.email}` : "";
  const msg = encodeURIComponent(`Hi Mickkk Team! Please activate my 7-day Pro Free Trial${emailText}.`);
  window.open(`https://wa.me/${myWhatsAppNumber}?text=${msg}`, '_blank');
  closeProModal();
}

async function signOutJournal() {
  if (!window.journalAuth?.signOut) { showToast("Signing out...", true); return; }
  try { await window.journalAuth.signOut(); window.location.href = "index.html"; }
  catch (err) { console.error(err); showToast("Could not sign out.", true); }
}

function userTradeCacheKey() { return `mickkk_journal_trades_${window.journalUser?.uid || "guest"}`; }
function userWatchCacheKey() { return `mickkk_journal_watchlist_${window.journalUser?.uid || "guest"}`; }
function cacheTrades() { try { localStorage.setItem(userTradeCacheKey(), JSON.stringify(trades)); } catch (e) {} }
function cacheWatchlist() { try { localStorage.setItem(userWatchCacheKey(), JSON.stringify(watchlist)); } catch (e) {} }

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatDate(v) {
  if (!v) return '-';
  const raw = String(v);
  const d = new Date(raw.length === 10 ? raw + 'T00:00:00' : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

function isoDate(v) {
  if (!v) return '';
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(v).slice(0,10);
  return d.toISOString().slice(0,10);
}

function getPartialExits(t) {
  let p = t && t.partialExits;
  if (!p) return [];
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch(e) { return []; }
  }
  return Array.isArray(p) ? p.filter(x => safeNum(x.qty) > 0 && safeNum(x.price) > 0) : [];
}

function partialQty(t) {
  return getPartialExits(t).reduce((s, x) => s + safeNum(x.qty), 0);
}

function remainingQty(t) {
  return Math.max(0, safeNum(t.qty) - partialQty(t));
}

function partialPnL(t) {
  return getPartialExits(t).reduce((sum, x) => {
    const q = safeNum(x.qty), px = safeNum(x.price), entry = safeNum(t.entry);
    return sum + (t.dir === 'B' ? (px - entry) : (entry - px)) * q;
  }, 0);
}

function isClosed(t) {
  const rem = remainingQty(t);
  return rem <= 0.000001 || (!!t.exit && rem <= 0.000001) || (!!t.exit && !getPartialExits(t).length);
}

function calcPnL(t) {
  if (!t) return null;
  const partials = getPartialExits(t);
  const rem = remainingQty(t);
  let gross = partialPnL(t);
  if (t.exit && rem > 0) {
    gross += (t.dir === 'B' ? (safeNum(t.exit) - safeNum(t.entry)) : (safeNum(t.entry) - safeNum(t.exit))) * rem;
  }
  if (!t.exit && !partials.length) return null;
  const brokerageCount = Math.max(1, partials.length + (t.exit && rem > 0 ? 1 : 0));
  return gross - BROKERAGE * brokerageCount;
}

function outcome(t) {
  if (!isClosed(t)) return 'OPEN';
  const p = calcPnL(t);
  return p > 0 ? 'WIN' : (p < 0 ? 'LOSS' : 'BE');
}

function plannedRiskAmount(t) {
  const explicit = safeNum(t.plannedRisk);
  if (explicit > 0) return explicit;
  if (t.sl && t.entry && t.qty) return Math.abs(safeNum(t.entry) - safeNum(t.sl)) * safeNum(t.qty);
  return 0;
}

function rMultiple(t) {
  const risk = plannedRiskAmount(t);
  const pnl = calcPnL(t);
  return risk > 0 && pnl !== null ? pnl / risk : null;
}

function holdingDays(t) {
  const start = isoDate(t.edate);
  const end = isoDate(t.xdate || t.exitDate || t.edate);
  if (!start || !end) return 0;
  const a = new Date(start + 'T00:00:00'), b = new Date(end + 'T00:00:00');
  return Math.max(0, Math.round((b - a) / 86400000));
}

function monthKey(t) {
  const d = isoDate(t.xdate || t.edate);
  return d ? d.slice(0,7) : 'Unknown';
}

function monthLabel(key) {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [y,m] = key.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-GB',{month:'short',year:'numeric'});
}

function weekdayLabel(t) {
  const d = isoDate(t.xdate || t.edate);
  if (!d) return 'Unknown';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US',{weekday:'short'});
}

function patternOf(t) {
  return t.setup || t.pattern || 'No Pattern';
}

function destroyChart(key) {
  if (chartInstances[key]) {
    try { chartInstances[key].destroy(); } catch(e) {}
    delete chartInstances[key];
  }
}

function makeChart(id, key, type, labels, datasets, extraOptions = {}) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(id);
  if (!canvas) return;
  destroyChart(key);
  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const base = {
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index', intersect:false},
    plugins:{legend:{display: datasets.length > 1, labels:{color:textColor,font:{size:10}}}, tooltip:{mode:'index',intersect:false}},
    scales:{
      x:{grid:{color:gridColor},ticks:{color:textColor,maxTicksLimit:8,font:{size:9}}},
      y:{grid:{color:gridColor},ticks:{color:textColor,font:{size:9}}}
    }
  };
  const options = {...base, ...extraOptions, plugins:{...base.plugins,...(extraOptions.plugins||{})}, scales:{...base.scales,...(extraOptions.scales||{})}};
  chartInstances[key] = new Chart(canvas,{type,data:{labels,datasets},options});
}

function lineDataset(label,data,borderColor,fillColor){
  return {label,data,borderColor,backgroundColor:fillColor || 'transparent',fill:!!fillColor,tension:.28,pointRadius:0,borderWidth:2};
}

function barDataset(label,data,positive='#10b981',negative='#ef4444'){
  return {label,data,backgroundColor:data.map(v => v >= 0 ? positive : negative),borderRadius:4};
}

async function loadTrades() {
  try {
    const user = await window.journalStoreReady;
    if (!user || !window.journalStore) throw new Error("No authenticated account");
    trades = await window.journalStore.listTrades();
    cacheTrades();
  } catch (err) {
    console.error("Could not load cloud trades:", err);
    try { const cached = localStorage.getItem(userTradeCacheKey()); if (cached) trades = JSON.parse(cached); } catch (e) {}
  }
  renderPositionsTable();
  renderTradesTable();
  renderPerformanceMetrics();
  renderAnalyticsView();
}

async function loadWatchlist() {
  try {
    await window.journalStoreReady;
    watchlist = await window.journalStore.listWatchlist();
    cacheWatchlist();
  } catch (err) {
    console.error("Could not load cloud watchlist:", err);
    try { const cached = localStorage.getItem(userWatchCacheKey()); if (cached) watchlist = JSON.parse(cached); } catch (e) {}
  }
  renderWatchlist();
}

// -------------------- Positions Dashboard (Restored Actions) --------------------
function renderPositionsTable() {
  try { 
    const uid = window.journalUser?.uid; 
    const saved = uid && localStorage.getItem("mickkk_portfolio_capital_" + uid); 
    if(saved && Number(saved) > 0) PORTFOLIO_CAPITAL = Number(saved); 
  } catch(e){} 
  updateCapitalDisplay();

  const open = trades.filter(t => outcome(t) === 'OPEN');
  const closed = trades.filter(t => outcome(t) !== 'OPEN');

  const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setKpi("kpi-open-count", open.length);
  setKpi("kpi-lots-count", `${open.length} Active Lots`);

  const riskFreeCount = open.filter(t => {
    const sl = safeNum(t.trailingSL || t.sl);
    return sl && (t.dir === 'B' ? sl >= safeNum(t.entry) : sl <= safeNum(t.entry));
  }).length;
  setKpi("kpi-riskfree-count", riskFreeCount);

  const invested = open.reduce((sum,t) => sum + safeNum(t.entry) * remainingQty(t), 0);
  setKpi("kpi-cap-invested", `${((invested / PORTFOLIO_CAPITAL) * 100).toFixed(1)}%`);
  setKpi("kpi-cap-deployed-val", `₹${invested.toLocaleString('en-IN',{maximumFractionDigits:0})} deployed`);

  let totalUnreal = 0, pricedPositions = 0;
  open.forEach(t => {
    const rawLtp = ltpCache[String(t.symbol || "").toUpperCase()];
    const ltp = Number(rawLtp);
    if (Number.isFinite(ltp) && ltp > 0) {
      totalUnreal += (t.dir === 'B' ? ltp - safeNum(t.entry) : safeNum(t.entry) - ltp) * remainingQty(t);
      pricedPositions++;
    }
  });
  const unrealEl = document.getElementById("kpi-unreal-pnl");
  if (unrealEl) {
    unrealEl.innerText = open.length && !pricedPositions ? "—" : `${totalUnreal >= 0 ? '+₹' : '-₹'}${Math.abs(totalUnreal).toFixed(0)}`;
    unrealEl.className = `text-xl font-black font-mono-num mt-1 ${totalUnreal >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;
  }

  const realGain = closed.reduce((sum,t) => sum + (calcPnL(t) || 0), 0);
  const realEl = document.getElementById("kpi-real-pnl");
  if (realEl) {
    realEl.innerText = `${realGain >= 0 ? '+₹' : '-₹'}${Math.abs(realGain).toFixed(0)}`;
    realEl.className = `text-xl font-black font-mono-num mt-1 ${realGain >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;
  }

  const tbody = document.getElementById("positionsTbody");
  if (!tbody) return;
  if (!open.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="py-8 text-center text-slate-400">No open positions. Click "Log Trade" above to deploy capital.</td></tr>`;
    return;
  }

  tbody.innerHTML = open.map(t => {
    const rawLtp = ltpCache[String(t.symbol||"").toUpperCase()], ltp = Number(rawLtp), hasLtp = Number.isFinite(ltp) && ltp > 0;
    const rem = remainingQty(t), investedVal = safeNum(t.entry) * rem, unreal = hasLtp ? (t.dir === 'B' ? ltp - safeNum(t.entry) : safeNum(t.entry) - ltp) * rem : null;
    const activeSL = safeNum(t.trailingSL || t.sl), riskVal = activeSL ? Math.abs(safeNum(t.entry) - activeSL) * rem : null, riskPct = riskVal !== null ? (riskVal / PORTFOLIO_CAPITAL) * 100 : null;
    const rr = (activeSL && t.target && safeNum(t.entry) !== activeSL) ? Math.abs(safeNum(t.target) - safeNum(t.entry)) / Math.abs(safeNum(t.entry) - activeSL) : null;
    const targetProfit = Number(window.sellProfitTargets?.[t.id] || 0), perShare = hasLtp ? (t.dir === 'B' ? ltp - safeNum(t.entry) : safeNum(t.entry) - ltp) : 0;
    const sellQty = targetProfit > 0 && perShare > 0 ? Math.min(rem, Math.ceil(targetProfit / perShare)) : 0;

    return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="py-2.5 px-3"><span class="font-bold text-blue-600 dark:text-blue-400 font-mono-num">${t.symbol}</span><span class="ml-1 text-[9px] font-black px-1.5 py-0.5 rounded ${t.dir==='B'?'bg-emerald-50 text-emerald-500':'bg-rose-50 text-rose-500'}">${t.dir==='B'?'LONG':'SHORT'}</span></td>
      <td class="py-2.5 px-2 text-center text-slate-400 whitespace-nowrap">${formatDate(t.edate)}</td>
      <td class="py-2.5 px-2 text-right font-mono-num font-bold">${rem.toLocaleString()}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">₹${safeNum(t.entry).toFixed(2)}</td>
      <td class="py-2.5 px-2 text-right font-mono-num font-bold text-slate-800 dark:text-white">${hasLtp ? '₹' + ltp.toFixed(2) : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num text-amber-500">${activeSL ? '₹' + activeSL.toFixed(2) : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">₹${investedVal.toLocaleString('en-IN',{maximumFractionDigits:0})}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${riskPct !== null ? riskPct.toFixed(2) + '%' : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${rr ? rr.toFixed(2) + 'R' : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num font-bold ${unreal === null ? 'text-slate-400' : unreal >= 0 ? 'text-emerald-500' : 'text-rose-500'}">${unreal === null ? '—' : `${unreal >= 0 ? '+' : ''}₹${unreal.toFixed(0)}`}</td>
      <td class="py-2.5 px-2 text-right">
        <input type="number" min="0" step="100" value="${targetProfit || ''}" placeholder="₹ profit" onchange="setSellProfitTarget('${t.id}',this.value)" class="w-20 p-1 rounded bg-transparent border border-slate-200 dark:border-borderDark text-right text-[11px] font-mono-num"/>
        <div class="text-[10px] text-slate-400">${sellQty ? `${sellQty} qty` : '—'}</div>
      </td>
      <td class="py-2.5 px-3 text-center">
        <div class="flex items-center justify-center gap-1">
          <button onclick="editTrade('${t.id}')" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-500" title="Edit"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
          <button onclick="trailStopLoss('${t.id}')" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-amber-500" title="Trail SL"><i data-lucide="shield-check" class="w-3.5 h-3.5"></i></button>
          <button onclick="pyramidPosition('${t.id}')" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-blue-500" title="Pyramid Add-on"><i data-lucide="layers" class="w-3.5 h-3.5"></i></button>
          <button onclick="partialExitPosition('${t.id}')" class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-purple-500" title="Partial Exit"><i data-lucide="split" class="w-3.5 h-3.5"></i></button>
          <button onclick="deleteTrade('${t.id}')" class="p-1 rounded hover:text-rose-500 text-slate-400" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

function setSellProfitTarget(id, value){
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0){ showToast("Enter a valid target profit amount.", true); return; }
  window.sellProfitTargets[id] = n;
  renderPositionsTable();
}

// Quick Position Actions (Restored)
async function trailStopLoss(id){
  const t = trades.find(x => String(x.id) === String(id));
  if(!t) return;
  const current = safeNum(t.trailingSL || t.sl);
  const raw = prompt("Enter new trailing stop-loss price (₹):", current || "");
  if(raw === null) return;
  const n = Number(raw);
  if(!Number.isFinite(n) || n <= 0){ showToast("Enter a valid stop-loss price.", true); return; }
  const old = { ...t };
  t.trailingSL = n;
  try {
    await window.journalStore.saveTrade(t);
    renderPositionsTable();
    renderTradesTable();
    showToast("Trailing SL saved successfully!");
  } catch(e){
    Object.assign(t, old);
    showToast("Could not save trailing SL.", true);
  }
}

function pyramidPosition(id){
  const t = trades.find(x => String(x.id) === String(id));
  if(!t) return;
  openTradeModal();
  document.getElementById("fSym").value = t.symbol;
  document.getElementById("fDir").value = t.dir || "B";
  document.getElementById("fType").value = t.type || "Swing";
  document.getElementById("fPyramidGroup").value = t.pyramidGroup || ("PYR_" + t.symbol + "_" + Date.now());
  document.getElementById("fPyramidLeg").value = (safeNum(t.pyramidLeg) || 1) + 1;
  document.getElementById("tradeModalTitle").innerText = "Add Pyramid Leg";
  document.getElementById("fTradeId").value = "";
  document.getElementById("fNotes").value = "Pyramid leg for " + t.symbol + ". " + (t.notes || "");
  showToast("Enter quantity and entry price, then save pyramid leg.");
}

async function partialExitPosition(id){
  const t = trades.find(x => String(x.id) === String(id));
  if(!t) return;
  const rem = remainingQty(t);
  const rawQ = prompt("Remaining quantity: " + rem + "\nEnter quantity to exit:", "");
  if(rawQ === null) return;
  const q = Number(rawQ);
  if(!Number.isInteger(q) || q <= 0 || q > rem){ showToast("Enter quantity between 1 and " + rem, true); return; }
  const rawP = prompt("Enter actual exit price (₹):", ltpCache[String(t.symbol).toUpperCase()] || "");
  if(rawP === null) return;
  const price = Number(rawP);
  if(!Number.isFinite(price) || price <= 0){ showToast("Enter a valid exit price.", true); return; }
  const old = { ...t, partialExits: getPartialExits(t).slice() };
  t.partialExits = [...getPartialExits(t), { qty: q, price, date: new Date().toISOString().slice(0, 10) }];
  if(remainingQty(t) === 0){
    t.exit = price;
    t.xdate = new Date().toISOString().slice(0, 10);
  }
  try {
    await window.journalStore.saveTrade(t);
    renderPositionsTable();
    renderTradesTable();
    renderPerformanceMetrics();
    renderAnalyticsView();
    showToast("Partial exit recorded in journal.");
  } catch(e){
    Object.assign(t, old);
    showToast("Could not save partial exit.", true);
  }
}

// -------------------- Trades Log (Clean Alignment & Formatting) --------------------
function tradeMatchesSearch(t, search) {
  const hay = [t.symbol, t.notes, t.setup, t.pattern, t.pyramidGroup, t.type, t.dir].join(' ').toLowerCase();
  return hay.includes(search);
}

function renderTradeSummary() {
  const closed = trades.filter(t => outcome(t) !== 'OPEN');
  const wins = closed.filter(t => outcome(t) === 'WIN'), losses = closed.filter(t => outcome(t) === 'LOSS');
  const net = closed.reduce((s,t) => s + (calcPnL(t) || 0), 0);
  const grossWin = wins.reduce((s,t) => s + (calcPnL(t) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s,t) => s + (calcPnL(t) || 0), 0));
  const pf = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const avg = closed.length ? net / closed.length : 0;
  const rs = closed.map(rMultiple).filter(v => v !== null);
  const avgR = rs.length ? rs.reduce((a,b) => a + b, 0) / rs.length : 0;
  
  const set = (id, val, cls) => { const e = document.getElementById(id); if(e){ e.innerText = val; if(cls) e.className = cls; }};
  set('sum-total-trades', trades.length);
  set('sum-trade-sub', `${closed.length} closed / ${trades.length - closed.length} open`);
  set('sum-net-pnl', `${net >= 0 ? '+₹' : '-₹'}${Math.abs(net).toFixed(0)}`, `text-xl font-black font-mono-num mt-1 ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`);
  set('sum-win-rate', `${closed.length ? (wins.length / closed.length * 100).toFixed(1) : '0.0'}%`);
  set('sum-win-loss', `${wins.length} W / ${losses.length} L`);
  set('sum-profit-factor', Number.isFinite(pf) ? pf.toFixed(2) : '∞');
  set('sum-avg-pnl', `${avg >= 0 ? '+₹' : '-₹'}${Math.abs(avg).toFixed(0)}`, `text-xl font-black font-mono-num mt-1 ${avg >= 0 ? 'text-emerald-500' : 'text-rose-500'}`);
  set('sum-avg-r', `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R`);
}

function renderTradesTable() {
  const search = (document.getElementById("tradeSearchInput")?.value || "").toLowerCase().trim();
  let list = trades.filter(t => {
    const stat = outcome(t);
    return tradeMatchesSearch(t, search) && !(activeFilter === 'open' && stat !== 'OPEN') && !(activeFilter === 'win' && stat !== 'WIN') && !(activeFilter === 'loss' && stat !== 'LOSS');
  });

  list.sort((a,b) => {
    const val = t => sortField === 'pnl' ? (calcPnL(t) || 0) : isoDate(sortField === 'xdate' ? (t.xdate || '') : (t.edate || ''));
    const av = val(a), bv = val(b);
    return sortAsc ? String(av).localeCompare(String(bv), undefined, {numeric:true}) : String(bv).localeCompare(String(av), undefined, {numeric:true});
  });

  const tbody = document.getElementById("tradesTbody");
  if(!tbody) return;
  if(!list.length){
    tbody.innerHTML = `<tr><td colspan="23" class="py-8 text-center text-slate-400">No trades found matching criteria.</td></tr>`;
    renderTradeSummary();
    return;
  }

  const total = list.length, totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageList = list.slice(startIndex, startIndex + PAGE_SIZE);

  const isPro = (window.journalUserRole === 'pro');

  tbody.innerHTML = pageList.map(t => {
    const pnl = calcPnL(t), stat = outcome(t), ret = (safeNum(t.entry) && pnl !== null) ? pnl / (safeNum(t.entry) * safeNum(t.qty)) * 100 : null;
    const activeSL = safeNum(t.trailingSL || t.sl), rr = (activeSL && t.target && safeNum(t.entry) !== activeSL) ? Math.abs(safeNum(t.target) - safeNum(t.entry)) / Math.abs(safeNum(t.entry) - activeSL) : null;
    const risk = plannedRiskAmount(t), ltp = Number(ltpCache[String(t.symbol||'').toUpperCase()]), hasLtp = Number.isFinite(ltp) && ltp > 0;
    const mfePlus = safeNum(t.mfe) > 0 && pnl !== null && safeNum(t.entry) * safeNum(t.qty) > 0 ? ((pnl / (safeNum(t.entry) * safeNum(t.qty))) / safeNum(t.mfe)) * 100 : null;

    const mfeCell = isPro 
      ? `<td class="py-2.5 px-2 text-right font-mono-num text-emerald-500">${t.mfe !== '' && t.mfe !== undefined ? safeNum(t.mfe).toFixed(2) + '%' : '—'}</td>`
      : `<td class="py-2.5 px-2 text-right font-mono-num text-slate-400 row-locked-blur">🔒 0.0%</td>`;

    const maeCell = isPro 
      ? `<td class="py-2.5 px-2 text-right font-mono-num text-rose-500">${t.mae !== '' && t.mae !== undefined ? safeNum(t.mae).toFixed(2) + '%' : '—'}</td>`
      : `<td class="py-2.5 px-2 text-right font-mono-num text-slate-400 row-locked-blur">🔒 0.0%</td>`;

    const mfePlusCell = isPro 
      ? `<td class="py-2.5 px-2 text-right font-mono-num">${mfePlus !== null ? mfePlus.toFixed(1) + '%' : '—'}</td>`
      : `<td class="py-2.5 px-2 text-right font-mono-num text-slate-400 row-locked-blur">🔒 —</td>`;

    return `<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
      <td class="py-2.5 px-3 font-bold text-blue-600 dark:text-blue-400 font-mono-num">${t.symbol || '-'}</td>
      <td class="py-2.5 px-2 text-center text-slate-400">${t.type || 'Swing'}</td>
      <td class="py-2.5 px-2 text-center font-bold ${t.dir === 'B' ? 'text-emerald-500' : 'text-rose-500'}">${t.dir === 'B' ? 'BUY' : 'SELL'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">₹${safeNum(t.entry).toFixed(2)}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${t.exit ? '₹' + safeNum(t.exit).toFixed(2) : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num font-bold">${safeNum(t.qty).toLocaleString()}</td>
      <td class="py-2.5 px-2 text-right font-mono-num text-slate-500">₹${(safeNum(t.entry) * safeNum(t.qty)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
      <td class="py-2.5 px-2 text-center text-slate-400 whitespace-nowrap">${formatDate(t.edate)}</td>
      <td class="py-2.5 px-2 text-center text-slate-400 whitespace-nowrap">${formatDate(t.xdate)}</td>
      <td class="py-2.5 px-2 text-right font-mono-num font-bold ${pnl !== null ? (pnl >= 0 ? 'text-emerald-500' : 'text-rose-500') : 'text-slate-400'}">${pnl !== null ? (pnl >= 0 ? '+₹' : '-₹') + Math.abs(pnl).toFixed(0) : 'Open'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${ret !== null ? (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%' : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${rr ? rr.toFixed(2) + 'R' : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${PORTFOLIO_CAPITAL ? ((risk / PORTFOLIO_CAPITAL) * 100).toFixed(2) + '%' : '—'}</td>
      <td class="py-2.5 px-2 text-center"><span class="text-[9px] font-black px-1.5 py-0.5 rounded ${stat === 'WIN' ? 'bg-emerald-50 text-emerald-600' : stat === 'LOSS' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}">${stat}</span></td>
      <td class="py-2.5 px-2 text-right font-mono-num">${hasLtp ? '₹' + ltp.toFixed(2) : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${activeSL ? '₹' + activeSL.toFixed(2) : '—'}</td>
      <td class="py-2.5 px-2 text-right font-mono-num">${safeNum(t.target) ? '₹' + safeNum(t.target).toFixed(2) : '—'}</td>
      ${mfeCell}
      ${maeCell}
      ${mfePlusCell}
      <td class="py-2.5 px-3 max-w-xs truncate text-slate-500" title="${String(t.notes || '').replace(/"/g, '&quot;')}">${t.notes || '—'}</td>
      <td class="py-2.5 px-2 text-center">${t.chartLink ? `<a href="${t.chartLink}" target="_blank" rel="noopener" class="text-blue-500 hover:underline">📈</a>` : '—'}</td>
      <td class="py-2.5 px-3 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="editTrade('${t.id}')" class="p-1 hover:text-emerald-500 cursor-pointer" title="Edit"><i data-lucide="edit-3" class="w-3.5 h-3.5"></i></button>
          <button onclick="deleteTrade('${t.id}')" class="p-1 hover:text-rose-500 cursor-pointer" title="Delete"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const pager = document.getElementById('tradesPagination');
  if(pager){
    const from = total ? startIndex + 1 : 0, to = Math.min(startIndex + PAGE_SIZE, total);
    pager.innerHTML = `<span>Showing ${from}–${to} of ${total} trades</span>
      <div class="flex items-center gap-2">
        <button onclick="changeTradePage(-1)" ${currentPage <= 1 ? 'disabled' : ''} class="px-3 py-1 rounded border border-slate-200 dark:border-borderDark disabled:opacity-30 cursor-pointer">‹ Prev</button>
        <span>Page ${currentPage} / ${totalPages}</span>
        <button onclick="changeTradePage(1)" ${currentPage >= totalPages ? 'disabled' : ''} class="px-3 py-1 rounded border border-slate-200 dark:border-borderDark disabled:opacity-30 cursor-pointer">Next ›</button>
      </div>`;
  }

  renderTradeSummary();
  if(window.lucide) lucide.createIcons();
}

function changeTradePage(delta){
  currentPage = Math.max(1, currentPage + delta);
  renderTradesTable();
}

function setTradeFilter(f, btn){
  currentPage = 1; 
  activeFilter = f;
  document.querySelectorAll(".trade-filter-btn").forEach(b => b.className = "trade-filter-btn px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-borderDark hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer");
  btn.className = "trade-filter-btn px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-500 cursor-pointer";
  renderTradesTable();
}

function sortTrades(field){
  currentPage = 1; 
  if(sortField === field) sortAsc = !sortAsc; 
  else { sortField = field; sortAsc = true; }
  renderTradesTable();
}

// -------------------- Partial Exits --------------------
let partialExitDraft = [];
function renderPartialExitRows(){
  const box = document.getElementById('partialExitRows');
  if(!box) return;
  box.innerHTML = partialExitDraft.map((x,i) => `
    <div class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
      <input type="number" min="1" step="1" value="${safeNum(x.qty) || ''}" data-pe-qty="${i}" placeholder="Qty" class="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-borderDark font-mono-num text-xs">
      <input type="number" step="0.05" value="${safeNum(x.price) || ''}" data-pe-price="${i}" placeholder="Exit price" class="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-borderDark font-mono-num text-xs">
      <input type="date" value="${isoDate(x.date) || ''}" data-pe-date="${i}" class="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-borderDark text-xs">
      <button type="button" onclick="removePartialExitRow(${i})" class="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>
  `).join('');
  if(window.lucide) lucide.createIcons();
}

function syncPartialExitDraft(){
  partialExitDraft = partialExitDraft.map((x,i) => ({
    ...x,
    qty: safeNum(document.querySelector(`[data-pe-qty="${i}"]`)?.value),
    price: safeNum(document.querySelector(`[data-pe-price="${i}"]`)?.value),
    date: document.querySelector(`[data-pe-date="${i}"]`)?.value || ''
  }));
}

function addPartialExitRow(){
  syncPartialExitDraft();
  partialExitDraft.push({ qty:'', price:'', date:new Date().toISOString().slice(0,10) });
  renderPartialExitRows();
}

function removePartialExitRow(i){
  syncPartialExitDraft();
  partialExitDraft.splice(i,1);
  renderPartialExitRows();
}

// -------------------- Modal Actions --------------------
function openTradeModal(id = null){
  document.getElementById("tradeModalTitle").innerText = id ? "Edit Trade Log" : "Add New Trade Log";
  document.getElementById("fTradeId").value = id || "";
  
  if(id){
    const t = trades.find(x => String(x.id) === String(id));
    if(t){
      ['fSym','fQty','fEntry','fExit','fSL','fTarget','fTrailingSL','fPlannedRisk','fPyramidGroup','fPyramidLeg','fMfe','fMae','fEdate','fXdate','fChartLink','fNotes'].forEach(fid => {
        const el = document.getElementById(fid);
        if(!el) return;
        const map = { fSym:t.symbol, fQty:t.qty, fEntry:t.entry, fExit:t.exit, fSL:t.sl, fTarget:t.target, fTrailingSL:t.trailingSL, fPlannedRisk:t.plannedRisk, fPyramidGroup:t.pyramidGroup, fPyramidLeg:t.pyramidLeg, fMfe:t.mfe, fMae:t.mae, fEdate:isoDate(t.edate), fXdate:isoDate(t.xdate), fChartLink:t.chartLink, fNotes:t.notes };
        el.value = map[fid] ?? '';
      });
      document.getElementById("fDir").value = t.dir || "B"; 
      document.getElementById("fType").value = t.type || "Swing"; 
      document.getElementById("fSetup").value = t.setup || "";
      partialExitDraft = getPartialExits(t).map(x => ({ qty:x.qty, price:x.price, date:isoDate(x.date) }));
    }
  } else {
    ["fSym","fQty","fEntry","fExit","fSL","fTarget","fTrailingSL","fPlannedRisk","fPyramidGroup","fPyramidLeg","fMfe","fMae","fEdate","fXdate","fChartLink","fNotes"].forEach(fid => {
      const el = document.getElementById(fid);
      if(el) el.value = '';
    });
    document.getElementById("fDir").value = "B";
    document.getElementById("fType").value = "Swing";
    document.getElementById("fSetup").value = "";
    document.getElementById("fEdate").value = new Date().toISOString().slice(0,10);
    partialExitDraft = [];
  }
  
  renderPartialExitRows();
  document.getElementById("tradeModal").classList.remove("hidden");
  if(window.lucide) lucide.createIcons();
}

function closeTradeModal(){ 
  document.getElementById("tradeModal").classList.add("hidden"); 
}

async function saveTradeLog(){
  const sym = document.getElementById("fSym").value.trim().toUpperCase();
  const qty = parseFloat(document.getElementById("fQty").value);
  const entry = parseFloat(document.getElementById("fEntry").value);
  
  if(!sym || isNaN(qty) || qty <= 0 || isNaN(entry)){ 
    showToast("Please provide Symbol, Quantity and Entry price!", true); 
    return; 
  }
  
  syncPartialExitDraft();
  const pe = partialExitDraft.filter(x => safeNum(x.qty) > 0 && safeNum(x.price) > 0).map(x => ({
    qty: safeNum(x.qty),
    price: safeNum(x.price),
    date: x.date || document.getElementById("fXdate").value || new Date().toISOString().slice(0,10)
  }));
  
  const peQty = pe.reduce((s,x) => s + x.qty, 0);
  if(peQty > qty){ showToast("Partial exit quantity cannot exceed total quantity.", true); return; }
  
  const user = window.journalUser; 
  if(!user){ showToast("Please sign in to save your journal.", true); return; } 
  
  const id = document.getElementById("fTradeId").value || ("T_" + Date.now());
  const sl = safeNum(document.getElementById("fSL").value) || null;
  const explicitRisk = safeNum(document.getElementById("fPlannedRisk").value);
  
  const tradeObj = {
    id,
    ownerUid: user.uid,
    userEmail: user.email || "",
    symbol: sym,
    companyName: tickerCompanyName(sym),
    dir: document.getElementById("fDir").value,
    type: document.getElementById("fType").value,
    qty,
    entry,
    exit: safeNum(document.getElementById("fExit").value) || null,
    sl,
    target: safeNum(document.getElementById("fTarget").value) || null,
    trailingSL: safeNum(document.getElementById("fTrailingSL").value) || null,
    plannedRisk: explicitRisk || (sl ? Math.abs(entry - sl) * qty : null),
    pyramidGroup: document.getElementById("fPyramidGroup").value.trim(),
    pyramidLeg: safeNum(document.getElementById("fPyramidLeg").value) || null,
    partialExits: pe,
    mfe: document.getElementById("fMfe").value === '' ? '' : safeNum(document.getElementById("fMfe").value),
    mae: document.getElementById("fMae").value === '' ? '' : safeNum(document.getElementById("fMae").value),
    edate: document.getElementById("fEdate").value || new Date().toISOString().slice(0,10),
    xdate: document.getElementById("fXdate").value || (document.getElementById("fExit").value ? new Date().toISOString().slice(0,10) : ""),
    setup: document.getElementById("fSetup").value,
    chartLink: document.getElementById("fChartLink").value,
    notes: document.getElementById("fNotes").value
  };

  if(!tradeObj.xdate && tradeObj.exit) tradeObj.xdate = new Date().toISOString().slice(0,10);

  const existingIdx = trades.findIndex(x => String(x.id) === String(id));
  const previousTrades = [...trades];
  if(existingIdx >= 0) trades[existingIdx] = tradeObj; else trades.unshift(tradeObj);
  
  closeTradeModal(); 
  renderPositionsTable(); 
  renderTradesTable(); 
  renderPerformanceMetrics(); 
  renderAnalyticsView();
  
  try {
    await window.journalStore.saveTrade(tradeObj);
    cacheTrades();
    showToast("✓ Trade saved securely to your account!");
  } catch(err) {
    console.error("Firestore save failed:", err); 
    trades = previousTrades;
    renderPositionsTable(); renderTradesTable(); renderPerformanceMetrics(); renderAnalyticsView();
    showToast("Trade could not be saved to cloud.", true);
  }
}

function editTrade(id){ openTradeModal(id); }

async function deleteTrade(id){
  if(!confirm("Are you sure you want to delete this trade?")) return;
  const backup = [...trades];
  trades = trades.filter(x => String(x.id) !== String(id));
  renderPositionsTable(); renderTradesTable(); renderPerformanceMetrics(); renderAnalyticsView();
  
  try {
    await window.journalStore.deleteTrade(id);
    cacheTrades();
    showToast("✓ Trade deleted.");
  } catch(e) {
    console.error("Firestore delete failed:", e); 
    trades = backup;
    renderPositionsTable(); renderTradesTable(); renderPerformanceMetrics(); renderAnalyticsView();
    showToast("Delete failed to sync.", true);
  }
}

// -------------------- LTP Real-Time Price Fetch --------------------
async function refreshLTP(){
  const buttonLabel = document.getElementById("ltpButtonLabel");
  const spinner = document.getElementById("ltpSpinner");
  const buttons = Array.from(document.querySelectorAll('button[onclick="refreshLTP()"]'));
  
  if (window.__ltpRefreshInProgress) { showToast("LTP refresh is already running."); return; }
  
  const symbols = [...new Set([
    ...trades.filter(t => outcome(t) === "OPEN").map(t => String(t.symbol || "").trim().toUpperCase()),
    ...watchlist.map(w => String(w.ticker || "").trim().toUpperCase())
  ].filter(s => /^[A-Z0-9&_-]{1,30}$/.test(s)))];
  
  if (!symbols.length) { showToast("No open positions or watchlist stocks to fetch quotes for.", true); return; }
  
  window.__ltpRefreshInProgress = true;
  buttons.forEach(b => b.disabled = true);
  if (buttonLabel) buttonLabel.textContent = "Fetching…";
  if (spinner) spinner.classList.add("animate-spin");
  
  let succeeded = 0, failed = [];
  try {
    for (let start = 0; start < symbols.length; start += 50) {
      const batch = symbols.slice(start, start + 50);
      const payload = await requestLTPBatch_(batch);
      if (payload && payload.success === true && payload.prices) {
        batch.forEach(symbol => {
          const price = Number(payload.prices[symbol]);
          if (Number.isFinite(price) && price > 0) { ltpCache[symbol] = price; succeeded++; }
          else failed.push(symbol);
        });
      }
    }
    ltpLastUpdated = new Date();
    renderPositionsTable();
    renderTradesTable();
    showToast(`✓ LTP updated: ${succeeded} quotes live!`);
  } catch (err) {
    showToast("Live quotes service busy, keeping existing values.", true);
  } finally {
    window.__ltpRefreshInProgress = false;
    buttons.forEach(b => b.disabled = false);
    if (buttonLabel) buttonLabel.textContent = "Refresh LTP";
    if (spinner) spinner.classList.remove("animate-spin");
  }
}

function requestLTPBatch_(symbols) {
  return new Promise((resolve, reject) => {
    const callbackName = "__mickkkLtpCallback_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      script.remove();
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
    };
    window[callbackName] = data => { cleanup(); resolve(data); };
    script.onerror = () => { cleanup(); reject(new Error("LTP request failed.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("LTP timed out.")); }, 25000);
    const url = new URL(LTP_WEB_APP_URL);
    url.searchParams.set("action", "ltp");
    url.searchParams.set("symbols", symbols.join(","));
    url.searchParams.set("callback", callbackName);
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

// -------------------- Performance Metrics Calculation --------------------
function renderPerformanceMetrics(){
  const closed = timeframeTrades(trades.filter(t => outcome(t) !== 'OPEN'));
  const wins = closed.filter(t => outcome(t) === 'WIN'), losses = closed.filter(t => outcome(t) === 'LOSS');
  const grossWin = wins.reduce((s,t) => s + (calcPnL(t) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s,t) => s + (calcPnL(t) || 0), 0));
  const pf = grossLoss ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const wr = closed.length ? wins.length / closed.length * 100 : 0;
  const payoff = avgLoss ? avgWin / avgLoss : 0;
  const net = closed.reduce((s,t) => s + (calcPnL(t) || 0), 0);
  const ret = net / PORTFOLIO_CAPITAL * 100;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setEl("perf-wr", wr.toFixed(1) + "%");
  setEl("perf-wr-sub", `${wins.length} Wins / ${losses.length} Losses`);
  setEl("perf-pf", Number.isFinite(pf) ? pf.toFixed(2) : "∞");
  setEl("perf-avg-win", `₹${avgWin.toFixed(0)}`);
  setEl("perf-avg-loss", `₹${avgLoss.toFixed(0)}`);
  setEl("perf-payoff", payoff.toFixed(2) + "x");
  
  const retEl = document.getElementById("perf-total-return");
  if (retEl) {
    retEl.innerText = `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%`;
    retEl.className = `text-xl font-black font-mono-num mt-1 ${ret >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;
  }
  setEl("perf-capital-label", `Base: ₹${PORTFOLIO_CAPITAL.toLocaleString('en-IN')}`);

  const sorted = [...wins].sort((a,b) => (calcPnL(b) || 0) - (calcPnL(a) || 0));
  const sortedLosers = [...losses].sort((a,b) => (calcPnL(a) || 0) - (calcPnL(b) || 0));
  
  const renderList = (el, arr, cls) => {
    const node = document.getElementById(el);
    if(!node) return;
    node.innerHTML = arr.slice(0, 10).map((t,i) => `
      <div class="flex justify-between items-center py-1 border-b border-slate-100 dark:border-borderDark">
        <span class="font-mono-num font-bold">#${i+1} ${t.symbol}</span>
        <span class="font-mono-num font-bold ${cls}">${(calcPnL(t) || 0) >= 0 ? '+' : '-'}₹${Math.abs(calcPnL(t) || 0).toFixed(0)}</span>
      </div>`).join('') || '<p class="text-slate-400">No closed trades yet.</p>';
  };
  renderList('topWinnersList', sorted, 'text-emerald-500');
  renderList('topLosersList', sortedLosers, 'text-rose-500');

  const pnlRows = [
    ['Net P&L', `₹${net.toFixed(0)}`],
    ['Gross Profit', `₹${grossWin.toFixed(0)}`],
    ['Gross Loss', `₹${grossLoss.toFixed(0)}`],
    ['Average P&L / Trade', `₹${closed.length ? (net / closed.length).toFixed(0) : '0'}`],
    ['Best Trade', wins.length ? `₹${Math.max(...wins.map(t => calcPnL(t))).toFixed(0)}` : '₹0'],
    ['Worst Trade', losses.length ? `₹${Math.min(...losses.map(t => calcPnL(t))).toFixed(0)}` : '₹0']
  ];
  const pnlStats = document.getElementById('pnlStatsTable');
  if (pnlStats) pnlStats.innerHTML = pnlRows.map(r => `<tr><td class="py-2 text-slate-400">${r[0]}</td><td class="py-2 text-right font-mono-num font-bold">${r[1]}</td></tr>`).join('');

  const rs = closed.map(rMultiple).filter(v => v !== null);
  const avgRisk = closed.length ? closed.reduce((s,t) => s + plannedRiskAmount(t), 0) / closed.length : 0;
  const maxRisk = rs.length ? Math.max(...rs) : 0;
  
  const riskRows = [
    ['Average Planned Risk', `₹${avgRisk.toFixed(0)}`],
    ['Max Planned Risk', `₹${Math.max(0, ...closed.map(plannedRiskAmount)).toFixed(0)}`],
    ['Average R-Multiple', `${rs.length ? (rs.reduce((a,b) => a + b, 0) / rs.length).toFixed(2) : '0.00'}R`],
    ['Best R-Multiple', `${maxRisk.toFixed(2)}R`]
  ];
  const riskTable = document.getElementById('riskAnalysisTable');
  if (riskTable) riskTable.innerHTML = riskRows.map(r => `<tr><td class="py-2 text-slate-400">${r[0]}</td><td class="py-2 text-right font-mono-num font-bold">${r[1]}</td></tr>`).join('');

  const mm = {};
  closed.forEach(t => { const k = monthKey(t); if(!mm[k]) mm[k] = {n:0, w:0, l:0, p:0}; mm[k].n++; if(outcome(t) === 'WIN') mm[k].w++; if(outcome(t) === 'LOSS') mm[k].l++; mm[k].p += calcPnL(t) || 0; });
  const monthlyTable = document.getElementById('monthlyBreakdownTable');
  if (monthlyTable) {
    monthlyTable.innerHTML = Object.keys(mm).sort().map(k => {
      const m = mm[k];
      return `<tr><td class="py-2 font-bold">${monthLabel(k)}</td><td class="py-2 text-right">${m.n}</td><td class="py-2 text-right text-emerald-500">${m.w}</td><td class="py-2 text-right text-rose-500">${m.l}</td><td class="py-2 text-right">${m.n ? (m.w / m.n * 100).toFixed(1) : '0.0'}%</td><td class="py-2 text-right font-mono-num font-bold ${m.p >= 0 ? 'text-emerald-500' : 'text-rose-500'}">${m.p >= 0 ? '+' : '-'}₹${Math.abs(m.p).toFixed(0)}</td><td class="py-2 text-right font-mono-num">${m.n ? '₹' + (m.p / m.n).toFixed(0) : '₹0'}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="py-4 text-center text-slate-400">No closed trades.</td></tr>';
  }

  renderPerformanceCharts();
}

function renderPerformanceCharts(){
  if(typeof Chart === 'undefined') return;
  const closed = timeframeTrades(trades.filter(t => outcome(t) !== 'OPEN')).sort((a,b) => isoDate(a.xdate || a.edate).localeCompare(isoDate(b.xdate || b.edate)));
  let cum = 0;
  const labels = closed.map(t => formatDate(t.xdate || t.edate)), cumData = closed.map(t => cum += calcPnL(t) || 0);
  makeChart('chartEquity', 'equity', 'line', labels, [lineDataset('Cumulative Net P&L', cumData, '#10b981', 'rgba(16,185,129,.08)')]);
  
  const monthly = {}; 
  closed.forEach(t => monthly[monthKey(t)] = (monthly[monthKey(t)] || 0) + (calcPnL(t) || 0)); 
  const mk = Object.keys(monthly).sort();
  makeChart('chartMonthly', 'monthly', 'bar', mk.map(monthLabel), [barDataset('Net P&L', mk.map(k => monthly[k]))]);
  
  let run = 0;
  const avgRun = closed.map((t,i) => { run += calcPnL(t) || 0; return run / (i + 1); });
  makeChart('chartAvgPnlRunning', 'avgPnlRunning', 'line', labels, [lineDataset('Avg P&L / Trade', avgRun, '#06b6d4', 'rgba(6,182,212,.07)')]);
  
  const counts = [closed.filter(t => outcome(t) === 'WIN').length, closed.filter(t => outcome(t) === 'LOSS').length, closed.filter(t => outcome(t) === 'BE').length];
  makeChart('chartOutcomePie', 'outcomePie', 'doughnut', ['Wins', 'Losses', 'Break-even'], [{ data: counts, backgroundColor: ['#10b981', '#ef4444', '#94a3b8'], borderWidth: 0 }], { plugins: { legend: { position: 'bottom' } } });

  let w = 0;
  const wr = closed.map((t,i) => { if (outcome(t) === 'WIN') w++; return w / (i + 1) * 100; });
  makeChart('chartWinRateRunning', 'winRateRunning', 'line', labels, [lineDataset('Running Win Rate %', wr, '#8b5cf6', 'rgba(139,92,246,.07)')], { scales: { y: { min: 0, max: 100 } } });

  const winPnl = closed.filter(t => outcome(t) === 'WIN').reduce((s,t) => s + calcPnL(t), 0);
  const winCount = closed.filter(t => outcome(t) === 'WIN').length;
  const lossPnl = Math.abs(closed.filter(t => outcome(t) === 'LOSS').reduce((s,t) => s + calcPnL(t), 0));
  const lossCount = closed.filter(t => outcome(t) === 'LOSS').length;
  makeChart('chartAvgWinLoss', 'avgWinLoss', 'bar', ['Average Win', 'Average Loss'], [{ data: [winCount ? winPnl / winCount : 0, lossCount ? lossPnl / lossCount : 0], backgroundColor: ['#10b981', '#ef4444'], borderRadius: 4 }], { plugins: { legend: { display: false } } });
  makeChart('chartWinLossCount', 'winLossCount', 'bar', ['Wins', 'Losses'], [{ data: counts.slice(0, 2), backgroundColor: ['#10b981', '#ef4444'], borderRadius: 4 }], { plugins: { legend: { display: false } } });

  let riskRun = 0;
  const riskAvg = closed.map((t,i) => { riskRun += plannedRiskAmount(t); return riskRun / (i + 1); });
  makeChart('chartAvgRiskRunning', 'avgRiskRunning', 'line', labels, [lineDataset('Avg Planned Risk', riskAvg, '#f59e0b', 'rgba(245,158,11,.07)')]);
}

// -------------------- Analytics Diagnostics --------------------
function computeMFEMAE(){
  const closed = trades.filter(t => outcome(t) !== 'OPEN');
  const mfes = closed.map(t => safeNum(t.mfe)).filter(v => v !== 0);
  const maes = closed.map(t => safeNum(t.mae)).filter(v => v !== 0);
  const avgMFE = mfes.length ? mfes.reduce((a,b) => a + b, 0) / mfes.length : 0;
  const avgMAE = maes.length ? maes.reduce((a,b) => a + b, 0) / maes.length : 0;
  const eff = closed.map(t => {
    const mfe = Math.abs(safeNum(t.mfe));
    return mfe > 0 && calcPnL(t) !== null ? Math.max(0, (calcPnL(t) / safeNum(t.entry) / safeNum(t.qty)) * 100) / mfe : null;
  }).filter(v => v !== null);
  const expectancy = closed.length ? closed.reduce((s,t) => s + (rMultiple(t) || 0), 0) / closed.length : 0;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setEl('stat-avg-mfe', mfes.length ? avgMFE.toFixed(2) + '%' : '--');
  setEl('stat-avg-mae', maes.length ? avgMAE.toFixed(2) + '%' : '--');
  setEl('stat-exit-eff', eff.length ? (eff.reduce((a,b) => a + b, 0) / eff.length * 100).toFixed(1) + '%' : '--');
  setEl('stat-expectancy', expectancy.toFixed(2) + 'R');
}

function renderAnalyticsView(){
  computeMFEMAE();
  renderAnalyticsCharts();
}

function renderAnalyticsCharts(){
  if(typeof Chart === 'undefined') return;
  const closed = timeframeTrades(trades.filter(t => outcome(t) !== 'OPEN')).sort((a,b) => isoDate(a.xdate || a.edate).localeCompare(isoDate(b.xdate || b.edate)));
  const labels = closed.map(t => formatDate(t.xdate || t.edate));
  let cum = 0, peak = PORTFOLIO_CAPITAL;
  const capital = closed.map(t => { cum += calcPnL(t) || 0; return PORTFOLIO_CAPITAL + cum; });
  const dd = capital.map(v => { peak = Math.max(peak, v); return peak ? ((v - peak) / peak) * 100 : 0; });
  
  makeChart('chartCapitalGrowth', 'capitalGrowth', 'line', labels, [lineDataset('Capital', capital, '#10b981', 'rgba(16,185,129,.06)')]);
  makeChart('chartDrawdown', 'dd', 'line', labels, [lineDataset('Drawdown %', dd, '#ef4444', 'rgba(239,68,68,.08)')], { scales: { y: { ticks: { callback: v => v + '%' } } } });

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dowCounts = days.map(d => closed.filter(t => weekdayLabel(t) === d).length);
  const dowAvg = days.map(d => { const a = closed.filter(t => weekdayLabel(t) === d); return a.length ? a.reduce((s,t) => s + calcPnL(t), 0) / a.length : 0; });
  makeChart('chartTradesDow', 'tradesDow', 'bar', days, [{ data: dowCounts, backgroundColor: '#06b6d4', borderRadius: 4 }], { plugins: { legend: { display: false } } });
  makeChart('chartAvgDow', 'avgDow', 'bar', days, [barDataset('Avg P&L', dowAvg)], { plugins: { legend: { display: false } } });

  const pats = [...new Set(closed.map(patternOf))].sort();
  const pnlPat = pats.map(p => closed.filter(t => patternOf(t) === p).reduce((s,t) => s + calcPnL(t), 0));
  const cntPat = pats.map(p => closed.filter(t => patternOf(t) === p).length);
  makeChart('chartPatternImpact', 'patternImpact', 'bar', pats, [barDataset('Net P&L', pnlPat)], { plugins: { legend: { display: false } } });
  makeChart('chartTradesPattern', 'tradesPattern', 'bar', pats, [{ data: cntPat, backgroundColor: '#8b5cf6', borderRadius: 4 }], { plugins: { legend: { display: false } } });

  makeChart('chartTradeQuality', 'tradeQuality', 'scatter', [], [{ label: 'MFE vs MAE', data: closed.filter(t => t.mfe !== '' && t.mae !== '').map(t => ({ x: safeNum(t.mfe), y: safeNum(t.mae) })), backgroundColor: '#8b5cf6', pointRadius: 4 }], { scales: { x: { title: { display: true, text: 'MFE %' } }, y: { title: { display: true, text: 'MAE %' } } } });

  const hist = (vals, bins) => {
    const histLabels = [], histData = [];
    if (!vals.length) return { labels: histLabels, data: histData };
    const min = Math.min(...vals), max = Math.max(...vals), step = (max - min || 1) / bins;
    for (let i = 0; i < bins; i++) {
      const lo = min + i * step, hi = (i === bins - 1) ? max + 1 : lo + step;
      histLabels.push(`${lo.toFixed(1)}–${hi.toFixed(1)}`);
      histData.push(vals.filter(v => v >= lo && v < hi).length);
    }
    return { labels: histLabels, data: histData };
  };

  const mh = hist(closed.map(t => safeNum(t.mfe)).filter(v => v !== 0), 8);
  const ah = hist(closed.map(t => safeNum(t.mae)).filter(v => v !== 0), 8);
  makeChart('chartMfeDist', 'mfeDist', 'bar', mh.labels, [{ data: mh.data, backgroundColor: '#10b981', borderRadius: 3 }], { plugins: { legend: { display: false } } });
  makeChart('chartMaeDist', 'maeDist', 'bar', ah.labels, [{ data: ah.data, backgroundColor: '#ef4444', borderRadius: 3 }], { plugins: { legend: { display: false } } });

  const eff = closed.map(t => {
    const mfePct = safeNum(t.mfe);
    const pnlPct = safeNum(t.entry) && safeNum(t.qty) ? (calcPnL(t) / (safeNum(t.entry) * safeNum(t.qty))) * 100 : 0;
    return mfePct ? pnlPct / mfePct * 100 : 0;
  });
  makeChart('chartExitEfficiency', 'exitEfficiency', 'line', labels, [lineDataset('Exit Efficiency %', eff, '#06b6d4', 'rgba(6,182,212,.06)')]);

  const heat = closed.map(t => {
    const risk = plannedRiskAmount(t);
    const maePct = safeNum(t.mae);
    const maeAmt = safeNum(t.entry) && safeNum(t.qty) ? (maePct / 100) * safeNum(t.entry) * safeNum(t.qty) : 0;
    return risk ? maeAmt / risk * 100 : 0;
  });
  makeChart('chartHeat', 'heat', 'line', labels, [lineDataset('MAE ÷ Planned Risk %', heat, '#f59e0b', 'rgba(245,158,11,.06)')]);

  makeChart('chartMfeHolding', 'mfeHolding', 'scatter', [], [{ label: 'MFE vs Holding Days', data: closed.map(t => ({ x: holdingDays(t), y: safeNum(t.mfe) })), backgroundColor: '#10b981', pointRadius: 4 }], { scales: { x: { title: { display: true, text: 'Holding Days' } }, y: { title: { display: true, text: 'MFE %' } } } });

  const rs = closed.map(rMultiple).filter(v => v !== null);
  const rh = hist(rs, 10);
  makeChart('chartRDistribution', 'rDistribution', 'bar', rh.labels, [{ data: rh.data, backgroundColor: '#8b5cf6', borderRadius: 3 }], { plugins: { legend: { display: false } } });
  makeChart('chartMaeHolding', 'maeHolding', 'scatter', [], [{ label: 'MAE vs Holding Days', data: closed.map(t => ({ x: holdingDays(t), y: safeNum(t.mae) })), backgroundColor: '#ef4444', pointRadius: 4 }], { scales: { x: { title: { display: true, text: 'Holding Days' } }, y: { title: { display: true, text: 'MAE %' } } } });
}

// -------------------- Tools Calculations --------------------
function runSizingCalc() {
  const cap = parseFloat(document.getElementById("toolCap")?.value) || 0;
  const riskPct = parseFloat(document.getElementById("toolRiskPct")?.value) || 0;
  const entry = parseFloat(document.getElementById("toolEntry")?.value) || 0;
  const sl = parseFloat(document.getElementById("toolSL")?.value) || 0;

  if (!entry || !sl || entry === sl) return;

  const riskAmt = cap * (riskPct / 100);
  const riskPerShare = Math.abs(entry - sl);
  const qty = Math.floor(riskAmt / riskPerShare);
  const posVal = qty * entry;
  const exposure = (posVal / cap) * 100;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setEl("resRiskAmt", `₹${riskAmt.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
  setEl("resRiskPerShare", `₹${riskPerShare.toFixed(2)}`);
  setEl("resQty", `${qty.toLocaleString()} Shares`);
  setEl("resPosValue", `₹${posVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
  setEl("resExposure", `${exposure.toFixed(1)}% of Capital`);
}

function runRLadder() {
  const entry = parseFloat(document.getElementById("rEntry")?.value) || 0;
  const sl = parseFloat(document.getElementById("rSL")?.value) || 0;
  const cur = parseFloat(document.getElementById("rCurrent")?.value) || entry;
  const tbody = document.getElementById("rLadderTbody");
  if (!entry || !sl || entry === sl || !tbody) return;

  const rDiff = Math.abs(entry - sl);
  const levels = [-1, 0, 1, 2, 3, 4, 5];
  tbody.innerHTML = levels.map(r => {
    const target = entry + (r * rDiff);
    const gainPct = ((target - entry) / entry) * 100;
    const hit = cur >= target;
    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <td class="py-2">${r === -1 ? 'SL (-1R)' : (r === 0 ? 'Entry (0R)' : `Target +${r}R`)}</td>
        <td class="py-2 font-bold font-mono-num">₹${target.toFixed(2)}</td>
        <td class="py-2 font-mono-num ${gainPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}">${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%</td>
        <td class="py-2 ${hit ? 'text-emerald-500 font-bold' : 'text-slate-400'}">${hit ? '✓ Triggered' : 'Pending'}</td>
      </tr>
    `;
  }).join('');
}

// -------------------- Watchlist --------------------
function renderWatchlist() {
  const container = document.getElementById("watchListContainer");
  if (!container) return;
  if (!watchlist.length) {
    container.innerHTML = '<p class="py-4 text-slate-400">No stocks in watchlist.</p>';
    return;
  }
  container.innerHTML = watchlist.map((w, idx) => `
    <div class="py-3 flex justify-between items-center">
      <div>
        <span class="font-bold font-mono-num text-blue-500">${w.ticker}</span>
        <span class="ml-2 text-slate-400 font-semibold">${w.setup || 'Setup'}</span>
        <div class="text-[11px] text-slate-400 mt-0.5">Entry ₹${w.entry} | SL ₹${w.sl} | Target ₹${w.target}</div>
      </div>
      <button onclick="removeWatchItem(${idx})" class="text-rose-500 p-1 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
    </div>
  `).join('');
  if (window.lucide) lucide.createIcons();
}

async function addWatchItem() {
  const ticker = document.getElementById("w-ticker")?.value.trim().toUpperCase();
  if (!ticker) return;
  const item = {
    id: "W_" + Date.now(),
    ticker,
    companyName: tickerCompanyName(ticker),
    setup: document.getElementById("w-setup")?.value || "",
    entry: document.getElementById("w-entry")?.value || "",
    sl: document.getElementById("w-sl")?.value || "",
    target: document.getElementById("w-target")?.value || "",
    notes: document.getElementById("w-notes")?.value || ""
  };
  try {
    await window.journalStore.saveWatchlistItem(item);
    watchlist.unshift(item);
    cacheWatchlist();
    renderWatchlist();
    document.getElementById("w-ticker").value = "";
    document.getElementById("w-setup").value = "";
    document.getElementById("w-entry").value = "";
    document.getElementById("w-sl").value = "";
    document.getElementById("w-target").value = "";
    document.getElementById("w-notes").value = "";
    showToast("Watchlist setup saved!");
  } catch (err) {
    console.error(err);
    showToast("Watchlist could not be saved.", true);
  }
}

async function removeWatchItem(index) {
  const item = watchlist[index];
  if (!item) return;
  const previous = [...watchlist];
  watchlist.splice(index, 1);
  renderWatchlist();
  try {
    await window.journalStore.deleteWatchlistItem(item.id);
    cacheWatchlist();
    showToast("Watchlist item removed.");
  } catch (err) {
    console.error(err);
    watchlist = previous;
    renderWatchlist();
    showToast("Could not delete watchlist item.", true);
  }
}

// -------------------- CSV Export --------------------
function exportCSV() {
  if (!trades.length) {
    showToast("No trades to export.", true);
    return;
  }
  let csv = "Symbol,Type,Dir,Entry,Exit,Qty,SL,Target,NetPnL,ReturnPct,Status,EntryDate,ExitDate,Notes\n";
  trades.forEach(t => {
    const pnl = calcPnL(t);
    const ret = (t.entry && pnl) ? (pnl / (t.entry * t.qty)) * 100 : "";
    csv += `${t.symbol},${t.type},${t.dir},${t.entry},${t.exit || ""},${t.qty},${t.sl || ""},${t.target || ""},${pnl || ""},${ret ? ret.toFixed(2) : ""},${outcome(t)},${t.edate || ""},${t.xdate || ""},"${t.notes || ""}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Mickkk_Journal_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// -------------------- Broker Trade Import --------------------
let pendingBrokerImport = null;

function openImportModal() {
  pendingBrokerImport = null;
  const modal = document.getElementById('brokerImportModal');
  if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
  const fileInput = document.getElementById('brokerImportFile');
  if (fileInput) fileInput.value = '';
  const status = document.getElementById('brokerImportStatus');
  if (status) status.textContent = 'Choose a Zerodha or Groww report to preview its trades.';
  const wrap = document.getElementById('brokerImportPreviewWrap');
  if (wrap) wrap.classList.add('hidden');
  const confirm = document.getElementById('brokerImportConfirmBtn');
  if (confirm) confirm.disabled = true;
  if (window.lucide) lucide.createIcons();
}

function closeImportModal() {
  const modal = document.getElementById('brokerImportModal');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
  pendingBrokerImport = null;
}

function importCellText(v) { return String(v == null ? '' : v).trim(); }
function importHeaderKey(v) { return importCellText(v).toLowerCase().replace(/[^a-z0-9]/g, ''); }

function importParseDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && window.XLSX && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H || 0, d.M || 0, Math.floor(d.S || 0));
  }
  const str = importCellText(value);
  if (!str) return null;
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
  m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i);
  if (m) {
    let h = +(m[4] || 0); const ap = (m[6] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    return new Date(+m[3], +m[2]-1, +m[1], h, +(m[5]||0));
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function importIsoDate(d) {
  if (!d || isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function importStableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36).toUpperCase();
}

function importFindHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const keys = (rows[i] || []).map(importHeaderKey);
    if (keys.includes('symbol') && keys.includes('tradetype') && keys.includes('quantity') && keys.includes('price')) return { row: i, broker: 'Zerodha', keys };
    if (keys.includes('stockname') && keys.includes('symbol') && keys.includes('type') && keys.includes('quantity') && keys.includes('value')) return { row: i, broker: 'Groww', keys };
  }
  throw new Error('Report format not recognized. Use Zerodha tradebook or Groww stock order-history.');
}

function importBrokerRows(rows, forcedBroker) {
  const found = importFindHeader(rows);
  const broker = forcedBroker === 'auto' ? found.broker : forcedBroker;
  if (broker !== found.broker) throw new Error('Selected broker does not match this file.');
  const idx = {}; found.keys.forEach((k, i) => { if (k && idx[k] === undefined) idx[k] = i; });
  const val = (r, k) => r[idx[k]];
  const fillsByKey = new Map();
  let skipped = 0;
  for (let i = found.row + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const symbol = importCellText(val(r, 'symbol')).toUpperCase();
    const side = importCellText(val(r, broker === 'Zerodha' ? 'tradetype' : 'type')).toUpperCase();
    const qty = Number(val(r, 'quantity'));
    const rawPrice = broker === 'Zerodha' ? Number(val(r, 'price')) : (Number(val(r, 'value')) / qty);
    const dateValue = broker === 'Zerodha' ? (val(r, 'tradeexecutiontime') || val(r, 'tradedate')) : val(r, 'executiondateandtime');
    const date = importParseDate(dateValue);
    const status = broker === 'Groww' ? importCellText(val(r, 'orderstatus')).toLowerCase() : '';
    if (broker === 'Groww' && status && !['executed','complete','completed','traded'].includes(status)) { skipped++; continue; }
    if (!symbol || !['BUY','SELL'].includes(side) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rawPrice) || rawPrice <= 0 || !date) { if (r.some(x => importCellText(x))) skipped++; continue; }
    const orderId = importCellText(val(r, broker === 'Zerodha' ? 'orderid' : 'exchangeorderid')) || importCellText(val(r, broker === 'Zerodha' ? 'tradeid' : 'isin')) || ('ROW' + (i+1));
    const tradeId = importCellText(val(r, 'tradeid'));
    const key = [broker, symbol, side, importIsoDate(date), orderId].join('|');
    const existing = fillsByKey.get(key) || { key, symbol, side, qty: 0, amount: 0, date, orderId, executionIds: [] };
    existing.qty += qty; existing.amount += qty * rawPrice;
    if (tradeId) existing.executionIds.push(tradeId);
    fillsByKey.set(key, existing);
  }
  const fills = [...fillsByKey.values()].map(f => ({ ...f, price: f.amount / f.qty })).sort((a,b) => a.date - b.date || a.key.localeCompare(b.key));
  if (!fills.length) throw new Error('No valid executed equity trades found in this file.');
  const queues = new Map(), output = [], sourceEntryKeys = new Set();
  const makeTrade = (entryFill, exitFill, qty) => {
    const dir = entryFill.side === 'BUY' ? 'B' : 'S';
    const state = exitFill ? 'CLOSED' : 'OPEN';
    const sourceKey = [broker, entryFill.key, exitFill ? exitFill.key : 'OPEN'].join('::');
    const id = 'IMP_' + importStableHash(sourceKey);
    sourceEntryKeys.add(entryFill.key);
    return {
      id, symbol: entryFill.symbol, companyName: tickerCompanyName(entryFill.symbol), dir,
      type: exitFill && importIsoDate(entryFill.date) === importIsoDate(exitFill.date) ? 'Intraday' : 'Swing',
      qty: +qty.toFixed(6), entry: +entryFill.price.toFixed(6), exit: exitFill ? +exitFill.price.toFixed(6) : null,
      sl: null, target: null, trailingSL: null, plannedRisk: null, pyramidGroup: '', pyramidLeg: null,
      partialExits: [], mfe: '', mae: '', edate: importIsoDate(entryFill.date), xdate: exitFill ? importIsoDate(exitFill.date) : '',
      setup: 'Broker Import', chartLink: '', notes: `${broker} import · Order ${entryFill.orderId}${exitFill ? ' → ' + exitFill.orderId : ' · Open quantity'}`,
      importBroker: broker, importEntryKey: entryFill.key, importSourceKey: sourceKey, importState: state,
      importOrderIds: [entryFill.orderId, ...(exitFill ? [exitFill.orderId] : [])]
    };
  };
  fills.forEach(fill => {
    let remaining = fill.qty;
    const q = queues.get(fill.symbol) || [];
    while (remaining > 0.000001 && q.length && q[0].side !== fill.side) {
      const lot = q[0];
      const matched = Math.min(remaining, lot.qty);
      output.push(makeTrade(lot, fill, matched));
      lot.qty -= matched; remaining -= matched;
      if (lot.qty <= 0.000001) q.shift();
    }
    if (remaining > 0.000001) {
      q.push({ ...fill, qty: remaining });
    }
    queues.set(fill.symbol, q);
  });
  for (const q of queues.values()) q.forEach(lot => { if (lot.qty > 0.000001) output.push(makeTrade(lot, null, lot.qty)); });
  output.sort((a,b) => (a.edate || '').localeCompare(b.edate || '') || a.symbol.localeCompare(b.symbol));
  return { broker, fills, trades: output, skipped, sourceEntryKeys: [...sourceEntryKeys] };
}

async function previewBrokerImport() {
  pendingBrokerImport = null;
  const file = document.getElementById('brokerImportFile')?.files[0];
  const status = document.getElementById('brokerImportStatus');
  const wrap = document.getElementById('brokerImportPreviewWrap');
  const confirm = document.getElementById('brokerImportConfirmBtn');
  if (wrap) wrap.classList.add('hidden'); 
  if (confirm) confirm.disabled = true;
  if (!file) return;
  try {
    if (status) status.textContent = 'Reading report and matching executions…';
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const rows = [];
    workbook.SheetNames.forEach(name => {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '' });
      if (sheetRows.some(r => r.some(c => ['tradetype','stockname'].includes(importHeaderKey(c))))) rows.push(...sheetRows);
    });
    const result = importBrokerRows(rows, document.getElementById('brokerImportSelect')?.value || 'auto');
    await window.journalStoreReady;
    const existingIds = new Set(trades.map(t => String(t.id)));
    const duplicates = result.trades.filter(t => existingIds.has(t.id)).length;
    pendingBrokerImport = { ...result, fileName: file.name, duplicates };
    
    const summary = document.getElementById('brokerImportSummary');
    if (summary) summary.textContent = `${result.broker} · ${result.fills.length} grouped orders · ${result.trades.length} matched/open trade rows · ${duplicates} already imported · ${result.skipped} rows skipped`;
    
    const shown = result.trades.slice(0, 60);
    const body = document.getElementById('brokerImportPreviewBody');
    if (body) {
      body.innerHTML = shown.map(t => `<tr><td class="p-2 font-bold">${escapeImportHtml(t.symbol)}</td><td class="p-2">${t.dir === 'B' ? 'BUY' : 'SELL'}</td><td class="p-2 text-right font-mono-num">${t.qty}</td><td class="p-2 text-right font-mono-num">₹${t.entry.toFixed(2)}</td><td class="p-2 text-right font-mono-num">${t.exit ? '₹'+t.exit.toFixed(2) : '—'}</td><td class="p-2 text-center">${t.edate}</td><td class="p-2 text-center">${t.xdate || '—'}</td><td class="p-2 text-center ${t.importState==='OPEN'?'text-amber-500':'text-emerald-500'} font-bold">${t.importState}</td></tr>`).join('');
    }
    if (wrap) wrap.classList.remove('hidden'); 
    if (confirm) confirm.disabled = false;
    if (status) status.textContent = 'Review preview above, then confirm import.';
  } catch (err) {
    if (status) status.textContent = err.message || 'Could not read report.';
    showToast(err.message, true);
  }
}

function escapeImportHtml(v) {
  return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function confirmBrokerImport() {
  if (!pendingBrokerImport) return;
  const btn = document.getElementById('brokerImportConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing…'; }
  try {
    await window.journalStoreReady;
    const result = pendingBrokerImport;
    for (const t of result.trades) {
      await window.journalStore.saveTrade({ ...t, ownerUid: window.journalUser.uid, userEmail: window.journalUser.email || '' });
    }
    closeImportModal();
    await loadTrades();
    showToast(`✓ Imported ${result.trades.length} ${result.broker} trade rows!`);
  } catch (err) {
    showToast(err.message || 'Import failed.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Import to Trade Log'; }
    if (window.lucide) lucide.createIcons();
  }
}

// -------------------- Window Exports --------------------
window.openProModal = openProModal;
window.closeProModal = closeProModal;
window.openWhatsAppTrialModal = openWhatsAppTrialModal;
window.applyJournalRoleRules = applyJournalRoleRules;
window.handlePerformanceTimeframe = handlePerformanceTimeframe;
window.handleComputeMFEMAE = handleComputeMFEMAE;
window.editPortfolioCapital = editPortfolioCapital;
window.refreshLTP = refreshLTP;
window.openTradeModal = openTradeModal;
window.closeTradeModal = closeTradeModal;
window.saveTradeLog = saveTradeLog;
window.editTrade = editTrade;
window.deleteTrade = deleteTrade;
window.trailStopLoss = trailStopLoss;
window.pyramidPosition = pyramidPosition;
window.partialExitPosition = partialExitPosition;
window.setSellProfitTarget = setSellProfitTarget;
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.exportCSV = exportCSV;
window.addWatchItem = addWatchItem;
window.removeWatchItem = removeWatchItem;
window.runSizingCalc = runSizingCalc;
window.runRLadder = runRLadder;
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.previewBrokerImport = previewBrokerImport;
window.confirmBrokerImport = confirmBrokerImport;
window.setTradeFilter = setTradeFilter;
window.sortTrades = sortTrades;
window.changeTradePage = changeTradePage;
window.addPartialExitRow = addPartialExitRow;
window.removePartialExitRow = removePartialExitRow;
window.signOutJournal = signOutJournal;

document.addEventListener("DOMContentLoaded", () => {
  syncThemeIcons(document.documentElement.classList.contains("dark"));
  populateNSETickerList();
  updateUserHeaderBadge();
  loadTrades();
  loadWatchlist();
  runSizingCalc();
  runRLadder();
  if (window.lucide) lucide.createIcons();
});
