/* units.js — قطع التصدير: كل قطعة ليها كود لوحدها (رقم القطعة + مسلسل، زي AF-ANG-001-0007) */
import { html, useState, useEffect, Icon, Pill, Empty, Spinner, Field, Stepper, Chips, Act, Sheet, SecTitle, openSheet, toast, confirmBox } from './ui.js?v=8';
import { call, errText } from './api.js?v=8';
import { useStore, reload } from './store.js?v=8';
import * as L from './lib.js?v=8';
import { StickerSheet } from './stickers.js?v=8';
import { ItemSheet, run } from './items.js?v=8';
import { ShipmentForm, ShipmentSheet } from './export.js?v=8';

export const unitLabel = (code, item) => ({ code, title: item.name + (item.size ? ' · ' + item.size : ''), sub: item.name_en || item.part_no || '' });

/* بعد ما القطع اتسجلت: استيكراتها على طول */
function printNew(codes, item) {
  openSheet(StickerSheet, { labels: codes.map((c) => unitLabel(c, item)), title: codes.length === 1 ? 'استيكر ' + codes[0] : `استيكرات ${codes.length} قطعة` });
}
export async function makeUnits(item, n) {
  try {
    const codes = await call('make_units', { p_item: item.id, p_count: n, p_note: '' });
    await reload().catch(() => {});
    toast(n === 1 ? 'اتسجلت ' + codes[0] : `اتسجلت ${n} قطعة ✓`);
    printNew(codes, item);
    return true;
  } catch (e) { toast(errText(e), 'bad'); return false; }
}

/* «صنّعنا»: دفعة كاملة مرة واحدة */
export function MakeSheet({ id, close }) {
  const { idx } = useStore();
  const item = idx.items.get(id);
  const [n, setN] = useState(1);
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  async function go() {
    setBusy(true);
    if (await makeUnits(item, n)) close();
    setBusy(false);
  }
  return html`<${Sheet} title="صنّعنا كام قطعة؟" sub=${L.bidi(item.name, item.part_no)} onClose=${close}
    footer=${html`<button class="btn bigbtn green" disabled=${busy} onClick=${go}>${busy ? 'لحظة...' : html`<${Icon} name="check" size=${22} /> سجّل ${n} واطبع استيكراتهم`}</button>`}>
    <${Stepper} value=${n} min=${1} max=${200} onChange=${setN} big />
    <div class="note info"><${Icon} name="qr" size=${18} /><span>كل قطعة هتاخد كود لوحدها زي <b class="ltr-t">${item.part_no}-0001</b>، وملف الاستيكرات هيطلعلك على طول.</span></div>
  <//>`;
}

/* القطع اللي في المخزن جوه صفحة المنتج */
export function UnitsBlock({ item }) {
  const { idx } = useStore();
  const [all, setAll] = useState(false);
  const units = idx.unitsByItem.get(item.id) || [];
  const show = all ? units : units.slice(0, 12);
  return html`
    <${SecTitle} right=${units.length > 0 && html`<button class="linkbtn" onClick=${() => openSheet(StickerSheet, { labels: units.map((u) => unitLabel(u.code, item)), title: 'استيكرات ' + item.name })}><${Icon} name="printer" size=${15} /> اطبعهم كلهم</button>`}>
      القطع اللي عندنا (${units.length})<//>
    ${units.length === 0 ? html`<${Empty} icon="box" text="مفيش قطع في المخزن — دوس «صنّعنا» لما تخلص دفعة" />`
      : html`<div class="unitgrid">${show.map((u) => {
        const sh = idx.unitShip.get(u.id);
        return html`<button class=${'unitchip' + (sh ? ' inship' : '')} key=${u.id} onClick=${() => openSheet(UnitSheet, { code: u.code, itemId: item.id })}>
          <b class="ltr-t">${u.code}</b>${sh && html`<small>${sh.ref}</small>`}</button>`;
      })}</div>
      ${units.length > 12 && !all && html`<button class="linkbtn center" onClick=${() => setAll(true)}>اعرض الكل (${units.length})</button>`}`}`;
}

