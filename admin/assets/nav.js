import { h } from '/js/components/dom.js';

// ---------- Logout confirmation ----------
export function confirmLogout() {
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

// Reports submenu, in display order
export const REPORTS = [
  { slug: 'previously-applied-noc', title: 'Previously applied for NOC' },
  { slug: 'school-type', title: 'Type of school' },
  { slug: 'teachers', title: 'Teachers available' },
  { slug: 'untrained-teachers', title: 'Untrained teachers' },
  { slug: 'sanctioned-plan', title: 'Sanctioned building plan' },
  { slug: 'needs-lease', title: 'Need to take property on lease' },
  { slug: 'lease-20-years', title: '20-year lease deed possible' },
  { slug: 'non-compliance', title: 'Non-compliance items' },
];

// Shared header with the menu; `active` is 'dashboard' or 'reports' (activeReport = slug of the open report)
export function Topbar(active, subtitle, activeReport = '') {
  const toggle = h('button', {
    class: `nav-link nav-toggle${active === 'reports' ? ' active' : ''}`, type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: (e) => { e.stopPropagation(); setOpen(!group.classList.contains('open')); },
  }, 'Reports ', h('span', { class: 'caret' }, '▾'));
  const submenu = h('div', { class: 'submenu', role: 'menu' },
    REPORTS.map((r) => h('a', { href: `/admin/reports/${r.slug}`, role: 'menuitem', class: `sub-link${r.slug === activeReport ? ' active' : ''}` }, r.title)));
  const group = h('div', { class: 'nav-group' }, toggle, submenu);
  const setOpen = (open) => { group.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', (e) => { if (!group.contains(e.target)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' },
      h('img', { src: '/img/logo.png', alt: '', class: 'brand-logo' }),
      h('div', {},
        h('span', { class: 'brand-short' }, 'NCUSO'),
        h('small', {}, 'National Council for Unaided School Organization'),
        h('strong', { class: 'brand-sub' }, subtitle))),
    h('nav', { class: 'topnav', 'aria-label': 'Admin menu' },
      h('a', { href: '/admin', class: `nav-link${active === 'dashboard' ? ' active' : ''}`, 'aria-current': active === 'dashboard' ? 'page' : null }, 'Dashboard'),
      group),
    h('button', { class: 'btn ghost', type: 'button', onClick: confirmLogout }, 'Log out'));
}
