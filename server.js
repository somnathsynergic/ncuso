import express from 'express';
import path from 'node:path';
import 'dotenv/config'
import { fileURLToPath } from 'node:url';
import { getDistricts, insertSchoolReg, listRegistrations, getRegistration, setApprovalStatus, nonComplianceReport, schoolSummaryReport } from './db.js';
import { authenticate, startSession, endSession, isAuthed, requireAdmin, loginBlocked, recordFail, clearFails } from './auth.js';
import { allFields, steps } from './public/js/config/formConfig.js';
import { validateAll } from './public/js/validators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/districts', async (_req, res) => {
  try {
    res.json(await getDistricts());
  } catch (e) {
    console.error('Failed to load districts:', e.message);
    res.status(500).json({ error: 'Could not load districts' });
  }
});

app.post('/api/submissions', async (req, res) => {
  // Keep only known fields, then run the same validation the browser uses.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const values = Object.fromEntries(allFields.map((f) => [f.name, body[f.name]]));
  const errors = validateAll(values);

  try {
    // The district must exist in md_districts; store its sl_no.
    let districtId = null;
    if (!errors.district) {
      districtId = (await getDistricts()).find((d) => d.name === values.district)?.id ?? null;
      if (districtId === null) errors.district = 'Choose a district from the list';
    }
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Validation failed', errors });

    const id = await insertSchoolReg(values, districtId);
    res.status(201).json({ id });
  } catch (e) {
    console.error('Failed to save submission:', e.message);
    res.status(500).json({ error: 'Could not save your submission. Please try again.' });
  }
});

// ---------- Admin module (/admin) ----------
const ADMIN_DIR = path.join(__dirname, 'admin');
app.use('/admin/assets', express.static(path.join(ADMIN_DIR, 'assets')));

// Route guard, part 1: admin pages and APIs must never be cached, so the browser's Back/Forward
// buttons cannot replay a page that no longer matches the login state.
app.use(['/admin', '/api/admin'], (_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache', Expires: '0' });
  next();
});

app.get('/admin', (req, res) =>
  isAuthed(req) ? res.sendFile(path.join(ADMIN_DIR, 'dashboard.html')) : res.redirect('/admin/login'));
app.get('/admin/login', (req, res) =>
  isAuthed(req) ? res.redirect('/admin') : res.sendFile(path.join(ADMIN_DIR, 'login.html')));

// Lightweight "am I logged in?" check used by the pages when they are restored from history
app.get('/admin/reports', (req, res) =>
  isAuthed(req) ? res.sendFile(path.join(ADMIN_DIR, 'reports.html')) : res.redirect('/admin/login'));

app.get('/api/admin/session', requireAdmin, (req, res) => res.json({ ok: true, admin: req.adminId }));

app.post('/api/admin/login', async (req, res) => {
  if (loginBlocked(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || username.length > 50 || password.length > 200) {
    recordFail(req.ip);
    return res.status(401).json({ error: 'Invalid ID or password' });
  }
  try {
    const user = await authenticate(username.trim(), password);
    if (!user) {
      recordFail(req.ip);
      return res.status(401).json({ error: 'Invalid ID or password' });
    }
    clearFails(req.ip);
    startSession(res, user.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('Login failed:', e.message);
    res.status(500).json({ error: 'Login is temporarily unavailable. Please try again.' });
  }
});

app.post('/api/admin/logout', (_req, res) => {
  endSession(res);
  res.json({ ok: true });
});

app.get('/api/admin/registrations', requireAdmin, async (req, res) => {
  const q = req.query;
  const int = (v, def, min, max) => Math.min(max, Math.max(min, Number.parseInt(v, 10) || def));
  try {
    const { total, rows, maxId, totals } = await listRegistrations({
      search: String(q.search || '').trim().slice(0, 100),
      districtId: Number.parseInt(q.district, 10) || null,
      sort: String(q.sort || 'submitted'),
      dir: q.dir === 'asc' ? 'asc' : 'desc',
      page: int(q.page, 1, 1, 1e6),
      pageSize: [10, 25, 50, 100].includes(Number(q.pageSize)) ? Number(q.pageSize) : 10,
    });
    res.json({ total, rows, maxId, totals });
  } catch (e) {
    console.error('Failed to list registrations:', e.message);
    res.status(500).json({ error: 'Could not load registrations' });
  }
});

// Non-compliance report: schools per item, using the dashboard's search/district filters
const NON_COMPLIANCE_ITEMS = steps.flatMap((st) => st.fields).find((f) => f.name === 'nonCompliances').options;
const REPORT_FIELDS = ['previouslyAppliedNoc', 'schoolType', 'sanctionedPlan', 'needsLease', 'lease20Possible'];
const REPORT_OPTIONS = Object.fromEntries(REPORT_FIELDS.map((n) => [n, allFields.find((f) => f.name === n).options]));
const reportFilters = (q) => ({
  search: String(q.search || '').trim().slice(0, 100),
  districtId: Number.parseInt(q.district, 10) || null,
});
app.get('/api/admin/reports/summary', requireAdmin, async (req, res) => {
  try {
    res.json(await schoolSummaryReport(REPORT_OPTIONS, reportFilters(req.query)));
  } catch (e) {
    console.error('Failed to build report:', e.message);
    res.status(500).json({ error: 'Could not load the report' });
  }
});

app.get('/api/admin/reports/non-compliance', requireAdmin, async (req, res) => {
  try {
    res.json(await nonComplianceReport(NON_COMPLIANCE_ITEMS, reportFilters(req.query)));
  } catch (e) {
    console.error('Failed to build report:', e.message);
    res.status(500).json({ error: 'Could not load the report' });
  }
});

app.get('/api/admin/registrations/:id', requireAdmin, async (req, res) => {
  try {
    const reg = await getRegistration(Number.parseInt(req.params.id, 10));
    reg ? res.json(reg) : res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('Failed to load registration:', e.message);
    res.status(500).json({ error: 'Could not load registration' });
  }
});

app.patch('/api/admin/registrations/:id/status', requireAdmin, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const status = req.body?.status;
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
  if (!['A', 'R'].includes(status)) return res.status(400).json({ error: 'Status must be A (approve) or R (reject)' });

  // Rejecting needs a note. It is stored together with the admin id as "<admin id> - <note>" in rejected_by.
  let actor = req.adminId;
  if (status === 'R') {
    const note = typeof req.body?.note === 'string' ? req.body.note.replace(/\s+/g, ' ').trim() : '';
    if (!note) return res.status(400).json({ error: 'A rejection note is required' });
    if (note.length > 400) return res.status(400).json({ error: 'The rejection note must be 400 characters or fewer' });
    actor = `${req.adminId} - ${note}`;
  }
  try {
    const out = await setApprovalStatus(id, status, actor);
    if (out.result === 'not_found') return res.status(404).json({ error: 'Not found' });
    if (out.result === 'already_decided') {
      const word = out.status === 'A' ? 'approved' : 'rejected';
      return res.status(409).json({ error: `This registration is already ${word} and cannot be changed.`, status: out.status });
    }
    res.json({ id, status, decidedBy: actor });
  } catch (e) {
    console.error('Failed to update status:', e.message);
    if (e.code === 'ER_DATA_TOO_LONG') {
      return res.status(500).json({ error: 'The rejected_by column is too short for a note. Run db/td_school_reg_rejection_note.sql.' });
    }
    res.status(500).json({ error: 'Could not update status' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
