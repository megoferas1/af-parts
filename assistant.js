/* assistant.js — «المدير»: مساعد بتكلمه عربي أو إنجليزي، بيرد من بيانات السيستم وبيعمل الحاجات بعد ما توافق
   الذكاء من Gemini (مجاني) عن طريق Supabase Edge Function اسمها ai — المفتاح هناك مش هنا.
   ولو الذكاء مش متاح، الزراير اللي تحت والبحث العادي شغالين. */
import { html, useState, useEffect, useRef, Icon, Sheet, Spinner, openSheet, toast } from './ui.js?v=18';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=18';
import { sb, call, errText, staffSession } from './api.js?v=18';
import { useStore, getStore, reload, canInvoice } from './store.js?v=18';
import * as L from './lib.js?v=18';
import { ItemSheet, startNewItem, InstallForm } from './items.js?v=18';
import { DriverSheet } from './drivers.js?v=18';
import { JobSheet, JobForm, JOB_ST, isOpenJob, isLate } from './jobs.js?v=18';
import { TripSheet, TripForm } from './trips.js?v=18';
import { ShipmentSheet, ShipmentForm } from './export.js?v=18';
import { InvoiceSheet, InvoiceForm, invoiceFile, usdRate, conv } from './invoices.js?v=18';
import { FileReady } from './stickers.js?v=18';
import { LogSheet } from './log.js?v=18';
import { scanOpen } from './home.js?v=18';

/* ============================================================ أدوات صغيرة */
const st = () => getStore();
const N = (s) => L.norm(s);
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const staffName = (id) => { const s = id && st().data.staff.find((x) => x.id === id); return s ? s.name : ''; };
const KIND_JOB = { setup: 'سيت أب', fab: 'فابريكيشن', '': '' };

/* يلاقي حاجة واحدة من ليستة بالـ id أو الاسم — ولو أكتر من واحدة يرجّعهم عشان المساعد يسأل */
function pick(list, q, hay) {
  if (q === null || q === undefined || q === '') return { none: true };
  const s = String(q).trim();
  const byId = list.find((x) => x.id === s || x.ref === s.toUpperCase() || x.code === s.toUpperCase());
  if (byId) return { one: byId };
  const exact = list.filter((x) => N(hay(x)).split(' | ')[0] === N(s));
  if (exact.length === 1) return { one: exact[0] };
  const m = list.filter((x) => L.matches(hay(x), s));
  if (m.length === 1) return { one: m[0] };
  if (m.length > 1) return { many: m.slice(0, 8) };
  return { none: true };
}
const findDriver = (q) => pick(st().data.drivers, q, (d) => d.name + ' | ' + d.phone);
const findStaff = (q) => pick(st().data.staff, q, (s) => s.name);
const findCustomer = (q) => pick(st().data.customers, q, (c) => c.name + ' | ' + c.phone + ' ' + c.country + ' ' + c.email);
const findJob = (q) => pick(st().data.jobs, q, (j) => {
  const { idx } = st(); const c = j.car_id && idx.cars.get(j.car_id); const d = j.driver_id && idx.drivers.get(j.driver_id);
  return j.ref + ' | ' + [c && c.name, d && d.name, j.title].join(' ');
});
const findItem = (q, kinds) => {
  const { data, idx } = st();
  const list = kinds ? data.items.filter((i) => kinds.includes(i.kind)) : data.items;
  return pick(list, q, (i) => i.name + ' | ' + idx.hay.get(i.id));
};
function findCar(driverId, q) {
  const cars = st().idx.carsByDriver.get(driverId) || [];
  if (!q) return cars.length === 1 ? { one: cars[0] } : cars.length ? { many: cars } : { none: true };
  return pick(cars, q, (c) => c.name + ' | ' + c.plate);
}
const opts = (arr, f) => arr.map(f);
/* بحث مرن: يشيل كلام زي «فين / بتاع / ال...» ولو مفيش نتيجة يجرّب بأي كلمة */
const STOP = new Set(['فين', 'عندنا', 'هل', 'في', 'ايه', 'اللي', 'بتاع', 'بتاعه', 'بتاعت', 'على', 'من', 'كام', 'مكان', 'where', 'is', 'the', 'do', 'we', 'have', 'a', 'any']);
function words(q) {
  return N(q).replace(/[؟?!.,،]/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).map((w) => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w));
}
function smartFind(list, hay, q) {
  let r = list.filter((x) => L.matches(hay(x), q));
  if (r.length) return r;
  const ws = words(q);
  if (!ws.length) return [];
  r = list.filter((x) => { const h = N(hay(x)); return ws.every((w) => h.includes(w)); });
  if (r.length) return r;
  return list.map((x) => { const h = N(hay(x)); return [x, ws.filter((w) => h.includes(w)).length]; })
    .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x);
}
const ambig = (what, arr, f) => ({ error: 'ambiguous', what, options: opts(arr, f), hint: 'اسأل المستخدم يقصد أنهي واحد' });
const notFound = (what, q) => ({ error: 'not_found', what, query: q });

/* شكل الحاجة لما المساعد يقراها */
function itemOut(i) {
  const { idx } = st();
  const d = i.driver_id && idx.drivers.get(i.driver_id), c = i.car_id && idx.cars.get(i.car_id);
  const o = {
    id: i.id, code: i.code || '', name: i.name, name_en: i.name_en || undefined, size: i.size || undefined, type: L.KIND[i.kind].label,
    category: i.category || undefined, qty_in_garage: i.qty, location: i.location || 'مش محدد', condition: (L.COND[i.condition] || {}).label,
    owner: i.kind === 'part' ? (d ? d.name : 'الجراش') : undefined, car: c ? c.name : undefined, part_no: i.part_no || undefined, note: i.note || undefined,
  };
  const out = idx.outQty.get(i.id); if (out) o.out_on_trip = out;
  const tr = idx.outTrips.get(i.id); if (tr) o.trips = tr.map((x) => x.trip.name + ' (' + L.TRIP_STATUS[x.trip.status].label + ')');
  const sh = idx.shipQty.get(i.id); if (sh) o.reserved_in_shipment = sh;
  if (i.kind === 'product') o.units_in_stock = (idx.unitsByItem.get(i.id) || []).length;
  if (canInvoice() && i.price != null) o.price = i.price + ' ' + (i.price_cur || '');
  return o;
}
function jobOut(j, full) {
  const { idx } = st();
  const c = j.car_id && idx.cars.get(j.car_id), d = j.driver_id && idx.drivers.get(j.driver_id);
  const tasks = (j.lines || []).filter((l) => l.kind === 'task');
  const o = {
    id: j.id, ref: j.ref, car: c ? c.name : '', driver: d ? d.name : '', title: j.title, type: KIND_JOB[j.kind || ''] || undefined,
    status: (JOB_ST[j.status] || {}).label, late: isLate(j) || undefined, due: j.due_date || undefined,
    responsible: staffName(j.staff_id) || undefined, tasks_done: tasks.filter((l) => l.done).length + ' من ' + tasks.length,
    received: L.fmtDate(j.created_at),
  };
  if (full) {
    o.tasks = tasks.map((l) => ({ id: l.id, title: l.title, done: l.done, by: l.done ? l.done_by : undefined, staff: staffName(l.staff_id) || 'محدش' }));
    o.materials = (j.lines || []).filter((l) => l.kind === 'material').map((l) => l.title + ' × ' + r2(l.qty) + (l.unit ? ' ' + l.unit : ''));
    o.hours = (j.hours || []).map((h) => h.staff_name + ': ' + r2(h.hours) + ' س (' + h.work_date + ')');
    o.note = j.note || undefined; o.phone = d ? d.phone : undefined;
    if (j.invoice) o.invoice = j.invoice.ref;
  }
  return o;
}

/* ============================================================ الأدوات (اللي المساعد يقدر يعمله) */
const S_ = (type, props, req) => (Object.keys(props).length ? { type: 'object', properties: props, ...(req && req.length ? { required: req } : {}) } : undefined);
const str = (d) => ({ type: 'string', description: d });
const num = (d) => ({ type: 'number', description: d });
const bool = (d) => ({ type: 'boolean', description: d });
const arr = (items, d) => ({ type: 'array', items, description: d });
const en = (vals, d) => ({ type: 'string', enum: vals, description: d });

const TASK = S_('object', { title: str('الشغلانة'), staff: str('اسم الموظف اللي هيعملها (اختياري)') }, ['title']);

