/**
 * Job search for dashboard (client-side) and parity with GET /jobs?q on the backend.
 * Builds lowercase fragments per job: text fields plus expanded applied_date / deadline
 * tokens (ISO, year, month, day, English month long/short, en-US locale date strings).
 */

const TEXT_FIELDS = [
  'title',
  'company',
  'location',
  'description',
  'notes',
  'recruiter_notes',
  'status',
];

const DATE_FIELDS = ['applied_date', 'deadline'];

/**
 * @param {unknown} value
 * @returns {Date | null}
 */
export function parseJobDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const day = Number(iso[3]);
    const d = new Date(y, m, day);
    if (d.getFullYear() === y && d.getMonth() === m && d.getDate() === day) return d;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * @param {Date} d
 * @returns {string[]}
 */
function dateSearchFragments(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const mm = String(m + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const parts = [`${y}-${mm}-${dd}`, String(y), mm, dd, String(day)];
  parts.push(
    d
      .toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      .toLowerCase()
  );
  parts.push(
    d
      .toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
      .toLowerCase()
  );
  parts.push(d.toLocaleDateString('en-US', { month: 'long' }).toLowerCase());
  parts.push(d.toLocaleDateString('en-US', { month: 'short' }).toLowerCase());
  return parts;
}

/**
 * @param {Record<string, unknown>} job
 * @returns {string[]}
 */
export function jobSearchFragments(job) {
  const frags = [];
  for (const field of TEXT_FIELDS) {
    const v = job[field];
    if (v == null) continue;
    frags.push(String(v).toLowerCase());
  }
  for (const field of DATE_FIELDS) {
    const d = parseJobDate(job[field]);
    if (d) frags.push(...dateSearchFragments(d));
  }
  return frags;
}

/**
 * @param {Record<string, unknown>} job
 * @param {string} rawQuery
 * @returns {boolean}
 */
export function jobMatchesSearchQuery(job, rawQuery) {
  const q = String(rawQuery ?? '')
    .trim()
    .toLowerCase();
  if (!q) return true;
  return jobSearchFragments(job).some((fragment) => fragment.includes(q));
}
