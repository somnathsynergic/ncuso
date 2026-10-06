import { h } from '/js/components/dom.js';
import { steps } from '/js/config/formConfig.js';

const COLUMNS = [
  { key: 'id', label: 'ID', width: 80 },
  { key: 'school', label: 'School', width: 240 },
  { key: 'udise', label: 'UDISE No.', width: 130 },
  { key: 'district', label: 'District', width: 190 },
  { key: 'type', label: 'Type', width: 190 },
  { key: 'students', label: 'Students', num: true, width: 100 },
  { key: 'teachers', label: 'Teachers', num: true, width: 100 },
  { key: 'submitted', label: 'Submitted', width: 170 },
  { key: 'status', label: 'Status', width: 120 },
  { key: 'actions', label: 'Action', width: 210, noSort: true },
];

const STATUS = { P: ['Pending', 'pending'], A: ['Approved', 'approved'], R: ['Rejected', 'rejected'] };
const BLINK_MS = 1800; // 3 blinks x 0.6s (keep in sync with admin.css)
const ROW_H = 49;     // fixed row height (px) — required for windowing math
const OVERSCAN = 6;   // extra rows rendered above/below the viewport
const CHUNK = 100;    // rows per request in "All" mode

// Two modes, both server-side:
//  - paged: the server returns one page (10/25/50/100 rows); the rows are virtualized in the scroller.
//  - all:   the server returns CHUNK rows at a time; chunks are fetched on demand as the user scrolls.
const state = {
  search: '', district: '', sort: 'submitted', dir: 'desc', page: 1, pageSize: 10,
  rows: [],            // paged mode: current page
  cache: new Map(),    // all mode: row index -> row
  inflight: new Set(), // all mode: chunk numbers being fetched
  total: 0, districts: [], loading: true, error: '',
  seenKey: null,          // localStorage key holding the newest registration id this admin has already seen
  seenHandled: false,
  blinkIds: new Set(),    // rows that are new since the last visit
  blinkStart: 0,
};

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable: nothing blinks */ } },
};

// Runs once, on the first successful load: rows with an id above the last-seen id blink, then the
// last-seen id moves up so they only blink this once. First-ever visit just sets the baseline.
function markNewRows(data) {
  if (state.seenHandled || !state.seenKey) return;
  state.seenHandled = true;
  const saved = store.get(state.seenKey);
  if (saved !== null) {
    const last = Number(saved) || 0;
    data.rows.forEach((r) => { if (r.id > last) state.blinkIds.add(r.id); });
    if (state.blinkIds.size) state.blinkStart = performance.now();
  }
  store.set(state.seenKey, String(Math.max(Number(saved) || 0, data.maxId || 0)));
}

const root = document.getElementById('app');

// Keep the Back button inside the dashboard while signed in: pressing Back re-adds the dashboard entry,
// so you never fall out to the form (or login) page and never land on a "forward" dashboard entry.
// Logging out is the only way out. Browsers may skip history entries added without a user gesture,
// so the trap is armed on load and again on the first click/keypress/touch.
const armBackTrap = () => history.pushState({ adminTrap: true }, '', location.href);
armBackTrap();
['pointerdown', 'keydown', 'touchstart'].forEach((t) => window.addEventListener(t, armBackTrap, { once: true, capture: true }));
window.addEventListener('popstate', armBackTrap);

// Route guard: when this page is restored from history (Back/Forward, bfcache) re-verify the session,
// so a logged-out user can never view the data table by navigating forward.
window.addEventListener('pageshow', (e) => {
  const fromHistory = e.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (!fromHistory) return;
  fetch('/api/admin/session', { cache: 'no-store' })
    .then((r) => { if (r.status === 401) location.replace('/admin/login'); })
    .catch(() => {});
});
const fmtDate = (s) => new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 401) { location.replace('/admin/login'); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}

