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

const MENU = [
  { key: 'dashboard', label: 'Dashboard', href: '/admin' },
  { key: 'reports', label: 'Reports', href: '/admin/reports' },
];

// Shared header with the menu; `active` is the key of the current page
export const Topbar = (active, subtitle) => h('header', { class: 'topbar' },
  h('div', { class: 'brand' },
    h('img', { src: '/img/logo.png', alt: '', class: 'brand-logo' }),
    h('div', {},
      h('span', { class: 'brand-short' }, 'NCUSO'),
      h('small', {}, 'National Council for Unaided School Organization'),
      h('strong', { class: 'brand-sub' }, subtitle))),
  h('nav', { class: 'topnav', 'aria-label': 'Admin menu' },
    MENU.map((m) => h('a', { href: m.href, class: `nav-link${m.key === active ? ' active' : ''}`, 'aria-current': m.key === active ? 'page' : null }, m.label))),
  h('button', { class: 'btn ghost', type: 'button', onClick: confirmLogout }, 'Log out'));
