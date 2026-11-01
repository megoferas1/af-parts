/* purchases.js — المشتريات: جوه كل شغلانة (بأنواعها وفاتورتها)، وصفحة كل المشتريات (مسح وتعديل للإدارة) */
import { html, useState, useEffect, Icon, Pill, Empty, Spinner, Field, Chips, Sheet, SecTitle, openSheet, toast, confirmBox, NumInput, parseNum } from './ui.js?v=28';
import { call, errText, sb } from './api.js?v=28';
import { useStore, getStore, isAdmin, reload } from './store.js?v=28';
import * as L from './lib.js?v=28';
import { buildPdf, fileFrom, safeName } from './docs.js?v=28';
import { FileReady } from './stickers.js?v=28';
import { egp, carOf, monthOf, expensesIn } from './money.js?v=28';

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

/* خانة سعر صغيرة: بتتحفظ لما تخرج منها أو تدوس Enter */
function PriceBox({ value, onSave, disabled, placeholder }) {
  const [t, setT] = useState(value ? String(Math.round(Number(value) * 100) / 100) : '');
  useEffect(() => { setT(value ? String(Math.round(Number(value) * 100) / 100) : ''); }, [value]);
  const commit = () => { const n = parseNum(t);
    if (t === '' || !(n >= 0) || n === Number(value || 0)) return; onSave(n); };
  return html`<input class="pbox" inputmode="decimal" dir="ltr" placeholder=${placeholder || 'السعر'} value=${t} disabled=${disabled}
    onInput=${(e) => setT(e.target.value.replace(/[^0-9٠-٩.,٫]/g, ''))} onBlur=${commit} onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); }} />`;
}

/* جوه صفحة الشغلانة: كل بند سطر واحد (اللي اتشرى بسعره، واللي لسه)، وزرار إضافة صغير، والفاتورة */
export function JobPurchases({ job: j, onCount }) {
  const { data } = useStore();
  const [list, setList] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(null);
  const load = () => call('job_expenses', { p_job: j.id }).then((r) => { setList(r || []); onCount && onCount(r || []); }).catch(() => setList([]));
  useEffect(() => { load(); }, [j.id, j.updated_at, data]);
  const left = (j.lines || []).filter((l) => l.kind === 'buy' && !l.done);
  const total = list ? Math.round(L.sum(list, (e) => Number(e.price) || 0)) : 0;
  const admin = isAdmin();
  async function pdf() { setBusy(true); try { setFile(await jobPurchasesPdf(j, list || [])); } catch (e) { toast(errText(e), 'bad'); } setBusy(false); }
  async function bought(l, price) {   // اتشرى: يتسجل بسعره ويتعلّم عليه
    try { await call('expense_add', { p: { item: l.title, qty: Number(l.qty) || 1, price, job_id: j.id } });
      await call('job_line_done', { p_id: l.id, p_done: true }).catch(() => {}); toast('اتسجل ✓'); await reload(); load(); } catch (e) { toast(errText(e), 'bad'); }
  }
  async function setPrice(e, price) {
    try { await call('expense_update', { p_id: e.id, p: { item: e.item, qty: Number(e.qty), price, shop: e.shop || '', cat: catOf(e), size: e.size || '', job_id: j.id } }); toast('السعر اتعدّل'); load(); } catch (er) { toast(errText(er), 'bad'); }
  }
  async function dropBuy(l) {
    if (!(await confirmBox({ title: 'شيل «' + l.title + '»؟', ok: 'شيل', danger: true }))) return;
    try { await call('job_line_delete', { p_id: l.id }); await reload(); } catch (e) { toast(errText(e), 'bad'); }
  }
  async function addLine() {
    const item = (add.item || '').trim();
    if (!item) return toast('اكتب البند', 'bad');
    setBusy(true);
    try {
      if (add.price > 0) await call('expense_add', { p: { item, qty: 1, price: add.price, job_id: j.id } });
      else await call('job_steps_add', { p_job: j.id, p_steps: [], p_buy: [{ title: item }], p_remove: [] });
      setAdd(null); await reload(); load();
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`
    <${SecTitle} right=${list && list.length ? html`<b class="num">${egp(total)}</b>` : ''}>المشتريات<//>
    <div class="card tight">
      ${list === null ? html`<${Spinner} />` : ''}
      ${(list || []).map((e) => html`<div class="pline" key=${e.id}>
        <span class="tick on sm"><${Icon} name="check" size=${14} stroke=${3} /></span>
        <button class="pline-t grow" onClick=${() => admin && openSheet(ExpenseForm, { e, onChanged: load })}>
          <span dir="auto">${e.item}${Number(e.qty) !== 1 ? ' × ' + Number(e.qty) : ''}${e.size ? ' (' + e.size + ')' : ''}</span>
          <small dir="auto">${[e.shop, e.staff, L.fmtDate(e.date)].filter(Boolean).join(' · ')}${e.receipt ? ' · 📷' : ''}</small></button>
        ${admin ? html`<${PriceBox} value=${e.price} onSave=${(n) => setPrice(e, n)} />` : html`<b class="num pnum">${egp(e.price)}</b>`}
      </div>`)}
      ${left.map((l) => html`<div class="pline todo" key=${l.id}>
        <span class="tick sm"></span>
        <button class="pline-t grow" onClick=${() => admin && dropBuy(l)}><span dir="auto">${l.title}${Number(l.qty) !== 1 ? ' × ' + Number(l.qty) + (l.unit ? ' ' + l.unit : '') : ''}</span>
          <small>لسه هنشتريها — اكتب السعر لما تتشرى</small></button>
        <${PriceBox} value=${0} onSave=${(n) => bought(l, n)} />
      </div>`)}
      ${list && list.length === 0 && left.length === 0 && html`<div class="hint">مفيش مشتريات لسه.</div>`}
      ${add ? html`<div class="addrow sm">
          <input class="input" dir="auto" placeholder="البند (مثلاً: مسامير 14)" value=${add.item} autoFocus onInput=${(e) => setAdd({ ...add, item: e.target.value })} />
          <input class="pbox big" inputmode="decimal" dir="ltr" placeholder="السعر" value=${add.p || ''} onInput=${(e) => { const t = e.target.value.replace(/[^0-9.]/g, ''); setAdd({ ...add, p: t, price: Number(t) || 0 }); }} />
          <button class="btn sm dark" disabled=${busy} onClick=${addLine}><${Icon} name="check" size=${18} /></button></div>
          <small class="soft">من غير سعر = لسه هنشتريها</small>`
        : html`<div class="addlinks"><button class="addlink" onClick=${() => setAdd({ item: '', price: 0 })}><${Icon} name="plus" size=${14} /> إضافة</button>
          ${list && list.length > 0 && (file ? html`<${FileReady} file=${file} text=${'مشتريات ' + j.ref} />`
            : html`<button class="addlink" disabled=${busy} onClick=${pdf}><${Icon} name="file" size=${14} /> ${busy ? 'بجهّز...' : 'فاتورة المشتريات PDF'}</button>`)}</div>`}
    </div>`;
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
