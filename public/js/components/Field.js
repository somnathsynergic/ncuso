import { h } from './dom.js';

// Wraps any control with label, hint and error message.
function FieldShell(field, control, error) {
  return h('div', { class: `field${error ? ' has-error' : ''}`, 'data-field': field.name },
    h('label', { class: 'field-label', htmlFor: field.name }, field.label, h('span', { class: 'req' }, ' *')),
    control,
    field.hint && h('p', { class: 'field-hint' }, field.hint),
    h('p', { class: 'field-error', role: 'alert' }, error || ''));
}

function TextInput(field, value, onChange) {
  const input = h('input', {
    class: 'input', id: field.name, name: field.name, type: field.type, value: value ?? '',
    placeholder: field.placeholder || '', inputMode: field.inputMode, maxLength: field.maxLength,
    min: field.min, max: field.max, autocomplete: field.type === 'email' ? 'email' : 'off',
    autocapitalize: field.type === 'email' ? 'none' : null, spellcheck: field.type === 'email' ? false : null,
    onInput: (e) => {
      if (field.inputMode === 'numeric') e.target.value = e.target.value.replace(/\D/g, '');
      onChange(e.target.value);
    },
  });
  return field.prefix ? h('div', { class: 'input-wrap' }, h('span', { class: 'prefix' }, field.prefix), input) : input;
}

// Year-only calendar: a text box (typing works) plus a popup grid of 12 years with prev/next paging.
// Range comes from field.min / field.max; years outside it are disabled.
function YearPicker(field, value, onChange) {
  const PAGE = 12;
  const min = field.min ?? 1900;
  const max = field.max ?? new Date().getFullYear();
  const thisYear = new Date().getFullYear();
  let pageStart = 0;
  let skipOpen = false;

  const validYear = () => {
    const y = Number(input.value);
    return /^\d{4}$/.test(input.value) && y >= min && y <= max ? y : null;
  };
  const alignedStart = (y) => y - ((y - min) % PAGE); // pages are aligned so the first page begins at min

  const input = h('input', {
    class: 'input', id: field.name, name: field.name, type: 'text', value: value ?? '', inputMode: 'numeric',
    maxLength: 4, placeholder: field.placeholder || 'Select year', autocomplete: 'off',
    role: 'combobox', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    onInput: (e) => {
      e.target.value = e.target.value.replace(/\D/g, '');
      onChange(e.target.value);
      const y = validYear();
      if (y) { pageStart = alignedStart(y); paint(); }
    },
    onFocus: () => (skipOpen ? (skipOpen = false) : show()),
    onClick: () => show(),
    onKeydown: (e) => {
      if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); hide(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); show(); }
    },
  });
  const panel = h('div', { class: 'yp-panel', role: 'dialog', 'aria-label': 'Choose year', hidden: true });
  const wrap = h('div', { class: 'yearpicker' }, input,
    h('button', {
      type: 'button', class: 'yp-icon', 'aria-label': 'Open year calendar', tabIndex: -1,
      onClick: () => (panel.hidden ? (input.focus(), show()) : hide()),
    }, '📅'),
    panel);

  const outside = (e) => { if (!wrap.contains(e.target)) hide(); };
  const onDocKey = (e) => { if (e.key === 'Escape') { hide(); skipOpen = true; input.focus(); } };

  function show() {
    if (!panel.hidden) return;
    pageStart = alignedStart(validYear() ?? Math.min(max, thisYear));
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onDocKey);
    paint();
  }
  function hide() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', onDocKey);
  }
  function pick(y) {
    input.value = String(y);
    onChange(String(y));
    hide();
    skipOpen = true;
    input.focus();
  }
  function paint() {
    if (panel.hidden) return;
    const selected = validYear();
    const last = pageStart + PAGE - 1;
    const nav = (label, aria, delta, disabled) => h('button', {
      type: 'button', class: 'yp-nav', 'aria-label': aria, disabled, onClick: () => { pageStart += delta; paint(); },
    }, label);
    const years = Array.from({ length: PAGE }, (_, i) => pageStart + i);
    panel.replaceChildren(
      h('div', { class: 'yp-head' },
        nav('«', 'Previous 12 years', -PAGE, pageStart <= min),
        h('strong', {}, `${Math.max(pageStart, min)} – ${Math.min(last, max)}`),
        nav('»', 'Next 12 years', PAGE, last >= max)),
      h('div', { class: 'yp-grid' }, years.map((y) => h('button', {
        type: 'button', disabled: y < min || y > max,
        class: `yp-year${y === selected ? ' selected' : ''}${y === thisYear ? ' now' : ''}`,
        'aria-pressed': String(y === selected), onClick: () => pick(y),
      }, String(y)))));
    panel.querySelector('.yp-year.selected')?.scrollIntoView?.({ block: 'nearest' });
  }
  return wrap;
}

function Select(field, value, onChange) {
  return h('select', {
    class: 'input select', id: field.name, name: field.name, onChange: (e) => onChange(e.target.value),
  },
  h('option', { value: '', selected: !value }, field.loadError ? 'Could not load options — refresh the page' : field.options.length ? 'Select…' : 'Loading…'),
  field.options.map((o) => h('option', { value: o, selected: o === value }, o)));
}

function OptionGroup(field, value, onChange, multi) {
  return h('div', { class: 'options' }, field.options.map((opt) => {
    const checked = multi ? (value || []).includes(opt) : value === opt;
    return h('label', { class: `option${checked ? ' selected' : ''}` },
      h('input', {
        type: multi ? 'checkbox' : 'radio', name: field.name, value: opt, checked,
        onChange: (e) => {
          if (!multi) return onChange(opt);
          const cur = value || [];
          onChange(e.target.checked ? [...cur, opt] : cur.filter((x) => x !== opt));
        },
      }),
      h('span', { class: 'mark' }), h('span', {}, opt));
  }));
}

export function Field(field, value, error, onChange) {
  const control =
    field.type === 'radio' ? OptionGroup(field, value, onChange, false)
    : field.type === 'checkbox' ? OptionGroup(field, value, onChange, true)
    : field.type === 'select' ? Select(field, value, onChange)
    : field.type === 'year' ? YearPicker(field, value, onChange)
    : TextInput(field, value, onChange);
  return FieldShell(field, control, error);
}
