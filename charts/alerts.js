// ============================================================
// MICKKK.com Charts — Professional Terminal Engine (ALERTS)
// ============================================================

/* ============ DUAL PRICE ALERTS ENGINE ============ */
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
  } catch(e){}
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