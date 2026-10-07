import { h } from '/js/components/dom.js';
import { Topbar } from '/admin/assets/nav.js';

const nf = new Intl.NumberFormat('en-IN');
const state = { search: '', district: '', districts: [], items: [], totalSchools: 0, loading: true, error: '' };
const root = document.getElementById('app');

async function api(url) {
  const res = await fetch(url);
  if (res.status === 401) { location.replace('/admin/login'); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

let epoch = 0; // stale responses are dropped
async function load() {
  const mine = ++epoch;
  state.loading = true;
  state.error = '';
  paintReport();
  try {
    const data = await api(`/api/admin/reports/non-compliance?${new URLSearchParams({ search: state.search, district: state.district })}`);
    if (mine !== epoch) return;
    state.items = data.items;
    state.totalSchools = data.totalSchools;
  } catch (e) {
    if (mine !== epoch) return;
    state.error = e.message;
    state.items = [];
    state.totalSchools = 0;
  }
  state.loading = false;
  paintReport();
}

function scopeLabel() {
  const name = state.districts.find((d) => String(d.id) === state.district)?.name;
  return `${name || 'All districts'}${state.search ? ` · matching “${state.search}”` : ''}`;
}

function paintReport() {
  const box = document.getElementById('report');
  if (!box) return;
  if (state.error) return box.replaceChildren(h('p', { class: 'error' }, state.error));
  const total = state.totalSchools;
  const body = state.items.map((it, i) => {
    const pct = total ? (it.count / total) * 100 : 0;
    return h('tr', {},
      h('td', { class: 'muted' }, String(i + 1)),
      h('td', { class: 'strong' }, it.item),
      h('td', { class: 'num' }, nf.format(it.count)),
      h('td', { class: 'bar-cell' },
        h('div', { class: 'meter', title: `${pct.toFixed(1)}%` }, h('span', { style: `width:${pct}%` })),
        h('span', { class: 'muted pct' }, `${pct.toFixed(1)}%`)));
  });
  box.replaceChildren(
    h('div', { class: 'report-scope muted' }, `${scopeLabel()} — ${state.loading ? '…' : nf.format(total)} schools`),
    h('div', { class: `table-wrap${state.loading ? ' loading' : ''}` },
      h('table', { class: 'report-table' },
        h('thead', {}, h('tr', {},
          h('th', {}, '#'), h('th', {}, 'Non-compliance item'),
          h('th', { class: 'num' }, 'Schools'), h('th', {}, '% of schools'))),
        h('tbody', {}, body.length ? body : h('tr', {}, h('td', { colSpan: 4, class: 'empty' }, state.loading ? 'Loading…' : 'No data.'))))));
}

function render() {
  let timer;
  const searchInput = h('input', {
    class: 'input', type: 'search', placeholder: 'Search school, UDISE, mobile or circle…', value: state.search,
    onInput: (e) => { clearTimeout(timer); const v = e.target.value.trim(); timer = setTimeout(() => { state.search = v; load(); }, 300); },
  });
  const districtSelect = h('select', { class: 'input select', onChange: (e) => { state.district = e.target.value; load(); } },
    h('option', { value: '' }, 'All districts'),
    state.districts.map((d) => h('option', { value: d.id, selected: String(d.id) === state.district }, d.name)));
  root.replaceChildren(
    Topbar('reports', 'Admin Dashboard · Reports'),
    h('main', { class: 'content' },
      h('div', { class: 'card' },
        h('h2', { class: 'report-title' }, 'Non-compliance report'),
        h('div', { class: 'toolbar report-toolbar' }, searchInput, districtSelect),
        h('div', { id: 'report' }))));
  paintReport();
}

// Re-verify the session when restored from history, as the dashboard does
window.addEventListener('pageshow', (e) => {
  const fromHistory = e.persisted || performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  if (!fromHistory) return;
  fetch('/api/admin/session', { cache: 'no-store' })
    .then((r) => { if (r.status === 401) location.replace('/admin/login'); })
    .catch(() => {});
});

(async function init() {
  render();
  load();
  try { state.districts = await api('/api/districts'); render(); } catch { /* filter stays on "All" */ }
})();