/* قراية (بتشتغل على طول) */
const READ = {
  summary: {
    d: 'ملخص الجراش دلوقتي: العربيات، المتأخر، الجاهز، القطع، الطلعات، الشحنات، الفواتير',
    p: S_('object', {}),
    run() {
      const { data, idx } = st();
      const open = data.jobs.filter(isOpenJob);
      const o = {
        cars_in_garage: open.length, late: open.filter(isLate).map((j) => j.ref), ready: open.filter((j) => j.status === 'ready').map((j) => j.ref),
        waiting_parts: open.filter((j) => j.status === 'waiting').map((j) => j.ref),
        driver_parts_in_garage: L.sum(idx.kinds.part.filter((i) => i.driver_id), (i) => i.qty), garage_parts: L.sum(idx.garageParts, (i) => i.qty),
        tools: idx.kinds.tool.length, products: idx.kinds.product.length,
        active_trips: data.trips.filter((t) => t.status !== 'closed').map((t) => t.name + ' (' + L.TRIP_STATUS[t.status].label + ')'),
        draft_shipments: data.shipments.filter((s) => s.status === 'draft').map((s) => s.ref),
        unassigned_tasks: L.sum(open, (j) => (j.lines || []).filter((l) => l.kind === 'task' && !l.done && !l.staff_id).length),
      };
      if (canInvoice()) o.unpaid_invoices = data.invoices.filter((v) => !v.paid).map((v) => v.ref + ' ' + (v.bill && v.bill.name) + ' ' + v.total + ' ' + v.currency);
      return o;
    },
  },
  find: {
    d: 'دوّر على أي حاجة في الجراش (قطعة، عدة، منتج تصدير) بالاسم أو الكود أو المقاس أو السواق، وكمان سواقين وعملاء. استخدمها لـ «فين كذا؟» و«عندنا كذا؟»',
    p: S_('object', { query: str('اللي بتدوّر عليه'), kind: en(['part', 'tool', 'product', 'any'], 'part=قطع السواقين والجراش، tool=العدة، product=منتجات التصدير') }, ['query']),
    run({ query, kind }) {
      const { data, idx } = st();
      const k = kind && kind !== 'any' ? [kind] : null;
      const items = smartFind(data.items.filter((i) => !k || k.includes(i.kind)), (i) => idx.hay.get(i.id), query);
      const drivers = data.drivers.filter((d) => L.matches(d.name + ' ' + d.phone, query)).slice(0, 5);
      const customers = data.customers.filter((c) => L.matches(c.name + ' ' + c.country, query)).slice(0, 5);
      return {
        items_found: items.length, items: items.slice(0, 15).map(itemOut),
        drivers: drivers.map((d) => ({ id: d.id, name: d.name, phone: d.phone })), customers: customers.map((c) => ({ id: c.id, name: c.name, country: c.country })),
        _refs: items.slice(0, 6).map((i) => ['item', i.id, i.name]),
      };
    },
  },
  list_jobs: {
    d: 'أوامر الشغل (العربيات اللي في الجراش)',
    p: S_('object', { filter: en(['open', 'late', 'ready', 'waiting', 'working', 'delivered', 'all'], 'open = كل اللي في الجراش'), driver: str('اسم السواق (اختياري)'), staff: str('اسم موظف: الشغل اللي عليه (اختياري)') }),
    run({ filter = 'open', driver, staff }) {
      let list = st().data.jobs;
      if (filter === 'open') list = list.filter(isOpenJob);
      else if (filter === 'late') list = list.filter(isLate);
      else if (filter === 'working') list = list.filter((j) => j.status === 'working' || j.status === 'received');
      else if (filter !== 'all') list = list.filter((j) => j.status === filter);
      if (driver) { const r = findDriver(driver); if (r.one) list = list.filter((j) => j.driver_id === r.one.id); }
      if (staff) { const r = findStaff(staff); if (r.one) list = list.filter((j) => j.staff_id === r.one.id || (j.lines || []).some((l) => l.staff_id === r.one.id)); }
      return { count: list.length, jobs: list.slice(0, 25).map((j) => jobOut(j)), _refs: list.slice(0, 5).map((j) => ['job', j.id, j.ref]) };
    },
  },
  get_job: {
    d: 'تفاصيل أمر شغل: الشغلانات وعلى مين، الخامات، الساعات',
    p: S_('object', { job: str('رقم أمر الشغل (JOB-0012) أو اسم العربية أو السواق') }, ['job']),
    run({ job }) {
      const r = findJob(job);
      if (r.many) return ambig('أمر شغل', r.many, (j) => jobOut(j));
      if (!r.one) return notFound('أمر شغل', job);
      return { ...jobOut(r.one, true), _refs: [['job', r.one.id, r.one.ref]] };
    },
  },
  get_driver: {
    d: 'بيانات سواق: تليفونه، عربياته، قطعه اللي في الجراش، وشغله المفتوح',
    p: S_('object', { driver: str('اسم السواق') }, ['driver']),
    run({ driver }) {
      const r = findDriver(driver);
      if (r.many) return ambig('سواق', r.many, (d) => d.name + ' ' + d.phone);
      if (!r.one) return notFound('سواق', driver);
      const { idx, data } = st(); const d = r.one;
      const parts = idx.itemsByDriver.get(d.id) || [];
      return {
        id: d.id, name: d.name, phone: d.phone, note: d.note || undefined,
        cars: (idx.carsByDriver.get(d.id) || []).map((c) => ({ id: c.id, name: c.name, plate: c.plate })),
        parts_count: L.sum(parts, (i) => i.qty), parts: parts.slice(0, 30).map((i) => i.name + (i.size ? ' ' + i.size : '') + ' × ' + i.qty + ' (' + (i.location || 'مكان مش محدد') + ')'),
        open_jobs: data.jobs.filter((j) => j.driver_id === d.id && isOpenJob(j)).map((j) => jobOut(j)),
        _refs: [['driver', d.id, d.name]],
      };
    },
  },
  past_jobs: {
    d: 'اتعلم من الشغل القديم: أوامر شغل شبه الشغلانة دي اتعمل فيها إيه بالظبط، مين عمل كل شغلانة، الساعات، والخامات، وخدت كام يوم. استخدمها قبل ما تقسّم أي عربية داخلة عشان تقسّم زي ما اتعمل قبل كده',
    p: S_('object', { query: str('الشغل أو العربية (زي: كيت زاوية E36، رول كيج، تغيير مساعدين)') }, ['query']),
    run({ query }) {
      const { data } = st();
      const hay = (j) => [j.title, j.kind && KIND_JOB[j.kind], ...(j.lines || []).map((l) => l.title), (st().idx.cars.get(j.car_id) || {}).name].filter(Boolean).join(' ');
      const done = (j) => (j.lines || []).filter((l) => l.kind === 'task').length > 0;
      const found = smartFind(data.jobs.filter(done), hay, query).slice(0, 6);
      if (!found.length) return { found: 0, note: 'مفيش شغل قديم شبهها. قسّمها انت.' };
      return {
        found: found.length,
        jobs: found.map((j) => {
          const tasks = (j.lines || []).filter((l) => l.kind === 'task');
          const mats = (j.lines || []).filter((l) => l.kind !== 'task');
          const hrs = j.hours || [];
          const days = j.status === 'delivered' && j.status_at ? Math.max(1, Math.round((new Date(j.status_at) - new Date(j.created_at)) / 864e5)) : undefined;
          return {
            ref: j.ref, title: j.title, type: KIND_JOB[j.kind || ''] || undefined, status: (JOB_ST[j.status] || {}).label,
            tasks: tasks.map((l) => l.title + (l.staff_id ? ' ← ' + staffName(l.staff_id) : '') + (l.done ? ' ✓' + (l.done_by ? ' (' + l.done_by + ')' : '') : '')),
            materials: mats.slice(0, 15).map((l) => l.title + (l.qty ? ' ×' + l.qty : '')),
            total_hours: r2(L.sum(hrs, (h) => Number(h.hours))) || undefined,
            hours_by: Object.entries(hrs.reduce((a, h) => { const n = staffName(h.staff_id) || '؟'; a[n] = (a[n] || 0) + Number(h.hours); return a; }, {})).map(([n, h]) => n + ': ' + r2(h)),
            days_to_deliver: days,
          };
        }),
      };
    },
  },
  staff_work: {
    d: 'الشغل اللي على كل موظف (أو موظف واحد): الشغلانات اللي لسه، وساعاته في آخر 7 أيام. استخدمها لتقسيم المهام',
    p: S_('object', { staff: str('اسم الموظف (اختياري)') }),
    run({ staff }) {
      const { data } = st();
      let people = data.staff;
      if (staff) { const r = findStaff(staff); if (r.one) people = [r.one]; else if (r.many) people = r.many; }
      const open = data.jobs.filter(isOpenJob);
      const since = L.addDays(L.todayStr(), -7);
      return {
        staff: people.map((s) => ({
          name: s.name,
          knows: s.skill || 'لسه مفيش',
          open_tasks: open.flatMap((j) => (j.lines || []).filter((l) => l.kind === 'task' && !l.done && l.staff_id === s.id).map((l) => j.ref + ': ' + l.title)),
          responsible_for: open.filter((j) => j.staff_id === s.id).map((j) => j.ref),
          hours_last_7_days: r2(L.sum(data.jobs.flatMap((j) => j.hours || []).filter((h) => h.staff_id === s.id && h.work_date >= since), (h) => Number(h.hours))),
        })),
        unassigned: open.flatMap((j) => (j.lines || []).filter((l) => l.kind === 'task' && !l.done && !l.staff_id).map((l) => j.ref + ': ' + l.title)),
      };
    },
  },
  list_trips: {
    d: 'الطلعات (سباق / تمرين) وحاجاتها',
    p: S_('object', { trip: str('اسم الطلعة (اختياري) عشان تفاصيلها') }),
    run({ trip }) {
      const { data, idx } = st();
      const out = (t, full) => {
        const o = { id: t.id, name: t.name, type: L.TRIP_KIND[t.kind].label, date: t.trip_date, place: t.place || undefined, status: L.TRIP_STATUS[t.status].label, items: t.items.length };
        if (full) o.list = t.items.map((x) => { const i = idx.items.get(x.item_id) || {}; return (i.name || '?') + ' × ' + x.qty + (t.status === 'prep' ? (x.loaded ? ' ✓طالع' : ' (مش متعلّم)') : t.status === 'out' ? (x.packed ? ' ✓اتحمّل' : ' (لسه)') : ''); });
        return o;
      };
      if (trip) {
        const r = pick(data.trips, trip, (t) => t.name + ' | ' + t.place);
        if (r.many) return ambig('طلعة', r.many, (t) => out(t));
        if (r.one) return { ...out(r.one, true), _refs: [['trip', r.one.id, r.one.name]] };
      }
      return { trips: data.trips.slice(0, 15).map((t) => out(t)), templates: data.templates.map((t) => t.name) };
    },
  },
  list_shipments: {
    d: 'شحنات التصدير والعملاء',
    p: S_('object', { status: en(['draft', 'shipped', 'all'], 'draft = بتتجهز') }),
    run({ status = 'all' }) {
      const { data, idx } = st();
      const list = data.shipments.filter((s) => status === 'all' || s.status === status);
      return {
        shipments: list.slice(0, 20).map((s) => ({ id: s.id, ref: s.ref, customer: (idx.customers.get(s.customer_id) || {}).name, status: s.status === 'draft' ? 'بتتجهز' : 'اتشحنت', date: s.ship_date,
          items: s.items.map((x) => (idx.items.get(x.item_id) || {}).name + ' × ' + x.qty) })),
        customers: data.customers.slice(0, 40).map((c) => c.name + ' (' + (c.country || '') + ')'),
        _refs: list.slice(0, 4).map((s) => ['shipment', s.id, s.ref]),
      };
    },
  },
  prices: {
    d: 'ليستة الأسعار: منتجاتنا والمصنعيات والخامات. استخدمها قبل ما تعمل فاتورة',
    p: S_('object', { query: str('اللي بتدوّر عليه (فاضي = الكل)') }),
    inv: true,
    run({ query }) {
      const { data } = st();
      const pi = data.price_items.filter((x) => !query || L.matches([x.name, x.name_en, x.part_no].join(' '), query));
      const pr = st().idx.kinds.product.filter((i) => !query || L.matches([i.name, i.name_en, i.part_no, i.category].join(' '), query));
      return {
        price_list: pi.slice(0, 40).map((x) => ({ price_item_id: x.id, name: x.name, name_en: x.name_en || undefined, type: x.kind === 'labor' ? 'مصنعية' : 'قطعة/خامة', unit: x.unit || undefined, price: x.price, currency: x.price_cur })),
        products: pr.slice(0, 30).map((i) => ({ product_id: i.id, part_no: i.part_no, name: i.name, name_en: i.name_en || undefined, price: i.price, currency: i.price_cur, in_stock: i.qty })),
      };
    },
  },
  list_invoices: {
    d: 'الفواتير',
    p: S_('object', { query: str('اسم العميل أو رقم الفاتورة (اختياري)'), unpaid_only: bool('اللي لسه ما اتدفعتش بس') }),
    inv: true,
    run({ query, unpaid_only }) {
      const list = st().data.invoices.filter((v) => (!unpaid_only || !v.paid) && (!query || L.matches([v.ref, v.bill && v.bill.name].join(' '), query)));
      return { count: list.length, invoices: list.slice(0, 20).map((v) => ({ id: v.id, ref: v.ref, to: v.bill && v.bill.name, date: v.inv_date, total: v.total + ' ' + v.currency, paid: v.paid })), _refs: list.slice(0, 4).map((v) => ['invoice', v.id, v.ref]) };
    },
  },
  recent_moves: {
    d: 'آخر الحركات في السجل (دخول، خروج، تركيب، طلعات...) — مين عمل إيه وإمتى',
    p: S_('object', { days: num('آخر كام يوم (افتراضي 1)'), driver: str('سواق (اختياري)'), item: str('قطعة أو كود (اختياري)') }),
    async run({ days = 1, driver, item }) {
      const p = { limit: 40, from: L.addDays(L.todayStr(), -Math.max(0, Math.round(days) - 1)) };
      if (driver) { const r = findDriver(driver); if (r.one) p.driver_id = r.one.id; }
      if (item) { const r = findItem(item); if (r.one) { p.item_id = r.one.id; delete p.from; } }
      const ms = await call('moves_list', { p });
      return { moves: ms.map((m) => ({ when: L.fmtDateTime(m.created_at), what: L.moveInfo(m).label, item: m.item_name + (m.code ? ' ' + m.code : ''), qty: m.amount, by: m.actor_name, note: m.note || undefined })) };
    },
  },
};

