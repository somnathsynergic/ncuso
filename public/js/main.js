import { h } from './components/dom.js';
import { steps, allFields } from './config/formConfig.js';
import { validateStep, validateAll } from './validators.js';
import { Header } from './components/Header.js';
import { Sidebar } from './components/Sidebar.js';
import { Field } from './components/Field.js';
import { Review } from './components/Review.js';
import { confirmDialog } from './components/ConfirmDialog.js';

const REVIEW = steps.length;

// The form always starts blank on page load (drafts are no longer kept).
// Clear any draft saved by an earlier version.
try { localStorage.removeItem('noc-form-draft-v1'); } catch { /* storage unavailable */ }

const state = {
  step: 0,
  maxReached: 0,
  values: Object.fromEntries(allFields.map((f) => [f.name, f.type === 'checkbox' ? [] : ''])),
  errors: {},
  status: 'idle', // idle | submitting | done | error
  message: '',
  refId: '',
};

const root = document.getElementById('app');

function go(i) {
  state.step = i;
  state.maxReached = Math.max(state.maxReached, i);
  state.errors = {};
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function next() {
  const errors = validateStep(steps[state.step], state.values);
  if (Object.keys(errors).length) {
    state.errors = errors;
    render();
    document.querySelector('.has-error input')?.focus();
    return;
  }
  go(state.step + 1);
}

// Final step: ask the user to confirm before anything is sent
async function confirmThenSubmit() {
  const ok = await confirmDialog({
    icon: '📨',
    title: 'Submit your details?',
    message: 'Please make sure everything is correct. Once submitted, you will not be able to change these details.',
    detail: state.values.schoolName ? `School: ${state.values.schoolName}` : '',
    confirmLabel: 'Yes, submit',
    cancelLabel: 'Review again',
  });
  if (ok) submit();
}

async function submit() {
  const errors = validateAll(state.values);
  if (Object.keys(errors).length) {
    const bad = steps.findIndex((s) => Object.keys(validateStep(s, state.values)).length);
    go(bad);
    state.errors = errors;
    render();
    return;
  }
  state.status = 'submitting';
  render();
  try {
    const res = await fetch('/api/submissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.values),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');
    state.status = 'done';
    state.refId = data.id;
  } catch (e) {
    state.status = 'error';
    state.message = e.message;
  }
  render();
}

function Actions(final = false) {
  return h('div', { class: 'actions' },
    state.step > 0 && h('button', { type: 'button', class: 'btn ghost', onClick: () => go(state.step - 1) }, '← Back'),
    final
      ? h('button', { type: 'button', class: 'btn primary', disabled: state.status === 'submitting', onClick: confirmThenSubmit },
        state.status === 'submitting' ? 'Submitting…' : 'Submit Details')
      : h('button', { type: 'submit', class: 'btn primary' }, 'Continue →'));
}

function StepForm(step) {
  return h('form', { class: 'card', noValidate: true, onSubmit: (e) => { e.preventDefault(); next(); } },
    h('div', { class: 'card-head' },
      h('span', { class: 'big-icon' }, step.icon),
      h('div', {}, h('h2', {}, step.title), h('p', {}, step.subtitle))),
    h('div', { class: 'grid' }, step.fields.map((f) => {
      const isChoice = f.type === 'radio' || f.type === 'checkbox';
      const node = Field(f, state.values[f.name], state.errors[f.name], (v) => {
        state.values[f.name] = v;
        delete state.errors[f.name];
        if (isChoice) render(); // refresh selected styling; text inputs keep focus instead
        else {
          node.classList.remove('has-error');
          node.querySelector('.field-error').textContent = '';
        }
      });
      if (isChoice) node.classList.add('wide');
      return node;
    })),
    Actions());
}

function ReviewStep() {
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('span', { class: 'big-icon' }, '✅'),
      h('div', {}, h('h2', {}, 'Review & Submit'), h('p', {}, 'Please verify the information before submitting.'))),
    Review(state.values, go),
    state.status === 'error' && h('p', { class: 'banner error' }, state.message),
    Actions(true));
}

function Done() {
  return h('div', { class: 'card done' },
    h('div', { class: 'tick' }, '✓'),
    h('h2', {}, 'Thank you! Your details have been submitted.'),
    h('p', {}, `Reference ID: ${state.refId}`),
    h('button', { class: 'btn primary', onClick: () => location.reload() }, 'Submit another response'));
}

function render() {
  const done = state.status === 'done';
  const main = done ? Done() : state.step === REVIEW ? ReviewStep() : StepForm(steps[state.step]);
  root.replaceChildren(
    Header(),
    h('div', { class: `layout${done ? ' single' : ''}` },
      done ? null : Sidebar(steps, state.step, state.maxReached, go),
      h('main', {}, main)),
    h('footer', {}, 'NCUSO · National Council for Unaided School Organization · Reg. No. IV-00128/2014'));
  // On narrow screens the stepper scrolls sideways: keep the active step in view
  const ol = root.querySelector('.sidebar ol');
  const cur = ol && ol.querySelector('.step.current');
  if (ol && cur) ol.scrollLeft = cur.offsetLeft - (ol.clientWidth - cur.offsetWidth) / 2;
}

// Fields with `optionsUrl` get their options from the API, then the form re-renders.
render();
Promise.all(allFields.filter((f) => f.optionsUrl).map(async (f) => {
  try {
    const res = await fetch(f.optionsUrl);
    if (!res.ok) throw new Error();
    f.options = (await res.json()).map((o) => o.name);
  } catch {
    f.loadError = true;
  }
})).then(render);
