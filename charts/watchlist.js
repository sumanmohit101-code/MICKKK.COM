// ============================================================
// MICKKK.com Charts — Professional Terminal Engine (WATCHLIST)
// ============================================================

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
        
        // WATCHLIST WITH LTP & DAILY CHANGE % RENDER LAYOUT
        row.innerHTML = `
          <span class="watch-sym">${escapeWatchText(item.symbol)}</span>
          <span class="watch-name">${escapeWatchText(item.name || '')}</span>
          <span id="watch-price-${item.symbol}" class="watch-price-info" style="font-family:var(--mono); font-size:9.5px; font-weight:600; margin-left:auto; white-space:nowrap; padding-right:4px; color:var(--text);">—</span>
          <button class="watch-remove" title="Remove from section">×</button>
        `;
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
  
  // TRIGGER PARALLEL FETCH FOR WATCHLIST PRICES & LTP DISPLAY
  loadWatchlistPrices(wl);
}

async function loadWatchlistPrices(wl) {
  if (!wl || !wl.sections) return;
  const symbols = [];
  wl.sections.forEach(s => {
    (s.items || []).forEach(item => {
      if (item.symbol && !symbols.includes(item.symbol)) symbols.push(item.symbol);
    });
  });
  
  symbols.forEach(async (sym) => {
    try {
      // Check memory cache first to respect Google Server rate-limits
      if (watchlistQuotesCache[sym] && (Date.now() - watchlistQuotesCache[sym].time < 120000)) {
        renderLtpOnWatchlist(sym, watchlistQuotesCache[sym].price, watchlistQuotesCache[sym].change);
        return;
      }
      
      const res = await fetch(`${CHARTS_API_URL}?action=getLive&symbol=${encodeURIComponent(sym)}`);
      const data = await res.json();
      if (data && typeof data.price === 'number') {
        const price = data.price;
        let pct = 0;
        
        // Fetch reference close dynamically from Google Sheets symbols array or candle series if possible
        const refClose = await getLatestStoredCloseQuote(sym);
        if (refClose && refClose > 0) {
          pct = ((price - refClose) / refClose) * 100;
        }
        
        watchlistQuotesCache[sym] = { price: price, change: pct, time: Date.now() };
        renderLtpOnWatchlist(sym, price, pct);
      }
    } catch(e) {}
  });
}

function renderLtpOnWatchlist(symbol, price, pct) {
  const elems = document.querySelectorAll(`[id="watch-price-${symbol}"]`);
  const color = pct >= 0 ? 'var(--green)' : 'var(--red)';
  const sign = pct >= 0 ? '+' : '';
  elems.forEach(el => {
    el.innerHTML = `₹${price.toFixed(2)} <span style="color:${color}; font-size:8.5px; font-weight:700;">(${sign}${pct.toFixed(2)}%)</span>`;
  });
}

async function getLatestStoredCloseQuote(symbol) {
  try {
    const cachedData = localStorage.getItem(`MICKKK_CANDLES_DATA_${symbol}`);
    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      if (parsed && parsed.length > 0) {
        return Number(parsed[parsed.length - 1].close || 0);
      }
    }
  } catch(e) {}
  return 0;
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