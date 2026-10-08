import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  connectTimeout: 10000,
});

// Inserts one form submission into td_school_reg and returns the new reg_id.
// `v` is already validated; district is given by name and resolved to md_districts.sl_no.
export async function insertSchoolReg(v, districtId) {
  const [result] = await pool.execute(
    `INSERT INTO td_school_reg (
       school_name, udise_no, mobile_no, email_id, year_of_establishment, district_id, circle_name,
       previously_applied_noc, school_type,
       total_students, total_boys, total_girls, total_teachers, untrained_teachers, avg_teacher_salary,
       total_classrooms, classrooms_below_400sqft, sanctioned_building_plan, needs_lease, lease_20_years_possible,
       non_compliances
     ) VALUES (?,?,?,?,?,?,?, ?,?, ?,?,?,?,?,?, ?,?,?,?,?, ?)`,
    [
      v.schoolName.trim(), v.udiseNo.trim(), v.mobile.trim(), v.email.trim().toLowerCase(), Number(v.yearEstablished), districtId, v.circle.trim(),
      v.previouslyAppliedNoc, v.schoolType,
      Number(v.totalStudents), Number(v.totalBoys), Number(v.totalGirls), Number(v.totalTeachers),
      Number(v.untrainedTeachers), Number(v.avgSalary),
      Number(v.totalClassrooms), Number(v.classroomsBelow400), v.sanctionedPlan, v.needsLease, v.lease20Possible,
      JSON.stringify(v.nonCompliances),
    ],
  );
  return result.insertId;
}

export async function getDistricts() {
  const [rows] = await pool.query('SELECT sl_no AS id, district_name AS name FROM md_districts ORDER BY district_name');
  return rows;
}

// ---------- Admin queries ----------

// Whitelist: UI sort key -> SQL expression (never interpolate user input directly)
const SORT_COLUMNS = {
  id: 'r.reg_id',
  school: 'r.school_name',
  udise: 'r.udise_no',
  district: 'd.district_name',
  type: 'r.school_type',
  students: 'r.total_students',
  teachers: 'r.total_teachers',
  status: 'r.approve_flag',
  submitted: 'r.created_at',
};

export async function listRegistrations({ search = '', districtId = null, status = '', sort = 'submitted', dir = 'desc', page = 1, pageSize = 10 }) {
  const where = [];
  const params = [];
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(r.school_name LIKE ? OR r.udise_no LIKE ? OR r.mobile_no LIKE ? OR r.circle_name LIKE ?)');
    params.push(like, like, like, like);
  }
  if (districtId) {
    where.push('r.district_id = ?');
    params.push(districtId);
  }
  if (['P', 'A', 'R'].includes(status)) {
    where.push('r.approve_flag = ?');
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderCol = SORT_COLUMNS[sort] || SORT_COLUMNS.submitted;
  const orderDir = dir === 'asc' ? 'ASC' : 'DESC';
  const from = 'FROM td_school_reg r LEFT JOIN md_districts d ON d.sl_no = r.district_id';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT r.reg_id AS id, r.school_name AS school, r.udise_no AS udise, COALESCE(d.district_name, 'Not specified') AS district,
            r.school_type AS type, r.total_students AS students, r.total_teachers AS teachers, r.approve_flag AS status, r.created_at AS submitted
     ${from} ${whereSql}
     ORDER BY ${orderCol} ${orderDir}, r.reg_id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const [[sums]] = await pool.query(
    `SELECT COALESCE(SUM(r.total_students), 0) AS students, COALESCE(SUM(r.total_teachers), 0) AS teachers ${from} ${whereSql}`, params);
  const totals = { students: Number(sums.students), teachers: Number(sums.teachers) };
  const [[{ maxId }]] = await pool.query('SELECT MAX(reg_id) AS maxId FROM td_school_reg'); // newest id overall, ignoring filters
  return { total, rows, maxId: maxId ?? 0, totals };
}