/* كتابة (بتظهر كارت «اعملها» الأول) — كل واحدة: check بيجهّز ويتأكد، وexec بينفّذ */
const WRITE = {
  create_job: {
    d: 'استلام عربية: أمر شغل جديد بالشغلانات مقسمة على الموظفين. لو السواق أو العربية مش متسجلين بيتسجلوا',
    p: S_('object', {
      driver: str('اسم صاحب العربية'), driver_phone: str('تليفونه لو سواق جديد'), car: str('العربية (مثلاً E36 أو BMW E46)'),
      kind: en(['setup', 'fab'], 'setup = سيت أب (مساعدين، سوست، سواي بار، تو، زوايا...) / fab = فابريكيشن (سمكرة، لحام، تقطيع، رول كيج...)'),
      title: str('المطلوب باختصار'), tasks: arr(TASK, 'الشغلانات بالتفصيل'), due_date: str('ميعاد التسليم YYYY-MM-DD'), responsible: str('الموظف المسؤول عن العربية'), note: str('ملاحظات'),
    }, ['driver', 'car', 'title']),
    check(a) {
      const out = { a: { ...a } };
      const d = findDriver(a.driver);
      if (d.many) return ambig('سواق', d.many, (x) => x.name + ' ' + x.phone);
      out.driver = d.one || null;
      if (out.driver) {
        const c = findCar(out.driver.id, a.car);
        if (c.many && a.car) return ambig('عربية', c.many, (x) => x.name + ' ' + x.plate);
        out.car = c.one || null;
      }
      const tasks = [];
      for (const t of a.tasks || []) {
        const s = t.staff ? findStaff(t.staff) : null;
        if (s && s.many) return ambig('موظف', s.many, (x) => x.name);
        if (t.staff && s && !s.one) return notFound('موظف', t.staff);
        tasks.push({ title: t.title, staff_id: s && s.one ? s.one.id : null, staff: s && s.one ? s.one.name : '' });
      }
      out.tasks = tasks;
      if (a.responsible) { const s = findStaff(a.responsible); if (!s.one) return s.many ? ambig('موظف', s.many, (x) => x.name) : notFound('موظف', a.responsible); out.staff = s.one; }
      if (out.driver && out.car) { const o = st().data.jobs.find((j) => j.car_id === out.car.id && isOpenJob(j)); if (o) out.warn = 'العربية دي عليها أمر شغل مفتوح ' + o.ref; }
      return { ok: out };
    },
    card(o) {
      return {
        title: 'استلام عربية', icon: 'clip',
        rows: [
          ['صاحبها', o.driver ? o.driver.name : o.a.driver + ' (سواق جديد' + (o.a.driver_phone ? ' · ' + o.a.driver_phone : '') + ')'],
          ['العربية', o.car ? o.car.name : o.a.car + ' (عربية جديدة)'],
          o.a.kind && ['النوع', KIND_JOB[o.a.kind]], ['المطلوب', o.a.title],
          o.a.due_date && ['التسليم', L.fmtDate(o.a.due_date)], o.staff && ['المسؤول', o.staff.name],
        ],
        list: o.tasks.map((t) => t.title + (t.staff ? ' ← ' + t.staff : '')), warn: o.warn,
      };
    },
    async exec(o) {
      let drv = o.driver && o.driver.id, car = o.car && o.car.id;
      if (!drv) drv = await call('save_driver', { p_id: null, p_name: o.a.driver, p_phone: o.a.driver_phone || '', p_note: '' });
      if (!car) car = await call('save_car', { p_id: null, p_driver: drv, p_name: o.a.car, p_plate: '', p_note: '' });
      const r = await call('job_save', { p_id: null, p: { driver_id: drv, car_id: car, kind: o.a.kind || '', title: o.a.title, note: o.a.note || '', staff_id: o.staff ? o.staff.id : null, due_date: o.a.due_date || null, tasks: o.tasks.map((t) => ({ title: t.title, staff_id: t.staff_id })) } });
      return { done: 'أمر الشغل اتعمل ' + r.ref, ref: r.ref, _refs: [['job', r.id, r.ref]] };
    },
  },
  add_tasks: {
    d: 'ضيف شغلانات على أمر شغل موجود (وكل واحدة على موظف لو اتقال)',
    p: S_('object', { job: str('رقم أمر الشغل أو العربية'), tasks: arr(TASK, 'الشغلانات') }, ['job', 'tasks']),
    check(a) {
      const j = findJob(a.job); if (j.many) return ambig('أمر شغل', j.many, (x) => jobOut(x)); if (!j.one) return notFound('أمر شغل', a.job);
      const tasks = [];
      for (const t of a.tasks || []) {
        const s = t.staff ? findStaff(t.staff) : null;
        if (t.staff && !(s && s.one)) return s && s.many ? ambig('موظف', s.many, (x) => x.name) : notFound('موظف', t.staff);
        tasks.push({ title: t.title, staff_id: s ? s.one.id : null, staff: s ? s.one.name : '' });
      }
      return { ok: { job: j.one, tasks } };
    },
    card: (o) => ({ title: 'شغلانات على ' + o.job.ref, icon: 'plus', list: o.tasks.map((t) => t.title + (t.staff ? ' ← ' + t.staff : '')) }),
    async exec(o) {
      for (const t of o.tasks) await call('job_line_add', { p_job: o.job.id, p: { kind: 'task', title: t.title, staff_id: t.staff_id } });
      return { done: 'اتضافت ' + o.tasks.length + ' شغلانة على ' + o.job.ref };
    },
  },
  assign_tasks: {
    d: 'وزّع شغلانات أمر شغل على الموظفين (أو شيلها من على حد)',
    p: S_('object', { job: str('أمر الشغل'), assignments: arr(S_('object', { task: str('الشغلانة (اسمها أو id)'), staff: str('الموظف، أو فاضي = محدش') }, ['task']), 'مين هيعمل إيه') }, ['job', 'assignments']),
    check(a) {
      const j = findJob(a.job); if (j.many) return ambig('أمر شغل', j.many, (x) => jobOut(x)); if (!j.one) return notFound('أمر شغل', a.job);
      const tasks = (j.one.lines || []).filter((l) => l.kind === 'task');
      const list = [];
      for (const x of a.assignments || []) {
        const t = pick(tasks, x.task, (l) => l.title);
        if (!t.one) return t.many ? ambig('شغلانة', t.many, (l) => l.title) : notFound('شغلانة', x.task);
        let s = null;
        if (x.staff) { const r = findStaff(x.staff); if (!r.one) return r.many ? ambig('موظف', r.many, (y) => y.name) : notFound('موظف', x.staff); s = r.one; }
        list.push({ line: t.one, staff: s });
      }
      return { ok: { job: j.one, list } };
    },
    card: (o) => ({ title: 'توزيع الشغل · ' + o.job.ref, icon: 'user', list: o.list.map((x) => x.line.title + ' ← ' + (x.staff ? x.staff.name : 'محدش')) }),
    async exec(o) {
      for (const x of o.list) await call('job_line_assign', { p_id: x.line.id, p_staff: x.staff ? x.staff.id : null });
      return { done: 'الشغل اتوزع' };
    },
  },
  set_skill: {
    d: 'سجّل إن موظف بيعرف يعمل شغلانة معينة (لو الإدارة قالت كده صراحة). ملحوظة: أي شغلانة بتتوزّع على موظف بتتسجل لوحدها إنه بيعرفها',
    p: S_('object', { people: arr(S_('object', { staff: str('الموظف'), skill: str('اللي بيعرف يعمله (كله)، أو فاضي عشان تمسحه') }, ['staff', 'skill']), 'مين شغلته إيه') }, ['people']),
    check(a) {
      const list = [];
      for (const x of a.people || []) {
        const r = findStaff(x.staff); if (!r.one) return r.many ? ambig('موظف', r.many, (y) => y.name) : notFound('موظف', x.staff);
        list.push({ s: r.one, skill: String(x.skill || '').trim() });
      }
      return list.length ? { ok: { list } } : { error: 'مفيش حد' };
    },
    card: (o) => ({ title: 'الموظفين بيعرفوا يعملوا إيه', icon: 'user', list: o.list.map((x) => x.s.name + ' ← ' + (x.skill || 'من غير')) }),
    async exec(o) {
      for (const x of o.list) await call('staff_set_skill', { p_staff: x.s.id, p_skill: x.skill });
      return { done: 'اتحفظت' };
    },
  },
  tasks_done: {
    d: 'علّم إن شغلانات خلصت (أو رجّعها لسه)',
    p: S_('object', { job: str('أمر الشغل'), tasks: arr(str('الشغلانة'), 'الشغلانات، أو ["all"] للكل'), done: bool('true = خلصت') }, ['job', 'tasks']),
    check(a) {
      const j = findJob(a.job); if (j.many) return ambig('أمر شغل', j.many, (x) => jobOut(x)); if (!j.one) return notFound('أمر شغل', a.job);
      const tasks = (j.one.lines || []).filter((l) => l.kind === 'task');
      const sel = [];
      for (const q of a.tasks || []) {
        if (/^(all|الكل|كله)$/i.test(String(q).trim())) { sel.push(...tasks); continue; }
        const t = pick(tasks, q, (l) => l.title); if (!t.one) return t.many ? ambig('شغلانة', t.many, (l) => l.title) : notFound('شغلانة', q);
        sel.push(t.one);
      }
      return { ok: { job: j.one, sel: [...new Set(sel)], done: a.done !== false } };
    },
    card: (o) => ({ title: (o.done ? 'خلصت ✓ · ' : 'لسه · ') + o.job.ref, icon: 'check', list: o.sel.map((l) => l.title) }),
    async exec(o) { for (const l of o.sel) await call('job_line_done', { p_id: l.id, p_done: o.done }); return { done: 'اتعلّم على ' + o.sel.length }; },
  },
  set_job_status: {
    d: 'غيّر حالة العربية: received استلمناها، working شغالين، waiting مستنية قطع، ready جاهزة، delivered اتسلمت، cancelled اتلغت',
    p: S_('object', { job: str('أمر الشغل'), status: en(Object.keys(JOB_ST), 'الحالة') }, ['job', 'status']),
    check(a) {
      const j = findJob(a.job); if (j.many) return ambig('أمر شغل', j.many, (x) => jobOut(x)); if (!j.one) return notFound('أمر شغل', a.job);
      if (!JOB_ST[a.status]) return { error: 'bad_status' };
      const left = (j.one.lines || []).filter((l) => l.kind === 'task' && !l.done).length;
      return { ok: { job: j.one, status: a.status, warn: a.status === 'ready' && left ? `فيه ${left} شغلانة لسه ما اتعلّمش عليها` : '' } };
    },
    card: (o) => ({ title: o.job.ref, icon: 'swap', rows: [['الحالة الجديدة', JOB_ST[o.status].label]], warn: o.warn }),
    async exec(o) {
      await call('job_set_status', { p_id: o.job.id, p_status: o.status });
      const d = o.job.driver_id && st().idx.drivers.get(o.job.driver_id);
      return { done: o.job.ref + ': ' + JOB_ST[o.status].label, _refs: [['job', o.job.id, 'افتح ' + o.job.ref + (d && d.phone ? ' وابعت واتساب' : '')]] };
    },
  },
  add_hours: {
    d: 'سجّل ساعات شغل لموظف على أمر شغل',
    p: S_('object', { job: str('أمر الشغل'), staff: str('الموظف'), hours: num('كام ساعة'), date: str('اليوم YYYY-MM-DD (افتراضي النهارده)'), note: str('ملاحظة') }, ['job', 'hours']),
    check(a) {
      const j = findJob(a.job); if (j.many) return ambig('أمر شغل', j.many, (x) => jobOut(x)); if (!j.one) return notFound('أمر شغل', a.job);
      let s = null; if (a.staff) { const r = findStaff(a.staff); if (!r.one) return r.many ? ambig('موظف', r.many, (y) => y.name) : notFound('موظف', a.staff); s = r.one; }
      if (!(a.hours > 0 && a.hours <= 24)) return { error: 'bad_hours' };
      return { ok: { job: j.one, staff: s, hours: a.hours, date: a.date || L.todayStr(), note: a.note || '' } };
    },
    card: (o) => ({ title: 'ساعات شغل · ' + o.job.ref, icon: 'timer', rows: [['مين', o.staff ? o.staff.name : 'إنت'], ['الساعات', String(o.hours)], ['اليوم', L.fmtDate(o.date)]] }),
    async exec(o) { await call('job_hours_add', { p_job: o.job.id, p: { staff_id: o.staff ? o.staff.id : null, hours: o.hours, work_date: o.date, note: o.note } }); return { done: 'الساعات اتسجلت' }; },
  },
  add_material: {
    d: 'سجّل خامة اتصرفت على أمر شغل (سلك لحام، أرجون، مواسير...)',
    p: S_('object', { job: str('أمر الشغل'), name: str('الخامة'), qty: num('الكمية'), unit: str('الوحدة') }, ['job', 'name']),
    check(a) {
      const j = findJob(a.job); if (j.many) return ambig('أمر شغل', j.many, (x) => jobOut(x)); if (!j.one) return notFound('أمر شغل', a.job);
      const pi = st().data.price_items.filter((x) => x.kind === 'material'); const m = pick(pi, a.name, (x) => x.name + ' | ' + x.name_en);
      return { ok: { job: j.one, name: a.name, qty: a.qty > 0 ? a.qty : 1, unit: a.unit || '', pi: m.one || null } };
    },
    card: (o) => ({ title: 'خامة · ' + o.job.ref, icon: 'box', rows: [['الخامة', o.pi ? o.pi.name : o.name], ['الكمية', o.qty + (o.unit ? ' ' + o.unit : '')]] }),
    async exec(o) { await call('job_line_add', { p_job: o.job.id, p: o.pi ? { kind: 'material', price_item_id: o.pi.id, qty: o.qty } : { kind: 'material', title: o.name, qty: o.qty, unit: o.unit } }); return { done: 'اتسجلت' }; },
  },
  create_invoice: {
    d: 'اعمل فاتورة جاهزة PDF. البنود من ليستة الأسعار (price_item_id أو product_id من أداة prices) أو بند بسعر مكتوب. لو بند ملوش سعر اسأل المستخدم',
    inv: true,
    p: S_('object', {
      to: str('اسم العميل: سواق أو عميل تصدير أو حد جديد'), phone: str('تليفون لو حد جديد'), car: str('عربية السواق (اختياري)'), job: str('أمر الشغل لو الفاتورة عليه (اختياري)'),
      lang: en(['ar', 'en'], 'لغة الفاتورة'), currency: en(['EGP', 'USD'], 'العملة'),
      lines: arr(S_('object', { name: str('البند'), qty: num('الكمية'), price: num('سعر الوحدة بعملة الفاتورة (لو مكتوب أو مختلف عن الليستة)'), price_item_id: str('من الليستة'), product_id: str('منتج من الليستة') }, ['name']), 'البنود'),
      discount: num('خصم (مبلغ)'), tax_pct: num('ضريبة %'), notes: str('ملاحظات'),
    }, ['to', 'lines']),
    async check(a) {
      const { data, idx } = st(); const S = data.settings;
      const lang = a.lang || 'ar', cur = a.currency || (lang === 'en' ? 'USD' : 'EGP');
      const inv = { inv_date: L.todayStr(), lang, currency: cur, bill: { name: a.to, phone: a.phone || '', address: '', country: '', extra: '' }, notes: a.notes || '', discount: a.discount || 0, tax_pct: a.tax_pct != null ? a.tax_pct : Number(S.inv_tax || 0), terms: (lang === 'en' ? S.inv_terms_en : S.inv_terms_ar) || '', show_payment: cur === 'USD' && !!S.inv_payment, show_rate: true };
      const d = findDriver(a.to), c = findCustomer(a.to);
      if (d.one) {
        inv.driver_id = d.one.id; inv.bill.name = d.one.name; inv.bill.phone = d.one.phone || '';
        const car = findCar(d.one.id, a.car); if (car.one) inv.bill.extra = (lang === 'en' ? 'Car: ' : 'العربية: ') + [car.one.name, car.one.plate].filter(Boolean).join(' · ');
      } else if (c.one) {
        Object.assign(inv, { customer_id: c.one.id }); inv.bill = { name: c.one.name, phone: c.one.phone || '', address: c.one.address || '', country: c.one.country || '', extra: c.one.email || '' };
      } else if (d.many || c.many) return ambig('عميل', [...(d.many || []), ...(c.many || [])], (x) => [x.name, x.phone, x.country].filter(Boolean).join(' · '));
      if (a.job) { const j = findJob(a.job); if (j.one) { inv.job_id = j.one.id; if (!inv.notes) inv.notes = (lang === 'en' ? 'Job ' : 'أمر شغل ') + j.one.ref; } }
      let rate = null; const needRate = () => rate || (rate = usdRate());
      const lines = [], missing = [];
      for (const l of a.lines || []) {
        const qty = l.qty > 0 ? l.qty : 1;
        let src = null;
        if (l.product_id) { const i = idx.items.get(l.product_id); if (i) src = { kind: 'product', ref_id: i.id, part_no: i.part_no || '', desc_ar: i.name, desc_en: i.name_en || i.name, unit: '', src_price: i.price != null ? Number(i.price) : null, src_cur: i.price_cur || 'USD' }; }
        if (!src && l.price_item_id) { const x = idx.priceItems.get(l.price_item_id); if (x) src = { kind: x.kind, ref_id: x.id, part_no: x.part_no || '', desc_ar: x.name, desc_en: x.name_en || x.name, unit: x.unit || '', src_price: x.price != null ? Number(x.price) : null, src_cur: x.price_cur || 'EGP' }; }
        if (!src) src = { kind: 'free', ref_id: null, part_no: '', desc_ar: l.name, desc_en: l.name, unit: '', src_price: null, src_cur: cur };
        let price = l.price != null && l.price !== '' ? Number(l.price) : null, manual = price != null;
        if (price == null && src.src_price != null) {
          price = src.src_cur === cur ? src.src_price : conv(src.src_price, src.src_cur, cur, await needRate());
        }
        if (price == null) { missing.push(l.name); continue; }
        if (src.src_cur !== cur || (src.kind === 'free' && cur === 'USD')) await needRate();
        lines.push({ ...src, desc: lang === 'en' ? src.desc_en : src.desc_ar, qty, price: r2(price), manual });
      }
      if (missing.length) return { error: 'missing_price', lines: missing, hint: 'اسأل المستخدم عن سعر البنود دي' };
      if (!lines.length) return { error: 'invoice_empty' };
      inv.rate = rate ? await rate : null;
      inv.show_rate = !!inv.rate;
      inv.lines = lines;
      const sub = L.sum(lines, (l) => r2(l.qty * l.price)); const disc = Math.min(Math.max(Number(inv.discount) || 0, 0), sub);
      inv._total = r2(sub - disc + r2(((sub - disc) * Number(inv.tax_pct)) / 100));
      return { ok: inv };
    },
    card(v) {
      const m = (n) => L.bidi(r2(n).toLocaleString('en-US'), v.currency === 'USD' ? '$' : 'ج');
      return { title: 'فاتورة لـ ' + v.bill.name, icon: 'file', list: v.lines.map((l) => l.desc + ' — ' + r2(l.qty) + ' × ' + m(l.price)),
        rows: [Number(v.discount) > 0 && ['خصم', m(v.discount)], Number(v.tax_pct) > 0 && ['ضريبة', v.tax_pct + '%'], ['الإجمالي', m(v._total)], ['اللغة', v.lang === 'en' ? 'English' : 'عربي']],
        edit: () => openSheet(InvoiceForm, { preset: v }) };
    },
    async exec(v) {
      const { _total, ...p } = v;
      const r = await call('invoice_save', { p_id: null, p });
      await reload().catch(() => {});
      return { done: 'الفاتورة اتعملت ' + r.ref, ref: r.ref, _invoice: r.id, _refs: [['invoice', r.id, r.ref]] };
    },
  },
  set_invoice_paid: {
    d: 'علّم إن فاتورة اتدفعت (أو لسه)', inv: true,
    p: S_('object', { invoice: str('رقم الفاتورة أو اسم العميل'), paid: bool('اتدفعت؟') }, ['invoice']),
    check(a) { const r = pick(st().data.invoices, a.invoice, (v) => v.ref + ' | ' + (v.bill && v.bill.name)); if (!r.one) return r.many ? ambig('فاتورة', r.many, (v) => v.ref + ' ' + v.bill.name) : notFound('فاتورة', a.invoice); return { ok: { v: r.one, paid: a.paid !== false } }; },
    card: (o) => ({ title: o.v.ref, icon: 'check', rows: [['العميل', o.v.bill.name], ['', o.paid ? 'اتدفعت ✓' : 'لسه ما اتدفعتش']] }),
    async exec(o) { await call('invoice_set_paid', { p_id: o.v.id, p_paid: o.paid }); return { done: 'اتعلّم' }; },
  },
  item_move: {
    d: 'حركة على قطعة أو عدة أو منتج: in دخول/زيادة/اتصنع، out خروج (مع السبب)، adjust جرد (العدد الصح). للتركيب على عربية استخدم open بـ install',
    p: S_('object', { item: str('الكود أو الاسم'), type: en(['in', 'out', 'adjust'], 'نوع الحركة'), qty: num('الكمية (في الجرد = العدد الصح)'), note: str('السبب أو ملاحظة') }, ['item', 'type', 'qty']),
    check(a) {
      const r = findItem(a.item); if (r.many) return ambig('حاجة', r.many, (i) => itemOut(i)); if (!r.one) return notFound('حاجة', a.item);
      if (a.type === 'out' && a.qty > r.one.qty) return { error: 'not_enough', in_garage: r.one.qty };
      return { ok: { i: r.one, type: a.type, qty: Math.round(a.qty), note: a.note || '' } };
    },
    card: (o) => ({ title: { in: L.IN_LABEL[o.i.kind] || 'دخول', out: 'خروج', adjust: 'جرد' }[o.type] + ' · ' + o.i.name, icon: o.type === 'out' ? 'out' : 'in',
      rows: [['الكود', o.i.code || '—'], [o.type === 'adjust' ? 'العدد الصح' : 'الكمية', String(o.qty)], ['دلوقتي', String(o.i.qty)], o.note && ['ملاحظة', o.note]] }),
    async exec(o) { const n = await call('item_move', { p_item: o.i.id, p_type: o.type, p_qty: o.qty, p_note: o.note }); return { done: 'اتسجلت · بقى ' + n, _refs: [['item', o.i.id, o.i.name]] }; },
  },
  save_driver: {
    d: 'سجّل سواق جديد (ومعاه عربية لو اتقالت)',
    p: S_('object', { name: str('الاسم'), phone: str('التليفون'), car: str('العربية (اختياري)'), plate: str('اللوحة') }, ['name']),
    check(a) { const d = findDriver(a.name); return { ok: { a, warn: d.one ? 'فيه سواق متسجل بنفس الاسم: ' + d.one.name : '' } }; },
    card: (o) => ({ title: 'سواق جديد', icon: 'user', rows: [['الاسم', o.a.name], o.a.phone && ['التليفون', o.a.phone], o.a.car && ['العربية', o.a.car + (o.a.plate ? ' · ' + o.a.plate : '')]], warn: o.warn }),
    async exec(o) {
      const id = await call('save_driver', { p_id: null, p_name: o.a.name, p_phone: o.a.phone || '', p_note: '' });
      if (o.a.car) await call('save_car', { p_id: null, p_driver: id, p_name: o.a.car, p_plate: o.a.plate || '', p_note: '' });
      return { done: 'السواق اتسجل', _refs: [['driver', id, o.a.name]] };
    },
  },
  add_car: {
    d: 'ضيف عربية لسواق موجود',
    p: S_('object', { driver: str('السواق'), car: str('العربية'), plate: str('اللوحة') }, ['driver', 'car']),
    check(a) { const d = findDriver(a.driver); if (!d.one) return d.many ? ambig('سواق', d.many, (x) => x.name) : notFound('سواق', a.driver); return { ok: { d: d.one, a } }; },
    card: (o) => ({ title: 'عربية جديدة لـ ' + o.d.name, icon: 'car', rows: [['العربية', o.a.car], o.a.plate && ['اللوحة', o.a.plate]] }),
    async exec(o) { await call('save_car', { p_id: null, p_driver: o.d.id, p_name: o.a.car, p_plate: o.a.plate || '', p_note: '' }); return { done: 'العربية اتضافت' }; },
  },
  create_trip: {
    d: 'طلعة جديدة (سباق / تمرين / طلعة) ومعاها ليستة جاهزة لو فيه',
    p: S_('object', { name: str('اسم الطلعة'), kind: en(['race', 'practice', 'other'], 'race سباق، practice تمرين'), place: str('المكان'), date: str('YYYY-MM-DD'), template: str('اسم الليستة الجاهزة (اختياري)') }, ['name']),
    check(a) {
      let tp = null;
      if (a.template) { const r = pick(st().data.templates, a.template, (t) => t.name); if (!r.one) return r.many ? ambig('ليستة', r.many, (t) => t.name) : notFound('ليستة', a.template); tp = r.one; }
      return { ok: { a, tp } };
    },
    card: (o) => ({ title: 'طلعة جديدة', icon: 'flag', rows: [['الاسم', o.a.name], ['النوع', L.TRIP_KIND[o.a.kind || 'race'].label], o.a.place && ['المكان', o.a.place], ['اليوم', L.fmtDate(o.a.date || L.todayStr())], o.tp && ['الليستة', o.tp.name + ' (' + o.tp.items.length + ')']] }),
    async exec(o) {
      const id = await call('trip_save', { p_id: null, p: { kind: o.a.kind || 'race', name: o.a.name, place: o.a.place || '', trip_date: o.a.date || '', note: '' } });
      let short = [];
      if (o.tp) short = await call('trip_apply_template', { p_trip: id, p_template: o.tp.id });
      return { done: 'الطلعة اتعملت', missing_from_garage: short && short.length ? short : undefined, _refs: [['trip', id, o.a.name]] };
    },
  },
  create_shipment: {
    d: 'شحنة تصدير جديدة لعميل (موجود أو جديد) بالمنتجات',
    p: S_('object', {
      customer: str('اسم العميل'), country: str('البلد لو جديد'), phone: str('تليفون'), email: str('إيميل'), address: str('العنوان'),
      items: arr(S_('object', { item: str('المنتج (اسم أو رقم قطعة)'), qty: num('العدد') }, ['item', 'qty']), 'اللي في الشحنة'), note: str('ملاحظة'),
    }, ['customer']),
    check(a) {
      const c = findCustomer(a.customer); if (c.many) return ambig('عميل', c.many, (x) => x.name + ' ' + x.country);
      const items = [];
      for (const x of a.items || []) {
        const r = findItem(x.item, ['product', 'part']); if (!r.one) return r.many ? ambig('منتج', r.many, (i) => itemOut(i)) : notFound('منتج', x.item);
        if (x.qty > r.one.qty) return { error: 'not_enough', item: r.one.name, in_stock: r.one.qty };
        items.push({ i: r.one, qty: Math.round(x.qty) });
      }
      return { ok: { a, c: c.one || null, items } };
    },
    card: (o) => ({ title: 'شحنة جديدة', icon: 'globe', rows: [['العميل', o.c ? o.c.name : o.a.customer + ' (جديد' + (o.a.country ? ' · ' + o.a.country : '') + ')']], list: o.items.map((x) => x.i.name + ' × ' + x.qty) }),
    async exec(o) {
      const p = { note: o.a.note || '', items: o.items.map((x) => ({ item_id: x.i.id, qty: x.qty })) };
      if (o.c) p.customer_id = o.c.id; else p.customer = { name: o.a.customer, country: o.a.country || '', phone: o.a.phone || '', email: o.a.email || '', address: o.a.address || '' };
      const id = await call('shipment_create', { p });
      return { done: 'الشحنة اتعملت', _refs: [['shipment', id, 'افتح الشحنة']] };
    },
  },
};

