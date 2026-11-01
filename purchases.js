/* purchases.js — المشتريات: جوه كل شغلانة (بأنواعها وفاتورتها)، وصفحة كل المشتريات (مسح وتعديل للإدارة) */
import { html, useState, useEffect, Icon, Pill, Empty, Spinner, Field, Chips, Sheet, SecTitle, openSheet, toast, confirmBox, NumInput } from './ui.js?v=25';
import { call, errText, sb } from './api.js?v=25';
import { useStore, getStore, isAdmin, reload } from './store.js?v=25';
import * as L from './lib.js?v=25';
import { buildPdf, fileFrom, safeName } from './docs.js?v=25';
import { FileReady } from './stickers.js?v=25';
import { egp, carOf, monthOf, expensesIn } from './money.js?v=25';

/* أنواع المشتريات (المدير بيختار لوحده) */
export const CATS = ['خراطة', 'خامات', 'مسامير وصواميل', 'جلفنة ودهان', 'شغل بره', 'نقل ومشاوير', 'تانية'];
export const catOf = (e) => (CATS.includes(e.cat) ? e.cat : e.cat ? e.cat : 'تانية');

/* مجموع كل نوع */
export function byCat(list) {
  const m = new Map();
  for (const e of list) { const k = catOf(e); m.set(k, (m.get(k) || 0) + (Number(e.price) || 0)); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total: Math.round(total) }));
}

const jobName = (j, idx) => {
  const car = j.car_id && idx.cars.get(j.car_id);
  const pr = j.product_id && idx.items.get(j.product_id);
  return car ? car.name : pr ? 'إنتاج ' + pr.name : j.title;
};

/* فاتورة مشتريات شغلانة واحدة (PDF) */
export async function jobPurchasesPdf(j, list) {
  const { data, idx } = getStore();
  const S = data.settings || {};
  const d = j.driver_id && idx.drivers.get(j.driver_id);
  const cats = byCat(list);
  const total = Math.round(L.sum(list, (e) => Number(e.price) || 0));
  const blob = await buildPdf({
    dir: 'rtl', title: 'فاتورة مشتريات ' + j.ref, subtitle: S.company_ar,
    meta: [['الشغل', jobName(j, idx) + (j.title && jobName(j, idx) !== j.title ? ' — ' + j.title : '')], ...(d ? [['صاحبها', d.name]] : []),
      ['الإجمالي', egp(total)], ['عدد البنود', String(list.length)]],
    footer: `${S.company_ar || ''} — ${S.address_ar || ''}`,
    sections: [
      { title: 'على كل نوع', columns: [{ key: 'name', label: 'النوع', w: 3 }, { key: 'total', label: 'المبلغ', w: 1.2, align: 'end' }],
        rows: cats.map((c) => ({ name: c.name, total: egp(c.total) })), empty: 'مفيش' },
      { title: 'كل المشتريات', empty: 'لسه مفيش مشتريات على الشغل ده',
        columns: [{ key: 'date', label: 'اليوم', w: 1.1 }, { key: 'item', label: 'الحاجة', w: 2.6 }, { key: 'qty', label: 'العدد', w: 0.6, align: 'center' },
          { key: 'cat', label: 'النوع', w: 1.3 }, { key: 'shop', label: 'المحل', w: 1.3 }, { key: 'price', label: 'المبلغ', w: 1, align: 'end' }],
        rows: list.map((e) => ({ date: L.fmtDate(e.date), item: e.item + (e.size ? ' (' + e.size + ')' : ''), qty: Number(e.qty), cat: catOf(e), shop: e.shop || '—', price: egp(e.price) })) },
    ],
  });
  return fileFrom(blob, safeName('مشتريات ' + j.ref + ' ' + jobName(j, idx)) + '.pdf');
}