const isAll = () => state.pageSize === 'all';
const effectiveSize = () => (isAll() ? CHUNK : state.pageSize);
const rowCount = () => (isAll() ? state.total : state.rows.length);
const getRow = (i) => (isAll() ? state.cache.get(i) : state.rows[i]);

const query = (page, pageSize) => new URLSearchParams({
  search: state.search, district: state.district, sort: state.sort, dir: state.dir, page, pageSize,
});

let epoch = 0; // bumped on every query change; stale responses are dropped

async function load() {
  const mine = ++epoch;
  state.loading = true;
  state.error = '';
  state.inflight.clear();
  state.cache.clear();
  paintTable();
  try {
    const data = await api(`/api/admin/registrations?${query(state.page, effectiveSize())}`);
    if (mine !== epoch) return;
    state.total = data.total;
    markNewRows(data);
    const pages = Math.max(1, Math.ceil(data.total / effectiveSize()));
    if (!isAll() && state.page > pages) { state.page = pages; return load(); }
    if (isAll()) data.rows.forEach((r, i) => state.cache.set(i, r));
    else state.rows = data.rows;
  } catch (e) {
    if (mine !== epoch) return;
    state.error = e.message;
    state.rows = [];
    state.total = 0;
  }
  state.loading = false;
  paintTable();
}

// All mode: fetch a chunk (1-based) if it is not loaded or loading
async function ensureChunk(n) {
  if (state.inflight.has(n) || state.cache.has((n - 1) * CHUNK)) return;
  const mine = epoch;
  state.inflight.add(n);
  try {
    const data = await api(`/api/admin/registrations?${query(n, CHUNK)}`);
    if (mine !== epoch) return;
    data.rows.forEach((r, i) => state.cache.set((n - 1) * CHUNK + i, r));
  } catch (e) {
    if (mine !== epoch) return;
    state.error = e.message;
  } finally {
    if (mine === epoch) { state.inflight.delete(n); paintRows(); }
  }
}

function reset(patch) {
  Object.assign(state, patch, { page: 1 });
  const sc = document.getElementById('scroller');
  if (sc) sc.scrollTop = 0;
  load();
}

// rejected_by holds "<admin id> - <note>"; approved_by is just the admin id
function splitDecisionBy(by) {
  const s = String(by ?? '');
  const i = s.indexOf(' - ');
  return i < 0 ? { who: s, note: '' } : { who: s.slice(0, i), note: s.slice(i + 3) };
}

// ---------- Detail popup ----------
async function openDetail(id) {
  const body = h('div', { class: 'modal-body' }, h('p', { class: 'muted' }, 'Loading…'));
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  const onKey = (e) => e.key === 'Escape' && close();
  const foot = h('div', { class: 'modal-foot', hidden: true }); // approval controls, always visible below the scrolling details
  const overlay = h('div', { class: 'overlay', onClick: (e) => e.target === overlay && close() },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' },
        h('div', {}, h('h2', {}, 'Registration details'), h('small', { id: 'modal-sub' }, `ID #${id}`)),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onClick: close }, '✕')),
      body,
      foot));
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  try {
    const reg = await api(`/api/admin/registrations/${id}`);
    let current = reg.status;
    const decisionOf = (r) => ({ at: r.approvedAt ?? r.rejectedAt, by: r.approvedBy ?? r.rejectedBy });
    let decision = decisionOf(reg); // who decided and when (Approved or Rejected)
    const paintFoot = (busy = false) => {
      overlay.querySelector('#modal-sub').textContent = `ID #${reg.id} · Submitted ${fmtDate(reg.submittedAt)}`;
      const btn = (label, code, cls) => h('button', {
        type: 'button', class: `act big ${cls}`, disabled: busy || current !== 'P',
        onClick: async () => {
          const answer = await confirmDecision(code, reg.values.schoolName);
          if (!answer) return;
          paintFoot(true);
          const next = await updateStatus(reg.id, code, answer.note);
          if (next && next !== 'P') {
            try { decision = decisionOf(await api(`/api/admin/registrations/${reg.id}`)); } catch { /* footer just omits the details */ }
          }
          current = next || current;
          paintFoot();
        },
      }, label);
      foot.hidden = false;
      foot.replaceChildren(
        h('div', { class: 'foot-status' }, h('span', { class: 'muted' }, 'Status'), StatusBadge(current),
          current !== 'P' && decision.at && h('span', { class: 'muted' },
            `${splitDecisionBy(decision.by).who ? `by ${splitDecisionBy(decision.by).who} · ` : ''}${fmtDate(decision.at)}`)),
        h('div', { class: 'foot-actions' }, btn('Approve', 'A', 'approve'), btn('Reject', 'R', 'reject')),
        current === 'R' && splitDecisionBy(decision.by).note && h('div', { class: 'foot-note' },
          h('strong', {}, 'Rejection note: '), splitDecisionBy(decision.by).note));
    };
    paintFoot();
    body.replaceChildren(...steps.map((s) =>
      h('section', { class: 'detail-section' },
        h('h3', {}, `${s.icon} ${s.title}`),
        h('dl', {}, s.fields.map((f) => {
          const v = reg.values[f.name];
          const shown = Array.isArray(v)
            ? (v.length ? h('ul', { class: 'chips' }, v.map((x) => h('li', {}, x))) : '—')
            : f.prefix ? `${f.prefix} ${Number(v).toLocaleString('en-IN')}` : v;
          return [h('dt', {}, f.label), h('dd', {}, shown)];
        })))));
  } catch (e) {
    body.replaceChildren(h('p', { class: 'error' }, e.message));
  }
}

