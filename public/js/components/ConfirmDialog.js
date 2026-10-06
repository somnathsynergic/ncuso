import { h } from './dom.js';

// Reusable confirmation popup. Resolves true when confirmed, false when cancelled
// (Cancel button, Esc, or a click outside the box). Keyboard focus is kept inside while open
// and returned to the element that opened it afterwards.
export function confirmDialog({
  title, message, detail, icon = '❓', confirmLabel = 'Confirm', cancelLabel = 'Cancel',
}) {
  const opener = document.activeElement;
  return new Promise((resolve) => {
    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      document.body.classList.remove('no-scroll');
      if (opener && opener.isConnected) opener.focus();
      resolve(value);
    };

    const cancelBtn = h('button', { type: 'button', class: 'btn ghost', onClick: () => finish(false) }, cancelLabel);
    const confirmBtn = h('button', { type: 'button', class: 'btn primary', onClick: () => finish(true) }, confirmLabel);

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); return; }
      if (e.key !== 'Tab') return;
      // keep Tab inside the dialog
      const order = [cancelBtn, confirmBtn];
      const i = order.indexOf(document.activeElement);
      e.preventDefault();
      order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length].focus();
    };

    const overlay = h('div', { class: 'dlg-overlay', onClick: (e) => e.target === overlay && finish(false) },
      h('div', { class: 'dlg', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title', 'aria-describedby': 'dlg-msg' },
        h('div', { class: 'dlg-body' },
          h('div', { class: 'dlg-icon', 'aria-hidden': 'true' }, icon),
          h('h2', { id: 'dlg-title' }, title),
          h('p', { id: 'dlg-msg' }, message),
          detail && h('p', { class: 'dlg-detail' }, detail)),
        h('div', { class: 'dlg-actions' }, cancelBtn, confirmBtn)));

    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    confirmBtn.focus();
  });
}
