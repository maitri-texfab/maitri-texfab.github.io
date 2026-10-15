'use strict';
// A one-off speed test for MIS (Admin 2, 15 Oct 2026: "phone ↔ Sheet directly"): the time of reading and writing a test Sheet
// through the Sheets API with the person's own sign-in, against today's Apps Script door. Nothing is kept on the phone: the
// sign-in and the Sheets permission live in this page's memory until it is closed. No sheet ID is in this file: it is pasted
// on the page. The engine's address and the sign-in Client ID come from the site's config.js, as the app's do.
(function () {
var CFG = window.MAITRI_CONFIG, $ = function (id) { return document.getElementById(id); }, OPENED = performance.now();
var ID = null, EMAIL = '', TOKEN = null, TC = null, LOG = [], WIDTH = 16, ROWS = 10800;   // the read copy: about 10,800 rows of 16 columns
var SCOPE = 'https://www.googleapis.com/auth/spreadsheets', API = 'https://sheets.googleapis.com/v4/spreadsheets/';
function say(t) { LOG.push(t); $('out').textContent = LOG.join('\n'); }
function secs(ms) { return (ms / 1000).toFixed(2) + ' s'; }
function sheetId() { return String($('sheet').value || '').trim(); }
function col(n) { return String.fromCharCode(64 + n); }
function ready() { $('sheets').disabled = !ID; var ok = !!(ID && TOKEN && sheetId()); $('setup').disabled = !ok; $('run').disabled = !ok; $('silent').disabled = !TC; }

// one timed call → { ms, status, err, body }
function timed(url, opt) { var t = performance.now();
  return fetch(url, Object.assign({ cache: 'no-store', credentials: 'omit' }, opt)).then(function (r) { return r.text().then(function (b) { var ms = performance.now() - t, j = null; try { j = JSON.parse(b); } catch (e) { j = null; }
      var err = !r.ok ? (r.status + ' ' + (j && j.error && (j.error.message || j.error.status) || b.slice(0, 120))) : (j && j.ok === false ? 'refused: ' + (j.error || '') : '');
      return { ms: ms, status: r.status, err: err, body: j }; }); },
    function (e) { return { ms: performance.now() - t, status: 0, err: 'no connection: ' + (e && e.message || e), body: null }; }); }
function sheets(path, method, body) { return timed(API + encodeURIComponent(sheetId()) + path, { method: method || 'GET', headers: Object.assign({ Authorization: 'Bearer ' + TOKEN }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined }); }
function door(name, arg) { return timed(CFG.modules[0].endpoint, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: ID, name: name, arg: arg }) }); }

