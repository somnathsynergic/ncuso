import { h } from '/js/components/dom.js';
import { Topbar, REPORTS } from '/admin/assets/nav.js';

const nf = new Intl.NumberFormat('en-IN');
const slug = location.pathname.split('/')[3];
const report = REPORTS.find((r) => r.slug === slug);
if (!report) location.replace(`/admin/reports/${REPORTS[0].slug}`); // /admin/reports → first report
const state = { district: '', districts: [], data: null, totalSchools: 0, loading: true, error: '' };
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
    const qs = new URLSearchParams({ district: state.district });
    const data = await api(`/api/admin/reports/${slug === 'non-compliance' || slug === 'district-summary' ? slug : 'summary'}?${qs}`);
    if (mine !== epoch) return;
    state.data = data;
    state.totalSchools = data.totalSchools ?? data.total?.values.schools ?? 0;
  } catch (e) {
    if (mine !== epoch) return;
    state.error = e.message;
    state.data = null;
    state.totalSchools = 0;
  }
  state.loading = false;
  paintReport();
}

function scopeLabel() {
  const name = state.districts.find((d) => String(d.id) === state.district)?.name;
  return `${name || 'All districts'}`;
}

// Table of { item, count } rows with the share of schools as plain text
function CountTable(items, label) {
  const total = state.totalSchools;
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'report-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, '#'), h('th', {}, label), h('th', { class: 'num' }, 'Schools'), h('th', { class: 'num' }, '% of schools'))),
      h('tbody', {}, items.map((it, i) => h('tr', {},
        h('td', { class: 'muted' }, String(i + 1)),
        h('td', { class: 'strong' }, it.item),
        h('td', { class: 'num' }, nf.format(it.count)),
        h('td', { class: 'num muted' }, `${(total ? (it.count / total) * 100 : 0).toFixed(1)}%`))))));
}

// Single-figure report
const Stat = (value, note) => h('div', { class: 'stat-box' }, h('strong', {}, nf.format(value)), note && h('span', { class: 'muted' }, note));

// District-wise summary: a row per district, columns grouped by report; first column stays put while scrolling
function DistrictTable(d) {
  // first column of each group gets a broader divider that runs down the whole table
  const cells = (values) => d.groups.flatMap((g) => g.cols.map((c, i) =>
    h('td', { class: `num${i === 0 ? ' group-start' : ''}` }, nf.format(values[c.key]))));
  return h('div', { class: 'table-wrap district-wrap' },
    h('table', { class: 'report-table district-table' },
      h('thead', {},
        h('tr', {}, h('th', { rowSpan: 2, class: 'sticky-col' }, 'District'),
          d.groups.map((g) => h('th', { colSpan: g.cols.length, class: 'group-head group-start' }, g.title))),
        h('tr', {}, d.groups.flatMap((g) => g.cols.map((c, i) => h('th', { class: `num sub-head${i === 0 ? ' group-start' : ''}` }, c.label))))),
      h('tbody', {},
        d.rows.map((r) => h('tr', {}, h('td', { class: 'strong sticky-col' }, r.district), cells(r.values)))),
      h('tfoot', {},
        h('tr', { class: 'total-row' }, h('td', { class: 'strong sticky-col' }, d.total.district), cells(d.total.values)))));
}

// What each report shows, from the loaded data
const BODY = {
  'previously-applied-noc': (d) => CountTable(d.groups.previouslyAppliedNoc, 'Previously applied for NOC'),
  'school-type': (d) => CountTable(d.groups.schoolType, 'Type of school'),
  teachers: (d) => Stat(d.teachers, 'Total teachers available'),
  'untrained-teachers': (d) => Stat(d.untrained, `Total untrained teachers${d.teachers ? ` (${((d.untrained / d.teachers) * 100).toFixed(1)}% of ${nf.format(d.teachers)} teachers)` : ''}`),
  'sanctioned-plan': (d) => CountTable(d.groups.sanctionedPlan, 'Has a sanctioned building plan'),
  'needs-lease': (d) => CountTable(d.groups.needsLease, 'Needs to take the property on lease'),
  'lease-20-years': (d) => CountTable(d.groups.lease20Possible, '20-year lease deed possible'),
  'non-compliance': (d) => CountTable(d.items, 'Non-compliance item'),
  'district-summary': DistrictTable,
};

function paintReport() {
  const box = document.getElementById('report');
  if (!box || !report) return;
  if (state.error) return box.replaceChildren(h('p', { class: 'error' }, state.error));
  if (!state.data) return box.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
  box.replaceChildren(
    h('div', { class: 'report-scope muted' }, `${scopeLabel()} — ${nf.format(state.totalSchools)} schools`),
    h('div', { class: state.loading ? 'loading-fade' : '' }, BODY[slug](state.data)));
}

function render() {
  const districtSelect = h('select', { class: 'input select', onChange: (e) => { state.district = e.target.value; load(); } },
    h('option', { value: '' }, 'All districts'),
    state.districts.map((d) => h('option', { value: d.id, selected: String(d.id) === state.district }, d.name)));
  root.replaceChildren(
    Topbar('reports', 'Admin Dashboard · Reports', slug),
    h('main', { class: 'content' },
      h('div', { class: 'card' },
        h('h2', { class: 'report-title' }, report.title),
        slug !== 'district-summary' && h('div', { class: 'toolbar report-toolbar' }, districtSelect),
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
  if (!report) return;
  render();
  load();
  try { state.districts = await api('/api/districts'); render(); } catch { /* filter stays on "All" */ }
})();
