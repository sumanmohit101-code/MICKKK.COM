/* =========================================================================
   MICKKK CACHE — fast data layer for all pages (classic script, load first)
   1) Every sheet/API call goes through your Cloudflare Worker (edge cache), so
      Google Sheets is hit ~once per 5 min instead of once per visitor.
   2) Browser HTTP cache (Cache-Control from the Worker) for repeat visits.
   3) IndexedDB "instant hydrate": last data shows in ~0s, fresh data swaps in
      silently (stale-while-revalidate). No 5 MB localStorage limit.
   4) Identical requests in flight are merged (no duplicate downloads).
   If the Worker is down, it falls back to Google directly.
   ========================================================================= */
(function () {
  'use strict';
  var WORKER = 'https://mickkk-com-cache.sumanmohit101.workers.dev/';
  var SHEET_ID = '13SG0bcfTGXLQfq14hb_rRrTUALq5GYUQuNegP_AH42Y';
  var DIRECT = {
    screener: 'https://script.google.com/macros/s/AKfycbwyf03hzfg05WOcl_TImieFbqTb7djfEuAmM5v31CVqMS2Du1-2GYX72xd26e4jsbFm8g/exec',
    scanners: 'https://script.google.com/macros/s/AKfycbzVL6f0CG_zF7c19DscTYxgAaDgKpS7ZQJc3NESbtdvwcyNESl08H3b-QoKuJfqFSOdXg/exec'
  };
  var DB_NAME = 'mickkk-cache', STORE = 'kv';
  var mem = new Map();          // key -> { t: timestamp, d: data }
  var db = null;
  var inflight = new Map();

  function openDB() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var done = false, to = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 1500);
      try {
        var rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(STORE); };
        rq.onsuccess = function () { if (!done) { done = true; clearTimeout(to); resolve(rq.result); } };
        rq.onerror = rq.onblocked = function () { if (!done) { done = true; clearTimeout(to); resolve(null); } };
      } catch (e) { done = true; clearTimeout(to); resolve(null); }
    });
  }

  function loadAll() {
    return new Promise(function (resolve) {
      if (!db) return resolve();
      try {
        var tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
        var kq = st.getAllKeys(), vq = st.getAll();
        tx.oncomplete = function () {
          var ks = kq.result || [], vs = vq.result || [];
          ks.forEach(function (k, i) { mem.set(k, vs[i]); });
          resolve();
        };
        tx.onerror = tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  function purgeOldLocalStorage() {
    try {                                   // old single-file version stored big JSON here
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('MICKKK_CACHE_') === 0) localStorage.removeItem(k); });
    } catch (e) {}
  }

  var MKC = {
    WORKER: WORKER,
    force: false,                           // true = skip browser cache once (Refresh button)
    init: async function () { db = await openDB(); await loadAll(); purgeOldLocalStorage(); },
    get: function (key) { var v = mem.get(key); return v ? v.d : null; },
    age: function (key) { var v = mem.get(key); return v ? (Date.now() - v.t) / 1000 : Infinity; },
    set: function (key, data) {
      var rec = { t: Date.now(), d: data };
      mem.set(key, rec);
      if (!db) return;
      try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec, key); } catch (e) {}
    },
    url: function (route, params) {
      var p = new URLSearchParams(Object.assign({ route: route }, params || {}));
      return WORKER + '?' + p.toString();
    },
    /** GET through the worker (falls back to Google directly). Returns a Response. */
    fetch: function (route, params) {
      var url = MKC.url(route, params), force = MKC.force;
      var key = url + (force ? '#f' : '');
      if (inflight.has(key)) return inflight.get(key).then(function (r) { return r.clone(); });
      var p = (async function () {
        try {
          var res = await fetch(url, { cache: force ? 'reload' : 'default' });
          if (!res.ok) throw new Error('worker ' + res.status);
          return res;
        } catch (e) {
          // fallback: straight to Google
          if (route === 'gviz') {
            return fetch('https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent((params || {}).sheet || ''));
          }
          var base = DIRECT[route]; if (!base) throw e;
          var q = new URLSearchParams(params || {}).toString();
          return fetch(base + (q ? '?' + q : ''));
        }
      })();
      inflight.set(key, p);
      p.finally(function () { setTimeout(function () { inflight.delete(key); }, 1500); }).catch(function () {});
      return p.then(function (r) { return r.clone(); });
    },
    gviz: function (sheet) { return MKC.fetch('gviz', { sheet: sheet }); },
    /** one-shot "bypass browser cache" window used by the Refresh button */
    forceFor: function (ms) { MKC.force = true; setTimeout(function () { MKC.force = false; }, ms || 8000); }
  };
  window.MKC = MKC;
})();
