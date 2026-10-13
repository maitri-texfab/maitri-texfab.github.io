'use strict';
// The Maitri company app · module SY-13, the product master: Designs, Check, Fix (differences), Rates, Lists.
// MIS · Product, 13 Oct 2026. The same screens and flow as the SY-13 web app v1.3.1; the frame (shell.js) gives the bottom
// bar, the pages, the sign-in and the calls to the engine. Which of the five tabs a person has is the engine's answer
// (appStart → can), never decided here. What the phone remembers between openings: that answer's roles and lists and the
// names of the designs, for the person signed in; never a rate. Nothing is kept by the service worker.
// A code that starts with TEST- is a test design: the engine keeps it apart from everything real. It is not in the list of
// names, so the finder offers it by itself when such a code is typed.
(function () {
var M = window.MAITRI, $ = M.$, h = M.h, all = M.all;
function call(name, arg) { return def.call(name, arg); }   // the frame gives this module its engine when it registers
var S = null;            // what appStart gave: who I am, what I may do, the six lists, my lists of work
var IDX = null;          // every design: [{ no, key, s }], for finding one on the phone
var FAILED = [], DRAW = {};
function keyOf(no) { return String(no).replace(/\s+/g, '').toUpperCase(); }
/** A code as it is searched: letters and digits only, the zeros in front of the number dropped, so "kt 12" finds "KT - 0012". */
function loose(s) { return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(\d)/, '$1$2'); }
function press(btn, name, arg, then, label) { M.press(btn, call, name, arg, then, label); }
function send(what, name, arg, done, failed) { M.send(what, call, name, arg, done, failed); }

// ---- shared pieces ----
function selects(attrs, id) { return S.attributes.map(function (a) { var cur = (attrs || {})[a] || '', list = S.lists[a] || [], opts = list.slice(); if (cur && opts.indexOf(cur) < 0) opts.push(cur);
  return '<label>' + h(S.labels[a]) + '</label><select data-attr="' + a + '" data-of="' + id + '"><option value="">' + (list.length ? '— choose —' : '— nothing in this list yet —') + '</option>' +
    opts.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + h(v) + '</option>'; }).join('') + '</select>'; }).join(''); }
function readSelects(id) { var o = {}; all('select[data-of="' + id + '"]').forEach(function (s) { o[s.getAttribute('data-attr')] = s.value; }); return o; }
function summary(attrs) { var v = S.attributes.map(function (a) { return attrs[a]; }).filter(function (x) { return x; }); return v.length ? h(v.join(' · ')) : 'No details chosen yet'; }
function photoBox(d) { if (d.photo) return '<img class="photo" src="' + h(d.photo) + '" alt="photo" loading="lazy">'; if (d.has_photo) return '<div class="nophoto" data-photo="' + h(d.key) + '">Loading the photo…</div>'; return '<div class="nophoto">No photo yet</div>'; }
function fillPhotos() { all('[data-photo]').forEach(function (el) { var key = el.getAttribute('data-photo'); el.removeAttribute('data-photo');
  call('appPhoto', key).then(function (src) { if (src) el.outerHTML = '<img class="photo" src="' + src + '" alt="photo">'; else el.textContent = 'The photo shows here after the next hourly check'; }, function () { el.textContent = 'The photo could not be loaded'; }); }); }
/** A photo taken or chosen on the phone, made no larger than 1,000 px (the size the engine keeps for showing) and sent as a JPG. */
function readPhoto(file) { return new Promise(function (ok, bad) { var fr = new FileReader();
  fr.onerror = function () { bad(new Error('The photo could not be read. Choose it again.')); };
  fr.onload = function () { var img = new Image(); img.onerror = function () { bad(new Error('This file is not a picture this phone can read. Use a JPG or PNG photo.')); };
    img.onload = function () { var k = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); var data = c.toDataURL('image/jpeg', 0.85); ok({ type: 'image/jpeg', b64: data.split(',')[1], preview: data }); };
    img.src = fr.result; };
  fr.readAsDataURL(file); }); }