// ---------- Logout confirmation ----------
function confirmLogout() {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll'); };
  const onKey = (e) => e.key === 'Escape' && close();
  const confirmBtn = h('button', {
    class: 'btn danger', type: 'button',
    onClick: async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Logging out…';
      try { await fetch('/api/admin/logout', { method: 'POST' }); } finally { location.replace('/admin/login'); }
    },
  }, 'Yes, log out');
  const overlay = h('div', { class: 'overlay', onClick: (e) => e.target === overlay && close() },
    h('div', { class: 'modal confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'logout-title' },
      h('div', { class: 'confirm-body' },
        h('div', { class: 'warn-icon' }, '⚠️'),
        h('h2', { id: 'logout-title' }, 'Log out?'),
        h('p', {}, 'You will be signed out of the admin dashboard and will need to log in again to view registrations.')),
      h('div', { class: 'confirm-actions' },
        h('button', { class: 'btn ghost', type: 'button', onClick: close }, 'Cancel'),
        confirmBtn)));
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.btn.ghost').focus(); // safe default
}


// ---------- Table (virtualized) ----------
function Pagination() {
  if (isAll()) {
    return h('div', { class: 'pager' },
      h('span', { class: 'muted' }, state.total
        ? `All ${state.total.toLocaleString('en-IN')} records — rows load as you scroll`
        : 'No records'));
  }
  const size = effectiveSize();
  const pages = Math.max(1, Math.ceil(state.total / size));
  const from = state.total ? (state.page - 1) * size + 1 : 0;
  const to = Math.min(state.total, state.page * size);
  // windowed page numbers: 1 … p-1 p p+1 … N
  const nums = [...new Set([1, state.page - 1, state.page, state.page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const items = [];
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) items.push(h('span', { class: 'gap' }, '…'));
    items.push(h('button', {
      type: 'button', class: `page${n === state.page ? ' active' : ''}`, onClick: () => goPage(n),
    }, String(n)));
  });
  return h('div', { class: 'pager' },
    h('span', { class: 'muted' }, `Showing ${from.toLocaleString('en-IN')}–${to.toLocaleString('en-IN')} of ${state.total.toLocaleString('en-IN')}`),
    h('div', { class: 'pages' },
      h('button', { type: 'button', class: 'page', disabled: state.page <= 1, onClick: () => goPage(state.page - 1) }, '‹ Prev'),
      items,
      h('button', { type: 'button', class: 'page', disabled: state.page >= pages, onClick: () => goPage(state.page + 1) }, 'Next ›')));
}

