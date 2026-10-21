/* =========================================================================
   MICKKK SHELL — sidebar collapse/expand, theme toggle, login, pro modal
   Shared by every page. Storage keys are the same as the Market Data page
   (theme, mickkk_sidebar_collapsed) so settings carry across pages.
   ========================================================================= */
(function () {
  'use strict';

  var SIDEBAR_KEY = 'mickkk_sidebar_collapsed';
  var AUTH_KEY = 'mickkk_user';
  var WHATSAPP_NUMBER = '917086054184';

  function $(id) { return document.getElementById(id); }
  function icons() { if (window.lucide && lucide.createIcons) lucide.createIcons(); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  /* ---------------- SIDEBAR ---------------- */
  function applySidebar(collapsed) {
    var sb = $('sidebar'), main = $('mainContent'), btn = $('collapseBtn');
    if (!sb || !main) return;
    sb.classList.toggle('sidebar-collapsed', collapsed);
    main.classList.toggle('main-collapsed', collapsed);
    if (btn) {
      btn.innerHTML = '<i data-lucide="' + (collapsed ? 'chevron-right' : 'chevron-left') + '"></i>';
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }
    icons();
  }
  window.toggleSidebar = function () {
    var collapsed = !$('sidebar').classList.contains('sidebar-collapsed');
    applySidebar(collapsed);
    lsSet(SIDEBAR_KEY, collapsed ? 'true' : 'false');
  };

  /* ---------------- THEME ---------------- */
  function syncThemeIcons(isDark) {
    ['sunIconSide', 'sunIconMini'].forEach(function (id) { var e = $(id); if (e) e.style.display = isDark ? 'none' : ''; });
    ['moonIconSide', 'moonIconMini'].forEach(function (id) { var e = $(id); if (e) e.style.display = isDark ? '' : 'none'; });
  }
  window.toggleTheme = function () {
    var isDark = document.documentElement.classList.toggle('dark');
    lsSet('theme', isDark ? 'dark' : 'light');
    syncThemeIcons(isDark);
    window.dispatchEvent(new CustomEvent('mickkk:theme', { detail: { dark: isDark } }));
  };

  /* ---------------- MODAL HELPERS ---------------- */
  function openModal(id) { var m = $(id); if (m) { m.classList.add('open'); icons(); } }
  function closeModal(id) { var m = $(id); if (m) m.classList.remove('open'); }

  window.openProModal = function () { openModal('proModal'); };
  window.closeProModal = function () { closeModal('proModal'); };
  window.openWhatsAppTrialModal = function () {
    var msg = encodeURIComponent('Hi Mickkk Team! Please activate my 7-day Pro Free Trial.');
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
    closeModal('proModal');
  };

  /* ---------------- LOGIN (front-end session) ----------------
     NOTE: this stores the profile in this browser only (localStorage).
     To connect a real backend, set window.MickkkAuth.onLogin / onLogout, or
     replace submitLogin() with a fetch() to your auth endpoint and then call
     MickkkAuth.setUser({ name, email, plan }).                              */
  function getUser() {
    try { return JSON.parse(lsGet(AUTH_KEY) || 'null'); } catch (e) { return null; }
  }
  function setUser(u) {
    lsSet(AUTH_KEY, JSON.stringify(u));
    renderAuth();
  }
  function renderAuth() {
    var u = getUser();
    var loggedIn = !!u;
    var name = loggedIn ? (u.name || u.email.split('@')[0]) : 'Guest';
    var plan = loggedIn && u.plan === 'pro' ? 'pro' : 'free';
    var letter = (name.charAt(0) || 'M').toUpperCase();
    window.userRole = plan;

    var nameEl = $('sideUserName'); if (nameEl) { nameEl.textContent = name; nameEl.title = loggedIn ? u.email : 'Not logged in'; }
    var badge = $('sidePlanBadge');
    if (badge) { badge.textContent = loggedIn ? (plan === 'pro' ? 'Pro Member' : 'Free Tier') : 'Not logged in'; badge.classList.toggle('pro', plan === 'pro'); }
    var up = $('sideUpgradeLink'); if (up) up.style.display = (loggedIn && plan !== 'pro') || !loggedIn ? '' : 'none';

    ['sideUserAvatar', 'sideUserAvatarMini'].forEach(function (id) {
      var el = $(id); if (!el) return;
      el.classList.toggle('guest', !loggedIn);
      el.firstChild.nodeValue = letter;
    });
    var mini = $('sideCollapsedUserWrap'); if (mini) mini.setAttribute('data-title', loggedIn ? name + ' • ' + (plan === 'pro' ? 'Pro' : 'Free') : 'Guest • Login');

    document.querySelectorAll('[data-auth="in"]').forEach(function (e) { e.style.display = loggedIn ? '' : 'none'; });
    document.querySelectorAll('[data-auth="out"]').forEach(function (e) { e.style.display = loggedIn ? 'none' : ''; });
    icons();
  }
  window.openLoginModal = function () {
    var err = $('loginErr'); if (err) err.textContent = '';
    openModal('loginModal');
    var f = $('loginEmail'); if (f) setTimeout(function () { f.focus(); }, 50);
  };
  window.closeLoginModal = function () { closeModal('loginModal'); };
  window.submitLogin = function (ev) {
    if (ev) ev.preventDefault();
    var name = ($('loginName').value || '').trim();
    var email = ($('loginEmail').value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { $('loginErr').textContent = 'Please enter a valid email address.'; return false; }
    var prev = getUser();
    var user = { name: name, email: email, plan: prev && prev.email === email ? prev.plan : 'free' };
    setUser(user);
    closeModal('loginModal');
    if (window.MickkkAuth && typeof window.MickkkAuth.onLogin === 'function') window.MickkkAuth.onLogin(user);
    return false;
  };
  window.logoutUser = function () {
    lsDel(AUTH_KEY);
    renderAuth();
    if (window.MickkkAuth && typeof window.MickkkAuth.onLogout === 'function') window.MickkkAuth.onLogout();
  };
  window.MickkkAuth = Object.assign(window.MickkkAuth || {}, { getUser: getUser, setUser: setUser, logout: window.logoutUser });

  /* ---------------- HEADER DATE CHIP ---------------- */
  function setDateChip() {
    var el = $('headerDateDisplay'); if (!el) return;
    el.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ---------------- INIT ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    syncThemeIcons(document.documentElement.classList.contains('dark'));
    var saved = lsGet(SIDEBAR_KEY);
    var small = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    applySidebar(saved === 'true' || (saved === null && small));
    renderAuth();
    setDateChip();
    icons();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal('loginModal'); closeModal('proModal'); }
    });
    ['loginModal', 'proModal'].forEach(function (id) {
      var m = $(id); if (!m) return;
      m.addEventListener('mousedown', function (e) { if (e.target === m) closeModal(id); });
    });
  });
})();
