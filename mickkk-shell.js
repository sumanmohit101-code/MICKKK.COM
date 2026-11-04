/* =========================================================================
   MICKKK SHELL — sidebar collapse/expand, theme toggle, pro modal, date chip.
   Login itself lives in mickkk-gate.js + auth.js (Firebase Google login).
   Storage keys match the Market Data page: theme, mickkk_sidebar_collapsed.
   ========================================================================= */
(function () {
  'use strict';
  var SIDEBAR_KEY = 'mickkk_sidebar_collapsed';
  var WHATSAPP_NUMBER = '917086054184';

  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------------- SIDEBAR (instant: only toggles classes, no icon re-scan) ---------------- */
  function applySidebar(collapsed) {
    var sb = $('sidebar'), main = $('mainContent');
    if (!sb || !main) return;
    sb.classList.toggle('sidebar-collapsed', collapsed);
    main.classList.toggle('main-collapsed', collapsed);
    var btn = $('collapseBtn'); if (btn) btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
  window.toggleSidebar = function () {
    var collapsed = !$('sidebar').classList.contains('sidebar-collapsed');
    applySidebar(collapsed);
    lsSet(SIDEBAR_KEY, collapsed ? 'true' : 'false');
  };

  /* ---------------- THEME (sun/moon switched by CSS) ---------------- */
  window.toggleTheme = function () {
    var isDark = document.documentElement.classList.toggle('dark');
    lsSet('theme', isDark ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('mickkk:theme', { detail: { dark: isDark } }));
  };

  /* ---------------- PRO MODAL ---------------- */
  window.openProModal = function () { var m = $('proModal'); if (m) m.classList.add('open'); };
  window.closeProModal = function () { var m = $('proModal'); if (m) m.classList.remove('open'); };
  window.openWhatsAppTrialModal = function () {
    var u = window.MickkkGate && window.MickkkGate.user;
    var emailText = u && u.email ? ' for my registered email: ' + u.email : '';
    var msg = encodeURIComponent('Hi Mickkk Team! Please activate my 7-day Pro Free Trial' + emailText + '.');
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
    window.closeProModal();
  };

  /* ---------------- HEADER DATE (e.g. "Wed, 21 Oct 2026") ---------------- */
  function setDateChip() {
    var el = $('headerDateDisplay'); if (!el) return;
    el.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }


  /* ---------------- HOVER TIPS: any element with data-tip="..." ---------------- */
  function initTips() {
    var tip = document.createElement('div'); tip.id = 'mkTip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
    var cur = null, t = null;
    function show(el) {
      var text = el.getAttribute('data-tip'); if (!text) return;
      tip.textContent = text; tip.classList.add('on');
      var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      var top = r.bottom + 8; if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function hide() { clearTimeout(t); cur = null; tip.classList.remove('on'); }
    document.addEventListener('mouseover', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (!el || el === cur) return;
      if (el.closest('#sidebar.sidebar-collapsed')) return;      // sidebar has its own tooltip
      cur = el; clearTimeout(t); t = setTimeout(function () { if (cur === el) show(el); }, 280);
    });
    document.addEventListener('mouseout', function (e) { if (cur && !(e.relatedTarget && cur.contains(e.relatedTarget))) hide(); });
    document.addEventListener('scroll', hide, true); document.addEventListener('mousedown', hide, true);
  }

  function init() {
    initTips();
    var saved = lsGet(SIDEBAR_KEY);
    var small = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    // first paint without animation, so the page never "slides" on load
    var sb = $('sidebar'), main = $('mainContent');
    if (sb) sb.classList.add('no-anim'); if (main) main.classList.add('no-anim');
    applySidebar(saved === 'true' || (saved === null && small));
    setDateChip();
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (sb) sb.classList.remove('no-anim'); if (main) main.classList.remove('no-anim');
    }); });

    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeProModal(); });
    var pm = $('proModal');
    if (pm) pm.addEventListener('mousedown', function (e) { if (e.target === pm) window.closeProModal(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