/* فتح شاشة في الابلكيشن (من غير تأكيد) — للحاجات اللي محتاجة كاميرا أو اختيارات كتير */
const OPEN = {
  open: {
    d: 'افتح شاشة في الابلكيشن للمستخدم: item قطعة، job أمر شغل، driver سواق، trip طلعة، shipment شحنة، invoice فاتورة، install تركيب قطعة على عربية، new_item تسجيل حاجة جديدة، scan سكان QR، log السجل، new_job/new_trip/new_shipment/new_invoice فورم فاضي',
    p: S_('object', { what: en(['item', 'job', 'driver', 'trip', 'shipment', 'invoice', 'install', 'new_item', 'scan', 'log', 'new_job', 'new_trip', 'new_shipment', 'new_invoice'], 'الشاشة'), ref: str('الحاجة (كود، اسم، رقم)'), car: str('للتركيب: العربية') }, ['what']),
    run({ what, ref, car }) {
      const { data } = st();
      const go = (C, p) => { setTimeout(() => openSheet(C, p), 50); return { done: 'اتفتحت' }; };
      if (what === 'scan') { setTimeout(scanOpen, 50); return { done: 'السكان اتفتح' }; }
      if (what === 'log') return go(LogSheet, {});
      if (what === 'new_job') return go(JobForm, {});
      if (what === 'new_trip') return go(TripForm, {});
      if (what === 'new_shipment') return go(ShipmentForm, {});
      if (what === 'new_invoice') return canInvoice() ? go(InvoiceForm, {}) : { error: 'invoice_only' };
      if (what === 'new_item') { setTimeout(() => startNewItem({}), 50); return { done: 'اتفتح' }; }
      if (what === 'item' || what === 'install') {
        const r = findItem(ref); if (!r.one) return r.many ? ambig('حاجة', r.many, (i) => itemOut(i)) : notFound('حاجة', ref);
        if (what === 'install') {
          let carId = null, drv = r.one.driver_id;
          if (car) { const all = data.cars; const c = pick(drv ? all.filter((x) => x.driver_id === drv) : all, car, (x) => x.name + ' | ' + x.plate + ' ' + ((st().idx.drivers.get(x.driver_id) || {}).name || '')); if (c.one) { carId = c.one.id; drv = c.one.driver_id; } }
          return go(InstallForm, { id: r.one.id, carId, driverId: drv });
        }
        return go(ItemSheet, { id: r.one.id });
      }
      if (what === 'job') { const r = findJob(ref); return r.one ? go(JobSheet, { id: r.one.id }) : r.many ? ambig('أمر شغل', r.many, (x) => jobOut(x)) : notFound('أمر شغل', ref); }
      if (what === 'driver') { const r = findDriver(ref); return r.one ? go(DriverSheet, { id: r.one.id }) : r.many ? ambig('سواق', r.many, (x) => x.name) : notFound('سواق', ref); }
      if (what === 'trip') { const r = pick(data.trips, ref, (t) => t.name); return r.one ? go(TripSheet, { id: r.one.id }) : notFound('طلعة', ref); }
      if (what === 'shipment') { const r = pick(data.shipments, ref, (s) => s.ref + ' | ' + ((st().idx.customers.get(s.customer_id) || {}).name || '')); return r.one ? go(ShipmentSheet, { id: r.one.id }) : notFound('شحنة', ref); }
      if (what === 'invoice') { const r = pick(data.invoices, ref, (v) => v.ref + ' | ' + (v.bill && v.bill.name)); return r.one ? go(InvoiceSheet, { id: r.one.id }) : notFound('فاتورة', ref); }
      return { error: 'unknown' };
    },
  },
};