function goPage(n) {
  state.page = n;
  document.getElementById('scroller').scrollTop = 0;
  load();
}

function Head() {
  return h('thead', {}, h('tr', {}, COLUMNS.map((c) => {
    if (c.noSort) return h('th', { class: 'static' }, h('span', { class: 'th-label' }, c.label));
    const active = state.sort === c.key;
    return h('th', {
      class: `sortable${active ? ' sorted' : ''}${c.num ? ' num' : ''}`,
      'aria-sort': active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none',
    }, h('button', {
      type: 'button',
      onClick: () => reset({ sort: c.key, dir: active && state.dir === 'asc' ? 'desc' : active ? 'asc' : (c.key === 'submitted' || c.num ? 'desc' : 'asc') }),
    }, c.label, h('span', { class: 'arrow' }, active ? (state.dir === 'asc' ? '▲' : '▼') : '↕')));
  })));
}

const spacer = (px) => h('tr', { class: 'spacer', style: `height:${px}px` }, h('td', { colSpan: COLUMNS.length }));
const messageRow = (text, cls = '') => h('tr', {}, h('td', { colSpan: COLUMNS.length, class: `empty ${cls}` }, text));

function DataRow(r) {
  const elapsed = performance.now() - state.blinkStart;
  const blinking = state.blinkIds.has(r.id) && elapsed < BLINK_MS;
  return h('tr', {
    class: `row${blinking ? ' blink' : ''}`, tabIndex: 0,
    style: `height:${ROW_H}px${blinking ? `;--blink-delay:-${Math.round(elapsed)}ms` : ''}`,
    onClick: () => openDetail(r.id),
    onKeydown: (e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openDetail(r.id)),
  },
  h('td', {}, `#${r.id}`),
  h('td', { class: 'strong' }, r.school),
  h('td', {}, r.udise),
  h('td', {}, r.district),
  h('td', {}, h('span', { class: 'tag-pill' }, r.type)),
  h('td', { class: 'num' }, r.students),
  h('td', { class: 'num' }, r.teachers),
  h('td', { class: 'muted' }, fmtDate(r.submitted)),
  h('td', {}, StatusBadge(r.status)),
  h('td', { class: 'actions-cell' }, ActionButtons(r)));
}

const StatusBadge = (s) => h('span', { class: `status ${(STATUS[s] || STATUS.P)[1]}` }, (STATUS[s] || STATUS.P)[0]);

// Approve / Reject buttons; the one matching the current status is disabled. Clicks must not open the row popup.
function ActionButtons(r) {
  const busy = pendingUpdates.has(r.id);
  const btn = (label, code, cls) => h('button', {
    type: 'button', class: `act ${cls}`, disabled: busy || r.status !== 'P',
    title: `${label} ${r.school}`, 'aria-label': `${label} ${r.school}`,
    onClick: (e) => { e.stopPropagation(); decide(r.id, code, r.school); },
  }, label);
  return [btn('Approve', 'A', 'approve'), btn('Reject', 'R', 'reject')];
}

// Small auto-dismissing notification (bottom-centre), above any popup
function toast(message, type = 'success') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const el = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-icon' }, type === 'error' ? '!' : type === 'rejected' ? '✕' : '✓'), message);
  box.append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 3000);
}

