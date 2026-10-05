import { h } from './dom.js';

export const ORG_SHORT = 'NCUSO';
export const ORG_NAME = 'National Council for Unaided School Organization';

// Blue banner (organisation name + full name) followed by the form's title block.
export function Header() {
  return h('div', { class: 'masthead' },
    h('header', { class: 'site-header' },
      h('div', { class: 'banner-inner' },
        h('img', { class: 'logo', src: '/img/logo.png', alt: `${ORG_SHORT} emblem` }),
        h('div', { class: 'org' },
          h('span', { class: 'org-short' }, ORG_SHORT),
          h('span', { class: 'org-name' }, ORG_NAME)),
        h('img', { class: 'tag', src: '/img/tagline-sm.png', alt: 'শিক্ষার স্বার্থে ঐক্যবদ্ধ' }))),
    h('section', { class: 'page-intro' },
      h('h1', {}, 'NOC Non-Compliance Details'),
      h('p', {}, 'Detail information of member schools regarding major points of non-compliance to the NOC application')));
}
