import { h } from './dom.js';

// Vertical step list. Steps already reached are clickable.
export function Sidebar(steps, current, maxReached, onGo) {
  const items = [...steps, { id: 'review', title: 'Review & Submit', subtitle: 'Check everything' }];
  return h('nav', { class: 'sidebar', 'aria-label': 'Form steps' },
    h('div', { class: 'progress-label' }, `Step ${current + 1} of ${items.length}`),
    h('div', { class: 'progress' }, h('div', { class: 'bar', style: `width:${((current + 1) / items.length) * 100}%` })),
    h('ol', {}, items.map((s, i) => {
      const status = i < current ? 'done' : i === current ? 'current' : 'todo';
      return h('li', { class: `step ${status}` },
        h('button', {
          type: 'button', disabled: i > maxReached, onClick: () => onGo(i),
          'aria-current': status === 'current' ? 'step' : null,
        },
        h('span', { class: 'badge' }, status === 'done' ? '✓' : String(i + 1)),
        h('span', { class: 'meta' }, h('strong', {}, s.title), h('small', {}, s.subtitle))));
    })));
}
