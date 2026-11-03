/* =========================================================================
   MICKKK LABELS — professional names + hover explanations (classic script)
   - patternInfo(): readable name, icon, colour and explanation for each scanner
   - colTip():      explanation for table column headers
   - applyTips():   adds hover tips (data-tip) to buttons, tabs and table headers,
                    including ones created later by JavaScript.
   Tooltip rendering itself is in mickkk-shell.js (works with any [data-tip]).
   ========================================================================= */
(function () {
  'use strict';

  /* ---------------- Pattern / scanner names ---------------- */
  // [regex on UPPERCASE raw name, label, icon, colour class, explanation]
  var P = [
    [/DOUBLE ?BOTTOM/, 'Double Bottom', '📈', 'pat-blue', 'Price made two similar lows and is recovering: a classic bullish reversal pattern.'],
    [/HEAD ?& ?SHOULDER/, 'Head & Shoulders', '📉', 'pat-purple', 'Three-peak pattern (middle peak highest). A break below the neckline is usually bearish.'],
    [/CUP ?& ?HANDLE/, 'Cup & Handle', '☕', 'pat-orange', 'Rounded base followed by a small pullback. A bullish continuation setup.'],
    [/BULL ?FLAG/, 'Bull Flag', '🚩', 'pat-green', 'Sharp rally followed by a tight, shallow pullback. A bullish continuation setup.'],
    [/NEAR TO MONTHLY HIGH|NEAR MONTHLY HIGH/, 'Near Monthly High', '🎯', 'pat-green', 'Trading within a few percent of its 1-month high.'],
    [/NEAR TO QUARTERLY HIGH|NEAR QUARTERLY HIGH/, 'Near Quarterly High', '🎯', 'pat-green', 'Trading within a few percent of its 3-month high.'],
    [/PULLBACK/, 'Pullback', '🎯', 'pat-yellow', 'A strong stock pulling back toward a key moving average: a possible low-risk entry.'],
    [/10D STRONG CANDLE/, 'Strong 10-Day Candle', '🕯️', 'pat-orange', 'A large bullish candle appeared in the last 10 days, showing strong buying.'],
    [/3D CANDLES TIGHT/, '3-Day Tight Candles', '🕯️', 'pat-cyan', 'The last three candles closed in a very narrow band: volatility is contracting.'],
    [/TIGHT AFTER STRONG CANDLE/, 'Tight After Strong Candle', '🕯️', 'pat-cyan', 'A strong candle followed by tight, quiet trading: price is digesting the move.'],
    [/^NR7/, 'NR7 (Narrow Range)', '📏', 'pat-cyan', 'Narrowest daily range of the last 7 days. Often comes before a bigger move.'],
    [/RANGE ?10D TIGHT/, '10-Day Tight Range', '📏', 'pat-cyan', 'High-to-low range over the last 10 days is unusually small.'],
    [/RANGE ?5D TIGHT/, '5-Day Tight Range', '📏', 'pat-cyan', 'High-to-low range over the last 5 days is unusually small.'],
    [/RANGE ?3D TIGHT/, '3-Day Tight Range', '📏', 'pat-cyan', 'High-to-low range over the last 3 days is unusually small.'],
    [/CONSOLIDATING IN A RANGE/, 'Consolidating in a Range', '↔️', 'pat-cyan', 'Trading sideways inside a defined price range.'],
    [/^RANGE$/, 'Sideways Range', '↔️', 'pat-cyan', 'Stocks trading inside a defined price range.'],
    [/GAP ?& ?GO|^GAP/, 'Gap & Go', '🚀', 'pat-cyan', 'Gapped up at the open and held its strength through the day.'],
    [/VOLUME SHOCKER|VOL ?>/, 'Volume Spike', '🌊', 'pat-orange', 'Volume is far above its recent average, which often signals institutional interest.'],
    [/MONTHLY RSI ?> ?60/, 'Monthly RSI above 60', '⚡', 'pat-green', 'RSI on the monthly chart is above 60: strong long-term momentum.'],
    [/RSI CROSSING ITS 10 ?EMA|RSI CROSSING 10/, 'RSI Crossing 10-EMA', '⚡', 'pat-blue', 'RSI has just moved above its own 10-period average: momentum is turning up.'],
    [/52 ?WEEK HIGH|52WH/, '52-Week High', '🎯', 'pat-green', 'Trading at or near its 52-week high.'],
    [/MINI COIL/, 'Mini Coil (Daily)', '🌀', 'pat-purple', 'A small volatility squeeze on the daily chart.'],
    [/^IB DAILY|INSIDE BAR.*DAILY/, 'Inside Bar (Daily)', '🕯️', 'pat-purple', "Today's high-low range is inside yesterday's range."],
    [/^DIB DAILY/, 'Double Inside Bar (Daily)', '🕯️', 'pat-purple', 'Two consecutive inside bars: a very tight squeeze.'],
    [/MONTHLY INSIDE BAR NEAR 20 ?EMA/, 'Monthly Inside Bar near 20-EMA', '🕯️', 'pat-purple', 'Monthly inside bar sitting close to the 20-period moving average.'],
    [/IPO/, 'Recent IPOs', '🆕', 'pat-blue', 'Recently listed stocks.'],
    [/TOP GAINERS/, 'Top Gainers (above +4%)', '🟢', 'pat-green', 'Up more than 4% today.'],
    [/TOP LO+SERS/, 'Top Losers (below -4%)', '🔴', 'pat-rose', 'Down more than 4% today.'],
    [/MICKKK SCREENER/, 'Mickkk Screener', '⭐', 'pat-green', 'Stocks that pass the Mickkk core screen.'],
    [/MANAS ARORA/, 'Reversal Setup (Manas Arora)', '🔄', 'pat-purple', 'Reversal strategy scan.'],
    [/DELAYED EP/, 'Delayed Episodic Pivot', '💥', 'pat-orange', 'An earlier Episodic Pivot (big gap on news/earnings) that is still setting up.'],
    [/EP SCANNER/, 'Episodic Pivot (EP)', '💥', 'pat-orange', 'Big gap-up on strong volume, usually after earnings or news.']
  ];
  function titleCase(s) { return String(s).toLowerCase().replace(/(^|[\s\/(&-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  var cache = {};
  window.patternInfo = function (raw) {
    if (cache[raw]) return cache[raw];
    var clean = String(raw || '').replace(/\(\d+\)/g, '').trim(), up = clean.toUpperCase(), out = null;
    for (var i = 0; i < P.length; i++) if (P[i][0].test(up)) { out = { label: P[i][1], icon: P[i][2], cls: P[i][3], tip: P[i][4] }; break; }
    if (!out) out = { label: titleCase(clean), icon: '⚡', cls: 'pat-cyan', tip: 'Stocks matching the "' + titleCase(clean) + '" scan.' };
    cache[raw] = out; return out;
  };

  /* ---------------- Column explanations ---------------- */
  var C = {
    'stock / symbol': 'NSE symbol and company name. The icons open the chart on Mickkk, TradingView and Chartink.',
    'rs rating': 'Relative strength rating from 1 (weakest) to 99 (strongest) compared with all stocks. Use the dropdown to choose the RS model.',
    'sector / industry': 'Business sector (top line) and industry (second line).',
    'cap category': 'Large, Mid, Small or Micro cap, based on market capitalisation.',
    'ltp': 'Last traded price (latest close).', 'volume': 'Number of shares traded in the latest session.',
    'market cap (cr)': 'Market capitalisation in ₹ crore.',
    '30d turnover (cr)': 'Average daily traded value over 30 days in ₹ crore. Higher means easier to trade.',
    '20d turnover (cr)': 'Average daily traded value over 20 days in ₹ crore.',
    'd %': "Today's price change.", 'w %': 'Price change over 1 week.', '15d %': 'Price change over 15 days.', 'm %': 'Price change over 1 month.',
    'q %': 'Price change over 3 months (quarter).', 'h %': 'Price change over 6 months (half year).', 'y %': 'Price change over 1 year.',
    '52wh away': 'Distance from the 52-week high. 0% means at the high; -20% means 20% below it.',
    'rsi': 'Relative Strength Index (14 days). Above 70 is overbought, below 30 is oversold.',
    'away ema 200': 'How far the price is from its 200-day moving average. Positive = above the long-term trend.',
    'd range': "Today's high-to-low range as % of price. Lower means calmer trading.",
    '3d range': 'High-to-low range of the last 3 days as % of price.', '5d range': 'High-to-low range of the last 5 days as % of price.',
    '10d range': 'High-to-low range of the last 10 days as % of price.', '20d range': 'High-to-low range of the last 20 days as % of price.', '30d range': 'High-to-low range of the last 30 days as % of price.',
    'detected patterns': 'Chart patterns and scans this stock currently matches. Hover a tag for its meaning.',
    'rs raw': 'Raw relative-strength score from the sheet (not the 1-99 rating).',
    'rs raw (m)': 'Raw monthly relative-strength score from the sheet.',
    '1d rel. return': "Stock's 1-day return minus the benchmark's. Positive = outperforming.",
    '1w rel. return': "Stock's 1-week return minus the benchmark's.", '15d rel. return': "Stock's 15-day return minus the benchmark's.",
    '1m rel. return': "Stock's 1-month return minus the benchmark's.", '3m rel. return': "Stock's 3-month return minus the benchmark's.",
    '6m rel. return': "Stock's 6-month return minus the benchmark's.", '1y rel. return': "Stock's 1-year return minus the benchmark's.",
    'overall rs rank': 'Final rank: the average of the five RS model ranks. 1 = strongest.',
    'average rank': 'Simple average of the five model ranks.',
    'abs. rs near-term · score': "Stock's own weighted return over short periods (1W, 15D, 1M, 3M). Higher is stronger.",
    'abs. rs near-term · rank': 'Rank by the near-term absolute RS score.',
    'abs. rs standard · score': "Stock's own weighted return over longer periods (1W to 1Y).", 'abs. rs standard · rank': 'Rank by the standard absolute RS score.',
    'rel. rs near-term · score': 'Near-term returns measured against the benchmark index.', 'rel. rs near-term · rank': 'Rank by the near-term relative RS score.',
    'rel. rs standard · score': 'Longer-term returns measured against the benchmark index.', 'rel. rs standard · rank': 'Rank by the standard relative RS score.',
    'short-term rs · score': 'Weighted momentum: 1W 40%, 15D 35%, 1M 25%.', 'short-term rs · rank': 'Rank by the short-term RS score.',
    'previous rank': 'Short-term RS rank on the previous snapshot.', 'current rank': 'Short-term RS rank now.',
    'rank change': 'Places gained since the previous snapshot. Bigger = faster improvement.', 'short-term rs rating': 'Short-term RS rating from 1 to 99.',
    'signal': 'Type of early signal detected for this stock.', 'near-term rs rank': 'Rank by near-term RS. Lower is stronger.', 'standard rs rank': 'Rank by standard RS. Lower is stronger.',
    'rs momentum': 'How many places the near-term RS rank is ahead of the standard RS rank.',
    'distance from 200 ema': 'Distance of price from the 200-day moving average.', 'below 52w high %': 'How far below the 52-week high the price is.',
    'rsi (14)': 'Relative Strength Index over 14 days.', 'stage': 'Market stage: 1 Basing, 2 Advancing, 3 Topping, 4 Declining.'
  };
  function norm(t) {
    return String(t || '').replace(/[⇅▲▼↑↓×＋🔼]/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  window.colTip = function (h) { return C[norm(h)] || ('Value from the "' + String(h).trim() + '" column of the data sheet.'); };

  /* ---------------- Buttons / controls ---------------- */
  var B = {
    'reset': 'Reset every filter, search and selection to the defaults.',
    'clear chips': 'Deselect all quick filters and pattern scanners. Range filters stay.',
    'columns': 'Choose which columns appear in the table.',
    'copy symbols': 'Copy the symbols of all stocks shown, ready to paste into a watchlist.',
    'copy': 'Copy the symbols of all stocks shown.',
    'export csv': 'Download the table as a CSV file (Pro feature).', 'csv': 'Download the table as a CSV file (Pro feature).',
    'refresh': 'Reload the latest data. Data is cached for about 5 minutes to keep the site fast.',
    'default': 'Recommended columns.', 'all': 'Show every column from the sheet.', 'technicals': 'Price, momentum, moving averages and ranges.',
    'valuation': 'Market cap, P/E, P/B, ROCE and similar ratios.', 'sales & profit': 'Sales, profit and margin columns.', 'holding': 'FII, DII and promoter holding.',
    'custom': 'Your own column selection.',
    'rs model weights': 'View or change how much each time period counts in the RS models.',
    'match all': 'A stock must match every selected pattern.', 'match any': 'A stock can match any one of the selected patterns.',
    'show all': 'Show every pattern.', 'show less': 'Show fewer patterns.',
    'hide filters': 'Collapse the filter area to see more of the table.', 'show filters': 'Expand the filter area.',
    'apply': 'Apply the selection.', 'select all': 'Tick every visible item.', 'deselect all': 'Untick every visible item.',
    'daily': 'Stocks beating the benchmark today.', 'weekly': 'Stocks beating the benchmark over 1 week.', '15 days': 'Stocks beating the benchmark over 15 days.',
    'monthly': 'Stocks beating the benchmark over 1 month.', 'quarterly': 'Stocks beating the benchmark over 3 months.', 'yearly': 'Stocks beating the benchmark over 1 year.',
    'timeframe:': 'How far back the rank trend chart goes.', '1w': 'Last 1 week', '15d': 'Last 15 days', '1m': 'Last 1 month', '3m': 'Last 3 months', '6m': 'Last 6 months', '1y': 'Last 1 year',
    'overall · top 50': 'Top 50 by overall RS rank.', 'overall · top 100': 'Top 100 by overall RS rank.', 'short-term · top 50': 'Top 50 by short-term RS rank.',
    'absolute (near-term) · top 50': 'Top 50 by near-term absolute RS.', 'absolute (standard) · top 50': 'Top 50 by standard absolute RS.',
    'relative (near-term) · top 50': 'Top 50 by near-term relative RS.', 'relative (standard) · top 50': 'Top 50 by standard relative RS.',
    'early stage 2 breakout': 'Early breakout into Stage 2 (advancing).', 'stage 1 base reversal': 'Base-building stock where RS is starting to turn up.', 'new uptrend start': 'A fresh uptrend that has just begun.'
  };
  var SELECTORS = '.btn-tool, .chip, .matrix-btn, .tf-pill, .seg button, .flt-link, .flt-collapse, #master-table th, table th, .bench-tile, .rs-leader-title, .view-matrix-label, .flt-sec-title, .fr-label span, .rf-title, .rf-row label';
  var G = { 'overall rs · top 10': 'The ten strongest stocks by overall RS rank.', 'absolute rs (near-term) · top 10': 'Top 10 by near-term absolute RS.', 'absolute rs (standard) · top 10': 'Top 10 by standard absolute RS.',
    'relative rs (near-term) · top 10': 'Top 10 by near-term RS versus the benchmark.', 'relative rs (standard) · top 10': 'Top 10 by standard RS versus the benchmark.', 'short-term rs · top 10': 'Top 10 by short-term RS.',
    'range filters': 'Type a minimum and/or maximum. Leave a box blank for no limit.', 'patterns & scanners': 'Chart patterns detected by the live scanners. Click to filter.', 'technical': 'Quick filters based on price, momentum and moving averages.',
    'fundamental': 'Quick filters based on company financials.', 'custom filter': 'Filter on any numeric column of the sheet.',
    'price & volume': 'Price level, traded volume, size and liquidity.', 'momentum': 'Recent price momentum and relative strength.', 'trend & highs': 'Position relative to highs and long-term trend.',
    'volatility (range %)': 'How wide the recent high-to-low range has been. Lower means tighter.' };
  function tipFor(el) {
    var t = norm(el.textContent);
    if (el.matches('th')) return C[t] || '';
    return B[t] || G[t] || '';
  }
  function applyTips(root) {
    (root || document).querySelectorAll(SELECTORS).forEach(function (el) {
      if (el.hasAttribute('data-tip')) return;
      var tip = tipFor(el); if (tip) el.setAttribute('data-tip', tip);
    });
  }
  window.applyTips = applyTips;
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { applyTips(document); }, 120); }
  function init() {
    applyTips(document);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
