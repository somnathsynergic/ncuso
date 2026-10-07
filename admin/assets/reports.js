import { h } from '/js/components/dom.js';
import { Topbar } from '/admin/assets/nav.js';

const nf = new Intl.NumberFormat('en-IN');
const state = { search: '', district: '', districts: [], summary: null, nonCompliance: [], totalSchools: 0, loading: true, error: '' };
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
    const qs = new URLSearchParams({ search: state.search, district: state.district });
    const [summary, nc] = await Promise.all([
      api(`/api/admin/reports/summary?${qs}`), api(`/api/admin/reports/non-compliance?${qs}`)]);
    if (mine !== epoch) return;
    state.summary = summary;
    state.nonCompliance = nc.items;
    state.totalSchools = summary.totalSchools;
  } catch (e) {
    if (mine !== epoch) return;
    state.error = e.message;
    state.summary = null;
    state.nonCompliance = [];
    state.totalSchools = 0;
  }
  state.loading = false;
  paintReport();
}

function scopeLabel() {
  const name = state.districts.find((d) => String(d.id) === state.district)?.name;
  return `${name || 'All districts'}${state.search ? ` · matching “${state.search}”` : ''}`;
}

// Table of { item, count } rows with a share-of-schools bar
function CountTable(title, items, label) {
  const total = state.totalSchools;
  const rows = items.map((it, i) => {
    const pct = total ? (it.count / total) * 100 : 0;
    return h('tr', {},
      h('td', { class: 'muted' }, String(i + 1)),
      h('td', { class: 'strong' }, it.item),
      h('td', { class: 'num' }, nf.format(it.count)),
      h('td', { class: 'bar-cell' },
        h('div', { class: 'meter', title: `${pct.toFixed(1)}%` }, h('span', { style: `width:${pct}%` })),
        h('span', { class: 'muted pct' }, `${pct.toFixed(1)}%`)));
  });
  return h('section', { class: 'report-section' },
    h('h3', {}, title),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'report-table' },
        h('thead', {}, h('tr', {},
          h('th', {}, '#'), h('th', {}, label), h('th', { class: 'num' }, 'Schools'), h('th', {}, '% of schools'))),
        h('tbody', {}, rows))));
}

// Single-figure report
const Stat = (title, value, note) => h('section', { class: 'report-section' },
  h('h3', {}, title),
  h('div', { class: 'stat-box' }, h('strong', {}, nf.format(value)), note && h('span', { class: 'muted' }, note)));

function paintReport() {
  const box = document.getElementById('report');
  if (!box) return;
  if (state.error) return box.replaceChildren(h('p', { class: 'error' }, state.error));
  const sm = state.summary;
  if (!sm) return box.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  const untrainedPct = sm.teachers ? ` (${((sm.untrained / sm.teachers) * 100).toFixed(1)}% of teachers)` : '';
  box.replaceChildren(
    h('div', { class: 'report-scope muted' }, `${scopeLabel()} — ${nf.format(state.totalSchools)} schools`),
    h('div', { class: state.loading ? 'loading-fade' : '' },
      CountTable('1. Schools that previously applied for NOC', sm.groups.previouslyAppliedNoc, 'Previously applied'),
      CountTable('2. Type of school', sm.groups.schoolType, 'Type of school'),
      Stat('3. Number of teachers available', sm.teachers, 'Total teachers across schools'),
      Stat('4. Number of untrained teachers', sm.untrained, `Total untrained teachers${untrainedPct}`),
      CountTable('5. Schools with a sanctioned building plan', sm.groups.sanctionedPlan, 'Sanctioned building plan'),
      CountTable('6. Schools that need to take the property on lease', sm.groups.needsLease, 'Needs lease'),
      CountTable('7. Lease deed for 20 years of the school building is possible', sm.groups.lease20Possible, '20-year lease possible'),
      CountTable('8. Non-compliance items', state.nonCompliance, 'Non-compliance item')));
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
        h('h2', { class: 'report-title' }, 'Reports'),
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
