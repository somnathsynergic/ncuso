import { h } from './dom.js';
import { steps } from '../config/formConfig.js';

export function Review(values, onEdit) {
  return h('div', { class: 'review' }, steps.map((s, i) =>
    h('section', { class: 'review-card' },
      h('div', { class: 'review-head' },
        h('h3', {}, `${s.icon} ${s.title}`),
        h('button', { type: 'button', class: 'link', onClick: () => onEdit(i) }, 'Edit')),
      h('dl', {}, s.fields.map((f) => {
        const v = values[f.name];
        return [h('dt', {}, f.label), h('dd', {}, Array.isArray(v) ? v.join(', ') : f.prefix ? `${f.prefix} ${v}` : v)];
      })))));
}