// ---------- Confirmation before approving / rejecting ----------
// Resolves to { note } when confirmed (note is '' for approvals) or null when cancelled.
// Rejecting requires a note (max 400 chars); it is saved with the admin id as "<admin> - <note>".
function confirmDecision(status, school) {
  const reject = status === 'R';
  const NOTE_MAX = 400;
  const opener = document.activeElement;
  return new Promise((resolve) => {
    const finish = (value) => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
      if (opener && opener.isConnected) opener.focus();
      resolve(value);
    };
    // capture phase + stopImmediatePropagation: Esc closes only this dialog, not the details popup under it
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); finish(null); }
    };

    const error = h('p', { class: 'error note-error', role: 'alert' });
    const counter = h('span', { class: 'muted note-count' }, `0 / ${NOTE_MAX}`);
    const note = reject ? h('textarea', {
      class: 'input note-input', rows: 4, maxLength: NOTE_MAX, placeholder: 'Why is this registration being rejected?',
      'aria-label': 'Rejection note (required)', 'aria-required': 'true',
      onInput: (e) => { counter.textContent = `${e.target.value.length} / ${NOTE_MAX}`; if (e.target.value.trim()) { error.textContent = ''; e.target.classList.remove('invalid'); } },
    }) : null;

    const submit = () => {
      if (reject && !note.value.trim()) {
        error.textContent = 'A rejection note is required.';
        note.classList.add('invalid');
        note.focus();
        return;
      }
      finish({ note: reject ? note.value.replace(/\s+/g, ' ').trim() : '' });
    };

    const cancelBtn = h('button', { class: 'btn ghost', type: 'button', onClick: () => finish(null) }, 'Cancel');
    const overlay = h('div', { class: 'overlay overlay-top', onClick: (e) => e.target === overlay && finish(null) },
      h('div', { class: `modal confirm ${reject ? 'is-reject' : 'is-approve'}`, role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'decide-title' },
        h('div', { class: 'confirm-body' },
          h('div', { class: 'warn-icon' }, reject ? '⚠️' : '✅'),
          h('h2', { id: 'decide-title' }, reject ? 'Reject this registration?' : 'Approve this registration?'),
          h('p', {}, school ? h('strong', {}, school) : 'This registration', ` will be marked as ${reject ? 'Rejected' : 'Approved'}. This decision is final and cannot be changed later.`),
          reject && h('div', { class: 'note-field' },
            h('label', {}, 'Rejection note ', h('span', { class: 'req' }, '*')),
            note, h('div', { class: 'note-meta' }, error, counter))),
        h('div', { class: 'confirm-actions' },
          cancelBtn,
          h('button', { class: `btn ${reject ? 'danger' : 'success'}`, type: 'button', onClick: submit }, reject ? 'Yes, reject' : 'Yes, approve'))));

    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    (reject ? note : cancelBtn).focus(); // reject: start typing the note; approve: safe default is Cancel
  });
}

// Ask first, then save. Returns the new status, or null if cancelled / failed.
async function decide(id, status, school) {
  const answer = await confirmDecision(status, school);
  return answer ? updateStatus(id, status, answer.note) : null;
}

