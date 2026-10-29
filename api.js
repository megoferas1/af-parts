/* api.js — الاتصال بـ Supabase */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=16';

if (!window.supabase) throw new Error('مكتبة Supabase ما اتحمّلتش (cdn.jsdelivr.net)');
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'afparts-admin' },
});

const ls = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
export const staffSession = {
  get token() { return ls.get('afparts_staff'); },
  set(t) { ls.set('afparts_staff', t); },
  clear() { ls.del('afparts_staff'); },
};
export const lastRole = { get: () => ls.get('afparts_role') || 'staff', set: (r) => ls.set('afparts_role', r) };
export const pref = { get: (k, d) => ls.get('afparts_p_' + k) || d, set: (k, v) => ls.set('afparts_p_' + k, v) };

let TOKEN = '';
let onUnauthorized = () => {};
export const setToken = (t) => { TOKEN = t || ''; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function rpcRaw(name, args) {
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw error;
  return data;
}
/* كل دوال النظام بتاخد التوكن */
export async function call(name, args) {
  try {
    return await rpcRaw(name, { p_token: TOKEN, ...(args || {}) });
  } catch (e) {
    if (isUnauthorized(e)) onUnauthorized();
    throw e;
  }
}
export const isUnauthorized = (e) => /unauthorized/i.test((e && e.message) || '');

const MSG = {
  unauthorized: 'انتهت الجلسة، ادخل تاني',
  admin_only: 'دي للإدارة بس',
  name_required: 'لازم تكتب الاسم',
  driver_required: 'اختار السواق',
  customer_required: 'اختار العميل',
  car_required: 'اختار العربية',
  car_mismatch: 'العربية دي مش بتاعة السواق ده',
  not_enough: 'الكمية اللي في الجراش مش كفاية',
  bad_qty: 'الكمية غلط',
  code_used: 'الاستيكر ده متسجل على حاجة تانية',
  code_unknown: 'الكود ده مش من استيكراتنا',
  has_items: 'مينفعش يتمسح، عليه حاجات متسجلة',
  on_trip: 'الحاجة دي في طلعة لسه ما خلصتش',
  on_shipment: 'الحاجة دي في شحنة لسه ما اتشحنتش',
  not_latest: 'تقدر تتراجع عن آخر حركة بس',
  cant_undo: 'الحركة دي مينفعش نتراجع عنها',
  trip_closed: 'الطلعة دي خلصت',
  trip_not_prep: 'الطلعة دي طلعت خلاص',
  trip_not_out: 'الطلعة لسه ما طلعتش',
  trip_empty: 'الطلعة فاضية، ضيف حاجات الأول',
  not_in_trip: 'دي مش في الطلعة',
  bad_counts: 'الأعداد أكتر من الكمية',
  shipment_done: 'الشحنة دي اتشحنت خلاص',
  shipment_empty: 'الشحنة فاضية',
  not_product: 'الشحنات للمنتجات والقطع بس',
  bad_kind: 'الحاجة دي مينفعش تتشحن',
  part_no_used: 'رقم القطعة ده متسجل على منتج تاني',
  invoice_only: 'الفواتير للإدارة بس، أو للي الإدارة اديته الصلاحية',
  bill_required: 'اكتب اسم العميل',
  invoice_empty: 'ضيف بند واحد على الأقل',
  bad_price: 'السعر غلط',
  bad_tax: 'نسبة الضريبة غلط',
  bad_abbr: 'الاختصار من 1 لـ 6 حروف إنجليزي',
  bad_currency: 'العملة غلط',
  bad_pin: 'الرقم السري لازم يكون من 4 لـ 8 أرقام',
  bad_ticket: 'الصورة ما اترفعتش، جرّب تاني',
  job_title_required: 'اكتب المطلوب يتعمل في العربية',
  bad_status: 'الحالة غلط',
  bad_hours: 'الساعات لازم تكون من ربع ساعة لـ 24 ساعة',
  unit_added: 'القطعة دي اتضافت للشحنة دي خلاص',
  unit_other_ship: 'القطعة دي في شحنة تانية بتتجهز',
  unit_shipped: 'القطعة دي اتشحنت خلاص، مينفعش تتمسح',
  unit_not_stock: 'القطعة دي مش في المخزن (اتشحنت أو خرجت)',
  unit_unknown: 'الكود ده مش لقطعة متسجلة',
  scan_unit: 'امسح استيكر القطعة نفسها مش استيكر المنتج',
  not_found: 'مش لاقيينها، يمكن اتمسحت',
};
export function errText(e) {
  const m = (e && e.message) || String(e || '');
  for (const k in MSG) if (m.includes(k)) return MSG[k];
  if (/Could not find the function|function public\.\w+\(.*\) does not exist|schema cache/i.test(m)) return 'لازم تشغّل ملف التحديث الأخير في Supabase الأول';
  if (/fetch|network|Failed|Load failed/i.test(m)) return 'مفيش نت أو السيرفر مش بيرد';
  return 'حصلت مشكلة: ' + m.slice(0, 90);
}

/* ---------- الصور ---------- */
export const photoUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/photos/${path}` : '');

export function compressImage(file, max = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('compress'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
export async function uploadPhoto(itemId, file) {
  const blob = await compressImage(file);
  const path = await call('photo_ticket', { p_item: itemId });
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  const r = await call('set_photo', { p_item: itemId, p_path: path });
  if (r && r.delete) removePhotoFile(r.delete);
}
/* صورة على أمر شغل (قبل / أثناء / بعد) */
export async function uploadJobPhoto(jobId, file, stage) {
  const blob = await compressImage(file, 1400, 0.74);
  const path = await call('job_photo_ticket', { p_job: jobId });
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  await call('job_photo_add', { p_job: jobId, p_path: path, p_stage: stage });
}
export function removePhotoFile(path) {
  if (!path) return;
  try { sb.storage.from('photos').remove([path]).catch(() => {}); } catch (e) { /* ignore */ }
}

/* ---------- مشاركة / تنزيل ملف ---------- */
export function canShareFile(file) {
  try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (e) { return false; }
}
export async function shareFile(file, text) {
  try {
    await navigator.share({ files: [file], title: file.name, text: text || '' });
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
    downloadFile(file);
    return true;
  }
}
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
}

/* تحميل مكتبة خارجية مرة واحدة — src ممكن يبقى لينك أو ليستة لينكات (لو الأول وقع يجرب اللي بعده) */
const loaded = {};
export async function loadScript(src, globalName) {
  if (globalName && window[globalName]) return true;
  const list = Array.isArray(src) ? src : [src];
  let err = null;
  for (const u of list) {
    try {
      await loadOne(u);
      if (!globalName || window[globalName]) return true;
      err = new Error('lib ' + u);
    } catch (e) { err = e; }
  }
  throw err || new Error('lib');
}
function loadOne(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => { delete loaded[src]; reject(new Error('lib ' + src)); };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}