const allowed = (t) => !t.inv || canInvoice();
function toolDecls() {
  const out = [];
  for (const g of [READ, WRITE, OPEN]) for (const [name, t] of Object.entries(g)) if (allowed(t)) out.push({ name, description: t.d, ...(t.p ? { parameters: t.p } : {}) });
  return out;
}

/* ============================================================ تعليمات المساعد */
function systemText() {
  const { data, idx } = st();
  const me = data.me;
  const drivers = data.drivers.slice(0, 250).map((d) => d.name + ((idx.carsByDriver.get(d.id) || []).length ? ' [' + idx.carsByDriver.get(d.id).map((c) => c.name).join('، ') + ']' : '')).join(' · ');
  return `إنت «المدير»، مساعد جراش AF Fabworks جوه ابلكيشن AF Parts. الجراش في العاشر من رمضان: فابريكيشن وتجهيز عربيات دريفت، تصنيع قطع وتصديرها (كيت زاوية ANG، قواعد ماتور ENG، دراعات ARM، ضبط تو TOE، رول كيج CAG، تعليق SUS، شاسيه CHS)، صيانة عربيات السواقين، وطلعات سباق وتمرين.

النهارده ${L.todayStr()} (${L.fmtDate(L.todayStr())}). اللي بيكلمك: ${me.kind === 'admin' ? 'الإدارة' : me.name + ' (موظف)'}${canInvoice() ? '، ومعاه صلاحية الفواتير والأسعار' : '، ومعندوش صلاحية فواتير أو أسعار (ما تقولش أسعار خالص)'}.
الموظفين واللي كل واحد بيعرف يعمله (المدير بيتعلمه لوحده من الشغل اللي اتوزع عليه قبل كده): ${data.staff.map((s) => s.name + ' [' + (s.skill || 'لسه مفيش') + ']').join(' · ') || 'مفيش'}.
السواقين وعربياتهم: ${drivers || 'مفيش'}.

طريقتك:
- رد بنفس لغة المستخدم: عربي مصري لو كتب عربي، وإنجليزي لو كتب إنجليزي. كلامك قصير ومباشر زي مدير جراش فاهم شغله. من غير مقدمات.
- اللي في الجراش اسمهم «موظفين» مش «عمال». «صالة» يعني ساب فريم (مثلاً «صالة أمامي كاملة»). «كرونة» = الدفرنس.
- أي معلومة لازم تجيبها من الأدوات، وما تألفش حاجة. «فين كذا؟» أو «عندنا كذا؟» → find، وقول المكان والكمية وبتاعة مين.
- لما المستخدم يطلب حاجة تتعمل، نادي الأداة على طول. الابلكيشن بيعرض عليه كارت يوافق عليه، فما تسألوش «متأكد؟». وبعد ما تتعمل قول النتيجة في سطر.
- لو الأداة رجّعت ambiguous اسأل يقصد أنهي واحد. ولو not_found قول كده واقترح.
- استلام عربية: اسأل الأول «سيت أب ولا فابريكيشن؟» لو مش واضح. السيت أب زي: تغيير مساعدين، تغيير سوست المساعدين، تركيب سواي بار، ضبط تو، ضبط كامبر وزوايا، ضبط ارتفاع، كوينات. الفابريكيشن زي: سمكرة، لحام، تقطيع، رول كيج، تقوية شاسيه، صالة، قواعد ماتور، كيت زاوية. بعدين اسأل «هتعمل فيها إيه بالظبط؟»، وشوف past_jobs الأول: لو فيه شغل شبهها قبل كده، قسّمها بنفس الشغلانات ونفس الترتيب، واقترح نفس الموظفين، وقول المتوقع (ساعات وأيام) من غير ما تسأل كتير. وقسّم الكلام لشغلانات صغيرة واضحة، واقترح كل شغلانة على موظف: الأول للي عمل الشغلانة دي أو شبهها قبل كده، ولو فيه أكتر من واحد ينفع اختار الأفضى (شوف staff_work)، واسأل عن ميعاد التسليم. لما تبقى عارف السواق والعربية والشغل، اعمل create_job.
- توزيع الشغل: كل شغلانة اقترحها على الموظف اللي عملها أو عمل حاجة شبهها قبل كده (من اللي بين [] جنب اسمه، ومن past_jobs). لو أكتر من واحد يعرفها، اختار الأفضى (staff_work). لو محدش عملها قبل كده، اقترح وقول إنها أول مرة. ولما الإدارة تقول «أسامة هيعمل كذا» نفّذ على طول، والسيستم هيفتكر إن أسامة بيعرفها. لو قالت صراحة «فلان بيعرف كذا» من غير شغل، سجّلها بـ set_skill.
- الفواتير: هات الأسعار من prices الأول واستخدم price_item_id أو product_id. السواقين غالباً بالجنيه وعربي، وعملاء التصدير بالدولار وإنجليزي. لو بند ملوش سعر اسأل عليه. بعد ما الفاتورة تتعمل، الابلكيشن بيطلّع زرار PDF يتبعت واتساب.
- مسح أي حاجة أو التراجع عن حركة مش من عندك: قول للمستخدم يعملها من الابلكيشن (للإدارة بس).
- التركيب على عربية والصور والاستيكرات: افتح الشاشة بأداة open.
- التواريخ اكتبها YYYY-MM-DD في الأدوات. «بكرة» = ${L.addDays(L.todayStr(), 1)}.`;
}