/* جوه صفحة الشغلانة: المشتريات بأنواعها + «لسه هنشتري» + الفاتورة */
export function JobPurchases({ job: j, onCount }) {
  const { data } = useStore();
  const [list, setList] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => call('job_expenses', { p_job: j.id }).then((r) => { setList(r || []); onCount && onCount(r || []); }).catch(() => setList([]));
  useEffect(() => { load(); }, [j.id, j.updated_at, data]);
  const buy = (j.lines || []).filter((l) => l.kind === 'buy');
  const left = buy.filter((l) => !l.done);
  const total = list ? Math.round(L.sum(list, (e) => Number(e.price) || 0)) : 0;
  async function pdf() { setBusy(true); try { setFile(await jobPurchasesPdf(j, list || [])); } catch (e) { toast(errText(e), 'bad'); } setBusy(false); }
  async function tickBuy(l) { try { await call('job_line_done', { p_id: l.id, p_done: !l.done }); reload().catch(() => {}); } catch (e) { toast(errText(e), 'bad'); } }
  return html`
    ${buy.length > 0 && html`<${SecTitle} right=${html`<span class="num">${left.length}</span>`}>لسه هنشتري<//>
      <div class="card tight">${buy.map((l) => html`<div class="task" key=${l.id}>
        <button class=${'tick ' + (l.done ? 'on' : '')} onClick=${() => tickBuy(l)} aria-label="اتشرت">${l.done && html`<${Icon} name="check" size=${18} stroke=${3} />`}</button>
        <div class="task-main grow"><b class=${l.done ? 'done' : ''} dir="auto">${l.title}${Number(l.qty) !== 1 ? ' × ' + Number(l.qty) + (l.unit ? ' ' + l.unit : '') : ''}</b>
          ${l.done ? html`<small>✓ اتشرت ${L.bidi(l.done_by, L.fmtDate(l.done_at))}</small>` : l.note ? html`<small dir="auto">${l.note}</small>` : ''}</div></div>`)}</div>`}

    <${SecTitle} right=${list && list.length ? html`<b class="num">${egp(total)}</b>` : ''}>المشتريات<//>
    ${list === null ? html`<${Spinner} />` : list.length === 0 ? html`<div class="hint">قول للمدير «اشترينا كذا بكام لـ${j.ref}» وهتظهر هنا لوحدها.</div>` : html`
      <div class="catgrid">${byCat(list).map((c) => html`<div class="catbox" key=${c.name}><small>${c.name}</small><b>${egp(c.total)}</b></div>`)}</div>
      <div class="card tight">${list.map((e) => html`<${ExpRow} e=${e} key=${e.id} onChanged=${load} />`)}</div>
      ${file ? html`<${FileReady} file=${file} text=${'مشتريات ' + j.ref} />`
        : html`<button class="btn dark sm" disabled=${busy} onClick=${pdf}><${Icon} name="file" size=${18} /> ${busy ? 'بجهّز...' : 'فاتورة المشتريات PDF'}</button>`}`}`;
}

/* سطر مشتريات: الإدارة تدوس عليه تعدّل أو تمسح */
function ExpRow({ e, onChanged, showJob }) {
  const open = () => isAdmin() && openSheet(ExpenseForm, { e, onChanged });
  return html`<button class="trow lrow" onClick=${open}>
    <div class="grow"><div class="irow-title" dir="auto">${e.item}${Number(e.qty) !== 1 ? ' × ' + Number(e.qty) : ''}${e.size && html`<span class="size">${e.size}</span>`}</div>
      <div class="irow-sub"><span>${catOf(e)}</span>${e.shop && html`<span>${e.shop}</span>`}${showJob && html`<span>${carOf(e)}</span>`}<span>${L.bidi(e.staff, L.fmtDate(e.date))}</span>${e.receipt && html`<span>📷</span>`}</div></div>
    <b class="num">${egp(e.price)}</b></button>`;
}