function photoTile(id, text) { return '<label class="tile" id="' + id + '_tile"><input type="file" accept="image/*" id="' + id + '"><span id="' + id + '_text">' + text + '</span><small>Camera, gallery or a file</small></label><div id="' + id + '_prev"></div>'; }
function wirePhoto(id, hold) { $(id).onchange = function () { var f = this.files && this.files[0]; if (!f) return; $(id + '_text').textContent = 'Reading the photo…';
  readPhoto(f).then(function (p) { hold.photo = { type: p.type, b64: p.b64 }; hold.preview = p.preview; $(id + '_prev').innerHTML = '<img class="photo" src="' + p.preview + '" alt="the photo chosen">'; $(id + '_text').textContent = 'Photo chosen ✓ Tap to change it'; },
    function (e) { $(id + '_text').textContent = 'Tap to add a photo'; M.toast(e.message, true); }); }; }
/** Finding a design: on the phone, in the list of names, as you type. `pick({ no, key })`. */
function find(q, limit) { var want = loose(q), a = [], b = [], k = keyOf(q); if (/^TEST-[A-Z0-9().-]+$/.test(k)) return [{ no: k, key: k, test: true }]; if (!IDX || want.length < 2) return [];
  for (var i = 0; i < IDX.length && a.length < limit; i++) { var at = IDX[i].s.indexOf(want); if (at === 0) a.push(IDX[i]); else if (at > 0 && b.length < limit) b.push(IDX[i]); }
  return a.concat(b).slice(0, limit); }