/* ============================================================ الكلام مع السيرفر */
let HIST = [];          // كلام Gemini (contents)
let MSGS = [];          // اللي ظاهر في الشات
let BUSY = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function push(m) { MSGS = [...MSGS, { id: Date.now() + Math.random(), ...m }]; emit(); return MSGS[MSGS.length - 1].id; }
// كل واحد شاته لوحده: لو اللي داخل على الموبايل اتغيّر، الشات يتمسح
let OWNER = null;
function ownerCheck() {
  const me = (getStore().data || {}).me || {};
  const k = me.kind === 'admin' ? 'admin' : (me.id || me.name || '');
  if (OWNER !== null && OWNER !== k) { HIST = []; MSGS = []; BUSY = false; }
  OWNER = k;
}
function patch(id, p) { MSGS = MSGS.map((m) => (m.id === id ? { ...m, ...p } : m)); emit(); }

// ترتيب موديلات Gemini (الأسرع الأول). السيرفر بيجرب اللي بعده لو واحد مش متاح.
const AI_MODELS = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
async function askAI(contents) {
  let auth = 'Bearer ' + SUPABASE_KEY;
  try { const { data } = await sb.auth.getSession(); if (data && data.session) auth = 'Bearer ' + data.session.access_token; } catch (e) { /* موظف */ }
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(SUPABASE_URL + '/functions/v1/ai', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: auth },
      body: JSON.stringify({ token: staffSession.token || '', models: AI_MODELS, system: systemText(), tools: toolDecls(), contents }),
    });
    const j = await r.json().catch(() => ({ error: 'http_' + r.status }));
    if (!r.ok || j.error) { const e = new Error(j.error || 'http_' + r.status); e.detail = j.detail || ''; throw e; }
    return j.content || { role: 'model', parts: [] };
  } finally { clearTimeout(tm); }
}
const AI_ERR = {
  quota: 'خلصت رسايل الـ AI المجانية النهارده. الزراير والبحث شغالين، والـ AI بيرجع بكرة.',
  no_key: 'المساعد لسه متوصلش بمفتاح Gemini (Supabase ← Edge Functions ← Secrets).',
  unauthorized: 'الجلسة انتهت، اخرج وادخل تاني.',
};
const aiErrText = (e) => {
  const m = (e && e.message) || '';
  if (AI_ERR[m]) return AI_ERR[m];
  if (/http_404|Failed to fetch|NetworkError|Load failed|abort/i.test(m)) return 'المساعد الذكي مش متاح دلوقتي (يا إما مفيش نت، يا إما لسه ما اتركبش على Supabase). [' + m.slice(0, 40) + ']';
  return 'المساعد الذكي وقع: ' + m.slice(0, 40) + (e && e.detail ? ' — ' + String(e.detail).slice(0, 160) : '');
};

