import { h } from '/js/components/dom.js';

// Dropdown with a search box. `options` = [{ value, label }]; the first option is the "all" choice.
// Click opens the list; type to filter; ↑/↓ + Enter or a click selects; Esc / clicking outside closes.
export function SearchableSelect({ options, value = '', label = 'Select', onChange }) {
  let current = String(value);
  let active = 0; // highlighted index within the filtered list
  let shown = options;

  const labelOf = (v) => options.find((o) => String(o.value) === v)?.label ?? options[0].label;
  const toggle = h('button', { class: 'input select combo-toggle', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label,
    onClick: () => (wrap.classList.contains('open') ? close() : open()) }, labelOf(current));
  const search = h('input', { class: 'input combo-search', type: 'search', placeholder: 'Search…', 'aria-label': `Search ${label.toLowerCase()}`,
    onInput: () => { paint(); },
    onKeydown: (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); paint(false); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(false); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    } });
  const list = h('ul', { class: 'combo-list', role: 'listbox' });
  const wrap = h('div', { class: 'combo' }, toggle, h('div', { class: 'combo-panel' }, search, list));

  function paint(reset = true) {
    const q = search.value.trim().toLowerCase();
    shown = options.filter((o) => !q || o.label.toLowerCase().includes(q));
    if (reset) active = q ? 0 : Math.max(0, shown.findIndex((o) => String(o.value) === current)); // typing → first match; opening → current choice
    list.replaceChildren(...(shown.length
      ? shown.map((o, i) => h('li', {
        role: 'option', class: `combo-opt${i === active ? ' active' : ''}${String(o.value) === current ? ' selected' : ''}`,
        'aria-selected': String(String(o.value) === current),
        onClick: () => pick(o),
      }, o.label))
      : [h('li', { class: 'combo-empty' }, 'No matches')]));
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  }
  function pick(o) {
    close();
    if (String(o.value) === current) return;
    current = String(o.value);
    toggle.textContent = o.label;
    onChange(current);
  }
  function open() {
    wrap.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    search.value = '';
    paint();
    search.focus();
  }
  function close() {
    wrap.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wrap.classList.contains('open')) { close(); toggle.focus(); } });
  return wrap;
}
