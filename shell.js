'use strict';
// The Maitri company app: the frame every department's screens sit in. MIS · Product, 13 Oct 2026.
//   · Screens only. Nothing here holds data: every figure comes from a department's engine (a Google Apps Script) and is
//     shown, not kept. The service worker keeps these files on the phone and nothing else.
//   · One Google sign-in for the whole app. Google gives the phone an ID token (good for an hour); every call to an engine
//     carries it, and the engine checks it with Google before it answers. The token is held only while the app is open:
//     it is never written to the phone (Tanmay's ruling, 13 Oct). At each opening the app asks Google afresh, which is
//     silent where the phone allows it and one "Continue as" tap where it does not. This app never decides who may see what: the engine
//     says which tabs a person has.
//   · A department is a module: one file under modules/ and one line in config.js. The frame is not touched to add one.
(function () {
  var CFG = window.MAITRI_CONFIG, MODS = [], TAB = '', PAGE = null, flying = 0, TOKEN = null, started = false, gisReady = false, toastTimer = 0, renewTimer = 0, lastPerf = '', showPerf = false, swReg = null;
  var $ = function (id) { return document.getElementById(id); };
  function h(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ---- small things every screen uses ----
  function mark() { $('busy').className = flying > 0 ? 'on' : ''; }
  function toast(msg, bad) { var t = $('toast'); t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 9000 : 3500); }
  function sync(text) { $('sync').textContent = text || ''; }
  function perf() { var p = $('perf'); if (p && showPerf) p.textContent = CFG.version + ' · last answer: ' + lastPerf; }
  /** A button that sends something: it turns into "Saving…" at once, and comes back if the engine says no. */
  function press(btn, call, name, arg, then, label) { var was = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label || 'Saving…');
    call(name, arg).then(function (r) { btn.disabled = false; btn.innerHTML = was; then(r); }, function (e) { btn.disabled = false; btn.innerHTML = was; toast(e.message, true); }); }
  /** Something sent in the background: said at once, said again when it is saved, and said loudly if it was not. */
  function send(what, call, name, arg, done, failed) { sync('Saving…'); toast('Saving ' + what + '…');
    call(name, arg).then(function (r) { sync(flying ? 'Saving…' : 'Saved ✓'); setTimeout(function () { if (!flying) sync(''); }, 2500); toast(what + ' saved ✓'); if (done) done(r); },
      function (e) { sync(''); toast(what + ' was NOT saved: ' + e.message, true); if (failed) failed(e); }); }

  // ---- sign-in: Google's own prompt and button; the token lives in this page's memory and nowhere else ----
  function claims(jwt) { try { var p = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p)))); } catch (e) { return null; } }
  function fresh() { return !!TOKEN && TOKEN.exp * 1000 - Date.now() > 20000; }
  function keep(jwt) { var c = claims(jwt); if (!c || !c.exp || !c.email) return false;
    if (c.hd !== CFG.domain) { gate('That is not a ' + CFG.domain + ' account. Use your ' + CFG.domain + ' account.', true); return false; }
    TOKEN = { jwt: jwt, exp: Number(c.exp), email: String(c.email).toLowerCase() };   // in memory only
    clearTimeout(renewTimer); renewTimer = setTimeout(renew, Math.max((TOKEN.exp - 300) * 1000 - Date.now(), 5000)); return true; }
  function button() { if (!gisReady) return; $('gbtn').innerHTML = ''; google.accounts.id.renderButton($('gbtn'), { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 260 }); google.accounts.id.prompt(); }
  function gate(msg, bad) { $('gmsg').textContent = msg; $('gmsg').className = bad ? 'bad' : ''; $('gate').hidden = false; $('view').hidden = true; $('nav').hidden = true; $('back').hidden = true; $('refresh').hidden = true; $('who').hidden = true; button(); }
  function ungate() { $('gate').hidden = true; $('view').hidden = false; $('nav').hidden = !!PAGE; $('back').hidden = !PAGE; $('refresh').hidden = false; $('who').hidden = false; $('who').textContent = TOKEN.email.charAt(0).toUpperCase(); }
  /** Five minutes before the token runs out: ask Google for a new one. It comes without a tap when the phone allows it; when
   *  it does not, the sign-in screen shows at the next call. */
  function renew() { if (gisReady) google.accounts.id.prompt(); }
  function onCredential(r) { if (!r || !r.credential || !keep(r.credential)) return; ungate(); if (!started) boot(); else toast('Signed in ✓'); }
  window.onGoogleLibraryLoad = function () {
    google.accounts.id.initialize({ client_id: CFG.clientId, callback: onCredential, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true, hd: CFG.domain });
    gisReady = true; if (!$('gate').hidden) button(); };
  function signOut() { TOKEN = null; MODS.forEach(function (m) { if (m.forget) m.forget(); }); if (gisReady) google.accounts.id.disableAutoSelect(); location.reload(); }

  // The grey line (the owner's only): the whole call on the phone, and inside it the engine's door, from doPost's start to its end,
  // with the call itself ("server") inside that. "before" is from pressing to the door opening: the trip there, Google's own
  // start of the script, and "load", Google running the project's code; "after" is from the door closing to the phone having
  // the answer: Google's redirect and the trip back. before and after are read against the phone's clock, so a phone clock
  // that is off moves time from one to the other; their sum is right.
  function timing(name, t0, t1, x) { var s = function (ms) { return (ms / 1000).toFixed(1) + ' s'; }, line = String(name).replace(/^app/, '') + ' ' + s(t1 - t0);
    if (!x.door) return line + ' (server ' + s(Number(x.ms)) + ')';
    return line + ' = before ' + s(x.door[0] - t0) + (x.load >= 100 ? ' (load ' + s(x.load) + ')' : '') + ' + door ' + s(x.door[1] - x.door[0]) + ' (server ' + s(Number(x.ms)) + ') + after ' + s(t1 - x.door[1]); }
  // ---- an engine: one address per department, every call with the token ----
  function api(endpoint) { return function (name, arg) { return new Promise(function (ok, bad) {
    if (!fresh()) { TOKEN = null; gate('Your sign-in has run out. Sign in again.', false); return bad(new Error('Your sign-in has run out. Sign in again, then press the button again.')); }
    var t0 = Date.now(); flying++; mark();
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: TOKEN.jwt, name: name, arg: arg }), redirect: 'follow', credentials: 'omit', cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('The server answered ' + res.status + '. Try again.'); return res.json(); })
      .then(function (x) { flying--; mark();
        if (x && x.ok) { lastPerf = timing(name, t0, Date.now(), x); perf(); return ok(x.r); }
        if (x && x.code === 'auth') { TOKEN = null; gate(x.error, true); }
        bad(new Error(x && x.error || 'The server gave no answer. Try again.')); },
      function (e) { flying--; mark(); bad(new Error(/fetch|network|load failed/i.test(String(e && e.message)) ? 'No connection to the server. Check the internet, then press the button again.' : String(e && e.message || e))); }); }); }; }

  // ---- the frame: title bar, bottom bar, pages that open over a tab ----
  function tabs() { var t = []; MODS.forEach(function (m) { (m.tabs() || []).forEach(function (x) { t.push({ id: m.id + '.' + x.id, name: x.name, title: x.title || x.name, icon: x.icon, count: x.count, draw: x.draw }); }); }); return t; }
  function nav() { var t = tabs(); $('nav').innerHTML = t.map(function (x) { var n = x.count ? x.count() : 0; return '<button data-tab="' + h(x.id) + '"' + (x.id === TAB ? ' class="on"' : '') + '><svg viewBox="0 0 24 24">' + x.icon + '</svg>' + h(x.name) + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>'; }).join('');
    all('#nav button').forEach(function (b) { b.onclick = function () { go(b.getAttribute('data-tab')); }; }); }
  function go(id) { var t = tabs(); if (!t.length) { $('nav').innerHTML = ''; $('title').textContent = 'Maitri'; $('view').innerHTML = '<div class="card">Your account (' + h(TOKEN ? TOKEN.email : '') + ') has no access to this app yet. Ask MIS to add you.</div>'; return; }
    var x = t.filter(function (q) { return q.id === (id || TAB); })[0] || t[0]; TAB = x.id; PAGE = null; $('back').hidden = true; $('nav').hidden = false; $('title').textContent = x.title; nav(); $('view').scrollTop = 0; x.draw(); perf(); }
  function page(title, html, mount) { PAGE = title; $('title').textContent = title; $('back').hidden = false; $('nav').hidden = true; $('view').innerHTML = html; $('view').scrollTop = 0; if (mount) mount(); }
  function sheet() { var extra = []; MODS.forEach(function (m) { (m.menu ? m.menu() : []).forEach(function (x) { extra.push(x); }); });
    $('sheet').innerHTML = '<div><h2>' + h(TOKEN ? TOKEN.email : '') + '</h2><p class="muted">Maitri app · ' + h(CFG.version) + '</p>' + extra.map(function (x, i) { return '<button class="btn light" data-x="' + i + '">' + h(x.label) + '</button>'; }).join('') + '<button class="btn light" id="s_upd">Check for a new version</button><button class="btn light" id="s_out">Sign out</button><button class="btn" id="s_close">Close</button></div>'; $('sheet').hidden = false;
    all('#sheet [data-x]').forEach(function (b) { b.onclick = function () { $('sheet').hidden = true; extra[Number(b.getAttribute('data-x'))].run(); }; });
    $('s_close').onclick = function () { $('sheet').hidden = true; }; $('s_out').onclick = signOut;
    $('s_upd').onclick = function () { var b = this; b.disabled = true; b.textContent = 'Checking…'; (swReg ? swReg.update() : Promise.resolve()).then(function () { location.reload(); }, function () { location.reload(); }); }; }
  $('back').onclick = function () { go(); };
  $('who').onclick = sheet;
  $('sheet').onclick = function (e) { if (e.target === this) this.hidden = true; };
  $('toast').onclick = function () { this.hidden = true; };
  $('refresh').onclick = function () { if (PAGE) return toast('Go back first, then refresh.'); sync('Refreshing…'); Promise.all(MODS.map(function (m) { return m.start(true); })).then(function () { sync(''); if (!PAGE) go(); else nav(); }, function (e) { sync(''); toast('Could not refresh: ' + e.message, true); }); };

  // ---- the modules: loaded from config.js, each with its own engine ----
  var M = window.MAITRI = { cfg: CFG, $: $, h: h, all: all, toast: toast, sync: sync, press: press, send: send, page: page, go: go, nav: nav, perf: perf,
    foot: function () { return '<div id="perf"></div>'; }, flying: function () { return flying; }, paged: function () { return PAGE; }, tab: function () { return TAB; }, email: function () { return TOKEN ? TOKEN.email : ''; },
    showPerf: function (on) { showPerf = !!on; },
    /** A module says what it is: { id, start(again) → Promise, tabs() → [{ id, name, title, icon, count(), draw() }], forget(),
     *  menu() → [{ label, run() }]: lines for the account sheet }. */
    register: function (def) { var c = CFG.modules.filter(function (m) { return m.id === def.id; })[0]; if (!c) return; def.call = api(c.endpoint); MODS.push(def);
      def.start(false).then(function () { if (!PAGE) go(); else nav(); }, function (e) { if (!$('gate').hidden) return; toast(e.message, true); if (!tabs().length) $('view').innerHTML = '<div class="card">' + h(e.message) + '</div>'; }); } };
  function boot() { started = true; CFG.modules.forEach(function (m) { var s = document.createElement('script'); s.src = m.src; s.onerror = function () { toast('A part of the app could not be loaded. Check the internet and open the app again.', true); }; document.head.appendChild(s); }); }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(function (r) { swReg = r; }, function () { /* the app works without it; it only opens slower */ });
  gate('Signing in with your ' + CFG.domain + ' Google account…', false);   // Google answers by itself when it can; the button is there when it cannot
})();