// WHERE clause shared by the reports: same search/district filters as the dashboard
function reportFilter({ search = '', districtId = null }) {
  const where = [];
  const params = [];
  if (search) {
    const like = `%${search.replace(/[\%_]/g, '\$&')}%`;
    where.push('(r.school_name LIKE ? OR r.udise_no LIKE ? OR r.mobile_no LIKE ? OR r.circle_name LIKE ?)');
    params.push(like, like, like, like);
  }
  if (districtId) {
    where.push('r.district_id = ?');
    params.push(districtId);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// Summary reports. `groups` maps a report key to { column, options }: schools are counted per option
// (options with no schools show 0). Also returns teacher totals and the number of schools.
const GROUP_COLUMNS = {
  previouslyAppliedNoc: 'previously_applied_noc', schoolType: 'school_type', sanctionedPlan: 'sanctioned_building_plan',
  needsLease: 'needs_lease', lease20Possible: 'lease_20_years_possible',
};
export async function schoolSummaryReport(options, filters) {
  const { whereSql, params } = reportFilter(filters);
  const from = `FROM td_school_reg r ${whereSql}`;
  const [[sums]] = await pool.query(
    `SELECT COUNT(*) AS schools, COALESCE(SUM(r.total_teachers), 0) AS teachers, COALESCE(SUM(r.untrained_teachers), 0) AS untrained ${from}`, params);
  const groups = {};
  for (const [key, col] of Object.entries(GROUP_COLUMNS)) { // col comes from the constant above, never from user input
    const [rows] = await pool.query(`SELECT r.${col} AS v, COUNT(*) AS n ${from} GROUP BY r.${col}`, params);
    const byValue = new Map(rows.map((r) => [r.v, Number(r.n)]));
    groups[key] = options[key].map((item) => ({ item, count: byValue.get(item) ?? 0 }));
  }
  return { totalSchools: Number(sums.schools), teachers: Number(sums.teachers), untrained: Number(sums.untrained), groups };
}

// Counts schools per non-compliance item for the same search/district filters as the dashboard.
// Counted in JS rather than JSON_TABLE so it works on any MySQL version.
export async function nonComplianceReport(itemNames, filters) {
  const { whereSql, params } = reportFilter(filters);
  const [rows] = await pool.query(
    `SELECT r.non_compliances FROM td_school_reg r ${whereSql}`, params);
  const counts = new Map(itemNames.map((n) => [n, 0]));
  for (const r of rows) {
    let list = r.non_compliances;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
    if (!Array.isArray(list)) continue;
    for (const n of new Set(list)) if (counts.has(n)) counts.set(n, counts.get(n) + 1);
  }
  return { totalSchools: rows.length, items: [...counts].map(([item, count]) => ({ item, count })) };
}

// District-wise figures for schools that flagged one non-compliance item: schools, teachers, students, untrained
// teachers. Same shape as districtSummaryReport so the page can render both with one table.
export async function nonComplianceImpactReport(itemName) {
  const [districts] = await pool.query('SELECT sl_no AS id, district_name AS name FROM md_districts ORDER BY district_name');
  const [schools] = await pool.query(
    'SELECT district_id, non_compliances, total_teachers, total_students, untrained_teachers FROM td_school_reg');
  const cols = [{ key: 'schools', label: 'Schools' }, { key: 'teachers', label: 'Teachers' }, { key: 'students', label: 'Students' }, { key: 'untrained', label: 'Untrained teachers' }];
  const blank = () => ({ schools: 0, teachers: 0, students: 0, untrained: 0 });
  const byId = new Map(districts.map((d) => [d.id, { district: d.name, values: blank() }]));
  const total = { district: 'Total', values: blank() };
  for (const r of schools) {
    let list = r.non_compliances;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
    if (!Array.isArray(list) || !list.includes(itemName)) continue;
    let row = byId.get(r.district_id);
    if (!row) { row = { district: 'Not specified', values: blank() }; byId.set(r.district_id ?? null, row); }
    const add = { schools: 1, teachers: Number(r.total_teachers) || 0, students: Number(r.total_students) || 0, untrained: Number(r.untrained_teachers) || 0 };
    for (const k of Object.keys(add)) { row.values[k] += add[k]; total.values[k] += add[k]; }
  }
  return { groups: [{ title: itemName, cols }], rows: [...byId.values()], total };
}

// District-wise summary: one row per district with every report count, plus a totals row.
// `sections` = [{ title, key, label?, options }] describes the column groups; `ncItems` the non-compliance options.
export async function districtSummaryReport(options, ncItems) {
  const [districts] = await pool.query('SELECT sl_no AS id, district_name AS name FROM md_districts ORDER BY district_name');
  const [schools] = await pool.query(
    `SELECT district_id, total_teachers, untrained_teachers, total_students, total_boys, total_girls, previously_applied_noc, school_type, sanctioned_building_plan,
            needs_lease, lease_20_years_possible, non_compliances FROM td_school_reg`);

  const groups = [
    { title: 'Schools & teachers', cols: [{ key: 'schools', label: 'Schools' }, { key: 'teachers', label: 'Teachers' }, { key: 'untrained', label: 'Untrained teachers' }] },
    { title: 'Students', cols: [{ key: 'students', label: 'Students' }, { key: 'boys', label: 'Boys' }, { key: 'girls', label: 'Girls' }] },
    { title: 'Previously applied for NOC', cols: options.previouslyAppliedNoc.map((o) => ({ key: `noc:${o}`, label: o })) },
    { title: 'Type of school', cols: options.schoolType.map((o) => ({ key: `type:${o}`, label: o })) },
    { title: 'Sanctioned building plan', cols: options.sanctionedPlan.map((o) => ({ key: `plan:${o}`, label: o })) },
    { title: 'Needs property on lease', cols: options.needsLease.map((o) => ({ key: `lease:${o}`, label: o })) },
    { title: '20-year lease deed possible', cols: options.lease20Possible.map((o) => ({ key: `lease20:${o}`, label: o })) },
    { title: 'Non-compliance items', cols: ncItems.map((o) => ({ key: `nc:${o}`, label: o })) },
  ];
  const keys = groups.flatMap((g) => g.cols.map((c) => c.key));
  const blank = () => Object.fromEntries(keys.map((k) => [k, 0]));

  const byId = new Map(districts.map((d) => [d.id, { district: d.name, values: blank() }]));
  const total = { district: 'Total', values: blank() };
  for (const r of schools) {
    let row = byId.get(r.district_id);
    if (!row) { row = { district: 'Not specified', values: blank() }; byId.set(r.district_id ?? null, row); }
    let nc = r.non_compliances;
    if (typeof nc === 'string') { try { nc = JSON.parse(nc); } catch { nc = []; } }
    const hits = [
      'schools', 'teachers', 'untrained', 'students', 'boys', 'girls',
      `noc:${r.previously_applied_noc}`, `type:${r.school_type}`, `plan:${r.sanctioned_building_plan}`,
      `lease:${r.needs_lease}`, `lease20:${r.lease_20_years_possible}`,
      ...(Array.isArray(nc) ? [...new Set(nc)].map((n) => `nc:${n}`) : []),
    ];
    for (const k of hits) {
      if (!(k in row.values)) continue;
      const add = k === 'teachers' ? Number(r.total_teachers) || 0 : k === 'untrained' ? Number(r.untrained_teachers) || 0
        : k === 'students' ? Number(r.total_students) || 0 : k === 'boys' ? Number(r.total_boys) || 0 : k === 'girls' ? Number(r.total_girls) || 0 : 1;
      row.values[k] += add;
      total.values[k] += add;
    }
  }
  return { groups, rows: [...byId.values()], total };
}

// Returns one registration keyed by the same field names the form uses,
// so the admin popup can reuse the form config for labels.
export async function getRegistration(id) {
  const [rows] = await pool.query(
    `SELECT r.*, COALESCE(d.district_name, 'Not specified') AS district_name FROM td_school_reg r LEFT JOIN md_districts d ON d.sl_no = r.district_id WHERE r.reg_id = ?`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.reg_id,
    submittedAt: r.created_at,
    status: r.approve_flag,
    approvedAt: r.approved_at ?? null,
    approvedBy: r.approved_by ?? null,
    rejectedAt: r.rejected_at ?? null,
    rejectedBy: r.rejected_by ?? null,
    values: {
      schoolName: r.school_name, udiseNo: r.udise_no, mobile: r.mobile_no, email: r.email_id, yearEstablished: r.year_of_establishment,
      district: r.district_name, circle: r.circle_name,
      previouslyAppliedNoc: r.previously_applied_noc, schoolType: r.school_type,
      totalStudents: r.total_students, totalBoys: r.total_boys, totalGirls: r.total_girls,
      totalTeachers: r.total_teachers, untrainedTeachers: r.untrained_teachers, avgSalary: Number(r.avg_teacher_salary),
      totalClassrooms: r.total_classrooms, classroomsBelow400: r.classrooms_below_400sqft,
      sanctionedPlan: r.sanctioned_building_plan, needsLease: r.needs_lease, lease20Possible: r.lease_20_years_possible,
      nonCompliances: typeof r.non_compliances === 'string' ? JSON.parse(r.non_compliances) : r.non_compliances,
    },
  };
}

// Decides a registration: only a Pending (P) row can become Approved (A) or Rejected (R); the decision is final.
// The check is part of the UPDATE itself so two concurrent clicks cannot both succeed.
// The decision time (DB server time) and admin id are recorded in the same statement
// (approved_at/approved_by or rejected_at/rejected_by). If those audit columns have not been added to the
// table yet, the status change still goes through without them.
// Returns { result: 'ok' | 'not_found' | 'already_decided', status? }.
export async function setApprovalStatus(id, status, actor) {
  const audit = status === 'A'
    ? ", approved_at = NOW(), approved_by = ?"
    : ", rejected_at = NOW(), rejected_by = ?";
  const where = " WHERE reg_id = ? AND approve_flag = 'P'";
  let result;
  try {
    [result] = await pool.query(`UPDATE td_school_reg SET approve_flag = ?${audit}${where}`, [status, actor, id]);
  } catch (e) {
    if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    console.warn(`Audit columns missing (${e.sqlMessage}); updating status only. Run the db/*.sql migrations.`);
    [result] = await pool.query(`UPDATE td_school_reg SET approve_flag = ?${where}`, [status, id]);
  }
  if (result.affectedRows > 0) return { result: 'ok' };
  const [rows] = await pool.query('SELECT approve_flag FROM td_school_reg WHERE reg_id = ?', [id]);
  return rows.length ? { result: 'already_decided', status: rows[0].approve_flag } : { result: 'not_found' };
}

// ---------- Admin users (md_user) ----------

// Returns { userId, name, passwordHash } for an exact user_id match, or null.
// MySQL's default collation is case-insensitive, so the exact match is re-checked in JS.
export async function findUser(userId) {
  const [rows] = await pool.query(
    'SELECT user_id, user_name, user_password FROM md_user WHERE user_id = ? LIMIT 5', [userId]);
  const row = rows.find((r) => r.user_id === userId);
  return row ? { userId: row.user_id, name: row.user_name, passwordHash: row.user_password } : null;
}
