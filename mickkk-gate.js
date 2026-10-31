/* =========================================================================
   MICKKK GATE — "no login, no page" + Pro locks.     (ES module)
   Works with your auth.js (Firebase Google login + Firestore role).

   Use on ANY page, one line (after the page's other scripts):
       <script type="module" src="./mickkk-gate.js"></script>

   What it does
   - Shows a full-screen "Continue with Google" screen until the user is logged in.
   - After login: hides the gate, fills .auth-user-* elements (via auth.js),
     sets  window.MickkkGate = { user, role, isPro(), requirePro() }
     and fires   window.dispatchEvent(new CustomEvent('mickkk:authed', {detail:{user, role}}))
   - Pro locks: put  data-pro  on any button/tab/link. Free users see a PRO badge
     and clicking opens the upgrade popup. In JS use:  if (!MickkkGate.requirePro()) return;
   NOTE: client-side locks are a UI gate only. For truly secret data, verify the
   Firebase token on the server/Worker.
   ========================================================================= */

const CSS = `
html.mk-locked, html.mk-locked body { overflow: hidden !important; }
#mkGate { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 20px;
  background: radial-gradient(1200px 600px at 20% -10%, rgba(16,185,129,.16), transparent 60%), radial-gradient(900px 500px at 100% 110%, rgba(56,189,248,.14), transparent 60%), var(--bg-dark, #070d18);
  font-family: 'Plus Jakarta Sans','Inter',sans-serif; color: var(--sh-text, #f1f5f9); }
#mkGate[hidden] { display: none; }
#mkGate .g-card { width: 100%; max-width: 400px; text-align: center; padding: 32px 28px; border-radius: 24px;
  background: var(--sh-card, #0d162b); border: 1px solid var(--sh-border, #17243e); box-shadow: 0 30px 80px rgba(0,0,0,.35); }
#mkGate .g-logo { width: 64px; height: 64px; margin: 0 auto 10px; display: block; }
#mkGate .g-brand { font-family: 'Montserrat','Inter',sans-serif; font-weight: 900; font-size: 26px; letter-spacing: -.02em; }
#mkGate .g-brand b { color: var(--sh-brand, #00f5a0); font-weight: 900; }
#mkGate h2 { margin: 18px 0 6px; font-size: 17px; font-weight: 800; color: var(--text-strong, #fff); }
#mkGate p { margin: 0 0 18px; font-size: 12.5px; line-height: 1.6; color: var(--sh-muted, #94a3b8); }
#mkGate .g-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px 16px; border-radius: 12px;
  border: 1px solid var(--sh-border, #334155); background: #fff; color: #1f2937; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit;
  transition: transform .12s, box-shadow .12s; }
#mkGate .g-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(0,0,0,.25); }
#mkGate .g-btn:disabled { opacity: .6; cursor: wait; transform: none; }
#mkGate .g-btn svg { width: 18px; height: 18px; }
#mkGate .g-note { margin-top: 14px; font-size: 10.5px; color: var(--sh-muted, #94a3b8); }
#mkGate .g-err { margin-top: 12px; font-size: 12px; font-weight: 600; color: #f43f5e; min-height: 16px; }
#mkGate .g-spin { width: 26px; height: 26px; border-radius: 50%; border: 3px solid rgba(148,163,184,.25); border-top-color: #10b981; margin: 6px auto 0; animation: mkspin .8s linear infinite; }
@keyframes mkspin { to { transform: rotate(360deg); } }
.pro-locked { position: relative; cursor: pointer; }
.pro-locked::after { content: 'PRO'; position: absolute; top: -7px; right: -6px; font-size: 8px; font-weight: 900; letter-spacing: .05em; line-height: 1;
  padding: 3px 5px; border-radius: 6px; background: linear-gradient(135deg,#f59e0b,#ef4444); color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.3); pointer-events: none; }
.pro-locked > * { opacity: .75; }
`;

const GOOGLE_SVG = `<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.7 7l7.3 5.7c4.3-4 6.8-9.9 6.8-17.2z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.300-5.700c-2 1.400-4.600 2.200-8.600 2.200-6.300 0-11.600-4.100-13.500-9.900l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>`;

const state = { user: null, role: 'free', ready: false };
let A = null; // auth.js module

function $(id) { return document.getElementById(id); }

