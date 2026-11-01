/* money.js — المشتريات والمصاريف: تسجيل بصورة الفاتورة، تحليل الشهر، PDF، وقفل الشهر (مسح صور الفواتير) */
import { sb, call, compressImage } from './api.js?v=21';
import { getStore } from './store.js?v=21';
import * as L from './lib.js?v=21';
import { buildPdf, fileFrom, safeName } from './docs.js?v=21';

const r0 = (n) => Math.round(Number(n) || 0);
export const egp = (n) => r0(n).toLocaleString('en-US') + ' ج';
export const monthOf = (d) => String(d || L.todayStr()).slice(0, 7);
export const lastMonth = () => { const t = L.todayStr(); const d = new Date(t.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const prevOf = (m) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const monthEnd = (m) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);

/* صورة الفاتورة: بتتصغّر (حوالي ١٠٠–٢٠٠ كيلو) قبل ما تترفع */
export async function prepReceipt(file) {
  const blob = await compressImage(file, 1280, 0.6);
  const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { blob, b64, url: URL.createObjectURL(blob) };
}
export async function uploadReceipt(blob) {
  const path = await call('receipt_ticket');
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return path;
}

export const expensesIn = (from, to) => call('expenses_list', { p_from: from, p_to: to });

function group(list, key) {
  const m = new Map();
  for (const e of list) { const k = key(e) || '—'; const g = m.get(k) || { name: k, total: 0, count: 0 }; g.total += Number(e.price) || 0; g.count++; m.set(k, g); }
  return [...m.values()].sort((a, b) => b.total - a.total).map((g) => ({ ...g, total: r0(g.total) }));
}
export const carOf = (e) => (e.job ? e.job + (e.car ? ' ' + e.car : '') + (e.driver ? ' (' + e.driver + ')' : '') : 'مصاريف عامة');

/* تحليل فترة أو شهر */
export function analyze(list) {
  const total = r0(L.sum(list, (e) => Number(e.price) || 0));
  return {
    total, count: list.length, receipts: new Set(list.filter((e) => e.receipt).map((e) => e.receipt)).size,
    by_car: group(list, carOf), by_staff: group(list, (e) => e.staff), by_shop: group(list, (e) => e.shop),
    top_items: [...list].sort((a, b) => b.price - a.price).slice(0, 8).map((e) => ({ item: e.item, qty: Number(e.qty), price: r0(e.price), shop: e.shop, date: e.date, car: carOf(e) })),
  };
}
export async function monthReport(m) {
  const [cur, prev, closes] = await Promise.all([expensesIn(m + '-01', monthEnd(m)), expensesIn(prevOf(m) + '-01', monthEnd(prevOf(m))), call('month_closes_list').catch(() => [])]);
  const a = analyze(cur), p = analyze(prev);
  return {
    month: m, name: monthName(m), ...a,
    prev_month: { name: monthName(prevOf(m)), total: p.total, change_pct: p.total ? Math.round(((a.total - p.total) / p.total) * 100) : null },
    closed: (closes || []).some((c) => c.month === m),
    can_close: m < monthOf(L.todayStr()),
    _list: cur,
  };
}

export async function monthPdf(rep) {
  const S = getStore().data.settings || {};
  const cols = [{ key: 'name', label: 'البند', w: 3 }, { key: 'count', label: 'عدد', w: 0.7, align: 'center' }, { key: 'total', label: 'المبلغ', w: 1.2, align: 'end' }];
  const rows = (g) => g.map((x) => ({ ...x, total: egp(x.total) }));
  const blob = await buildPdf({
    dir: 'rtl', title: 'تحليل مصاريف ' + rep.name, subtitle: S.company_ar,
    meta: [['الإجمالي', egp(rep.total)], ['عدد المشتريات', String(rep.count)], ['الشهر اللي قبله', rep.prev_month.name + ': ' + egp(rep.prev_month.total) + (rep.prev_month.change_pct != null ? ' (' + (rep.prev_month.change_pct > 0 ? '+' : '') + rep.prev_month.change_pct + '%)' : '')]],
    footer: `${S.company_ar || ''} — ${S.address_ar || ''}`,
    sections: [
      { title: 'على كل عربية', columns: cols, rows: rows(rep.by_car), empty: 'مفيش' },
      { title: 'مين صرف', columns: cols, rows: rows(rep.by_staff), empty: 'مفيش' },
      { title: 'المحلات', columns: cols, rows: rows(rep.by_shop), empty: 'مفيش' },
      { title: 'كل المشتريات', empty: 'مفيش مشتريات في الشهر ده',
        columns: [{ key: 'date', label: 'اليوم', w: 1.1 }, { key: 'item', label: 'الحاجة', w: 2.4 }, { key: 'qty', label: 'العدد', w: 0.6, align: 'center' }, { key: 'price', label: 'المبلغ', w: 1, align: 'end' },
          { key: 'shop', label: 'المحل', w: 1.4 }, { key: 'car', label: 'العربية', w: 2 }, { key: 'staff', label: 'مين', w: 1 }],
        rows: rep._list.map((e) => ({ date: L.fmtDate(e.date), item: e.item, qty: Number(e.qty), price: egp(e.price), shop: e.shop || '—', car: carOf(e), staff: e.staff || '—' })) },
    ],
  });
  return fileFrom(blob, safeName('مصاريف ' + rep.name) + '.pdf');
}

/* قفل الشهر: التحليل يتحفظ، وصور الفواتير تتمسح، والأرقام تفضل */
export async function closeMonth(rep) {
  const { _list, ...report } = rep;
  const r = await call('month_close', { p_month: rep.month, p_report: report });
  const paths = (r && r.paths) || [];
  for (let i = 0; i < paths.length; i += 100) {
    try { await sb.storage.from('photos').remove(paths.slice(i, i + 100)); } catch (e) { /* الصورة اتمسحت قبل كده */ }
  }
  return { total: r && r.total, removed: paths.length };
}