// ---- sign-in: Google's button for the ID token (the door), and the Sheets permission on its own (asked at run time) ----
function gisLoaded() {
  google.accounts.id.initialize({ client_id: CFG.clientId, hd: CFG.domain, auto_select: true, use_fedcm_for_prompt: true, callback: function (r) {
    ID = r.credential; try { EMAIL = JSON.parse(atob(ID.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || ''; } catch (e) { EMAIL = ''; }
    say('signed in ' + secs(performance.now() - OPENED) + ' after the page opened (' + (r.select_by || 'unknown') + ')'); makeTokenClient(); ready(); } });
  google.accounts.id.renderButton($('idbtn'), { theme: 'outline', size: 'large', text: 'signin_with' }); google.accounts.id.prompt();
}
function makeTokenClient() {
  if (TC) return; TC = google.accounts.oauth2.initTokenClient({ client_id: CFG.clientId, scope: SCOPE, hint: EMAIL, hosted_domain: CFG.domain,
    callback: function (r) { if (r.error) { say('Sheets permission: ' + r.error + (r.error_description ? ' · ' + r.error_description : '')); return; }
      TOKEN = r.access_token; say('Sheets permission given ' + secs(performance.now() - ASKED) + ' after it was asked; the permission lasts ' + r.expires_in + ' s'); ready(); },
    error_callback: function (e) { say('Sheets permission not given: ' + (e && (e.type || e.message) || e)); } });
}
var ASKED = 0;
$('sheets').onclick = function () { ASKED = performance.now(); TC.requestAccessToken(); };
$('silent').onclick = function () { ASKED = performance.now(); say('asking for the Sheets permission with no prompt…'); TC.requestAccessToken({ prompt: 'none' }); };
$('sheet').oninput = ready;

// ---- fill the read tab once: about 10,800 dummy rows, no real data ----
$('setup').onclick = function () { var btn = this; btn.disabled = true; var head = [], n = 0;
  for (var c = 1; c <= WIDTH; c++) head.push('col' + c);
  var chunk = function (a) { if (a > ROWS + 1) { say('read tab filled: ' + ROWS + ' rows of ' + WIDTH + ' columns in ' + n + ' writes'); return; }
    var b = Math.min(a + 1999, ROWS + 1), vals = []; if (a === 1) vals.push(head);   // the header in row 1, the rows in 2 to ROWS + 1
    for (var i = Math.max(a, 2); i <= b; i++) { var row = ['TEST-' + i]; for (var k = 2; k <= WIDTH; k++) row.push('test ' + k + '-' + (i % 97)); vals.push(row); }
    var from = a === 1 ? 1 : a; sheets('/values/' + encodeURIComponent('read!A' + from + ':' + col(WIDTH) + (from + vals.length - 1)) + '?valueInputOption=RAW', 'PUT', { values: vals })
      .then(function (r) { n++; if (r.err) { say('fill stopped at row ' + from + ': ' + r.err); btn.disabled = false; return; } say('  rows ' + from + '–' + (from + vals.length - 1) + ' written in ' + secs(r.ms)); chunk(from + vals.length); }); };
  chunk(1); };

// ---- the test: the first calls, then 20 appends, 20 one-row reads, 5 full reads, 20 calls to today's door ----
function stats(name, xs) { var ok = xs.filter(function (x) { return !x.err; }).map(function (x) { return x.ms; }).sort(function (a, b) { return a - b; }), bad = xs.filter(function (x) { return x.err; });
  var med = ok.length ? (ok.length % 2 ? ok[(ok.length - 1) / 2] : (ok[ok.length / 2 - 1] + ok[ok.length / 2]) / 2) : NaN;
  return name + ': ' + ok.length + ' of ' + xs.length + ' answered · typical ' + (ok.length ? secs(med) : '—') + ' · worst ' + (ok.length ? secs(ok[ok.length - 1]) : '—') + (bad.length ? ' · refused or failed ' + bad.length + ': ' + bad.map(function (x) { return x.err; }).filter(function (e, i, a) { return a.indexOf(e) === i; }).join(' | ') : ''); }
function series(n, fn) { var out = [], i = 0; return new Promise(function (done) { var next = function () { if (i >= n) return done(out); fn(i++).then(function (r) { out.push(r); next(); }); }; next(); }); }
$('run').onclick = function () { var btn = this, net = $('net').value, R = {}; btn.disabled = true; LOG = []; var stamp = '';
  say('test on ' + net + ' · ' + new Date().toString().slice(0, 24) + ' · ' + (navigator.userAgent.match(/\(([^)]+)\)/) || ['', ''])[1]);
  sheets('/values/' + encodeURIComponent('read!A2:' + col(WIDTH) + '2')).then(function (r) { R.firstSheet = r; say('first Sheets call: ' + secs(r.ms) + (r.err ? ' · ' + r.err : '') + ' (' + secs(performance.now() - OPENED) + ' after the page opened)');
    return door('appIndex', { have: '' }); })
  .then(function (r) { R.firstDoor = r; stamp = r.body && r.body.r && r.body.r.stamp || ''; say('first call to today\'s door (Index, the list of names): ' + secs(r.ms) + (r.err ? ' · ' + r.err : '') + (r.body && r.body.door ? ' · inside the door ' + secs(r.body.door[1] - r.body.door[0]) : ''));
    return series(20, function (i) { return sheets('/values/' + encodeURIComponent('input!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', 'POST', { values: [[new Date().toISOString(), net, 'append ' + (i + 1), 'TEST']] }); }); })
  .then(function (xs) { R.append = xs; say(stats('20 appends of one row to input', xs));
    return series(20, function () { var row = 2 + Math.floor(Math.random() * (ROWS - 1)); return sheets('/values/' + encodeURIComponent('read!A' + row + ':' + col(WIDTH) + row)); }); })
  .then(function (xs) { R.one = xs; say(stats('20 one-row reads of read (the row found from the phone\'s copy)', xs));
    return series(5, function () { return sheets('/values/' + encodeURIComponent('read!A1:' + col(WIDTH) + (ROWS + 1))); }); })
  .then(function (xs) { R.full = xs; var rows = xs[0] && xs[0].body && xs[0].body.values ? xs[0].body.values.length : 0; say(stats('5 full reads of read (' + rows + ' rows)', xs));
    return series(20, function () { return door('appIndex', { have: stamp }); }); })
  .then(function (xs) { R.door = xs; say(stats('20 calls to today\'s door (Index, "same": the lightest answer)', xs));
    var inside = xs.filter(function (x) { return x.body && x.body.door; }).map(function (x) { return x.body.door[1] - x.body.door[0]; }).sort(function (a, b) { return a - b; });
    if (inside.length) say('  of those, inside the door: typical ' + secs(inside[Math.floor(inside.length / 2)]) + ' · worst ' + secs(inside[inside.length - 1]));
    say('done. Copy all of this and send it to MIS.'); btn.disabled = false; }); };

// Google's sign-in script, loaded from here (the page allows no inline script)
var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = gisLoaded; s.onerror = function () { say('Google\'s sign-in script could not be loaded'); }; document.head.appendChild(s);
})();