/* تعديل أو مسح مشتريات (الإدارة) */
export function ExpenseForm({ e, onChanged, close }) {
  const { data, idx } = useStore();
  const [f, setF] = useState({ item: e.item, qty: Number(e.qty), price: Number(e.price), shop: e.shop || '', cat: catOf(e), size: e.size || '', job_id: e.job_id || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const jobs = data.jobs.filter((j) => j.status !== 'cancelled');
  async function save() {
    setBusy(true);
    try { await call('expense_update', { p_id: e.id, p: { ...f, job_id: f.job_id || '' } }); toast('اتعدّل'); onChanged && onChanged(); close(); } catch (er) { toast(errText(er), 'bad'); }
    setBusy(false);
  }
  async function del() {
    if (!(await confirmBox({ title: 'امسح «' + e.item + '»؟', text: egp(e.price) + (e.shop ? ' من ' + e.shop : '') + ' — ' + L.fmtDate(e.date) + '. مفيش رجوع.', ok: 'امسح', danger: true }))) return;
    setBusy(true);
    try {
      const path = await call('expense_delete', { p_id: e.id });
      if (path) { try { await sb.storage.from('photos').remove([path]); } catch (er) { /* */ } }
      toast('اتمسحت'); onChanged && onChanged(); close();
    } catch (er) { toast(errText(er), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title="تعديل مشتريات" sub=${L.bidi(e.staff, L.fmtDate(e.date))} onClose=${close}
    footer=${html`<div class="grid2"><button class="btn red sm" disabled=${busy} onClick=${del}><${Icon} name="trash" size=${18} /> امسح</button>
      <button class="btn dark sm" disabled=${busy} onClick=${save}><${Icon} name="check" size=${18} /> حفظ</button></div>`}>
    <${Field} label="الحاجة"><input class="input" dir="auto" value=${f.item} onInput=${(ev) => set('item', ev.target.value)} /><//>
    <div class="grid2">
      <${Field} label="المبلغ (جنيه)"><${NumInput} value=${f.price} onChange=${(v) => set('price', v)} /><//>
      <${Field} label="العدد"><${NumInput} value=${f.qty} onChange=${(v) => set('qty', v)} /><//>
    </div>
    <${Field} label="النوع"><${Chips} items=${CATS} value=${f.cat} onChange=${(v) => set('cat', v)} /><//>
    <div class="grid2">
      <${Field} label="المحل"><input class="input" dir="auto" value=${f.shop} onInput=${(ev) => set('shop', ev.target.value)} /><//>
      <${Field} label="المقاس"><input class="input" dir="auto" value=${f.size} onInput=${(ev) => set('size', ev.target.value)} /><//>
    </div>
    <${Field} label="على"><select class="input" value=${f.job_id} onChange=${(ev) => set('job_id', ev.target.value)}>
      <option value="">مصاريف عامة</option>${jobs.map((j) => html`<option value=${j.id}>${j.ref} · ${jobName(j, idx)}</option>`)}</select><//>
  <//>`;
}

/* كل المشتريات: النهارده / الأسبوع / الشهر — متقسمة على الشغل */
const PERIODS = [['today', 'النهارده'], ['week', 'آخر 7 أيام'], ['month', 'الشهر ده'], ['last', 'الشهر اللي فات']];
function range(p) {
  const t = L.todayStr();
  if (p === 'today') return [t, t];
  if (p === 'week') return [L.addDays(t, -6), t];
  if (p === 'month') return [t.slice(0, 8) + '01', t];
  const d = new Date(t.slice(0, 7) + '-15T12:00:00'); d.setMonth(d.getMonth() - 1); const m = d.toISOString().slice(0, 7);
  const e = new Date(m + '-15T12:00:00'); e.setMonth(e.getMonth() + 1); e.setDate(0);
  return [m + '-01', e.toISOString().slice(0, 10)];
}
export function PurchasesSheet({ close }) {
  const [p, setP] = useState('today');
  const [list, setList] = useState(null);
  const load = () => { setList(null); const [a, b] = range(p); expensesIn(a, b).then((r) => setList(r || [])).catch(() => setList([])); };
  useEffect(load, [p]);
  const groups = new Map();
  for (const e of list || []) { const k = carOf(e); const g = groups.get(k) || { name: k, job: e.job, items: [], total: 0 }; g.items.push(e); g.total += Number(e.price) || 0; groups.set(k, g); }
  const gs = [...groups.values()].sort((a, b) => b.total - a.total);
  const total = Math.round(L.sum(list || [], (e) => Number(e.price) || 0));
  return html`<${Sheet} title="المشتريات" sub=${list ? egp(total) + ' · ' + list.length + ' حاجة' : ''} onClose=${close} full>
    <${Chips} items=${PERIODS} value=${p} onChange=${setP} wrap=${false} />
    ${list === null ? html`<${Spinner} />` : list.length === 0 ? html`<${Empty} icon="file" text="مفيش مشتريات في الفترة دي" />` : html`
      <div class="catgrid">${byCat(list).map((c) => html`<div class="catbox" key=${c.name}><small>${c.name}</small><b>${egp(c.total)}</b></div>`)}</div>
      ${gs.map((g) => html`<${SecTitle} key=${g.name} right=${html`<b class="num">${egp(g.total)}</b>`}>${g.name}<//>
        <div class="card tight">${g.items.map((e) => html`<${ExpRow} e=${e} key=${e.id} onChanged=${load} />`)}</div>`)}
      ${isAdmin() && html`<div class="hint">دوس على أي سطر عشان تعدّله أو تمسحه.</div>`}`}
  <//>`;
}
