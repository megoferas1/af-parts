/* invoices.js — الأسعار والفواتير (للإدارة واللي الإدارة اديته الصلاحية) */
import { html, useState, useEffect, useMemo, Icon, Pill, Empty, Field, Chips, SearchBox, Segmented, Sheet, Hero, SecTitle, openSheet, toast, confirmBox, NumInput } from './ui.js?v=11';
import { call, errText } from './api.js?v=11';
import { useStore, getStore, reload, isAdmin } from './store.js?v=11';
import * as L from './lib.js?v=11';
import { startNewItem, groupBy, run } from './items.js?v=11';
import { FileReady } from './stickers.js?v=11';
import { buildInvoicePdf, fmtMoney, fmtQty, invoiceTotals, fileFrom, safeName } from './docs.js?v=11';
import { HeroScan } from './home.js?v=11';

export const PKIND = { labor: { label: 'مصنعيات', one: 'مصنعية', icon: 'wrench' }, material: { label: 'قطع وخامات', one: 'قطعة / خامة', icon: 'box' } };
const CURS = [['EGP', 'جنيه'], ['USD', 'دولار']];
const money = (n, cur) => fmtMoney(n, cur, 'ar');

/* ---------- سعر الدولار النهارده (من النت، ولو مفيش تكتبه بإيدك) ---------- */
let rateCache = null;
export async function usdRate() {
  if (rateCache && Date.now() - rateCache.t < 30 * 60 * 1000) return rateCache.v;
  const tries = [
    ['https://open.er-api.com/v6/latest/USD', (j) => j && j.rates && j.rates.EGP],
    ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', (j) => j && j.usd && j.usd.egp],
    ['https://latest.currency-api.pages.dev/v1/currencies/usd.json', (j) => j && j.usd && j.usd.egp],
  ];
  for (const [u, pick] of tries) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
      const j = await fetch(u, { signal: ctl.signal, cache: 'no-store' }).then((r) => r.json());
      clearTimeout(tm);
      const v = Number(pick(j));
      if (v > 1 && v < 10000) { rateCache = { v: Math.round(v * 100) / 100, t: Date.now() }; return rateCache.v; }
    } catch (e) { /* نجرب اللي بعده */ }
  }
  return null;
}
const r2 = (n) => Math.round(n * 100) / 100;
export function conv(v, from, to, rate) {
  if (v === null || v === undefined || v === '') return null;
  if (from === to) return r2(Number(v));
  if (!rate) return null;
  return from === 'USD' ? r2(Number(v) * rate) : r2(Number(v) / rate);
}

/* =================================================================== تاب الفواتير */
export function InvoicesTab({ back }) {
  const { data } = useStore();
  const [seg, setSeg] = useState('invoices');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const unpaid = data.invoices.filter((v) => !v.paid);
  const list = data.invoices.filter((v) => (only === 'all' || !v.paid) && (!q || L.matches([v.ref, v.bill && v.bill.name, v.bill && v.bill.phone].join(' '), q)));
  return html`
    <${Hero} back=${back} title="الفواتير" sub=${`${data.invoices.length} فاتورة · ${unpaid.length} لسه ما اتدفعتش`} right=${html`<${HeroScan} />`} />
    <main class="body">
      <${Segmented} value=${seg} onChange=${setSeg} items=${[['invoices', 'الفواتير', unpaid.length], ['prices', 'الأسعار']]} />
      ${seg === 'invoices' ? html`
        <button class="btn" onClick=${() => openSheet(InvoiceForm, {})}><${Icon} name="plus" size=${22} /> فاتورة جديدة</button>
        ${data.invoices.length > 0 && html`<${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر برقم الفاتورة أو اسم العميل" />
          <${Segmented} value=${only} onChange=${setOnly} items=${[['all', 'الكل'], ['unpaid', 'لسه ما اتدفعتش', unpaid.length]]} />`}
        ${list.length === 0 ? html`<${Empty} icon="file" text=${data.invoices.length ? 'مفيش فواتير كده' : 'لسه مفيش فواتير'} />`
          : html`<div class="stack">${list.map((v) => html`<${InvoiceCard} v=${v} key=${v.id} />`)}</div>`}`
      : html`<${PricesPanel} />`}
    </main>`;
}

function InvoiceCard({ v }) {
  return html`<button class=${'tcard ' + (v.paid ? '' : 's-prep')} onClick=${() => openSheet(InvoiceSheet, { id: v.id })}>
    <span class="tcard-ic"><${Icon} name="file" size=${24} /></span>
    <span class="grow"><b>${L.bidi(v.ref, v.bill && v.bill.name)}</b><small>${L.bidi(L.fmtDate(v.inv_date), money(v.total, v.currency))}</small></span>
    <${Pill} tone=${v.paid ? 'green' : 'amber'}>${v.paid ? 'مدفوعة' : 'لسه'}<//>
  </button>`;
}