function finderHtml(id, hint) { return '<input type="search" id="' + id + '" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + h(hint || 'Type a design code, like KT 1234') + '"><div id="' + id + '_hits" style="margin-top:10px"></div>'; }
function finder(id, pick, keep) { var box = $(id), hits = $(id + '_hits');
  var draw = function () { var q = box.value; if (loose(q).length < 2) { hits.innerHTML = ''; return; }
    if (!IDX && !find(q, 1).length) { hits.innerHTML = '<div class="card muted">Loading the list of designs…</div>'; return; }
    var list = find(q, 30); hits.innerHTML = list.length ? list.map(function (x, i) { return '<button class="hit" data-i="' + i + '">' + h(x.no) + (x.test ? ' (test design)' : '') + '<span>›</span></button>'; }).join('') : '<div class="card muted">No design with that code</div>';
    all('.hit', hits).forEach(function (b) { b.onclick = function () { var x = list[Number(b.getAttribute('data-i'))]; if (!keep) { hits.innerHTML = ''; box.value = x.no; } pick(x); }; }); };
  box.oninput = draw; box._redraw = draw; if (box.value) draw(); }

// ---- 1 · designs: find one, open it, or log a new one ----
var lastQuery = '';
DRAW.designs = function () {
  $('view').innerHTML = failedHtml() + finderHtml('q') + '<div id="hint" class="muted" style="padding:6px 4px">' + (IDX ? IDX.length.toLocaleString('en-IN') + ' designs. Type part of a code to find one.' : 'Loading the list of designs…') + '</div>' + M.foot() +
    (S.can.log ? '<button class="fab" id="add">+ New design</button>' : '');
  $('q').value = lastQuery; wireFailed();
  finder('q', function (x) { openDesign(x); }, true); $('hint').hidden = loose(lastQuery).length >= 2; $('q').addEventListener('input', function () { lastQuery = this.value; $('hint').hidden = loose(this.value).length >= 2; });
  if (S.can.log) $('add').onclick = function () { logPage(null); }; M.perf(); };
function failedHtml() { return FAILED.map(function (f, i) { return '<div class="card late"><div class="code">' + h(f.arg.code) + ' was not saved</div><p class="muted">' + h(f.why) + '</p><div class="row"><button class="btn small" data-fix="' + i + '">Open it again</button><button class="btn small light" data-drop="' + i + '">Discard</button></div></div>'; }).join(''); }
function wireFailed() { all('[data-fix]').forEach(function (b) { b.onclick = function () { var f = FAILED.splice(Number(b.getAttribute('data-fix')), 1)[0]; logPage(f); }; });
  all('[data-drop]').forEach(function (b) { b.onclick = function () { FAILED.splice(Number(b.getAttribute('data-drop')), 1); M.go(); }; }); }
function logPage(again) { var hold = { photo: again ? again.arg.photo : null, preview: again ? again.preview : '' };
  M.page('New design', '<div class="card"><label style="margin-top:0">Design code, exactly as in the ERP</label><input type="text" id="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="KT - 1234" value="' + h(again ? again.arg.code : '') + '"><div id="known" class="muted" style="margin-top:6px"></div>' +
    '<label>Photo</label>' + photoTile('ph', hold.photo ? 'Photo chosen ✓ Tap to change it' : 'Tap to add a photo') + selects(again ? again.arg.attrs : {}, 'log') + '</div><div style="height:70px"></div><div class="dock"><button class="btn" id="save">Save the design</button></div>', function () {
    if (hold.preview) $('ph_prev').innerHTML = '<img class="photo" src="' + hold.preview + '" alt="the photo chosen">';
    wirePhoto('ph', hold);
    $('code').oninput = function () { var k = keyOf(this.value), hit = IDX && k.length > 3 && IDX.filter(function (x) { return x.key === k; })[0]; $('known').textContent = hit ? hit.no + ' is already in the ERP list. Saving adds its photo and details.' : ''; };
    $('save').onclick = function () { var code = $('code').value.trim().replace(/\s+/g, ' '); if (!code) return M.toast('Type the design code.', true); if (!hold.photo) return M.toast('Add a photo of the design.', true);
      var arg = { code: code, attrs: readSelects('log'), photo: hold.photo }, preview = hold.preview;
      send(code, 'appLogDesign', arg, function (r) { if (r.test) return; if (r.new_row && IDX) IDX.push({ no: r.no, key: r.key, s: loose(r.no) }); if (S.check) S.check.push({ key: r.key, no: r.no, mine: true, attrs: arg.attrs, entered_by: S.email, entered_at: 'just now', in_erp: r.new_row ? 'no' : 'yes', photo: '', has_photo: true }); if (!M.paged()) M.nav(); },
        function (e) { FAILED.push({ arg: arg, why: e.message, preview: preview }); if (!M.paged() && M.tab() === 'sy13.designs') M.go(); });
      logPage(null); $('code').focus(); }; }); }
function openDesign(x) { M.page(x.no, '<div class="skel" style="height:200px"></div><div class="skel"></div><div class="skel"></div>');
  call('appDesign', x.key).then(function (d) { if (M.paged() === x.no) designForm(d); }, function (e) { M.toast(e.message, true); if (M.paged() === x.no) M.go(); }); }
function designForm(d) { var hold = { photo: null }, st = d.status === 'confirmed' ? '<span class="tag green">Checked</span> by ' + h(d.confirmed_by) + ', ' + h(d.confirmed_at) : d.status === 'draft' ? '<span class="tag amber">Waiting for a check</span> entered by ' + h(d.entered_by) : '<span class="tag">Not logged yet</span>';
  $('view').innerHTML = '<div class="card"><div class="muted">' + st + '</div>' + photoBox(d) + (S.can.edit ? photoTile('ph', d.has_photo ? 'Tap to change the photo' : 'Tap to add a photo') + selects(d.attrs, 'edit') : '<p class="line">' + summary(d.attrs) + '</p>') + '</div>' +
    (S.can.edit ? '<div style="height:70px"></div><div class="dock"><button class="btn" id="save">Save the changes</button></div>' : '');
  fillPhotos(); if (!S.can.edit) return; wirePhoto('ph', hold);
  $('save').onclick = function () { press(this, 'appEditDesign', { key: d.key, attrs: readSelects('edit'), photo: hold.photo }, function (r) { M.toast(r.no + ' saved ✓' + (hold.photo ? ' The new photo shows after the next hourly check.' : ''));
    if (S.check && !r.test) { S.check = S.check.filter(function (q) { return q.key !== r.key; }); r.mine = true; S.check.push(r); } if (M.paged() === d.no) designForm(r); }); }; }

// ---- 2 · check new designs ----
DRAW.check = function () { var list = (S.check || []).filter(function (d) { return !d.gone; });
  if (!list.length) { $('view').innerHTML = '<div class="card">Nothing is waiting to be checked.</div>' + M.foot(); return M.perf(); }
  $('view').innerHTML = '<p class="muted" style="margin:2px 4px 10px">Look at the photo and the details. Correct what is wrong, then confirm.</p>' + list.map(function (d, i) {
    return '<div class="card" id="c' + i + '"><div class="code">' + h(d.no) + '</div><div class="muted">By ' + h(d.entered_by) + ', ' + h(d.entered_at) + (d.in_erp === 'yes' ? '' : ' · not in the ERP list yet') + '</div>' + photoBox(d) +
      (d.mine ? '<p class="line">' + summary(d.attrs) + '</p><p class="muted">You entered this one, so someone else in Design has to check it.</p>'
        : '<details style="margin-top:12px"><summary><span>' + summary(d.attrs) + '</span><span class="tag">Change</span></summary>' + selects(d.attrs, 'c' + i) + '</details><button class="btn" data-i="' + i + '">Confirm</button>') + '</div>'; }).join('') + M.foot();
  fillPhotos(); M.perf();
  all('.btn[data-i]').forEach(function (b) { b.onclick = function () { var i = Number(b.getAttribute('data-i')), d = list[i], card = $('c' + i), was = card.innerHTML, attrs = readSelects('c' + i);
    card.className = 'card pending'; card.innerHTML = '<span class="tag green">Confirming…</span> <b>' + h(d.no) + '</b>'; d.gone = true; M.nav();
    call('appConfirmDesign', { key: d.key, attrs: attrs }).then(function () { card.className = 'card'; card.innerHTML = '<span class="tag green">Confirmed ✓</span> <b>' + h(d.no) + '</b>'; },
      function (e) { d.gone = false; M.nav(); card.className = 'card'; card.innerHTML = was; M.toast(d.no + ' was NOT confirmed: ' + e.message, true); if (M.tab() === 'sy13.check' && !M.paged()) DRAW.check(); }); }; }); };

// ---- 3 · differences ----
DRAW.fix = function () { var rows = S.diffs || [], when = S.next_check ? ' (about ' + h(S.next_check) + ')' : '';
  if (!rows.length) { $('view').innerHTML = '<div class="card">Nothing to fix.</div>' + M.foot(); return M.perf(); }
  var chosen = function (fix) { return '<p style="margin:8px 0 0"><span class="tag green">Fix chosen</span> ' + h(fix) + '<br><span class="muted">It is applied at the next hourly check' + when + ', and the row then goes.</span></p>'; };
  $('view').innerHTML = rows.map(function (r, i) {
    var body = r.waiting ? chosen(r.fix) : !r.may.length && !r.pick_design ? '<p class="muted">This one is for MIS.</p>'
      : (r.pick_design ? '<label>If it is one of the designs, find it</label>' + finderHtml('d' + i, 'Type its code') + '<label>or</label>' : '<label>Fix</label>') +
        '<select id="s' + i + '"><option value="">— choose —</option>' + r.may.map(function (v) { return '<option>' + h(v) + '</option>'; }).join('') + '</select><button class="btn" data-i="' + i + '">Done</button>';
    return '<div class="card" id="r' + i + '"><div class="code">' + h(r.item) + '</div><p style="margin:6px 0 0">' + h(r.what) + '</p><div id="b' + i + '">' + body + '</div></div>'; }).join('') + M.foot(); M.perf();
  var picked = {};
  rows.forEach(function (r, i) { if (!r.waiting && r.pick_design) finder('d' + i, function (x) { picked[i] = x.no; $('s' + i).value = ''; }); });
  all('.btn[data-i]').forEach(function (b) { b.onclick = function () { var i = Number(b.getAttribute('data-i')), r = rows[i], body = $('b' + i), was = body.innerHTML, fix = $('s' + i).value || (r.pick_design && $('d' + i).value === picked[i] ? picked[i] : '');
    if (!fix) return M.toast('Choose a Fix first.', true);
    r.waiting = true; r.fix = fix; body.innerHTML = chosen(fix); M.nav();
    call('appDiffFix', { check: r.check, key: r.key, fix: fix }).then(function () { M.toast('Fix saved ✓'); }, function (e) { r.waiting = false; r.fix = ''; M.nav(); M.toast('The Fix was NOT saved: ' + e.message, true); if (M.tab() === 'sy13.fix' && !M.paged()) DRAW.fix(); else body.innerHTML = was; }); }; }); };

// ---- 4 · rates ----
function money(n) { var x = Number(n); return isFinite(x) ? x.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : h(n); }
function rateLine(r) { return 'A ' + money(r.a) + ' · B ' + money(r.b) + ' · C ' + money(r.c) + ' · D ' + money(r.d); }
function rateInputs(id, r) { return '<div class="rates">' + ['a', 'b', 'c', 'd'].map(function (x) { return '<div><label>' + x.toUpperCase() + '</label><input type="number" inputmode="decimal" step="any" min="0" id="' + id + x + '" value="' + (r ? h(r[x]) : '') + '"></div>'; }).join('') + '</div>'; }
function readRates(id) { var o = {}; ['a', 'b', 'c', 'd'].forEach(function (x) { o[x] = $(id + x).value; }); return o; }
function ratesOk(o) { return ['a', 'b', 'c', 'd'].every(function (x) { return o[x] !== '' && isFinite(Number(o[x])) && Number(o[x]) > 0; }); }
function waLink(rows, label, cls) { var text = 'Rates approved\n' + rows.map(function (r) { return r.no + ': ' + rateLine(r); }).join('\n'); return '<a class="btn wa ' + (cls || '') + '" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text) + '">' + label + '</a>'; }
var RSEG = '';
DRAW.rates = function () { var c = S.can, R = S.rates, seg = [];
  if (c.rate_approve) seg.push(['approve', 'To approve' + (R.waiting.length ? ' (' + R.waiting.length + ')' : '')]); if (c.rate_enter) seg.push(['enter', 'Enter or change']); if (c.rate_enter && !c.rate_approve) seg.push(['waiting', 'Waiting' + (R.waiting.length ? ' (' + R.waiting.length + ')' : '')]);
  if (c.rate_erp) seg.push(['erp', 'To enter in ERP' + (R.erp.length ? ' (' + R.erp.length + ')' : '')]); if (c.rate_read) seg.push(['read', 'Approved rates']);
  if (!seg.some(function (s) { return s[0] === RSEG; })) RSEG = seg[0][0];
  $('view').innerHTML = (seg.length > 1 ? '<div class="seg">' + seg.map(function (s) { return '<button data-seg="' + s[0] + '"' + (s[0] === RSEG ? ' class="on"' : '') + '>' + s[1] + '</button>'; }).join('') + '</div>' : '') + '<div id="rbody"></div>' + M.foot();
  all('[data-seg]').forEach(function (b) { b.onclick = function () { RSEG = b.getAttribute('data-seg'); DRAW.rates(); }; }); RATE[RSEG](); M.perf(); };
var RATE = {};
RATE.approve = function () { var rows = S.rates.waiting;
  $('rbody').innerHTML = rows.length ? rows.map(function (r, i) { return '<div class="card" id="a' + i + '"><div class="code">' + h(r.no) + (r.test ? ' <span class="tag amber">test</span>' : '') + '</div><p class="muted" style="margin:2px 0 10px">By ' + h(r.entered_by) + ', ' + h(r.entered_at) + '. Change a figure if it is wrong.</p>' + rateInputs('a' + i + '_', r) + '<button class="btn" data-i="' + i + '">Approve</button></div>'; }).join('') : '<div class="card">Nothing is waiting for approval.</div>';
  all('.btn[data-i]').forEach(function (b) { b.onclick = function () { var i = Number(b.getAttribute('data-i')), r = rows[i], v = readRates('a' + i + '_'), card = $('a' + i); if (!ratesOk(v)) return M.toast('Enter all four rates as numbers.', true);
    card.className = 'card pending'; card.innerHTML = '<span class="tag green">Approving…</span> <b>' + h(r.no) + '</b>';
    call('appRateApprove', Object.assign({ id: r.id }, v)).then(function (x) { S.rates.waiting = S.rates.waiting.filter(function (q) { return q.id !== r.id; }); M.nav(); card.className = 'card'; card.innerHTML = '<span class="tag green">' + (x.corrected ? 'Corrected and approved ✓' : 'Approved ✓') + '</span> <b>' + h(r.no) + '</b>'; },
      function (e) { M.toast(r.no + ' was NOT approved: ' + e.message, true); if (M.tab() === 'sy13.rates' && !M.paged()) DRAW.rates(); }); }; }); };
RATE.enter = function () { var chosen = null;
  $('rbody').innerHTML = '<div class="card"><label style="margin-top:0">Which design?</label>' + finderHtml('rf') + '<div id="rform" hidden><div class="code" id="rcode" style="margin:4px 0 12px"></div>' + rateInputs('n') + '<button class="btn" id="rsave">' + (S.can.rate_approve ? 'Save and approve' : 'Send for approval') + '</button>' +
    '<p class="muted">' + (S.can.rate_approve ? 'Your rates are in force at once and go to Purchase to enter in the ERP.' : 'They wait for approval. Until then the old rates stay in force.') + '</p></div></div>';
  finder('rf', function (x) { chosen = x; $('rcode').textContent = x.no; $('rform').hidden = false; $('na').focus(); });
  $('rsave').onclick = function () { var v = readRates('n'); if (!chosen) return M.toast('Choose the design first.', true); if (!ratesOk(v)) return M.toast('Enter all four rates as numbers.', true); var no = chosen.no;
    send('Rates for ' + no, 'appRateEnter', Object.assign({ code: no }, v), function (r) { var row = { id: 'new' + Date.now(), no: no, a: v.a, b: v.b, c: v.c, d: v.d, entered_by: S.email, entered_at: 'just now', approved_by: S.email, approved_at: 'just now' }; row.test = !!r.test; if (r.status === 'waiting') S.rates.waiting.push(row); else if (!r.test) S.rates.recent.unshift(row); M.nav(); if (!M.paged() && M.tab() === 'sy13.rates' && RSEG !== 'enter') DRAW.rates(); });
    RATE.enter(); }; };
RATE.waiting = function () { var rows = S.rates.waiting; $('rbody').innerHTML = rows.length ? rows.map(function (r) { return '<div class="card"><div class="code">' + h(r.no) + (r.test ? ' <span class="tag amber">test</span>' : '') + '</div><p class="line">' + rateLine(r) + '</p><p class="muted">By ' + h(r.entered_by) + ', ' + h(r.entered_at) + '</p></div>'; }).join('') : '<div class="card">Nothing is waiting for approval.</div>'; };
RATE.erp = function () { var rows = S.rates.erp;
  $('rbody').innerHTML = rows.length ? '<p class="muted" style="margin:2px 4px 10px">Enter each in the ERP, then tick it. One left for more than a day turns red.</p>' + waLink(rows, 'Send all on WhatsApp') + '<div style="height:12px"></div>' + rows.map(function (r, i) {
    return '<div class="card' + (r.late ? ' late' : '') + '" id="e' + i + '"><div class="code">' + h(r.no) + (r.late ? ' <span class="tag red">more than a day</span>' : '') + '</div><p class="line">' + rateLine(r) + '</p><p class="muted">Approved by ' + h(r.approved_by) + ', ' + h(r.approved_at) + '</p>' +
      '<div class="row"><button class="btn small" data-i="' + i + '">Entered in ERP ✓</button>' + waLink([r], 'WhatsApp', 'small') + '</div></div>'; }).join('') : '<div class="card">Every approved rate is ticked as entered in the ERP.</div>';
  all('.btn[data-i]').forEach(function (b) { b.onclick = function () { var i = Number(b.getAttribute('data-i')), r = rows[i], card = $('e' + i);
    card.className = 'card pending'; card.innerHTML = '<span class="tag green">Ticking…</span> <b>' + h(r.no) + '</b>';
    call('appRateErp', { id: r.id }).then(function () { S.rates.erp = S.rates.erp.filter(function (q) { return q.id !== r.id; }); M.nav(); card.className = 'card'; card.innerHTML = '<span class="tag green">Entered in ERP ✓</span> <b>' + h(r.no) + '</b>'; },
      function (e) { M.toast(r.no + ' was NOT ticked: ' + e.message, true); if (M.tab() === 'sy13.rates' && !M.paged()) DRAW.rates(); }); }; }); };
RATE.read = function () {
  var table = function (list) { return '<table><tr><th>Design</th><th class="n">A</th><th class="n">B</th><th class="n">C</th><th class="n">D</th></tr>' + list.map(function (x) { return '<tr><td><b>' + h(x.no) + '</b><br><span class="muted">' + h(x.approved_at) + '</span></td><td class="n">' + money(x.a) + '</td><td class="n">' + money(x.b) + '</td><td class="n">' + money(x.c) + '</td><td class="n">' + money(x.d) + '</td></tr>'; }).join('') + '</table>'; };
  $('rbody').innerHTML = finderHtml('rr', 'Look up a design: type its code') + '<div id="rout"><div class="card"><h2>Latest approved</h2>' + (S.rates.recent.length ? table(S.rates.recent) : '<p class="muted">No approved rates yet.</p>') + '</div></div>';
  finder('rr', function (x) { $('rout').innerHTML = '<div class="skel"></div>';
    call('appRates', { kind: 'read', code: x.key }).then(function (r) {
      var hist = r.history.length ? '<div class="card"><h2>History</h2><table><tr><th>When</th><th class="n">A</th><th class="n">B</th><th class="n">C</th><th class="n">D</th><th>What</th></tr>' + r.history.map(function (q) { return '<tr><td>' + h(q.entered_at) + '<br><span class="muted">' + h(q.entered_by) + '</span></td><td class="n">' + money(q.a) + '</td><td class="n">' + money(q.b) + '</td><td class="n">' + money(q.c) + '</td><td class="n">' + money(q.d) + '</td><td>' + h(q.status) + (q.erp_at ? '<br><span class="muted">in ERP ' + h(q.erp_at) + '</span>' : '') + '</td></tr>'; }).join('') + '</table></div>' : '';
      $('rout').innerHTML = '<div class="card"><h2>' + h(x.no) + (x.test ? ': test rate, shown to no one else' : ': rate in force') + '</h2>' + (r.current.length ? '<p class="line">' + rateLine(r.current[0]) + '</p><p class="muted">Approved by ' + h(r.current[0].approved_by) + ', ' + h(r.current[0].approved_at) + '</p>' : '<p class="muted">No approved rate for this design yet.</p>') + '</div>' + hist; },
      function (e) { $('rout').innerHTML = ''; M.toast(e.message, true); }); }); };

// ---- 5 · dropdown lists ----
var OPEN = {};
DRAW.lists = function () {
  $('view').innerHTML = '<p class="muted" style="margin:2px 4px 10px">The lists behind the six details. A value you take out stays on the designs that already use it; they are then listed under Fix.</p>' + S.attributes.map(function (a) {
    return '<details class="card" data-list="' + a + '"' + (OPEN[a] ? ' open' : '') + '><summary><span>' + h(S.labels[a]) + '</span><span class="tag" id="n_' + a + '"></span></summary><div class="chips" id="chips_' + a + '"></div><div class="row"><input type="text" id="new_' + a + '" placeholder="New value" autocomplete="off"><button class="btn small" style="flex:0 0 auto" data-add="' + a + '">Add</button></div></details>'; }).join('') + M.foot(); M.perf();
  S.attributes.forEach(drawChips);
  all('details[data-list]').forEach(function (d) { d.addEventListener('toggle', function () { OPEN[d.getAttribute('data-list')] = d.open; }); });
  all('[data-add]').forEach(function (b) { var a = b.getAttribute('data-add'), add = function () { var v = $('new_' + a).value.trim().replace(/\s+/g, ' '); if (!v) return M.toast('Type the value to add.', true); $('new_' + a).value = ''; listChange(a, v, 'add', false); };
    b.onclick = add; $('new_' + a).onkeydown = function (e) { if (e.key === 'Enter') add(); }; }); };
var LISTBUSY = {};   // values on their way to the server: shown at once, faded until saved
function drawChips(a) { var list = S.lists[a] || [], busy = LISTBUSY[a] || {}, shown = list.concat(Object.keys(busy).filter(function (v) { return busy[v] === 'add' && list.indexOf(v) < 0; })); if (!$('chips_' + a)) return;
  $('n_' + a).textContent = list.length;
  $('chips_' + a).innerHTML = shown.length ? shown.map(function (v, i) { return '<span' + (busy[v] ? ' class="pending"' : '') + '>' + h(v) + (busy[v] ? ' …' : '<button aria-label="Take out" data-i="' + i + '">&times;</button>') + '</span>'; }).join('') : '<span class="muted" style="background:none;padding:0">No values yet</span>';
  all('#chips_' + a + ' button').forEach(function (b) { b.onclick = function () { var v = shown[Number(b.getAttribute('data-i'))]; if (confirm('Take "' + v + '" out of the ' + S.labels[a] + ' list?')) listChange(a, v, 'retire', false); }; }); }
function listChange(a, v, action, sure) { (LISTBUSY[a] = LISTBUSY[a] || {})[v] = action; drawChips(a); M.sync('Saving…');
  call('appListChange', { list: a, value: v, action: action, sure: sure }).then(function (r) { delete LISTBUSY[a][v]; M.sync(M.flying() ? 'Saving…' : '');
    if (r.ask) { drawChips(a); if (confirm(r.ask)) listChange(a, v, action, true); return; }
    S.lists[a] = r.list; remember(); drawChips(a); M.toast(action === 'add' ? '"' + v + '" added ✓' : '"' + v + '" taken out ✓'); },
    function (e) { delete LISTBUSY[a][v]; M.sync(''); drawChips(a); M.toast('"' + v + '" was NOT ' + (action === 'add' ? 'added' : 'taken out') + ': ' + e.message, true); }); }

// ---- opening: what the phone remembers shows at once; the engine's answer follows ----
var KEY = 'maitri.sy13';
function remember() { try { localStorage.setItem(KEY, JSON.stringify({ email: S.email, can: S.can, lists: S.lists, labels: S.labels, attributes: S.attributes, ok_as_is: S.ok_as_is, owner: S.owner, names: IDX ? IDX.map(function (x) { return x.no; }) : null })); } catch (e) { /* no room, or private mode */ } }
function setIndex(names) { IDX = names.map(function (n) { return { no: n, key: keyOf(n), s: loose(n) }; }); }
function start(again) {
  if (!S) { try { var kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if (kept && kept.can && kept.email === M.email()) { S = kept; S.check = []; S.diffs = []; S.rates = { waiting: [], erp: [], recent: [] }; S.notes = []; if (kept.names) setIndex(kept.names); M.go(); M.sync('Refreshing\u2026'); } } catch (e) { /* nothing remembered */ } }
  return call('appStart').then(function (s) { var had = IDX; S = s; M.showPerf(S.owner); M.sync(''); remember(); if ((S.notes || []).length) M.toast(S.notes.join(' \u00b7 '), true);
    call('appIndex').then(function (x) { setIndex(x.names); remember(); if (!M.paged() && M.tab() === 'sy13.designs') { if ($('q') && $('q')._redraw && $('q').value) $('q')._redraw(); else DRAW.designs(); } },
      function (e) { if (!had) M.toast('The list of designs could not be loaded: ' + e.message, true); }); });
}
var ICON = { designs: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>', check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.5"/>',
  fix: '<path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.3v.2"/>', rates: '<path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8l7 7"/>', lists: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>' };
function tabs() { if (!S) return []; var c = S.can, t = [], add = function (id, name, title, count) { t.push({ id: id, name: name, title: title, icon: ICON[id], count: count, draw: DRAW[id] }); };
  if (c.log || c.edit) add('designs', 'Designs', 'Designs');
  if (c.check) add('check', 'Check', 'Check new designs', function () { return (S.check || []).filter(function (d) { return !d.mine && !d.gone; }).length; });
  if (c.diffs) add('fix', 'Fix', 'Differences', function () { return (S.diffs || []).filter(function (r) { return !r.waiting && (r.may.length || r.pick_design); }).length; });
  if (c.rate_enter || c.rate_approve || c.rate_erp || c.rate_read) add('rates', 'Rates', 'Rates', function () { return S.rates ? (c.rate_approve ? S.rates.waiting.length : 0) + (c.rate_erp ? S.rates.erp.length : 0) : 0; });
  if (c.lists) add('lists', 'Lists', 'Dropdown lists'); return t; }
/** For the owner: roles read again from the engine now, not from what it remembers (after MIS has changed a role). */
function menu() { return S && S.owner ? [{ label: 'Read my roles again now', run: function () { M.sync('Reading roles…'); call('appRefreshRoles').then(function (s) { S = s; M.sync(''); remember(); if (!M.paged()) M.go(); else M.nav(); M.toast('Roles read again ✓'); }, function (e) { M.sync(''); M.toast(e.message, true); }); } }] : []; }
var def = { id: 'sy13', start: start, tabs: tabs, menu: menu, forget: function () { try { localStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } } };
M.register(def);
})();