function injectUI() {
  if ($('mkGate')) return;
  const st = document.createElement('style'); st.id = 'mk-gate-css'; st.textContent = CSS; document.head.appendChild(st);
  document.documentElement.classList.add('mk-locked');
  const g = document.createElement('div'); g.id = 'mkGate';
  g.innerHTML = `
    <div class="g-card">
      <svg class="g-logo" viewBox="0 0 100 100"><use href="#mick-icon"/></svg>
      <div class="g-brand">Mickkk<b>.com</b></div>
      <div id="mkGateLoading"><div class="g-spin"></div><p style="margin-top:12px">Checking login…</p></div>
      <div id="mkGateLogin" hidden>
        <h2>Login to open the terminal</h2>
        <p>Sign in with your Google account to access the screener, RS rankings and market tools.</p>
        <button class="g-btn" id="mkGateBtn" type="button">${GOOGLE_SVG}<span>Continue with Google</span></button>
        <div class="g-err" id="mkGateErr"></div>
        <div class="g-note">Free account • Pro features unlock with upgrade</div>
      </div>
    </div>`;
  document.body.appendChild(g);
  $('mkGateBtn').addEventListener('click', doLogin);

  // Block clicks on Pro-locked controls (capture phase = before the page's own handlers)
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.pro-locked');
    if (!el) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (window.openProModal) window.openProModal();
  }, true);
}

function showLogin(msg) {
  injectUI();
  $('mkGate').hidden = false;
  document.documentElement.classList.add('mk-locked');
  $('mkGateLoading').hidden = true;
  $('mkGateLogin').hidden = false;
  if (msg) $('mkGateErr').textContent = msg;
}
function hideGate() {
  const g = $('mkGate'); if (g) g.hidden = true;
  document.documentElement.classList.remove('mk-locked');
}

async function doLogin() {
  const btn = $('mkGateBtn'); $('mkGateErr').textContent = '';
  btn.disabled = true; btn.lastElementChild.textContent = 'Opening Google…';
  try { await A.loginWithGoogle(); }                      // onAuthStateChanged continues the flow
  catch (e) { if (e && e.code !== 'auth/popup-closed-by-user') $('mkGateErr').textContent = 'Login failed. Please try again.'; }
  btn.disabled = false; btn.lastElementChild.textContent = 'Continue with Google';
}

/* ---------- Pro locks ---------- */
function isPro() { return state.role === 'pro'; }
function applyRoleUI() {
  const pro = isPro();
  document.querySelectorAll('[data-pro]').forEach(el => el.classList.toggle('pro-locked', !pro));
  const badge = $('sidePlanBadge');
  if (badge) { badge.textContent = pro ? 'Pro Member' : 'Free Tier'; badge.classList.toggle('pro', pro); }
  const up = $('sideUpgradeLink'); if (up) up.style.display = pro ? 'none' : '';
  const mini = $('sideCollapsedUserWrap');
  if (mini) mini.setAttribute('data-title', (state.user && (state.user.displayName || state.user.email) || 'User') + (pro ? ' • Pro' : ' • Free'));
}
function requirePro() {
  if (isPro()) return true;
  if (window.openProModal) window.openProModal();
  return false;
}

window.MickkkGate = {
  get user() { return state.user; }, get role() { return state.role; }, get ready() { return state.ready; },
  isPro, requirePro, applyRoleUI
};
window.userRole = 'free';
window.mkLogout = () => (A ? A.logoutUser() : location.reload());
window.mkLogin = () => showLogin();

async function boot() {
  const wait = () => new Promise(r => (document.body ? r() : document.addEventListener('DOMContentLoaded', r, { once: true })));
  await wait();
  injectUI();
  try {
    A = await import('./auth.js');
  } catch (e) {
    console.error('auth.js failed to load', e);
    showLogin('Login service could not load. Open this page from your website (http/https), not from a local file.');
    return;
  }
  A.initAuthListener(async (user, role) => {
    state.user = user; state.role = role === 'pro' ? 'pro' : 'free'; state.ready = true;
    window.userRole = state.role;
    hideGate(); applyRoleUI();
    window.dispatchEvent(new CustomEvent('mickkk:authed', { detail: { user, role: state.role } }));
  }, () => {
    state.user = null; state.role = 'free'; state.ready = false; window.userRole = 'free';
    showLogin();
    window.dispatchEvent(new CustomEvent('mickkk:loggedout'));
  });
}
boot();
