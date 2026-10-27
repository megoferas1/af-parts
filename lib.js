/* lib.js — تنسيقات وأسماء ثابتة */

export const TZ = 'Africa/Cairo';
const LOC = 'ar-EG-u-nu-latn';

export const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const todayStr = () => ymd(new Date());
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const fmtDateTime = (iso) => (iso ? new Intl.DateTimeFormat(LOC, {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
}).format(new Date(iso)) : '—');
export const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat(LOC, {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
}).format(new Date(String(iso).slice(0, 10) + 'T12:00:00Z')) : '—');
export const fmtDateShort = (iso) => (iso ? new Intl.DateTimeFormat(LOC, {
  day: 'numeric', month: 'short', timeZone: 'UTC',
}).format(new Date(String(iso).slice(0, 10) + 'T12:00:00Z')) : '—');
export const fmtDateEn = (iso) => (iso ? new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
}).format(new Date(String(iso).slice(0, 10) + 'T12:00:00Z')) : '—');
export const nowStamp = () => new Intl.DateTimeFormat(LOC, {
  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
}).format(new Date());

/* بحث عربي: نوحّد الألف والتاء المربوطة والياء */
export const norm = (s) => String(s || '').toLowerCase()
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '')
  .replace(/\s+/g, ' ').trim();
export function matches(hay, q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const h = norm(hay);
  return words.every((w) => h.includes(w));
}

/* أنواع الحاجات */
export const KIND = {
  part: { label: 'قطعة سواق', plural: 'قطع السواقين', icon: 'car', tone: 'red' },
  tool: { label: 'عدة الجراش', plural: 'العدة', icon: 'wrench', tone: 'dark' },
  product: { label: 'منتج تصدير', plural: 'التصدير', icon: 'box', tone: 'gray' },
};

export const COND = {
  new: { label: 'جديدة', tone: 'green' },
  used: { label: 'مستعملة', tone: 'gray' },
  repair: { label: 'محتاجة تصليح', tone: 'amber' },
  damaged: { label: 'تالفة', tone: 'red' },
};
export const COND_EN = { new: 'New', used: 'Used', repair: 'Needs repair', damaged: 'Damaged' };

export const TRIP_KIND = {
  race: { label: 'سباق', icon: 'flag' },
  practice: { label: 'تمرين', icon: 'timer' },
  other: { label: 'طلعة', icon: 'truck' },
};
export const TRIP_STATUS = {
  prep: { label: 'بيتحضّر', tone: 'amber' },
  out: { label: 'برا دلوقتي', tone: 'red' },
  closed: { label: 'رجعنا', tone: 'gray' },
};

/* اسم زرار "دخول" حسب النوع */
export const IN_LABEL = { part: 'دخول', tool: 'زيادة', product: 'اتصنع' };

export const OUT_REASONS = {
  part: ['راحت تتصلح برا', 'اتباعت', 'اترمت', 'تانية'],
  tool: ['اتلفت واترمت', 'اتسلفت', 'ضاعت', 'تانية'],
  product: ['اتباعت محلي', 'تالفة', 'عينة', 'تانية'],
};

/* أسماء الحركات في السجل */
const MV = {
  create: ['اتسجلت', 'plus', 'green'],
  make: ['اتصنّعت (قطع بأكواد)', 'plus', 'green'],
  in: ['دخول', 'in', 'green'],
  out: ['خروج', 'out', 'red'],
  adjust: ['جرد', 'list', 'gray'],
  move: ['نقل مكان', 'pin', 'gray'],
  cond: ['تغيير الحالة', 'tag', 'amber'],
  edit: ['تعديل', 'edit', 'gray'],
  install: ['اتركبت على العربية', 'wrench', 'dark'],
  removed: ['اتشالت من العربية ودخلت', 'swap', 'amber'],
  trip_out: ['طلعت مع طلعة', 'truck', 'dark'],
  trip_cancel: ['اتشالت من الطلعة ورجعت', 'undo', 'gray'],
  trip_back: ['رجعت سليمة', 'check', 'green'],
  trip_damaged: ['رجعت تالفة', 'alert', 'red'],
  trip_installed: ['اتركبت في الطلعة', 'wrench', 'dark'],
  trip_used: ['اتصرفت في الطلعة', 'flame', 'amber'],
  trip_lost: ['ضاعت في الطلعة', 'x', 'red'],
  ship: ['اتشحنت', 'globe', 'dark'],
};
export function moveInfo(m) {
  const base = MV[m.type] || [m.type, 'info', 'gray'];
  let label = base[0];
  if (m.type === 'in') label = IN_LABEL[m.item_kind] || 'دخول';
  return { label, icon: base[1], tone: base[2] };
}
export const MOVE_GROUPS = [
  ['', 'الكل'], ['io', 'دخول وخروج'], ['install', 'تركيب'], ['trip', 'الطلعات'], ['edit', 'تعديلات'],
];

/* أرقام تليفون مصرية → واتساب */
export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '20' + d.slice(1);
  return d;
}

/* عزل كل جزء عشان العربي والإنجليزي ما يتلخبطوش في نفس السطر */
export const bidi = (...parts) => parts.filter((x) => x !== null && x !== undefined && x !== '').map((x) => '\u2068' + x + '\u2069').join(' · ');
/* ترتيب طبيعي: مفتاح 9 قبل مفتاح 10 */
export const cmpName = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' }).compare;
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
