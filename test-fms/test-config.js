'use strict';
// The purchase FMS TEST page, /test-fms/ on the company app's site. A TEST page only: never the live app.
//   · The TEST engine's /exec address is NOT in this file or anywhere on the public site. The page asks for it once
//     and keeps it in this browser only (localStorage, key below), so it is never published.
//   · Same sign-in as the live app (same Client ID, same web address), so no sign-in setup change is needed.
//   · The page holds only the sha256 of the TEST address (S-289) and refuses any other address, so Tanmay's sign-in
//     token can only ever be sent to the TEST engine, never to an address pasted by mistake.
//   · Only the purchase module is loaded. SY-13 is not, so no token is ever sent to SY-13 from here.
//   · No service worker here: the live worker's cache cleanup would delete a second cache on this site, and a TEST
//     worker would delete the live one. This page is always fetched from the network.
//   · Then the frame (shell.js, a byte-for-byte copy of the live one) is started, and Google's sign-in after it.
(function () {
  var KEY = 'maitri.test-fms.exec';
  var CLIENT_ID = '450946631995-tvnhp1ug4f1ut5ojombndkg6l11sodt4.apps.googleusercontent.com', VERSION = 'purchase.js 56b0ced5 · frame 9e7041b · built 26 Nov 26 19:30 IST', PIN = 'fc04768e8def3f582a9c076184015d1a503182152bd664f388d6aa2b42ad4304';
  var OK = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function put(v) { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } }
  function forget() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } }
  function digest(v) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  /** Resolves true only for the one TEST address: the right shape AND its sha256 equal to the pin. */
  function pinned(v) { v = String(v || '').trim(); if (!OK.test(v)) return Promise.resolve(false); return digest(v).then(function (d) { return d === PIN; }, function () { return false; }); }
  window.MAITRI_TEST = { KEY: KEY, pinned: pinned };
  document.title = 'TEST · purchase FMS';

  function band(text) {
    var b = document.createElement('div');
    b.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#b3261e;color:#fff;font:600 12px system-ui,sans-serif;padding:4px 8px;display:flex;justify-content:space-between;align-items:center');
    var s = document.createElement('span'); s.textContent = text; b.appendChild(s);
    var x = document.createElement('button'); x.type = 'button'; x.textContent = 'Change TEST address';
    x.setAttribute('style', 'background:#fff;color:#b3261e;border:0;border-radius:4px;padding:2px 6px;font:600 12px system-ui,sans-serif');
    x.onclick = function () { forget(); location.reload(); };
    b.appendChild(x); document.body.appendChild(b);
  }
  function ask(msg) {
    var app = document.getElementById('app'); if (app) app.hidden = true;
    var w = document.createElement('div');
    w.setAttribute('style', 'max-width:420px;margin:40px auto;padding:16px;font:15px system-ui,sans-serif');
    w.innerHTML = '<h2 style="margin:0 0 8px">Purchase FMS · TEST</h2>' +
      '<p>This is the TEST page, not the live app. Paste the TEST engine\'s web app address (it ends in /exec). ' +
      'It is kept in this browser only and is never put on the site.</p>' +
      '<input id="t_exec" style="width:100%;box-sizing:border-box;padding:8px;font:14px monospace" autocomplete="off" spellcheck="false">' +
      '<p id="t_msg" style="color:#b3261e;min-height:1.2em"></p>' +
      '<button id="t_save" type="button" style="padding:8px 14px;font:600 15px system-ui,sans-serif">Use this address</button>';
    document.body.appendChild(w);
    var m = document.getElementById('t_msg'); m.textContent = msg || '';
    document.getElementById('t_save').onclick = function () {
      var v = String(document.getElementById('t_exec').value || '').trim();
      pinned(v).then(function (good) {
        if (!good) { m.textContent = 'That is not the TEST web app address (S-289). Copy it from the TEST deployment: it ends in /exec.'; return; }
        if (!put(v)) { m.textContent = 'This browser would not keep it (private mode?). Use a normal window.'; return; }
        location.reload();
      });
    };
  }
  function start(exec) {
    window.MAITRI_CONFIG = {
      version: VERSION,
      clientId: CLIENT_ID,
      domain: 'maitri.in',
      modules: [{ id: 'purchase', src: 'modules/purchase.js', endpoint: exec }]
    };
    var s = document.createElement('script'); s.src = 'shell.js';
    s.onload = function () {
      var g = document.createElement('script'); g.src = 'https://accounts.google.com/gsi/client'; g.async = true; document.head.appendChild(g);
    };
    document.head.appendChild(s);
    band('TEST · purchase FMS · ' + VERSION);
  }

  var exec = get();
  if (!exec) return ask('');
  pinned(exec).then(function (good) { if (good) start(exec); else { forget(); ask('The address kept in this browser was not the TEST one, so it was thrown away.'); } });
})();
