/* =========================================================================
   MICKKK NAV — the ONE place that builds the sidebar for every page.
   (classic script. Load it right after the sidebar placeholder, BEFORE mickkk-shell.js)

   In a page you only write:
       <aside id="sidebar" class="mk-sidebar" data-active="overview"></aside>
       <script src="./mickkk-nav.js"></script>

   data-active = one of the keys in NAV below (overview, breadth, marketdata,
   screener, charts, journal, guide ...).

   To add / rename / re-order a menu item, or to make a "coming soon" item live:
   edit the NAV list below. Every page updates. Nothing else to touch.

   It also injects (only if the page does not already have them):
     - the shared Mickkk logo symbol  (#mick-icon)
     - the Pro upgrade popup          (#proModal)
   ========================================================================= */
(function () {
  'use strict';

  var VERSION = 'v1.0.42';

  // key, href, title, lucide icon, optional icon colour class, soon = page not built yet
  var NAV = [
    { key: 'overview',   href: 'overview.html',   title: 'Market Overview',   icon: 'layout-dashboard' },
    { key: 'breadth',    href: 'breadth.html',    title: 'Market Breadth',    icon: 'activity', cls: 'ic-green' },
    { key: 'marketdata', href: 'marketdata.html', title: 'Market Data',       icon: 'database', cls: 'ic-green' },
    { key: 'screener',   href: 'screener.html',   title: 'Stock Screener',    icon: 'scan' },
    { key: 'index',      href: '#',               title: 'Index Terminal',    icon: 'layers', soon: true },
    { key: 'sector',     href: '#',               title: 'Sector &amp; Industry', icon: 'pie-chart', soon: true },
    { key: 'charts',     href: 'chart.html',      title: 'Charts',            icon: 'candlestick-chart' },
    { key: 'journal',    href: 'journal.html',    title: 'Trading Journal',   icon: 'book-open' },
    { key: 'guide',      href: 'guide.html',      title: 'Journal Guide',     icon: 'help-circle', cls: 'ic-blue' }
  ];

  var SYMBOL =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<linearGradient id="mkM" gradientUnits="userSpaceOnUse" x1="6" y1="10" x2="50" y2="92"><stop offset="0" style="stop-color:var(--mk-m1)"/><stop offset="1" style="stop-color:var(--mk-m2)"/></linearGradient>' +
    '<linearGradient id="mkMR" gradientUnits="userSpaceOnUse" x1="48" y1="54" x2="84" y2="14"><stop offset="0" style="stop-color:var(--mk-m1)"/><stop offset="1" style="stop-color:var(--mk-m2);stop-opacity:.25"/></linearGradient>' +
    '<linearGradient id="mkG" gradientUnits="userSpaceOnUse" x1="20" y1="92" x2="96" y2="6"><stop offset="0" style="stop-color:var(--mk-g1)"/><stop offset=".55" style="stop-color:var(--mk-g2)"/><stop offset="1" style="stop-color:var(--mk-g3)"/></linearGradient>' +
    '<linearGradient id="mkShaft" gradientUnits="userSpaceOnUse" x1="20" y1="86" x2="82" y2="24"><stop offset="0" style="stop-color:var(--mk-g2);stop-opacity:0"/><stop offset=".4" style="stop-color:var(--mk-g2);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--mk-g3)"/></linearGradient>' +
    '<clipPath id="mkClip"><path d="M0 0H100V100H22L0 78Z"/></clipPath>' +
    '<symbol id="mick-icon" viewBox="0 0 100 100">' +
    '<g clip-path="url(#mkClip)">' +
    '<path d="M48 54 L80 18 L80 94" fill="none" stroke="url(#mkMR)" stroke-width="19" stroke-linejoin="round"/>' +
    '<path d="M15 96 L15 18 L48 54" fill="none" stroke="url(#mkM)" stroke-width="19" stroke-linejoin="round"/>' +
    '<path d="M8 16 L48 54 L48 62 L8 24Z" fill="#fff" opacity=".28"/></g>' +
    '<rect x="32" y="80" width="8" height="12" rx="1.6" fill="url(#mkG)"/>' +
    '<rect x="43" y="68" width="8" height="24" rx="1.6" fill="url(#mkG)"/>' +
    '<rect x="54" y="56" width="8" height="36" rx="1.6" fill="url(#mkG)"/>' +
    '<g class="mk-glow"><polygon points="20,88 77,22 83,29" fill="url(#mkShaft)"/>' +
    '<polygon points="97,6 88,38 64,14" fill="url(#mkG)" stroke="url(#mkG)" stroke-width="2.5" stroke-linejoin="round"/></g>' +
    '</symbol></defs></svg>';

  var PRO_MODAL =
    '<div id="proModal" class="mk-modal" role="dialog" aria-modal="true">' +
    '<div class="mk-modal-card">' +
    '<button class="mk-modal-close" onclick="closeProModal()" aria-label="Close"><i data-lucide="x"></i></button>' +
    '<div class="mk-modal-icon"><i data-lucide="zap"></i></div>' +
    '<h3>Upgrade to Pro Institutional</h3>' +
    '<p class="sub">Unlock the full Stock Master universe, deep RS history, extended trend analytics and complete unblurred market archives.</p>' +
    '<button onclick="openWhatsAppTrialModal()" class="mk-modal-btn"><i data-lucide="message-circle"></i><span>Claim 7-Day Free Pro on WhatsApp</span></button>' +
    '<p class="mk-modal-note">Instant verification \u2022 Zero fees</p>' +
    '</div></div>';

  var CHEV =
    '<svg class="chev-l" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>' +
    '<svg class="chev-r" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

  var sb = document.getElementById('sidebar');
  if (!sb) return;
  var active = sb.getAttribute('data-active') || '';
  sb.classList.add('mk-sidebar');

  if (!document.getElementById('mick-icon')) document.body.insertAdjacentHTML('afterbegin', SYMBOL);

  var links = NAV.map(function (n) {
    var on = n.key === active;
    return '<a href="' + n.href + '" data-title="' + n.title + '" class="nav-item' + (on ? ' active' : '') + '"' +
      (on ? ' aria-current="page"' : '') + (n.soon ? ' data-soon data-tip="Coming soon"' : '') + '>' +
      '<i data-lucide="' + n.icon + '" class="' + (n.cls || '') + '"></i> <span class="nav-text">' + n.title + '</span></a>';
  }).join('');

  sb.innerHTML =
    '<button id="collapseBtn" onclick="toggleSidebar()" aria-label="Toggle Sidebar" class="collapse-float-btn">' + CHEV + '</button>' +
    '<div class="mk-sb-top">' +
      '<a href="index.html" title="Mickkk.com Home" class="mk-logo brand-container">' +
        '<svg viewBox="0 0 100 100" class="mk-logo-icon"><use href="#mick-icon"/></svg>' +
        '<div class="brand-text">' +
          '<div class="mk-line"><span class="mk-word">Mickkk</span><span class="mk-dot"></span><span class="mk-com">com</span></div>' +
          '<div class="mk-tagrow"><i></i><span class="mk-tag">Trade Smarter</span><i></i></div>' +
        '</div>' +
      '</a>' +
      '<div class="mk-divider"></div>' +
      '<nav class="mk-nav">' + links + '</nav>' +
    '</div>' +
    '<div>' +
      '<div class="sidebar-bottom-expanded mk-userbar">' +
        '<div class="mk-usercard">' +
          '<div class="mk-user-left">' +
            '<div class="mk-avatar auth-user-avatar" id="sideUserAvatar">G</div>' +
            '<div style="min-width:0">' +
              '<div class="mk-uname auth-user-name" id="sideUserName">Guest</div>' +
              '<div class="mk-uplan">' +
                '<span id="sidePlanBadge" class="mk-badge">Free Tier</span>' +
                '<button onclick="openProModal()" id="sideUpgradeLink" class="mk-link">Upgrade</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="mk-icons">' +
            '<button onclick="toggleTheme()" class="mk-iconbtn" title="Toggle Theme" aria-label="Toggle Theme"><i data-lucide="sun" class="ico-sun"></i><i data-lucide="moon" class="ico-moon"></i></button>' +
            '<button onclick="mkLogout()" class="mk-iconbtn danger" title="Logout" aria-label="Logout"><i data-lucide="log-out"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="mk-email auth-user-email" id="sideUserEmail"></div>' +
        '<div class="mk-ver">' + VERSION + '</div>' +
      '</div>' +
      '<div class="sidebar-bottom-collapsed">' +
        '<div id="sideCollapsedUserWrap" data-title="User" style="position:relative;cursor:default">' +
          '<div id="sideUserAvatarMini" class="mk-avatar auth-user-avatar">G</div>' +
        '</div>' +
        '<button onclick="toggleTheme()" class="mk-iconbtn" data-title="Toggle theme" aria-label="Toggle Theme"><i data-lucide="sun" class="ico-sun"></i><i data-lucide="moon" class="ico-moon"></i></button>' +
        '<button onclick="mkLogout()" class="mk-iconbtn danger" data-title="Logout" aria-label="Logout"><i data-lucide="log-out"></i></button>' +
      '</div>' +
    '</div>';

  // "coming soon" items must not jump to the top of the page
  Array.prototype.forEach.call(sb.querySelectorAll('[data-soon]'), function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

  if (!document.getElementById('proModal')) document.body.insertAdjacentHTML('beforeend', PRO_MODAL);
})();