const pendingUpdates = new Set();
async function updateStatus(id, status, note = '') {
  pendingUpdates.add(id);
  paintRows();
  try {
    await api(`/api/admin/registrations/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note }),
    });
    const row = isAll() ? [...state.cache.values()].find((x) => x.id === id) : state.rows.find((x) => x.id === id);
    if (row) row.status = status;
    const who = row ? ` '${row.school}'` : ` #${id}`;
    toast(status === 'A' ? `Registration${who} accepted` : `Registration${who} rejected`, status === 'A' ? 'success' : 'rejected');
    return status;
  } catch (e) {
    toast(e.message, 'error');
    // Already decided elsewhere: sync this screen with the real status
    const actual = e.data?.status;
    if (actual) {
      const row = isAll() ? [...state.cache.values()].find((x) => x.id === id) : state.rows.find((x) => x.id === id);
      if (row) row.status = actual;
    }
    return actual || null;
  } finally {
    pendingUpdates.delete(id);
    paintRows();
  }
}

const SkeletonRow = () => h('tr', { class: 'row skeleton', style: `height:${ROW_H}px` },
  COLUMNS.map(() => h('td', {}, h('span', { class: 'bar' }))));

// Renders only the rows intersecting the scroll viewport, padded by spacer rows
function paintRows() {
  const sc = document.getElementById('scroller');
  const tbody = document.getElementById('tbody');
  if (!sc || !tbody) return;

  const count = rowCount();
  if (state.error) return tbody.replaceChildren(messageRow(state.error, 'error'));
  if (!count) return tbody.replaceChildren(messageRow(state.loading ? 'Loading…' : 'No registrations match your filters.'));

  const viewH = sc.clientHeight || 600;
  const start = Math.max(0, Math.floor(sc.scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(count, Math.ceil((sc.scrollTop + viewH) / ROW_H) + OVERSCAN);

  const rows = [];
  const needed = new Set();
  for (let i = start; i < end; i++) {
    const r = getRow(i);
    if (r) rows.push(DataRow(r));
    else { rows.push(SkeletonRow()); needed.add(Math.floor(i / CHUNK) + 1); }
  }
  tbody.replaceChildren(spacer(start * ROW_H), ...rows, spacer((count - end) * ROW_H));
  if (isAll()) needed.forEach(ensureChunk);
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { ticking = false; paintRows(); });
}

// Full refresh of table body + footer (header is rebuilt in render() / on sort change)
function paintTable() {
  const holder = document.getElementById('table-holder');
  if (!holder) return;
  const wrap = document.getElementById('table-wrap');
  wrap.classList.toggle('loading', state.loading && rowCount() > 0);
  const old = holder.querySelector('.pager');
  const next = Pagination();
  old ? old.replaceWith(next) : holder.append(next);
  const thead = wrap.querySelector('thead');
  thead.replaceWith(Head());
  paintRows();
}

// ---------- Page shell ----------
function render() {
  let timer;
  const searchInput = h('input', {
    class: 'input', type: 'search', placeholder: 'Search school, UDISE, mobile or circle…', value: state.search,
    onInput: (e) => { clearTimeout(timer); const v = e.target.value.trim(); timer = setTimeout(() => reset({ search: v }), 300); },
  });
  const districtSelect = h('select', { class: 'input select', onChange: (e) => reset({ district: e.target.value }) },
    h('option', { value: '' }, 'All districts'),
    state.districts.map((d) => h('option', { value: d.id, selected: String(d.id) === state.district }, d.name)));
  const sizeSelect = h('select', { class: 'input select small', 'aria-label': 'Rows per page', onChange: (e) => reset({ pageSize: e.target.value === 'all' ? 'all' : Number(e.target.value) }) },
    [10, 25, 50, 100, 'all'].map((n) => h('option', { value: n, selected: n === state.pageSize }, n === 'all' ? 'All' : `${n} / page`)));

  const scroller = h('div', { id: 'scroller', class: 'scroller', onScroll },
    h('table', { class: 'vtable' },
      h('colgroup', {}, COLUMNS.map((c) => h('col', { style: `width:${c.width}px` }))),
      Head(),
      h('tbody', { id: 'tbody' })));

  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' },
        h('img', { src: '/img/logo.png', alt: '', class: 'brand-logo' }),
        h('div', {},
          h('span', { class: 'brand-short' }, 'NCUSO'),
          h('small', {}, 'National Council for Unaided School Organization'),
          h('strong', { class: 'brand-sub' }, 'Admin Dashboard · School registrations'))),
      h('button', { class: 'btn ghost', type: 'button', onClick: confirmLogout }, 'Log out')),
    h('main', { class: 'content' },
      h('div', { class: 'card' },
        h('div', { class: 'toolbar' }, searchInput, districtSelect, sizeSelect),
        h('div', { id: 'table-holder' }, h('div', { id: 'table-wrap', class: 'table-wrap' }, scroller)))));
  paintTable();
}

window.addEventListener('resize', () => paintRows());

(async function init() {
  render();
  try {
    const me = await api('/api/admin/session');
    state.seenKey = `ncuso-admin-last-seen:${me.admin}`;
  } catch { /* without an id nothing blinks; the table still loads */ }
  load();
  try { state.districts = await api('/api/districts'); render(); } catch { /* filter simply stays on "All" */ }
})();