/* =================================================================== الأسعار */
function PricesPanel() {
  const { data, idx } = useStore();
  const [seg, setSeg] = useState('product');
  const [q, setQ] = useState('');
  const prods = idx.kinds.product.filter((i) => !q || L.matches(idx.hay.get(i.id), q));
  const pitems = data.price_items.filter((x) => x.kind === seg && (!q || L.matches([x.name, x.name_en, x.part_no].join(' '), q)));
  const noPrice = idx.kinds.product.filter((i) => i.price == null).length;
  return html`<div class="stack">
    <${Segmented} value=${seg} onChange=${(v) => { setSeg(v); setQ(''); }} items=${[['product', 'منتجاتنا', noPrice], ['labor', 'مصنعيات'], ['material', 'قطع وخامات']]} />
    <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر بالاسم أو رقم القطعة" />
    ${seg === 'product' ? html`
      ${noPrice > 0 && html`<div class="note warn"><${Icon} name="alert" size=${18} /><span>${noPrice} منتج لسه ملوش سعر. دوس على المنتج وحط سعره.</span></div>`}
      <div class="grid2">
        <button class="btn sm" onClick=${() => startNewItem({ kind: 'product' })}><${Icon} name="plus" size=${18} /> منتج جديد</button>
        <button class="btn ghost sm" onClick=${() => openSheet(AbbrSheet)}><${Icon} name="tag" size=${18} /> اختصارات الأنواع</button>
      </div>
      ${prods.length === 0 ? html`<${Empty} icon="box" text="لسه مفيش منتجات" />`
        : groupBy(prods, (i) => i.category, idx.cats.product).map(([cat, its]) => html`<div class="grp" key=${cat}>
            <div class="grp-h">${cat} <i>${its.length}</i></div>
            <div class="card tight">${its.slice().sort((a, b) => L.cmpName(a.part_no || 'zz', b.part_no || 'zz')).map((i) => html`<${PriceRow} key=${i.id}
              pn=${i.part_no} name=${i.name} sub=${i.name_en} price=${i.price} cur=${i.price_cur}
              onClick=${() => openSheet(ProductPriceForm, { id: i.id })} />`)}</div></div>`)}`
    : html`
      <button class="btn sm" onClick=${() => openSheet(PriceItemForm, { kind: seg })}><${Icon} name="plus" size=${18} /> ${seg === 'labor' ? 'مصنعية جديدة' : 'قطعة / خامة جديدة'}</button>
      ${pitems.length === 0 ? html`<${Empty} icon=${PKIND[seg].icon} text=${seg === 'labor' ? 'لسه مفيش مصنعيات. ضيف المصنعيات اللي بتشتغلها بأسعارها.' : 'لسه مفيش قطع أو خامات. ضيف الزيوت والخامات والقطع اللي بتشتريها.'} />`
        : html`<div class="card tight">${pitems.map((x) => html`<${PriceRow} key=${x.id} pn=${x.part_no} name=${x.name} sub=${[x.name_en, x.unit && 'لكل ' + x.unit].filter(Boolean).join(' · ')}
            price=${x.price} cur=${x.price_cur} onClick=${() => openSheet(PriceItemForm, { id: x.id })} />`)}</div>`}`}
  </div>`;
}

function PriceRow({ pn, name, sub, price, cur, onClick }) {
  return html`<button class="lrow prow" onClick=${onClick}>
    <span class="grow">${pn && html`<span class="pn">${pn}</span>`}<b>${name}</b>${sub && html`<small dir="auto">${sub}</small>`}</span>
    <span class=${'price ' + (price == null ? 'none' : '')}>${price == null ? 'حط السعر' : money(price, cur)}</span>
  </button>`;
}

