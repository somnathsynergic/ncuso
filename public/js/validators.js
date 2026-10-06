import { steps } from './config/formConfig.js';

const isEmpty = (v) => v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');

export function validateField(field, value) {
  if (isEmpty(value)) return field.type === 'checkbox' ? 'Select at least one option' : 'This field is required';
  if (field.pattern && !field.pattern.test(String(value).trim())) return field.patternMessage;
  if (field.maxLength && String(value).trim().length > field.maxLength) return `Must be ${field.maxLength} characters or fewer`;
  if (field.type === 'number' || field.type === 'year') {
    const n = Number(value);
    if (!Number.isFinite(n) || (field.type === 'year' && !/^\d{4}$/.test(String(value).trim()))) {
      return field.type === 'year' ? 'Enter a valid 4-digit year' : 'Enter a valid number';
    }
    if (field.min !== undefined && n < field.min) return `Must be at least ${field.min}`;
    if (field.max !== undefined && n > field.max) return `Must be at most ${field.max}`;
  }
  if ((field.type === 'radio' || field.type === 'select') && field.options.length && !field.options.includes(value)) return 'Choose one of the options';
  if (field.type === 'checkbox' && !(Array.isArray(value) && value.every((x) => field.options.includes(x)))) {
    return 'Invalid selection';
  }
  return '';
}

export function validateStep(step, values) {
  const errors = {};
  for (const f of step.fields) {
    const msg = validateField(f, values[f.name]);
    if (msg) errors[f.name] = msg;
  }
  // Cross-field rules only fill in fields that have no error of their own
  if (step.rules) {
    for (const [k, msg] of Object.entries(step.rules(values))) if (!errors[k]) errors[k] = msg;
  }
  return errors;
}

export function validateAll(values) {
  return steps.reduce((acc, s) => ({ ...acc, ...validateStep(s, values) }), {});
}
