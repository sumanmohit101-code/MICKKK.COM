// ============================================================
// MICKKK.com Charts — Professional Terminal Engine (DRAWINGS)
// ============================================================

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