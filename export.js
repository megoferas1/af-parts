/* export.js — التصدير: المنتجات، الشحنات، العملاء */
import { html, useState, useMemo, Icon, Pill, Empty, Field, Chips, Stepper, SearchBox, Segmented, Sheet, Hero, openSheet, toast, confirmBox } from './ui.js?v=12';
import { call, errText } from './api.js?v=12';
import { useStore, getStore, reload, ownerText, canInvoice } from './store.js?v=12';
import { InvoiceForm, invoiceFromShipment } from './invoices.js?v=12';
import * as L from './lib.js?v=12';
import { ItemRow, ItemPicker, startNewItem, groupBy, run } from './items.js?v=12';
import { StickerSheet, labelFor, FileReady } from './stickers.js?v=12';
import { buildPdf, buildXlsx, fileFrom, safeName } from './docs.js?v=12';
import { ScanSheet } from './qr.js?v=12';
import { HeroScan } from './home.js?v=12';

export function ExportTab() {
  const { idx, data } = useStore();
  const [seg, setSeg] = useState('products');
  const [q, setQ] = useState('');
  const drafts = data.shipments.filter((s) => s.status === 'draft').length;
  const prods = useMemo(() => idx.kinds.product.filter((i) => !q || L.matches(idx.hay.get(i.id), q)), [idx, q]);
  return html`
    <${Hero} title="التصدير" sub=${`${L.sum(idx.kinds.product, (i) => i.qty)} قطعة متخزنة · ${data.customers.length} عميل`} right=${html`<${HeroScan} />`} />
    <main class="body">
      <${Segmented} value=${seg} onChange=${setSeg} items=${[['products', 'المنتجات'], ['shipments', 'الشحنات', drafts], ['customers', 'العملاء']]} />
      ${seg === 'products' && html`
        <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر في المنتجات" />
        <button class="btn" onClick=${() => startNewItem({ kind: 'product' })}><${Icon} name="plus" size=${22} /> منتج جديد</button>
        ${prods.length === 0 ? html`<${Empty} icon="box" text=${q ? 'مفيش منتج كده' : 'لسه مفيش منتجات — سجّل اللي بتصنّعوه'} />`
          : groupBy(prods, (i) => i.category, idx.cats.product).map(([cat, its]) => html`<div class="grp" key=${cat}>
              <div class="grp-h">${cat} <i>${L.sum(its, (i) => i.qty)}</i></div>
              <div class="card tight">${its.map((i) => html`<${ItemRow} item=${i} key=${i.id} extra=${i.name_en && html`<span class="soft tiny ltr-t">${i.name_en}</span>`} />`)}</div></div>`)}
`}
      ${seg === 'shipments' && html`
        <button class="btn" onClick=${() => openSheet(ShipmentForm, {})}><${Icon} name="plus" size=${22} /> شحنة جديدة</button>
        ${data.shipments.length === 0 ? html`<${Empty} icon="globe" text="لسه مفيش شحنات" />`
          : html`<div class="stack">${data.shipments.map((s) => html`<${ShipCard} s=${s} key=${s.id} />`)}</div>`}`}
      ${seg === 'customers' && html`
        <button class="btn" onClick=${() => openSheet(CustomerForm, {})}><${Icon} name="plus" size=${22} /> عميل جديد</button>
        ${data.customers.length === 0 ? html`<${Empty} icon="users" text="لسه مفيش عملاء" />`
          : html`<div class="card tight">${data.customers.map((c) => html`<button class="lrow" key=${c.id} onClick=${() => openSheet(CustomerForm, { id: c.id })}>
              <span class="avatar sm">${c.name.trim().charAt(0)}</span>
              <span class="grow"><b>${c.name}</b><small>${L.bidi(c.country, c.phone, c.email) || '—'}</small></span>
              <small class="soft">${data.shipments.filter((s) => s.customer_id === c.id).length} شحنة</small></button>`)}</div>`}`}
    </main>`;
}

