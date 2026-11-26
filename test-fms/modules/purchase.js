'use strict';
// The Maitri company app · module purchase: the purchase FMS, micro FMS #3. MIS · FMS, 11 Nov 2026.
// Build order 1 gives it two screens: My work, and New PO. The frame (shell.js) gives the bottom bar,
// the pages, the sign-in and the call to this module's own engine.
//   · Nothing is written in here. Every list a person picks from — vendors, departments, doers, reasons,
//     the kinds of PO — comes from the engine's answer to appStart at each opening. This file holds no
//     name, no number and no address, because the app's screens are a public site.
//   · Nothing is kept on the phone, not even those lists.
//   · It touches only its own section, and reaches the engine only through the frame's def.call.
//   · The pale boxes fill themselves from the engine's answer: department, the kind the PO was saved
//     under, and the due dates.
(function () {
var M = window.MAITRI, h = M.h;
var S = null, DRAW = {}, LAST = null;
function call(name, arg) { return def.call(name, arg); }
function val(id) { var el = M.$(id); return el ? String(el.value || '').trim() : ''; }
function pick(list, id, blank) {
  return '<select id="' + id + '"><option value="">' + h(blank) + '</option>' +
    (list || []).map(function (x) { return '<option value="' + h(x.code || x.email) + '">' + h(x.display || x.email) + '</option>'; }).join('') + '</select>';
}
function opts(list) {
  return (list || []).map(function (x) { return '<option value="' + h(x.code) + '">' + h(x.display) + '</option>'; }).join('');
}
function reasons(list, id, blank) {
  var rs = (S.reasons || {})[list] || [];
  return '<select id="' + id + '"><option value="">' + h(blank) + '</option>' +
    rs.map(function (r) { return '<option value="' + h(r.code) + '">' + h(r.text) + '</option>'; }).join('') + '</select>';
}

// ---- My work ----
DRAW.work = function () {
  var w = LAST || { entered: { count: 0, rows: [] }, samples_due: { count: 0, rows: [] } };
  var due = w.samples_due.rows.map(function (r) {
    return '<div class="item"><div class="r"><b>' + h(r.reference_no || r.po_key) + '</b>' +
      '<span class="pill ' + (r.days_late > 0 ? 'p-red' : 'p-amb') + '">' + (r.days_late > 0 ? h(r.days_late) + ' days late' : 'due today') + '</span></div>' +
      '<span class="muted">' + h(r.vendor_code) + ' · sample due ' + h(r.sample_due) + '</span></div>';
  }).join('');
  var mine = w.entered.rows.map(function (r) {
    return '<div class="item"><div class="r"><b>' + h(r.po_number) + '</b>' +
      (r.late_entry ? '<span class="pill p-amb">entered late</span>' : '') + '</div>' +
      '<span class="muted">' + h(r.vendor_code) + ' · ' + h(r.po_kind) + ' · ' + h(r.reference_no) + '</span></div>';
  }).join('');
  M.$('view').innerHTML =
    '<div class="sec">Samples to receive (' + h(w.samples_due.count) + ')</div>' +
    (due || '<div class="card">Nothing due.</div>') +
    '<div class="sec">What you entered today and on ' + h(w.previous_working_day || 'the day before') + ' (' + h(w.entered.count) + ')</div>' +
    (mine || '<div class="card">Nothing yet.</div>') +
    (S.can.new_po ? '<button class="big" id="go_new">+ New PO</button>' : '') + M.foot();
  if (S.can.new_po) M.$('go_new').onclick = newPoPage;
  M.perf();
};

// ---- New PO ----
function newPoPage() {
  var hint = S.test_prefix ? '<div class="card">This is the TEST system: a PO number must begin with ' + h(S.test_prefix) + '.</div>' : '';
  var deptRow = S.dept_without_design === 'deo_pick'
    ? '<div class="field" id="dept_row" hidden><label>Department (no design number, so choose it)</label>' + pick(S.departments, 'dept', '— choose —') + '</div>'
    : '';
  M.page('New PO', hint +
    '<div class="card">' +
    '<div class="field"><label>PO no.</label><input id="po" autocapitalize="characters"></div>' +
    '<div class="field"><label>Reference no. (sample no. or the vendor\'s REF)</label><input id="ref"></div>' +
    '<div class="field"><label>Design no. (leave blank if it is not made yet)</label><input id="design"></div>' +
    '<div class="field"><label>Vendor</label>' + pick(S.vendors, 'vendor', '— choose —') + '</div>' +
    '<div class="field"><label>Kind</label>' + reasons('po_kind', 'kind', '— choose —') + '</div>' +
    deptRow +
    '<div class="field"><label>Who raised it</label>' + pick(S.doers, 'doer', '— choose —') + '</div>' +
    '<div class="field"><label>When it was raised</label><select id="when">' + opts(LAST && LAST.when_choices) + '</select></div>' +
    '<div class="field"><label><input type="checkbox" id="ov_on"> Change the due date</label></div>' +
    '<div class="field" id="ov_row" hidden><label>New due date</label><input id="ov_due" type="date">' +
      '<label>Which date</label>' + reasons('milestone', 'ov_which', '— choose —') +
      '<label>Why</label>' + reasons('override', 'ov_reason', '— choose —') + '</div>' +
    '<button class="btn" id="save">Save</button>' +
    '</div><div id="said"></div>', mount);
}
function mount() {
  var design = M.$('design'), deptRow = M.$('dept_row'), ovOn = M.$('ov_on'), ovRow = M.$('ov_row');
  var showDept = function () { if (deptRow) deptRow.hidden = !!val('design'); };
  if (design) design.oninput = showDept;
  showDept();
  if (ovOn) ovOn.onchange = function () { ovRow.hidden = !ovOn.checked; };
  M.$('save').onclick = function () { save(this); };
}
function arg() {
  var a = { po_number: val('po'), reference_no: val('ref'), design_number: val('design'), vendor_code: val('vendor'),
    kind: val('kind'), done_by: val('doer') };
  if (val('when')) a.done_at = val('when');
  if (!a.design_number && val('dept')) a.dept_code = val('dept');
  var on = M.$('ov_on');
  if (on && on.checked) a.override = { milestone: val('ov_which'), due: val('ov_due'), reason_code: val('ov_reason') };
  return a;
}
function save(btn) {
  var a = arg();
  M.press(btn, call, 'newPo', a, function (r) { said(r, a); });
}
function said(r, a) {
  var box = M.$('said');
  if (!box) return;
  box.innerHTML = '<div class="card"><span class="tag green">Saved ✓</span>' +
    '<div class="inp auto">Department: <b>' + h(r.dept_code) + '</b></div>' +
    '<div class="inp auto">Saved as: <b>' + h(r.po_kind) + '</b>' + (r.kind_changed ? '<br><span class="muted">' + h(r.kind_changed) + '</span>' : '') + '</div>' +
    '<div class="inp auto">Sample due: <b>' + h(r.sample_due || '—') + '</b></div>' +
    '<div class="inp auto">Bulk due: <b>' + h(r.bulk_due || (r.po_kind === 'own_sample' ? 'set when the sample is approved' : '—')) + '</b></div>' +
    (r.late_entry ? '<p class="muted">Recorded as entered late.</p>' : '') +
    (r.warning ? '<p class="muted">' + h(r.warning) + '</p>' : '') +
    (r.kind_changed ? '<div class="field"><label>Still want a vendor sample? Say why and it keeps the own-sample flow.</label>' + reasons('sample_needed', 'sn_reason', '— choose —') + '<button class="btn" id="sn">Ask for a sample</button></div>' : '') +
    '</div>';
  if (r.kind_changed) {
    M.$('sn').onclick = function () {
      var fixed = JSON.parse(JSON.stringify(a));
      fixed.supersedes_id = r.entry_id;
      fixed.sample_needed = true;
      fixed.sample_needed_reason = val('sn_reason');
      M.press(this, call, 'supersede', fixed, function () { M.toast('Noted: it keeps the own-sample flow ✓'); refresh(); });
    };
  }
  refresh();
}
function refresh() { call('myWork').then(function (w) { LAST = w; M.nav(); }, function () { /* the screen stays as it is */ }); }

// ---- the module ----
function start(again) {
  return call('appStart').then(function (s) {
    S = s;
    return call('myWork').then(function (w) { LAST = w; if (again) M.nav(); });
  });
}
function tabs() {
  if (!S) return [];
  return [{ id: 'work', name: 'Purchase', title: 'My work · purchase', icon: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="18" cy="17" r="2"/>',
    count: function () { return LAST ? LAST.samples_due.count : 0; }, draw: DRAW.work }];
}
var def = { id: 'purchase', start: start, tabs: tabs };
M.register(def);
})();