/* نقصّ الكلام القديم عشان الطلب ما يكبرش (من أول رسالة مستخدم عادية) */
function trimmed() {
  if (HIST.length <= 24) return HIST;
  for (let k = HIST.length - 24; k < HIST.length; k++) {
    const m = HIST[k];
    if (m.role === 'user' && m.parts.some((p) => p.text)) return HIST.slice(k);
  }
  return HIST.slice(-24);
}
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));

/* الكارت: يستنى المستخدم يوافق أو يرفض */
function askConfirm(card) {
  return new Promise((resolve) => { push({ kind: 'confirm', card, state: 'wait', resolve }); });
}

async function runTool(fc) {
  const name = fc.name, args = fc.args || {};
  const refs = [];
  try {
    if (READ[name] && allowed(READ[name])) { const r = await READ[name].run(args); if (r._refs) refs.push(...r._refs); return { r, refs }; }
    if (OPEN[name]) return { r: OPEN[name].run(args), refs };
    const W = WRITE[name];
    if (!W || !allowed(W)) return { r: { error: 'not_allowed' }, refs };
    const c = await W.check(args);
    if (!c.ok) return { r: c, refs };
    const ok = await askConfirm(W.card(c.ok));
    if (!ok) return { r: { cancelled: true, note: 'المستخدم رفض أو عايز يغيّر حاجة — اسأله عايز إيه' }, refs };
    const r = await W.exec(c.ok);
    reload().catch(() => {});
    if (r._refs) refs.push(...r._refs);
    if (r._invoice) push({ kind: 'invoice', invId: r._invoice });
    return { r, refs };
  } catch (e) {
    return { r: { error: errText(e) }, refs };
  }
}

export async function send(text) {
  text = String(text || '').trim();
  ownerCheck();
  if (!text || BUSY) return;
  BUSY = true; emit();
  push({ kind: 'me', text });
  HIST.push({ role: 'user', parts: [{ text }] });
  const thinking = push({ kind: 'wait' });
  const turnRefs = [];
  try {
    for (let step = 0; step < 8; step++) {
      const content = await askAI(trimmed());
      const parts = (content.parts || []).filter((p) => !p.thought);
      HIST.push({ role: 'model', parts: content.parts && content.parts.length ? content.parts : [{ text: '...' }] });
      const say = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim();
      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      if (say) push({ kind: 'ai', text: say });
      if (!calls.length) break;
      const resp = [], refs = [];
      for (const fc of calls) {
        const { r, refs: rf } = await runTool(fc);
        refs.push(...rf);
        resp.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: { result: clean(r) } } });
      }
      turnRefs.push(...refs);
      HIST.push({ role: 'user', parts: resp });
    }
  } catch (e) {
    HIST.pop(); // الرسالة اللي ما اتردش عليها
    while (HIST.length && HIST[HIST.length - 1].role !== 'user') HIST.pop();
    if (HIST.length && HIST[HIST.length - 1].parts.some((p) => p.functionResponse)) HIST = [];
    push({ kind: 'err', text: aiErrText(e) });
    localAnswer(text);
  }
  MSGS = MSGS.filter((m) => m.id !== thinking);
  if (turnRefs.length) push({ kind: 'refs', refs: dedupe(turnRefs).slice(0, 6) });
  BUSY = false; emit();
}
const dedupe = (refs) => { const s = new Set(); return refs.filter((r) => { const k = r[0] + r[1]; if (s.has(k)) return false; s.add(k); return true; }); };

/* من غير AI: بحث عادي في السيستم */
function localAnswer(text) {
  const q = words(text).join(' ');
  if (!q) return;
  const r = READ.find.run({ query: q });
  if (r.items.length) push({ kind: 'local', items: r.items.slice(0, 8) });
  else push({ kind: 'ai', text: 'مش لاقي حاجة باسم «' + q + '» في الجراش.' });
}