function ShipCard({ s }) {
  const { idx } = useStore();
  const c = idx.customers.get(s.customer_id);
  return html`<button class=${'tcard s-' + (s.status === 'draft' ? 'prep' : 'closed')} onClick=${() => openSheet(ShipmentSheet, { id: s.id })}>
    <span class="tcard-ic"><${Icon} name="globe" size=${24} /></span>
    <span class="grow"><b>${L.bidi(s.ref, c ? c.name : '—')}</b><small>${L.bidi(L.fmtDate(s.ship_date), c && c.country, s.items.length + ' حاجة', L.sum(s.items, (x) => x.qty) + ' قطعة')}</small></span>
    <${Pill} tone=${s.status === 'draft' ? 'amber' : 'gray'}>${s.status === 'draft' ? 'بتتجهز' : 'اتشحنت'}<//>
  </button>`;
}

export function CustomerForm({ id, onSaved, close }) {
  const { idx } = useStore();
  const c = id ? idx.customers.get(id) : null;
  const [f, setF] = useState(c ? { address: '', ...c } : { name: '', country: '', phone: '', email: '', address: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!f.name.trim()) return toast('اكتب اسم العميل', 'bad');
    setBusy(true);
    try {
      const cid = await call('save_customer', { p_id: id || null, p: f });
      await reload().catch(() => {});
      toast('اتحفظ'); close(); if (onSaved) onSaved(cid);
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  async function del() {
    if (!(await confirmBox({ title: 'مسح ' + c.name + '؟', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('delete_customer', { p_id: id }), 'اتمسح');
    if (r.ok) close();
  }
  return html`<${Sheet} title=${id ? 'بيانات العميل' : 'عميل جديد'} onClose=${close}
    footer=${html`<div class="stack"><button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
      ${id && html`<button class="btn ghost" onClick=${del}><${Icon} name="trash" size=${18} /> مسح</button>`}</div>`}>
    <${Field} label="اسم العميل / الشركة" req><input class="input" value=${f.name} onInput=${(e) => set('name', e.target.value)} /><//>
    <${Field} label="البلد"><input class="input" value=${f.country} placeholder="مثلاً: UAE" onInput=${(e) => set('country', e.target.value)} /><//>
    <div class="grid2">
      <${Field} label="التليفون"><input class="input ltr" inputmode="tel" value=${f.phone} onInput=${(e) => set('phone', e.target.value)} /><//>
      <${Field} label="الإيميل"><input class="input ltr" type="email" value=${f.email} onInput=${(e) => set('email', e.target.value)} /><//>
    </div>
    <${Field} label="العنوان"><textarea class="input" rows="2" value=${f.address} onInput=${(e) => set('address', e.target.value)}></textarea><//>
    <${Field} label="ملاحظات"><textarea class="input" rows="2" value=${f.note} onInput=${(e) => set('note', e.target.value)}></textarea><//>
  <//>`;
}

/* بيانات العميل الجديد (الاسم والتليفون والبلد والعنوان) */
function CustomerFields({ c, set }) {
  return html`<div class="stack">
    <${Field} label="اسم العميل / الشركة" req><input class="input" value=${c.name} placeholder="مثلاً: عمر صقر" onInput=${(e) => set('name', e.target.value)} /><//>
    <div class="grid2">
      <${Field} label="التليفون"><input class="input ltr" inputmode="tel" value=${c.phone} onInput=${(e) => set('phone', e.target.value)} /><//>
      <${Field} label="البلد"><input class="input" value=${c.country} placeholder="مثلاً: مصر" onInput=${(e) => set('country', e.target.value)} /><//>
    </div>
    <${Field} label="العنوان"><textarea class="input" rows="2" value=${c.address} placeholder="المدينة، الشارع…" onInput=${(e) => set('address', e.target.value)}></textarea><//>
    <${Field} label="الإيميل (اختياري)"><input class="input ltr" type="email" value=${c.email} onInput=${(e) => set('email', e.target.value)} /><//>
  </div>`;
}

/*
  شحنة جديدة: بتاخد بيانات العميل (جديد أو من اللي عندنا) وتفتحله الشحنة.
  itemId: لو جاية من "خروج ← شحن" لقطعة أو منتج، الحاجة دي بتتحط في الشحنة على طول.
*/
export function ShipmentForm({ id, itemId, unitCode, close }) {
  const { data, idx } = useStore();
  const s = id ? data.shipments.find((x) => x.id === id) : null;
  const item = itemId ? idx.items.get(itemId) : null;
  const driver = item && item.driver_id ? idx.drivers.get(item.driver_id) : null;
  const avail = unitCode ? 1 : item ? item.qty - (idx.shipQty.get(item.id) || 0) : 0;
  const drafts = item ? data.shipments.filter((x) => x.status === 'draft') : [];
  const hasCust = data.customers.length > 0;
  const [mode, setMode] = useState(s ? 'old' : 'new');
  const [cust, setCust] = useState(s ? s.customer_id : '');
  const [c, setC] = useState({ name: '', phone: '', country: '', address: '', email: '' });
  const [date, setDate] = useState(s ? s.ship_date : L.todayStr());
  const [note, setNote] = useState(s ? s.note : '');
  const [qty, setQty] = useState(item ? (item.kind === 'part' ? Math.max(1, avail) : 1) : 1);
  const [busy, setBusy] = useState(false);
  const setc = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const picked = cust && idx.customers.get(cust);

  function toOwner() {
    const same = data.customers.find((x) => x.name.trim() === driver.name.trim());
    if (same) { setMode('old'); setCust(same.id); return; }
    setMode('new');
    setC((x) => ({ ...x, name: driver.name, phone: driver.phone || x.phone }));
  }
  async function addToDraft(sh) {
    setBusy(true);
    try {
      if (unitCode) await call('shipment_add_unit', { p_ship: sh.id, p_code: unitCode });
      else await call('shipment_add', { p_ship: sh.id, p_items: [{ item_id: item.id, qty }] });
      await reload().catch(() => {});
      toast('اتضافت لشحنة ' + sh.ref); close();
      openSheet(ShipmentSheet, { id: sh.id });
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  async function save() {
    if (mode === 'new' && !c.name.trim()) return toast('اكتب اسم العميل', 'bad');
    if (mode === 'old' && !cust) return toast('اختار العميل', 'bad');
    if (item && avail < 1) return toast('مفيش منها حاجة فاضية للشحن', 'bad');
    setBusy(true);
    try {
      let sid;
      if (id) {
        const cid = mode === 'new' ? await call('save_customer', { p_id: null, p: c }) : cust;
        sid = await call('shipment_save', { p_id: id, p: { customer_id: cid, ship_date: date, note } });
      } else {
        sid = await call('shipment_create', { p: {
          customer_id: mode === 'old' ? cust : null, customer: mode === 'new' ? c : null, ship_date: date, note,
          items: item && !unitCode ? [{ item_id: item.id, qty }] : [] } });
        if (unitCode) await call('shipment_add_unit', { p_ship: sid, p_code: unitCode });
      }
      await reload().catch(() => {});
      toast(id ? 'اتحفظت' : item ? 'الشحنة اتفتحت — دوس "اتشحنت" لما تطلع' : 'الشحنة اتفتحت، ضيف الحاجات اللي فيها');
      close();
      if (!id) openSheet(ShipmentSheet, { id: sid });
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }

  return html`<${Sheet} title=${id ? 'تعديل الشحنة' : item ? 'شحن ' + item.name : 'شحنة جديدة'} sub=${item ? L.bidi(item.size, unitCode || (item.kind === 'product' ? item.part_no : item.code), item.kind === 'part' ? ownerText(item, idx) : '') : ''} onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : id ? 'حفظ' : html`<${Icon} name="globe" size=${22} /> افتح الشحنة`}</button>`}>
    ${item && html`<div class="card soft-card stack">
      ${avail < 1 ? html`<div class="note warn"><${Icon} name="alert" size=${18} /><span>كل اللي عندنا منها في شحنة بتتجهز.</span></div>`
        : avail > 1 ? html`<${Field} label="كام واحدة هتتشحن؟" hint=${item.kind === 'product' ? 'هياخد أقدم قطع في المخزن بأكوادها، وتقدر تعمل سكان بدل كده جوه الشحنة' : ''}><${Stepper} value=${qty} min=${1} max=${avail} onChange=${setQty} big /><//>`
        : html`<div class="row gap8"><${Icon} name="box" size=${18} /><span>هتتشحن <b class="num">1</b></span></div>`}
    </div>`}
    ${item && avail > 0 && drafts.length > 0 && html`<${Field} label="ضيفها لشحنة بتتجهز؟" hint="أو كمّل تحت وافتح شحنة جديدة">
      <div class="stack">${drafts.map((d) => {
        const dc = idx.customers.get(d.customer_id);
        return html`<button class="lrow boxed" key=${d.id} disabled=${busy} onClick=${() => addToDraft(d)}>
          <span class="avatar sm"><${Icon} name="globe" size=${16} /></span>
          <span class="grow"><b>${L.bidi(d.ref, dc ? dc.name : '')}</b><small>${d.items.length} حاجة · ${L.fmtDate(d.ship_date)}</small></span>
          <${Icon} name="plus" size=${18} /></button>`;
      })}</div><//>`}

    <div class="sec-title"><span class="grow">${item ? 'رايحة لمين؟' : 'العميل'}</span></div>
    ${driver && html`<button type="button" class="btn ghost sm" onClick=${toOwner}><${Icon} name="user" size=${18} /> لصاحبها: ${driver.name}</button>`}
    ${hasCust && html`<${Segmented} value=${mode} onChange=${setMode} items=${[['new', 'عميل جديد'], ['old', 'عميل عندنا']]} />`}
    ${mode === 'new' ? html`<${CustomerFields} c=${c} set=${setc} />`
      : html`<${Field} label="اختار العميل" req>
          <select class="input" value=${cust} onChange=${(e) => setCust(e.target.value)}>
            <option value="">— اختار العميل —</option>
            ${data.customers.map((x) => html`<option value=${x.id}>${x.name}${x.country ? ' (' + x.country + ')' : ''}</option>`)}
          </select>
          ${picked && html`<div class="hint">${L.bidi(picked.phone, picked.country) || (picked.address ? '' : 'مفيش بيانات تانية')}${picked.address && html`<div dir="auto">${picked.address}</div>`}</div>`}
        <//>`}

    <div class="sec-title"><span class="grow">الشحنة</span></div>
    <${Field} label="تاريخ الشحن"><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /><//>
    <${Field} label="ملاحظات (بتظهر في الـ Packing List)"><textarea class="input" rows="2" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea><//>
  <//>`;
}

export function ShipmentSheet({ id, close }) {
  const { data, idx } = useStore();
  const s = data.shipments.find((x) => x.id === id) || idx.shipments.get(id);
  if (!s) return html`<${Sheet} title="الشحنة" onClose=${close}><${Empty} text="الشحنة دي اتمسحت" /><//>`;
  const c = idx.customers.get(s.customer_id);
  const draft = s.status === 'draft';
  const inShip = (iid) => (s.items.find((x) => x.item_id === iid) || {}).qty || 0;
  const hasParts = s.items.some((x) => (idx.items.get(x.item_id) || {}).kind === 'part');
  function add() {
    openSheet(ItemPicker, {
      title: 'ضيف حاجات للشحنة', kinds: hasParts ? ['part', 'product'] : ['product', 'part'],
      limit: (i) => i.qty - ((idx.shipQty.get(i.id) || 0) - inShip(i.id)) - inShip(i.id),
      onDone: async (sel) => {
        try { await call('shipment_add', { p_ship: id, p_items: sel }); await reload(); toast('اتضافت'); return true; }
        catch (e) { toast(errText(e), 'bad'); return false; }
      },
    });
  }
  function scan() {
    openSheet(ScanSheet, {
      continuous: true, title: 'ضيف للشحنة ' + s.ref, hint: 'امسح استيكر كل قطعة وانت بتحطها في الصندوق',
      onCode: async (code) => {
        const st = getStore().idx;
        if (st.unitByCode.has(code) || !st.byCode.has(code)) {
          try { const r = await call('shipment_add_unit', { p_ship: id, p_code: code }); await reload(); const i = st.items.get(r.item_id); return { ok: true, msg: '+1 ' + (i ? i.name : '') + ' · ' + r.code }; }
          catch (e) { return { ok: false, msg: errText(e) }; }
        }
        const it = st.byCode.get(code);
        if (it.kind === 'tool') return { ok: false, msg: 'العدة مش بتتشحن' };
        if (it.kind === 'product') return { ok: false, msg: 'امسح استيكر القطعة نفسها (زي ' + (it.part_no || '') + '-0001)' };
        try { await call('shipment_add', { p_ship: id, p_items: [{ item_id: it.id, qty: 1 }] }); await reload(); return { ok: true, msg: '+1 ' + it.name }; }
        catch (e) { return { ok: false, msg: errText(e) }; }
      },
    });
  }
  async function ship() {
    if (!(await confirmBox({ title: 'اتشحنت؟', text: `${L.sum(s.items, (x) => x.qty)} قطعة هتخرج من المخزن لـ ${c ? c.name : ''}.`, ok: 'اتشحنت' }))) return;
    await run(() => call('shipment_ship', { p_ship: id }), 'الشحنة اتسجلت ✈');
  }
  async function del() {
    if (!(await confirmBox({ title: 'مسح الشحنة؟', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('shipment_delete', { p_ship: id }), 'اتمسحت');
    if (r.ok) close();
  }
  return html`<${Sheet} title=${'شحنة ' + s.ref} sub=${L.bidi(c ? c.name : '—', c && c.country, L.fmtDate(s.ship_date))} onClose=${close} full
    footer=${html`<div class="stack">
      ${draft && html`<button class="btn bigbtn" disabled=${!s.items.length} onClick=${ship}><${Icon} name="globe" size=${22} /> اتشحنت</button>`}
      <button class=${'btn ' + (draft ? 'ghost' : 'bigbtn dark')} onClick=${() => openSheet(PackingListSheet, { id })}><${Icon} name="file" size=${20} /> Packing List (PDF / Excel)</button>
      ${canInvoice() && s.items.length > 0 && html`<button class="btn ghost" onClick=${() => openSheet(InvoiceForm, { preset: invoiceFromShipment(s) })}><${Icon} name="file" size=${20} /> اعمل فاتورة للشحنة دي</button>`}
    </div>`}>
    <div class="row gap8 wrap"><${Pill} tone=${draft ? 'amber' : 'gray'}>${draft ? 'بتتجهز' : 'اتشحنت ' + L.fmtDateTime(s.shipped_at)}<//>${s.note && html`<span class="soft">${s.note}</span>`}</div>
    ${c && html`<button class="lrow boxed" onClick=${() => openSheet(CustomerForm, { id: c.id })}>
      <span class="avatar sm">${c.name.trim().charAt(0)}</span>
      <span class="grow"><b>${c.name}</b><small>${L.bidi(c.phone, c.country) || (c.address ? '' : 'دوس هنا وضيف التليفون والعنوان')}</small>${c.address && html`<small dir="auto">${c.address}</small>`}</span>
      <${Icon} name="edit" size=${16} /></button>`}
    ${draft && html`<div class="grid2">
      <button class="btn dark sm" onClick=${scan}><${Icon} name="scan" size=${18} /> سكان وضيف</button>
      <button class="btn ghost sm" onClick=${add}><${Icon} name="plus" size=${18} /> اختار بالعدد</button></div>`}
    ${s.items.length === 0 ? html`<${Empty} icon="box" text="الشحنة فاضية" />` : html`<div class="card tight">${s.items.map((x) => {
      const i = idx.items.get(x.item_id);
      if (!i) return null;
      return html`<div class="trow" key=${x.item_id}>
        <div class="grow"><div class="irow-title">${i.name}${i.size && html`<span class="size">${i.size}</span>`}</div><div class="irow-sub">${i.kind === 'product' ? html`<span class="pn">${i.part_no}</span>` : i.code && html`<span class="code">${i.code}</span>`}${i.kind === 'part' ? html`<span>${ownerText(i, idx)}</span>` : i.name_en && html`<span class="ltr-t">${i.name_en}</span>`}<span>عندنا ${i.qty}</span></div>
          ${i.kind === 'product' && html`<div class="unitcodes">${(s.units || []).filter((u) => u.item_id === i.id).map((u) => html`<span key=${u.id}>${u.code}${draft && html`<button aria-label="شيل" onClick=${() => run(() => call('shipment_remove_unit', { p_ship: id, p_unit: u.id }))}><${Icon} name="x" size=${13} /></button>`}</span>`)}</div>`}</div>
        ${draft ? html`<${Stepper} value=${x.qty} min=${0} max=${i.qty} onChange=${(v) => run(() => call('shipment_set_qty', { p_ship: id, p_item: i.id, p_qty: v }))} />` : html`<div class="qty"><b class="num">${x.qty}</b></div>`}
      </div>`;
    })}</div>`}
    <div class="spread"><b>الإجمالي</b><b class="num">${L.sum(s.items, (x) => x.qty)} قطعة</b></div>
    ${draft && html`<div class="row gap8 wrap">
      <button class="linkbtn" onClick=${() => openSheet(ShipmentForm, { id })}><${Icon} name="edit" size=${15} /> تعديل البيانات</button>
      <button class="linkbtn danger" onClick=${del}><${Icon} name="trash" size=${15} /> مسح الشحنة</button></div>`}
  <//>`;
}

export function PackingListSheet({ id, close }) {
  const { data, idx } = useStore();
  const s = data.shipments.find((x) => x.id === id);
  const [lang, setLang] = useState('en');
  const [fmt, setFmt] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  if (!s) return null;
  const c = idx.customers.get(s.customer_id) || {};
  async function make() {
    setBusy(true); setFile(null);
    try {
      const S = data.settings, en = lang === 'en';
      const total = L.sum(s.items, (x) => x.qty);
      const rows = s.items.map((x, n) => {
        const i = idx.items.get(x.item_id) || {};
        return { n: n + 1, code: i.part_no || i.code, name: en ? (i.name_en || i.name) : i.name, size: i.size || '—', qty: x.qty };
      });
      /* أكواد قطع التصدير اللي في الشحنة (AF-ANG-001: 0001، 0002...) */
      const serials = s.items.map((x) => {
        const i = idx.items.get(x.item_id) || {};
        const us = (s.units || []).filter((u) => u.item_id === x.item_id).map((u) => u.code);
        return us.length ? { pn: i.part_no, sn: us.map((c) => c.slice(String(i.part_no || '').length + 1) || c).join(', ') } : null;
      }).filter(Boolean);
      const meta = en
        ? [['Shipment No.', s.ref], ['Date', L.fmtDateEn(s.ship_date)], ['Customer', c.name || '—'], ['Country', c.country || '—'],
          ...(c.address ? [['Address', c.address]] : []),
          ['Contact', [c.phone, c.email].filter(Boolean).join(' / ') || '—'], ['Total quantity', total + ' pcs']]
        : [['رقم الشحنة', s.ref], ['التاريخ', L.fmtDate(s.ship_date)], ['العميل', c.name || '—'], ['البلد', c.country || '—'],
          ...(c.address ? [['العنوان', c.address]] : []),
          ['التواصل', [c.phone, c.email].filter(Boolean).join(' / ') || '—'], ['إجمالي الكمية', total + ' قطعة']];
      const cols = en
        ? [{ key: 'n', label: '#', w: 0.5, align: 'center' }, { key: 'code', label: 'Part No.', w: 1.5 }, { key: 'name', label: 'Description', w: 4 }, { key: 'size', label: 'Size / Model', w: 2 }, { key: 'qty', label: 'Qty', w: 0.9, align: 'center' }]
        : [{ key: 'n', label: '#', w: 0.5, align: 'center' }, { key: 'code', label: 'رقم القطعة', w: 1.5 }, { key: 'name', label: 'الصنف', w: 4 }, { key: 'size', label: 'المقاس / الموديل', w: 2 }, { key: 'qty', label: 'الكمية', w: 0.9, align: 'center' }];
      const footer = en ? [S.company_en, S.address_en, S.phone, S.email].filter(Boolean).join(' — ') : [S.company_ar, S.address_ar, S.phone].filter(Boolean).join(' — ');
      const base = safeName(`${s.ref} ${c.name || ''} packing list`);
      if (fmt === 'pdf') {
        const blob = await buildPdf({ dir: en ? 'ltr' : 'rtl', title: en ? 'PACKING LIST' : 'قائمة التعبئة (Packing List)', subtitle: en ? S.company_en : S.company_ar, meta, footer,
          sections: [{ title: en ? 'Items' : 'الأصناف', columns: cols, rows, total: en ? `Total: ${total} pcs` : `الإجمالي: ${total} قطعة` },
            ...(serials.length ? [{ title: en ? 'Serial numbers' : 'أكواد القطع', columns: [{ key: 'pn', label: en ? 'Part No.' : 'رقم القطعة', w: 1.5 }, { key: 'sn', label: en ? 'Serial No.' : 'الأكواد', w: 6.4 }], rows: serials }] : []),
            ...(s.note ? [{ title: en ? 'Notes' : 'ملاحظات', columns: [{ key: 't', label: en ? 'Note' : 'ملاحظة', w: 1 }], rows: [{ t: s.note }] }] : [])],
          signatures: en ? ['Prepared by', 'Checked by', 'Received by'] : ['جهّزها', 'راجعها', 'استلمها'] });
        setFile(fileFrom(blob, base + (en ? '' : ' AR') + '.pdf'));
      } else {
        const blob = buildXlsx([{ name: 'Packing List', rtl: !en, title: (en ? 'PACKING LIST — ' + S.company_en : 'قائمة التعبئة — ' + S.company_ar), meta,
          columns: cols.map((x) => ({ label: x.label, w: x.key === 'name' ? 36 : x.key === 'n' ? 5 : 16 })),
          rows: [...rows.map((r) => [r.n, r.code, r.name, r.size, r.qty]), ['', '', '', en ? 'Total' : 'الإجمالي', total],
            ...(serials.length ? [[], ['', en ? 'Serial numbers' : 'أكواد القطع'], ...serials.map((r) => ['', r.pn, r.sn])] : [])] }]);
        setFile(fileFrom(blob, base + (en ? '' : ' AR') + '.xlsx'));
      }
    } catch (e) { toast('مقدرتش أجهّز الملف: ' + errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title="Packing List" sub=${L.bidi(s.ref, c.name)} onClose=${close}>
    <${Field} label="اللغة"><${Chips} items=${[['en', 'English'], ['ar', 'عربي']]} value=${lang} onChange=${(v) => { setLang(v); setFile(null); }} /><//>
    <${Field} label="نوع الملف"><${Chips} items=${[['pdf', 'PDF'], ['xlsx', 'Excel']]} value=${fmt} onChange=${(v) => { setFmt(v); setFile(null); }} /><//>
    ${lang === 'en' && s.items.some((x) => { const i = idx.items.get(x.item_id) || {}; return i.kind === 'product' && !i.name_en; }) && html`<div class="note warn"><${Icon} name="alert" size=${18} /><span>فيه منتجات ملهاش اسم إنجليزي، هيظهر اسمها العربي. تقدر تكتبه من "تعديل" في صفحة المنتج.</span></div>`}
    ${file ? html`<${FileReady} file=${file} text=${'Packing list ' + s.ref} />`
      : html`<button class="btn bigbtn dark" disabled=${busy} onClick=${make}>${busy ? 'بجهّز...' : html`<${Icon} name="file" size=${22} /> جهّز الملف`}</button>`}
  <//>`;
}