/* صفحة قطعة واحدة بكودها */
export function UnitSheet({ code, itemId, close }) {
  const { idx, data } = useStore();
  const u = idx.unitByCode.get(code);
  const item = idx.items.get((u && u.item_id) || itemId);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (u) return;
    let off = false;
    call('code_info', { p_code: code }).then((r) => { if (!off) setInfo(r || {}); }).catch(() => { if (!off) setInfo({}); });
    return () => { off = true; };
  }, [code, !!u]);
  if (!item) return html`<${Sheet} title=${code} onClose=${close}><${Empty} icon="info" text="المنتج ده اتمسح" /><//>`;
  const sh = u && idx.unitShip.get(u.id);
  const drafts = data.shipments.filter((s) => s.status === 'draft');
  let status;
  if (u) status = sh ? html`<${Pill} tone="amber" icon="globe">في شحنة ${sh.ref} بتتجهز<//>` : html`<${Pill} tone="green">في المخزن<//>`;
  else if (!info) status = html`<${Spinner} />`;
  else if (info.unit_status === 'shipped') status = html`<${Pill} tone="dark" icon="globe">اتشحنت ${info.ship_ref || ''}<//>`;
  else status = html`<${Pill} tone="red">خرجت${info.note ? ' — ' + info.note : ''}<//>`;

  async function unship() {
    await run(() => call('shipment_remove_unit', { p_ship: sh.id, p_unit: u.id }), 'اتشالت من الشحنة');
  }
  return html`<${Sheet} title=${item.name} sub=${L.bidi(item.size, item.name_en)} onClose=${close}>
    <div class="unithead">
      <span class="codechip big ltr-t">${code}</span>
      <div class="row gap8 wrap center">${status}</div>
      ${u && html`<small class="soft">اتسجلت ${L.fmtDateTime(u.created_at)}</small>`}
    </div>
    ${u && html`<div class="acts a3">
      <${Act} icon="printer" label="استيكر" tone="dark" onClick=${() => openSheet(StickerSheet, { labels: [unitLabel(code, item)], title: 'استيكر ' + code })} />
      ${!sh && html`<${Act} icon="globe" label="شحن" onClick=${() => openSheet(UnitShipSheet, { code, itemId: item.id })} />`}
      <${Act} icon="out" label="خروج" tone="red" onClick=${() => openSheet(UnitOutSheet, { id: u.id, code })} />
    </div>`}
    ${sh && html`<div class="grid2">
      <button class="btn ghost sm" onClick=${() => openSheet(ShipmentSheet, { id: sh.id })}><${Icon} name="globe" size=${18} /> افتح ${sh.ref}</button>
      <button class="btn ghost sm" onClick=${unship}><${Icon} name="x" size=${18} /> شيلها من الشحنة</button></div>`}
    <button class="lrow boxed" onClick=${() => openSheet(ItemSheet, { id: item.id })}>
      <span class="avatar sm"><${Icon} name="globe" size=${16} /></span>
      <span class="grow"><b>${item.name}</b><small>${L.bidi(item.part_no, `عندنا ${item.qty}`)}</small></span>
      <${Icon} name="chev" size=${18} /></button>
  <//>`;
}

/* شحن قطعة بكودها: لشحنة بتتجهز أو شحنة جديدة */
function UnitShipSheet({ code, itemId, close }) {
  const { data, idx } = useStore();
  const drafts = data.shipments.filter((s) => s.status === 'draft');
  const [busy, setBusy] = useState(false);
  async function add(s) {
    setBusy(true);
    const r = await run(() => call('shipment_add_unit', { p_ship: s.id, p_code: code }), 'اتضافت لشحنة ' + s.ref);
    setBusy(false);
    if (r.ok) close();
  }
  return html`<${Sheet} title="شحن القطعة دي" sub=${code} onClose=${close}>
    ${drafts.length > 0 && html`<${Field} label="ضيفها لشحنة بتتجهز">
      <div class="stack">${drafts.map((s) => {
        const c = idx.customers.get(s.customer_id);
        return html`<button class="lrow boxed" key=${s.id} disabled=${busy} onClick=${() => add(s)}>
          <span class="avatar sm"><${Icon} name="globe" size=${16} /></span>
          <span class="grow"><b>${L.bidi(s.ref, c ? c.name : '')}</b><small>${L.sum(s.items, (x) => x.qty)} قطعة · ${L.fmtDate(s.ship_date)}</small></span>
          <${Icon} name="plus" size=${18} /></button>`;
      })}</div><//>`}
    <button class="btn" onClick=${() => { close(); openSheet(ShipmentForm, { itemId, unitCode: code }); }}><${Icon} name="plus" size=${20} /> شحنة جديدة</button>
  <//>`;
}

/* خروج قطعة بكودها */
const UNIT_OUT = ['اتباعت', 'اتسلّمت لعميل', 'تالفة / اترمت'];
function UnitOutSheet({ id, code, close }) {
  const [why, setWhy] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function go() {
    const n = [why, note.trim()].filter(Boolean).join(' — ');
    if (!n) return toast('اختار خرجت ليه', 'bad');
    setBusy(true);
    const r = await run(() => call('unit_out', { p_unit: id, p_note: n }), 'اتسجل ✓');
    setBusy(false);
    if (r.ok) close();
  }
  return html`<${Sheet} title="خرجت ليه؟" sub=${code} onClose=${close}
    footer=${html`<button class="btn bigbtn red" disabled=${busy} onClick=${go}>${busy ? 'لحظة...' : 'سجّل الخروج'}</button>`}>
    <${Chips} items=${UNIT_OUT} value=${why} onChange=${(v) => setWhy(why === v ? '' : v)} />
    <${Field} label="ملاحظة (اختياري)"><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} /><//>
  <//>`;
}