/* سعر ورقم قطعة منتج من منتجاتنا */
function ProductPriceForm({ id, close }) {
  const { idx } = useStore();
  const it = idx.items.get(id);
  const [pn, setPn] = useState(it ? it.part_no || '' : '');
  const [en, setEn] = useState(it ? it.name_en || '' : '');
  const [price, setPrice] = useState(it && it.price != null ? Number(it.price) : null);
  const [cur, setCur] = useState(it ? it.price_cur || 'USD' : 'USD');
  const [busy, setBusy] = useState(false);
  if (!it) return null;
  async function save() {
    setBusy(true);
    try {
      if ((pn || '').trim().toUpperCase() !== (it.part_no || '') || en.trim() !== (it.name_en || '')) {
        await call('save_item', { p_id: it.id, p: { kind: it.kind, name: it.name, name_en: en, category: it.category, size: it.size, driver_id: null, car_id: null,
          qty: it.qty, condition: it.condition, location: it.location, note: it.note, part_no: (pn || '').trim() } });
      }
      await call('set_item_price', { p_item: it.id, p_price: price, p_cur: cur });
      await reload().catch(() => {});
      toast('اتحفظ'); close();
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title=${it.name} sub=${it.category || 'منتج'} onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>`}>
    <${Field} label="السعر" hint="ده السعر الثابت، وفي كل فاتورة تقدر تغيّره">
      <div class="row gap8"><${NumInput} value=${price} onChange=${setPrice} placeholder="0.00" />
        <div class="curseg"><${Segmented} value=${cur} onChange=${setCur} items=${CURS} /></div></div><//>
    <${Field} label="رقم القطعة (Part No.)"><input class="input ltr" value=${pn} placeholder="AF-ENG-001" onInput=${(e) => setPn(e.target.value.toUpperCase())} /><//>
    <${Field} label="الاسم بالإنجليزي" hint="ده اللي بيظهر في الفاتورة الإنجليزي والـ Packing List"><input class="input ltr" value=${en} onInput=${(e) => setEn(e.target.value)} /><//>
  <//>`;
}

/* اختصارات أنواع المنتجات (ENG / ANG …) */
function AbbrSheet({ close }) {
  const { data } = useStore();
  const cats = data.categories.filter((c) => c.kind === 'product');
  const [vals, setVals] = useState(() => Object.fromEntries(cats.map((c) => [c.name, c.abbr || ''])));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      for (const c of cats) if ((vals[c.name] || '') !== (c.abbr || '')) await call('set_category_abbr', { p_kind: 'product', p_name: c.name, p_abbr: vals[c.name] || '' });
      await reload().catch(() => {});
      toast('اتحفظ'); close();
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title="اختصارات الأنواع" sub="بتتحط في رقم القطعة: AF-ENG-001" onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>`}>
    <div class="card tight">${cats.map((c) => html`<div class="lrow" key=${c.name}><span class="grow"><b>${c.name}</b><small class="ltr-t">AF-${vals[c.name] || '…'}-001</small></span>
      <input class="input ltr abbr" maxlength="6" value=${vals[c.name]} onInput=${(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); setVals((x) => ({ ...x, [c.name]: v })); }} /></div>`)}</div>
    <div class="hint">الأنواع نفسها بتتضاف من الإعدادات ← الأنواع ← التصدير.</div>
  <//>`;
}

/* مصنعية / قطعة أو خامة */
function PriceItemForm({ id, kind, close }) {
  const { idx } = useStore();
  const old = id ? idx.priceItems.get(id) : null;
  const [f, setF] = useState(() => old ? { ...old, price: Number(old.price) } : { kind: kind || 'labor', name: '', name_en: '', unit: '', price: null, price_cur: 'EGP', part_no: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.name.trim()) return toast('اكتب الاسم', 'bad');
    setBusy(true);
    try { await call('price_item_save', { p_id: id || null, p: { ...f, price: f.price == null ? 0 : f.price } }); await reload().catch(() => {}); toast('اتحفظ'); close(); }
    catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  async function del() {
    if (!(await confirmBox({ title: 'مسح ' + old.name + '؟', text: 'الفواتير القديمة مش هتتأثر.', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('price_item_delete', { p_id: id }), 'اتمسح');
    if (r.ok) close();
  }
  const labor = f.kind === 'labor';
  return html`<${Sheet} title=${old ? old.name : labor ? 'مصنعية جديدة' : 'قطعة / خامة جديدة'} onClose=${close}
    footer=${html`<div class="stack"><button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
      ${old && isAdmin() && html`<button class="btn ghost" onClick=${del}><${Icon} name="trash" size=${18} /> مسح</button>`}</div>`}>
    <${Segmented} value=${f.kind} onChange=${(v) => set('kind', v)} items=${[['labor', 'مصنعية'], ['material', 'قطعة / خامة']]} />
    <${Field} label="الاسم" req><input class="input" value=${f.name} placeholder=${labor ? 'مثلاً: تركيب كيت زاوية' : 'مثلاً: زيت ماتور 5W-40'} onInput=${(e) => set('name', e.target.value)} /><//>
    <${Field} label="الاسم بالإنجليزي (اختياري)" hint="للفاتورة الإنجليزي"><input class="input ltr" value=${f.name_en} onInput=${(e) => set('name_en', e.target.value)} /><//>
    <${Field} label="السعر">
      <div class="row gap8"><${NumInput} value=${f.price} onChange=${(v) => set('price', v)} placeholder="0.00" />
        <div class="curseg"><${Segmented} value=${f.price_cur} onChange=${(v) => set('price_cur', v)} items=${CURS} /></div></div><//>
    <${Field} label="الوحدة (اختياري)" hint=${labor ? 'سيبها فاضية لو السعر للشغلانة كلها' : 'مثلاً: لتر، قطعة، متر'}>
      <input class="input" value=${f.unit} placeholder=${labor ? 'ساعة' : 'لتر'} onInput=${(e) => set('unit', e.target.value)} />
      <${Chips} items=${labor ? ['ساعة', 'يوم'] : ['قطعة', 'لتر', 'متر', 'كيلو', 'طقم']} value=${f.unit} onChange=${(v) => set('unit', f.unit === v ? '' : v)} /><//>
    ${!labor && html`<${Field} label="رقم القطعة (اختياري)"><input class="input ltr" value=${f.part_no} onInput=${(e) => set('part_no', e.target.value.toUpperCase())} /><//>`}
  <//>`;
}

/* =================================================================== الفاتورة */
let lineKey = 0;
const withKey = (l) => ({ key: ++lineKey, ...l });

/* فاتورة جاية من شحنة: العميل والحاجات اللي فيها */
export function invoiceFromShipment(s) {
  const { idx } = getStore();
  const c = idx.customers.get(s.customer_id) || {};
  return {
    lang: 'en', currency: 'USD', customer_id: c.id || null, shipment_id: s.id,
    bill: { name: c.name || '', phone: c.phone || '', address: c.address || '', country: c.country || '', extra: c.email || '' },
    notes: 'Shipment ' + s.ref,
    lines: s.items.map((x) => {
      const i = idx.items.get(x.item_id) || {};
      return { kind: i.kind === 'product' ? 'product' : 'free', ref_id: i.id || null, part_no: i.part_no || '', desc_ar: i.name || '', desc_en: i.name_en || i.name || '',
        qty: x.qty, unit: '', src_price: i.price != null ? Number(i.price) : null, src_cur: i.price_cur || 'USD' };
    }),
  };
}

export function InvoiceForm({ id, preset, close }) {
  const { data, idx } = useStore();
  const S = data.settings;
  const old = id ? idx.invoices.get(id) : null;
  const base = old || preset || {};
  const [lang, setLangRaw] = useState(base.lang || 'ar');
  const [cur, setCurRaw] = useState(base.currency || 'EGP');
  const [rate, setRateRaw] = useState(base.rate != null ? Number(base.rate) : null);
  const [rateSt, setRateSt] = useState(base.rate != null ? 'saved' : 'loading');
  const [showRate, setShowRate] = useState(old ? !!old.show_rate : true);
  const [date, setDate] = useState(base.inv_date || L.todayStr());
  const [who, setWho] = useState(base.customer_id ? 'customer' : base.driver_id ? 'driver' : old ? 'new' : data.drivers.length ? 'driver' : 'new');
  const [driverId, setDriverId] = useState(base.driver_id || '');
  const [carId, setCarId] = useState('');
  const [custId, setCustId] = useState(base.customer_id || '');
  const [bill, setBill] = useState(() => ({ name: '', phone: '', address: '', country: '', extra: '', ...(base.bill || {}) }));
  const [lines, setLines] = useState(() => (base.lines || []).map((l) => withKey({
    ...l, desc: l.desc || (base.lang === 'en' ? l.desc_en || l.desc_ar : l.desc_ar || l.desc_en) || '',
    price: l.price != null ? Number(l.price) : conv(l.src_price, l.src_cur, base.currency || 'EGP', base.rate),
  })));
  const [discount, setDiscount] = useState(old ? Number(old.discount) : 0);
  const [tax, setTax] = useState(old ? Number(old.tax_pct) : Number(S.inv_tax || 0));
  const [notes, setNotes] = useState(base.notes || '');
  const termsFor = (lg) => (lg === 'en' ? S.inv_terms_en : S.inv_terms_ar) || '';
  const [terms, setTerms] = useState(old ? old.terms : termsFor(base.lang || 'ar'));
  const [showPay, setShowPay] = useState(old ? !!old.show_payment : (base.currency || 'EGP') === 'USD' && !!S.inv_payment);
  const [busy, setBusy] = useState(false);
  const setb = (k, v) => setBill((x) => ({ ...x, [k]: v }));

  /* الأسعار اللي جاية من الليستة بتتحسب تاني لو سعر الدولار أو العملة اتغيرت (إلا اللي انت غيرته بإيدك) */
  const reprice = (ls, c, r) => ls.map((l) => (l.manual || l.src_price == null ? l : { ...l, price: conv(l.src_price, l.src_cur, c, r) }));
  function setRate(r, st) { setRateRaw(r); if (st) setRateSt(st); setLines((ls) => reprice(ls, cur, r)); }
  function setCur(c) {
    if (c === cur) return;
    setLines((ls) => ls.map((l) => (l.manual || l.src_price == null ? { ...l, price: l.price == null ? null : conv(l.price, cur, c, rate) ?? l.price } : { ...l, price: conv(l.src_price, l.src_cur, c, rate) })));
    setCurRaw(c);
    if (S.inv_payment) setShowPay(c === 'USD');
  }
  function setLang(lg) {
    if (lg === lang) return;
    setLines((ls) => ls.map((l) => (l.desc_edited || !(l.desc_ar || l.desc_en) ? l : { ...l, desc: lg === 'en' ? l.desc_en || l.desc_ar : l.desc_ar || l.desc_en })));
    if (!terms || terms === termsFor(lang)) setTerms(termsFor(lg));
    setLangRaw(lg);
  }
  async function fetchRate() {
    setRateSt('loading');
    const r = await usdRate();
    if (r) setRate(r, 'live'); else setRateSt('failed');
  }
  useEffect(() => { if (rateSt === 'loading') fetchRate(); }, []);

  function pickDriver(v) {
    setDriverId(v); setCarId('');
    const d = idx.drivers.get(v);
    if (d) setBill((x) => ({ ...x, name: d.name, phone: d.phone || '', extra: '' }));
  }
  function pickCar(v) {
    setCarId(v);
    const c = idx.cars.get(v);
    setb('extra', c ? (lang === 'en' ? 'Car: ' : 'العربية: ') + [c.name, c.plate].filter(Boolean).join(' · ') : '');
  }
  function pickCustomer(v) {
    setCustId(v);
    const c = idx.customers.get(v);
    if (c) setBill({ name: c.name, phone: c.phone || '', address: c.address || '', country: c.country || '', extra: c.email || '' });
  }
  function setWhoMode(m) { setWho(m); if (m === 'new') { setDriverId(''); setCustId(''); } }

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function addLine(l) {
    setLines((ls) => [...ls, withKey({ ...l, desc: l.desc || (lang === 'en' ? l.desc_en || l.desc_ar : l.desc_ar || l.desc_en) || '',
      price: l.price != null ? l.price : conv(l.src_price, l.src_cur, cur, rate) })]);
  }
  const t = invoiceTotals(lines.map((l) => ({ qty: l.qty, price: l.price || 0 })), discount, tax);
  const needRate = lines.some((l) => !l.manual && l.src_price != null && l.src_cur !== cur);

  async function save() {
    if (!bill.name.trim()) return toast('اكتب اسم العميل', 'bad');
    if (!lines.length) return toast('ضيف بند واحد على الأقل', 'bad');
    const bad = lines.find((l) => !(l.desc || '').trim() || !(Number(l.qty) > 0) || l.price == null);
    if (bad) return toast(!(bad.desc || '').trim() ? 'فيه بند من غير اسم' : !(Number(bad.qty) > 0) ? 'فيه بند الكمية بتاعته غلط' : 'حط سعر لـ ' + bad.desc, 'bad');
    setBusy(true);
    try {
      const p = {
        inv_date: date, lang, currency: cur, rate, show_rate: !!(showRate && rate), show_payment: showPay,
        bill: { name: bill.name.trim(), phone: bill.phone.trim(), address: bill.address.trim(), country: bill.country.trim(), extra: bill.extra.trim() },
        customer_id: who === 'customer' ? custId || null : null, driver_id: who === 'driver' ? driverId || null : null, shipment_id: base.shipment_id || null,
        job_id: base.job_id || null,
        lines: lines.map(({ key, ...l }) => l), discount: discount || 0, tax_pct: tax || 0, notes, terms,
      };
      const r = await call('invoice_save', { p_id: id || null, p });
      await reload().catch(() => {});
      toast(id ? 'الفاتورة اتحفظت' : 'الفاتورة اتعملت ' + r.ref);
      close();
      if (!id) openSheet(InvoiceSheet, { id: r.id });
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }

  const cars = driverId ? idx.carsByDriver.get(driverId) || [] : [];
  return html`<${Sheet} title=${old ? 'تعديل ' + old.ref : 'فاتورة جديدة'} sub=${preset && preset.shipment_id ? 'من الشحنة' : preset && preset.job_id ? 'من أمر الشغل' : ''} onClose=${close} full
    footer=${html`<div class="invfoot"><div class="grow"><small>الإجمالي</small><b class="num">${money(t.total, cur)}</b></div>
      <button class="btn bigbtn" style="width:auto;padding:0 26px" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : html`<${Icon} name="check" size=${22} /> حفظ`}</button></div>`}>

    <div class="sec-title"><span class="grow">العميل</span></div>
    <${Segmented} value=${who} onChange=${setWhoMode} items=${[['driver', 'سواق'], ['customer', 'عميل'], ['new', 'حد جديد']]} />
    ${who === 'driver' && html`<select class="input" value=${driverId} onChange=${(e) => pickDriver(e.target.value)}>
        <option value="">— اختار السواق —</option>${data.drivers.map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select>
      ${cars.length > 0 && html`<select class="input" value=${carId} onChange=${(e) => pickCar(e.target.value)}>
        <option value="">— العربية (اختياري) —</option>${cars.map((c) => html`<option value=${c.id}>${c.name}</option>`)}</select>`}`}
    ${who === 'customer' && html`<select class="input" value=${custId} onChange=${(e) => pickCustomer(e.target.value)}>
        <option value="">— اختار العميل —</option>${data.customers.map((c) => html`<option value=${c.id}>${c.name}${c.country ? ' (' + c.country + ')' : ''}</option>`)}</select>`}
    <div class="card soft-card stack">
      <${Field} label="الاسم" req><input class="input" value=${bill.name} onInput=${(e) => setb('name', e.target.value)} /><//>
      <div class="grid2">
        <${Field} label="التليفون"><input class="input ltr" inputmode="tel" value=${bill.phone} onInput=${(e) => setb('phone', e.target.value)} /><//>
        <${Field} label="البلد"><input class="input" value=${bill.country} onInput=${(e) => setb('country', e.target.value)} /><//>
      </div>
      <${Field} label="العنوان"><input class="input" value=${bill.address} onInput=${(e) => setb('address', e.target.value)} /><//>
      <${Field} label="سطر زيادة (اختياري)" hint="مثلاً العربية أو الإيميل"><input class="input" value=${bill.extra} onInput=${(e) => setb('extra', e.target.value)} /><//>
    </div>

    <div class="sec-title"><span class="grow">الفاتورة</span></div>
    <div class="grid2">
      <${Field} label="العملة"><${Segmented} value=${cur} onChange=${setCur} items=${CURS} /><//>
      <${Field} label="اللغة"><${Segmented} value=${lang} onChange=${setLang} items=${[['ar', 'عربي'], ['en', 'English']]} /><//>
    </div>
    <div class=${'ratebox ' + (needRate && !rate ? 'warn' : '')}>
      <div class="row gap8">
        <span class="grow"><b>سعر الدولار</b><small>${rateSt === 'loading' ? 'بجيب سعر النهارده...' : rateSt === 'live' ? 'سعر النهارده من النت — تقدر تغيّره' : rateSt === 'saved' ? 'السعر اللي اتحفظ مع الفاتورة' : rateSt === 'failed' ? 'مقدرتش أجيب السعر، اكتبه بإيدك' : 'اتكتب بإيدك'}</small></span>
        <button type="button" class="iconbtn light" onClick=${fetchRate} aria-label="سعر النهارده"><${Icon} name="refresh" size=${18} /></button>
      </div>
      <div class="row gap8 rate-in"><span class="ltr-t">1 USD =</span><${NumInput} value=${rate} onChange=${(v) => setRate(v, 'manual')} placeholder="48.50" /><span>جنيه</span></div>
      <label class="check"><input type="checkbox" checked=${showRate} onChange=${(e) => setShowRate(e.target.checked)} /> اكتب سعر الدولار في الفاتورة</label>
    </div>
    <${Field} label="التاريخ"><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /><//>

    <div class="sec-title"><span class="grow">البنود (${lines.length})</span></div>
    ${lines.length === 0 && html`<div class="note info"><${Icon} name="info" size=${18} /><span>ضيف منتجاتنا أو المصنعيات أو القطع والخامات من الليستة، أو اكتب بند جديد.</span></div>`}
    ${lines.map((l, n) => html`<div class="iline" key=${l.key}>
      <div class="row gap8">
        <span class="iline-n">${n + 1}</span>
        <div class="grow">${l.part_no && html`<span class="pn">${l.part_no}</span>`}
          <textarea class="input iline-desc" rows="1" dir="auto" value=${l.desc} onInput=${(e) => setLine(l.key, { desc: e.target.value, desc_edited: true })}></textarea></div>
        <button type="button" class="iconbtn light" onClick=${() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="شيل"><${Icon} name="x" size=${18} /></button>
      </div>
      <div class="iline-nums">
        <label><small>الكمية${l.unit ? ' (' + l.unit + ')' : ''}</small><${NumInput} value=${l.qty} onChange=${(v) => setLine(l.key, { qty: v })} /></label>
        <label><small>سعر الوحدة${l.manual && l.src_price != null ? ' ✎' : ''}</small><${NumInput} cls=${l.price == null ? 'bad' : ''} value=${l.price} placeholder=${l.src_price != null && !rate ? 'محتاج سعر الدولار' : 'السعر'} onChange=${(v) => setLine(l.key, { price: v, manual: true })} /></label>
        <div class="iline-amt"><small>الإجمالي</small><b class="num">${fmtMoney((Number(l.qty) || 0) * (Number(l.price) || 0))}</b></div>
      </div>
      ${l.src_price != null && (l.manual || l.src_cur !== cur) && html`<div class="hint">السعر في الليستة: ${money(l.src_price, l.src_cur)}${l.manual ? html` · <button type="button" class="linkbtn inline" onClick=${() => setLine(l.key, { manual: false, price: conv(l.src_price, l.src_cur, cur, rate) })}>رجّع سعر الليستة</button>` : ''}</div>`}
    </div>`)}
    <button class="btn dark" onClick=${() => openSheet(LinePicker, { lang, cur, rate, onAdd: addLine })}><${Icon} name="plus" size=${22} /> ضيف بند</button>

    <div class="card soft-card stack">
      <div class="grid2">
        <${Field} label=${'خصم (' + (cur === 'USD' ? 'دولار' : 'جنيه') + ')'}><${NumInput} value=${discount} onChange=${(v) => setDiscount(v || 0)} placeholder="0" /><//>
        <${Field} label="ضريبة %"><${NumInput} value=${tax} onChange=${(v) => setTax(v || 0)} placeholder="0" /><//>
      </div>
      <div class="tot"><span>الإجمالي</span><b class="num">${money(t.sub, cur)}</b></div>
      ${t.disc > 0 && html`<div class="tot"><span>خصم</span><b class="num">${money(t.disc, cur)}</b></div>`}
      ${tax > 0 && html`<div class="tot"><span>ضريبة ${fmtQty(tax)}%</span><b class="num">${money(t.tax, cur)}</b></div>`}
      <div class="tot big"><span>الإجمالي المستحق</span><b class="num">${money(t.total, cur)}</b></div>
    </div>

    <${Field} label="ملاحظات (بتظهر في الفاتورة)"><textarea class="input" rows="2" dir="auto" value=${notes} onInput=${(e) => setNotes(e.target.value)}></textarea><//>
    <${Field} label="الشروط" hint="الافتراضي بيتغير من الإعدادات ← الفواتير"><textarea class="input" rows="2" dir="auto" value=${terms} onInput=${(e) => setTerms(e.target.value)}></textarea><//>
    ${S.inv_payment ? html`<label class="check"><input type="checkbox" checked=${showPay} onChange=${(e) => setShowPay(e.target.checked)} /> اطبع بيانات الدفع (الحساب البنكي) في الفاتورة</label>`
      : isAdmin() && html`<div class="hint">بيانات الدفع (الحساب البنكي) تقدر تكتبها من الإعدادات ← الفواتير.</div>`}
  <//>`;
}

/* اختيار البنود: منتجاتنا / مصنعيات / قطع وخامات / بند جديد */
function LinePicker({ lang, cur, rate, onAdd, close }) {
  const { data, idx } = useStore();
  const [seg, setSeg] = useState('product');
  const [q, setQ] = useState('');
  const [n, setN] = useState(0);
  const [free, setFree] = useState({ desc: '', qty: 1, unit: '', price: null });
  const add = (l, name) => { onAdd(l); setN((x) => x + 1); toast('اتضاف: ' + name); };
  const prods = idx.kinds.product.filter((i) => !q || L.matches(idx.hay.get(i.id), q)).sort((a, b) => L.cmpName(a.part_no || 'zz', b.part_no || 'zz'));
  const pitems = data.price_items.filter((x) => x.kind === seg && (!q || L.matches([x.name, x.name_en, x.part_no].join(' '), q)));
  const show = (price, pc) => (price == null ? 'من غير سعر' : money(price, pc) + (pc !== cur && rate ? ' ≈ ' + money(conv(price, pc, cur, rate), cur) : ''));
  function addFree() {
    if (!free.desc.trim()) return toast('اكتب البند', 'bad');
    if (free.price == null) return toast('اكتب السعر', 'bad');
    add({ kind: 'free', desc: free.desc.trim(), qty: free.qty || 1, unit: free.unit.trim(), price: free.price, manual: true, src_price: null }, free.desc.trim());
    setFree({ desc: '', qty: 1, unit: '', price: null });
  }
  return html`<${Sheet} title="ضيف بند" sub=${n ? `ضفت ${n}` : 'دوس على أي حاجة تتضاف على طول'} onClose=${close} full
    footer=${html`<button class="btn bigbtn" onClick=${close}>${n ? `خلصت (${n})` : 'رجوع'}</button>`}>
    <${Segmented} value=${seg} onChange=${(v) => { setSeg(v); setQ(''); }} items=${[['product', 'منتجاتنا'], ['labor', 'مصنعيات'], ['material', 'قطع وخامات'], ['free', 'بند جديد']]} />
    ${seg === 'free' ? html`<div class="stack">
        <${Field} label="البند" req><input class="input" dir="auto" value=${free.desc} placeholder="مثلاً: مصنعية لحام" onInput=${(e) => setFree((x) => ({ ...x, desc: e.target.value }))} /><//>
        <div class="grid2">
          <${Field} label="الكمية"><${NumInput} value=${free.qty} onChange=${(v) => setFree((x) => ({ ...x, qty: v }))} /><//>
          <${Field} label="الوحدة"><input class="input" value=${free.unit} placeholder="اختياري" onInput=${(e) => setFree((x) => ({ ...x, unit: e.target.value }))} /><//>
        </div>
        <${Field} label=${'سعر الوحدة (' + (cur === 'USD' ? 'دولار' : 'جنيه') + ')'} req><${NumInput} value=${free.price} onChange=${(v) => setFree((x) => ({ ...x, price: v }))} placeholder="0.00" /><//>
        <button class="btn dark" onClick=${addFree}><${Icon} name="plus" size=${20} /> ضيف</button>
        <div class="hint">لو بتستخدمه كتير، ضيفه في ليستة الأسعار عشان سعره يبقى ثابت.</div>
      </div>`
    : html`<${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر بالاسم أو رقم القطعة" />
      ${seg === 'product' ? (prods.length === 0 ? html`<${Empty} icon="box" text="مفيش منتجات" />` : html`<div class="card tight">${prods.map((i) => html`<button class="lrow prow" key=${i.id}
          onClick=${() => add({ kind: 'product', ref_id: i.id, part_no: i.part_no || '', desc_ar: i.name, desc_en: i.name_en || i.name, qty: 1, unit: '',
            src_price: i.price != null ? Number(i.price) : null, src_cur: i.price_cur || 'USD', manual: false }, i.name)}>
          <span class="grow">${i.part_no && html`<span class="pn">${i.part_no}</span>`}<b>${lang === 'en' && i.name_en ? i.name_en : i.name}</b></span>
          <span class=${'price ' + (i.price == null ? 'none' : '')}>${show(i.price == null ? null : Number(i.price), i.price_cur)}</span><${Icon} name="plus" size=${18} /></button>`)}</div>`)
      : pitems.length === 0 ? html`<${Empty} icon=${PKIND[seg].icon} text=${'لسه مفيش ' + PKIND[seg].label + ' في ليستة الأسعار'} />`
      : html`<div class="card tight">${pitems.map((x) => html`<button class="lrow prow" key=${x.id}
          onClick=${() => add({ kind: x.kind, ref_id: x.id, part_no: x.part_no || '', desc_ar: x.name, desc_en: x.name_en || x.name, qty: 1, unit: x.unit || '',
            src_price: Number(x.price), src_cur: x.price_cur, manual: false }, x.name)}>
          <span class="grow">${x.part_no && html`<span class="pn">${x.part_no}</span>`}<b>${lang === 'en' && x.name_en ? x.name_en : x.name}</b>${x.unit && html`<small>لكل ${x.unit}</small>`}</span>
          <span class="price">${show(Number(x.price), x.price_cur)}</span><${Icon} name="plus" size=${18} /></button>`)}</div>`}`}
  <//>`;
}

/* ملف الـ PDF بتاع الفاتورة */
export async function invoiceFile(v) {
  const S = getStore().data.settings;
  const en = v.lang === 'en';
  const blob = await buildInvoicePdf({
    lang: v.lang, ref: v.ref, date: v.inv_date, dateText: en ? L.fmtDateEn(v.inv_date) : L.fmtDate(v.inv_date),
    currency: v.currency, rate: v.rate != null ? Number(v.rate) : null, showRate: v.show_rate, paid: v.paid,
    company: { name: en ? S.company_en : S.company_ar, address: en ? S.address_en : S.address_ar, phone: S.phone, email: S.email },
    billTo: v.bill || {}, lines: (v.lines || []).map((l) => ({ ...l, qty: Number(l.qty), price: Number(l.price) })),
    discount: Number(v.discount), taxPct: Number(v.tax_pct), notes: v.notes, payment: v.show_payment ? S.inv_payment : '', terms: v.terms,
  });
  return fileFrom(blob, safeName(`${v.ref} ${(v.bill && v.bill.name) || ''}`) + '.pdf');
}

export function InvoiceSheet({ id, close }) {
  const { idx } = useStore();
  const v = idx.invoices.get(id);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const stamp = v ? v.updated_at + ':' + v.paid : '';
  useEffect(() => { setFile(null); }, [stamp]);
  if (!v) return html`<${Sheet} title="الفاتورة" onClose=${close}><${Empty} icon="file" text="الفاتورة دي اتمسحت" /><//>`;
  const b = v.bill || {};
  async function make() {
    setBusy(true);
    try { setFile(await invoiceFile(v)); } catch (e) { toast('مقدرتش أجهّز الملف: ' + errText(e), 'bad'); }
    setBusy(false);
  }
  async function togglePaid() { await run(() => call('invoice_set_paid', { p_id: v.id, p_paid: !v.paid }), v.paid ? 'اتعلمت إنها لسه' : 'اتعلمت إنها اتدفعت ✓'); }
  async function del() {
    if (!(await confirmBox({ title: 'مسح ' + v.ref + '؟', text: 'الفاتورة هتتمسح خالص. مفيش رجوع.', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('invoice_delete', { p_id: v.id }), 'اتمسحت');
    if (r.ok) close();
  }
  return html`<${Sheet} title=${'فاتورة ' + v.ref} sub=${L.bidi(b.name, L.fmtDate(v.inv_date))} onClose=${close} full
    footer=${html`<div class="stack">
      ${file ? html`<${FileReady} file=${file} text=${'Invoice ' + v.ref} />`
        : html`<button class="btn bigbtn dark" disabled=${busy} onClick=${make}>${busy ? 'بجهّز...' : html`<${Icon} name="file" size=${22} /> الفاتورة PDF`}</button>`}
    </div>`}>
    <div class="row gap8 wrap"><${Pill} tone=${v.paid ? 'green' : 'amber'}>${v.paid ? 'مدفوعة' : 'لسه ما اتدفعتش'}<//>
      <${Pill}>${v.lang === 'en' ? 'English' : 'عربي'}<//><${Pill}>${v.currency === 'USD' ? 'دولار' : 'جنيه'}<//>
      ${v.rate && html`<span class="soft tiny ltr-t">1 USD = ${fmtQty(v.rate)} EGP</span>`}</div>
    <div class="card soft-card"><b>${b.name}</b>${[b.phone, b.extra, b.address, b.country].filter(Boolean).map((s) => html`<div class="soft" dir="auto">${s}</div>`)}</div>
    <div class="card tight">${(v.lines || []).map((l, n) => html`<div class="trow" key=${n}>
      <div class="grow"><div class="irow-title" dir="auto">${l.desc}</div><div class="irow-sub">${l.part_no && html`<span class="pn">${l.part_no}</span>`}<span class="num">${fmtQty(l.qty)}${l.unit ? ' ' + l.unit : ''} × ${fmtMoney(l.price)}</span></div></div>
      <b class="num">${fmtMoney(Number(l.qty) * Number(l.price))}</b></div>`)}</div>
    <div class="card soft-card stack">
      <div class="tot"><span>الإجمالي</span><b class="num">${money(v.subtotal, v.currency)}</b></div>
      ${Number(v.discount) > 0 && html`<div class="tot"><span>خصم</span><b class="num">${money(v.discount, v.currency)}</b></div>`}
      ${Number(v.tax_pct) > 0 && html`<div class="tot"><span>ضريبة ${fmtQty(v.tax_pct)}%</span><b class="num">${money(Number(v.total) - Number(v.subtotal) + Number(v.discount), v.currency)}</b></div>`}
      <div class="tot big"><span>الإجمالي المستحق</span><b class="num">${money(v.total, v.currency)}</b></div>
    </div>
    ${v.notes && html`<div class="soft" dir="auto">${v.notes}</div>`}
    <div class="grid2">
      <button class=${'btn ' + (v.paid ? 'ghost' : 'green')} onClick=${togglePaid}><${Icon} name=${v.paid ? 'undo' : 'check'} size=${20} /> ${v.paid ? 'لسه ما اتدفعتش' : 'اتدفعت'}</button>
      <button class="btn ghost" onClick=${() => { close(); openSheet(InvoiceForm, { id: v.id }); }}><${Icon} name="edit" size=${20} /> تعديل</button>
    </div>
    <div class="row gap8 wrap">
      <button class="linkbtn" onClick=${() => { close(); openSheet(InvoiceForm, { preset: { ...v, id: undefined, ref: undefined, inv_date: L.todayStr(), paid: false } }); }}><${Icon} name="layers" size=${15} /> فاتورة جديدة زيها</button>
      ${isAdmin() && html`<button class="linkbtn danger" onClick=${del}><${Icon} name="trash" size=${15} /> مسح الفاتورة</button>`}
    </div>
    <div class="hint">اتعملت بواسطة ${v.created_by || '—'} · ${L.fmtDateTime(v.created_at)}</div>
  <//>`;
}