/* زراير سريعة — شغالة من غير AI */
function quick() {
  const { data } = st();
  const late = data.jobs.filter(isLate);
  const q = [
    ['clip', 'عربية داخلة', () => openSheet(JobForm, {})],
    ['scan', 'سكان', scanOpen],
    canInvoice() && ['file', 'فاتورة جديدة', () => openSheet(InvoiceForm, {})],
    ['alert', 'المتأخر' + (late.length ? ' (' + late.length + ')' : ''), () => showLocal('late')],
    ['user', 'الشغل على مين', () => showLocal('staff')],
    ['flag', 'طلعة جديدة', () => openSheet(TripForm, {})],
    ['globe', 'شحنة جديدة', () => openSheet(ShipmentForm, {})],
    ['history', 'السجل', () => openSheet(LogSheet, {})],
  ];
  return q.filter(Boolean);
}
function showLocal(what) {
  if (what === 'late') {
    const r = READ.list_jobs.run({ filter: 'late' });
    push({ kind: 'ai', text: r.count ? 'العربيات المتأخرة:\n' + r.jobs.map((j) => `• ${j.ref} ${j.car} (${j.driver}) — ${j.status}، التسليم كان ${j.due}`).join('\n') : 'مفيش عربيات متأخرة 👌' });
    if (r._refs.length) push({ kind: 'refs', refs: r._refs });
  } else {
    const r = READ.staff_work.run({});
    const lines = r.staff.map((s) => `• ${s.name}: ${s.open_tasks.length ? s.open_tasks.join('، ') : 'فاضي'}`);
    if (r.unassigned.length) lines.push(`• من غير موظف: ${r.unassigned.join('، ')}`);
    push({ kind: 'ai', text: lines.length ? lines.join('\n') : 'مفيش موظفين متسجلين' });
  }
}

function openRef([type, id]) {
  const m = { item: [ItemSheet, { id }], job: [JobSheet, { id }], driver: [DriverSheet, { id }], trip: [TripSheet, { id }], shipment: [ShipmentSheet, { id }], invoice: [InvoiceSheet, { id }] }[type];
  if (m) openSheet(m[0], m[1]);
}
const REF_IC = { item: 'box', job: 'clip', driver: 'user', trip: 'flag', shipment: 'globe', invoice: 'file' };

/* ============================================================ الشاشة */
function useChat() {
  const [, f] = useState(0);
  useEffect(() => { const g = () => f((x) => x + 1); subs.add(g); return () => subs.delete(g); }, []);
}

function ConfirmCard({ m }) {
  const c = m.card;
  const answer = (v) => { if (m.state !== 'wait') return; patch(m.id, { state: v ? 'yes' : 'no' }); m.resolve(v); };
  return html`<div class=${'ai-card ' + m.state}>
    <div class="ai-card-h"><${Icon} name=${c.icon || 'info'} size=${18} /><b>${c.title}</b></div>
    ${(c.rows || []).filter(Boolean).map(([k, v]) => html`<div class="ai-kv"><span>${k}</span><b dir="auto">${v}</b></div>`)}
    ${c.list && c.list.length > 0 && html`<ul class="ai-list">${c.list.map((x) => html`<li dir="auto">${x}</li>`)}</ul>`}
    ${c.warn && html`<div class="note warn"><${Icon} name="alert" size=${16} /><span>${c.warn}</span></div>`}
    ${m.state === 'wait' ? html`<div class="ai-card-btns">
        <button class="btn sm green" onClick=${() => answer(true)}><${Icon} name="check" size=${18} /> اعملها</button>
        ${c.edit && html`<button class="btn sm ghost" onClick=${() => { answer(false); c.edit(); }}><${Icon} name="edit" size=${17} /> عدّل بإيدك</button>`}
        <button class="btn sm ghost" onClick=${() => answer(false)}>لأ</button></div>`
      : html`<div class="ai-card-st">${m.state === 'yes' ? '✓ اتعملت' : 'اتلغت'}</div>`}
  </div>`;
}

function InvoiceMsg({ m }) {
  const { idx } = useStore();
  const v = idx.invoices.get(m.invId);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!v) return html`<div class="ai-card"><${Spinner} /></div>`;
  async function make() { setBusy(true); try { setFile(await invoiceFile(v)); } catch (e) { toast(errText(e), 'bad'); } setBusy(false); }
  return html`<div class="ai-card yes">
    <div class="ai-card-h"><${Icon} name="file" size=${18} /><b>${v.ref} · ${v.bill && v.bill.name}</b></div>
    ${file ? html`<${FileReady} file=${file} text=${'Invoice ' + v.ref} />`
      : html`<button class="btn dark" disabled=${busy} onClick=${make}>${busy ? 'بجهّز...' : html`<${Icon} name="file" size=${20} /> الفاتورة PDF (ابعتها واتساب)`}</button>`}
    <button class="linkbtn" onClick=${() => openSheet(InvoiceSheet, { id: v.id })}>افتح الفاتورة</button>
  </div>`;
}

function Msg({ m }) {
  if (m.kind === 'me') return html`<div class="ai-msg me" dir="auto">${m.text}</div>`;
  if (m.kind === 'ai') return html`<div class="ai-msg bot" dir="auto">${String(m.text || '').split(/\*\*(.+?)\*\*/g).map((x, i) => (i % 2 ? html`<b>${x}</b>` : x.replace(/^\s*[*-]\s+/gm, '• ')))}</div>`;
  if (m.kind === 'err') return html`<div class="ai-msg err"><${Icon} name="alert" size=${16} /> ${m.text}</div>`;
  if (m.kind === 'wait') return MSGS.some((x) => x.kind === 'confirm' && x.state === 'wait') ? null : html`<div class="ai-msg bot wait"><i></i><i></i><i></i></div>`;
  if (m.kind === 'confirm') return html`<${ConfirmCard} m=${m} />`;
  if (m.kind === 'invoice') return html`<${InvoiceMsg} m=${m} />`;
  if (m.kind === 'refs') return html`<div class="ai-refs">${m.refs.map((r) => html`<button class="chip" onClick=${() => openRef(r)}><${Icon} name=${REF_IC[r[0]] || 'chev'} size=${14} /> ${r[2]}</button>`)}</div>`;
  if (m.kind === 'local') return html`<div class="ai-card"><div class="ai-card-h"><${Icon} name="search" size=${18} /><b>لقيت في الجراش</b></div>
    ${m.items.map((i) => html`<button class="lrow" onClick=${() => openSheet(ItemSheet, { id: i.id })}><span class="grow"><b>${i.name}${i.size ? ' · ' + i.size : ''}</b><small>${L.bidi(i.code, i.owner, i.location, 'العدد ' + i.qty_in_garage)}</small></span><${Icon} name="chev" size=${16} /></button>`)}</div>`;
  return null;
}

export function AssistantSheet({ close, first }) {
  ownerCheck();
  useChat();
  useStore();
  const [t, setT] = useState('');
  const end = useRef(null);
  const inp = useRef(null);
  useEffect(() => { if (end.current) end.current.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [MSGS.length, MSGS[MSGS.length - 1] && MSGS[MSGS.length - 1].state]);
  useEffect(() => { if (first) send(first); }, []);
  const go = () => { const x = t; setT(''); send(x); };
  const me = st().data.me;
  return html`<${Sheet} title="المدير" sub="اسأله أو قوله يعمل أي حاجة، عربي أو English" onClose=${close} full
    footer=${html`<div class="ai-foot">
      <div class="ai-quick">${quick().map(([ic, lb, fn]) => html`<button class="chip" onClick=${fn}><${Icon} name=${ic} size=${14} /> ${lb}</button>`)}</div>
      <div class="ai-input">
        <textarea ref=${inp} class="input" rows="1" dir="auto" value=${t} placeholder="اكتب أو اسأل أي حاجة..."
          onInput=${(e) => { setT(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
          onKeyDown=${(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } }}></textarea>
        <button class="btn send" disabled=${BUSY || !t.trim()} onClick=${go} aria-label="ابعت"><${Icon} name="send" size=${21} /></button>
      </div>
    </div>`}>
    ${MSGS.length === 0 && html`<div class="ai-hello">
      <div class="ai-hello-ic"><${Icon} name="spark" size=${30} /></div>
      <b>أهلاً ${me.kind === 'admin' ? '' : me.name}، أنا المدير.</b>
      <span>أقدر أدوّرلك على أي قطعة، أستلم عربية وأقسّم شغلها على الموظفين، أعمل فواتير PDF، وأسجّل الحركات.</span>
      <div class="ai-ex">${['فين كيت الزاوية بتاع E36؟', 'إيه العربيات المتأخرة؟', 'مين فاضي من الموظفين؟', canInvoice() ? 'اعمل فاتورة لأحمد فيها تركيب كيت زاوية' : 'عربية كريم الـ E46 داخلة فابريكيشن'].map((x) => html`<button class="chip" onClick=${() => send(x)}>${x}</button>`)}</div>
    </div>`}
    <div class="ai-chat">${MSGS.map((m) => html`<${Msg} m=${m} key=${m.id} />`)}<div ref=${end}></div></div>
    ${MSGS.length > 0 && !BUSY && html`<button class="linkbtn" onClick=${() => { HIST = []; MSGS = []; emit(); }}><${Icon} name="undo" size=${14} /> كلام جديد</button>`}
  <//>`;
}

export const openAssistant = (first) => openSheet(AssistantSheet, { first });
export function AssistantFab() {
  return html`<button class="aifab" onClick=${() => openAssistant()} aria-label="المدير"><${Icon} name="spark" size=${24} /></button>`;
}
