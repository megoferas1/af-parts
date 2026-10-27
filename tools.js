/* tools.js — عدة الجراش + الليستات الجاهزة */
import { html, useState, useMemo, Icon, Empty, Field, Stepper, SearchBox, Sheet, Hero, openSheet, toast, confirmBox } from './ui.js?v=9';
import { call, errText } from './api.js?v=9';
import { useStore, reload, ownerText } from './store.js?v=9';
import * as L from './lib.js?v=9';
import { ItemRow, ItemPicker, startNewItem, groupBy, run } from './items.js?v=9';
import { tripGroups } from './trips.js?v=9';
import { StickerSheet, labelFor } from './stickers.js?v=9';
import { HeroScan } from './home.js?v=9';

export function ToolsTab({ back }) {
  const { idx, data } = useStore();
  const [q, setQ] = useState('');
  const list = useMemo(() => idx.kinds.tool.filter((i) => !q || L.matches(idx.hay.get(i.id), q)), [idx, q]);
  return html`
    <${Hero} back=${back} title="العدة" sub=${`حاجات الجراش · ${idx.kinds.tool.length} حاجة`} right=${html`<${HeroScan} />`} />
    <main class="body">
      <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر في العدة (كراسي، خيام، جاك...)" />
      <div class="grid2">
        <button class="btn" onClick=${() => startNewItem({ kind: 'tool' })}><${Icon} name="plus" size=${22} /> حاجة جديدة</button>
        <button class="btn dark" onClick=${() => openSheet(TemplatesSheet)}><${Icon} name="layers" size=${20} /> الليستات الجاهزة (${data.templates.length})</button>
      </div>
      ${list.length === 0 ? html`<${Empty} icon="wrench" text=${q ? 'مفيش حاجة كده' : 'لسه مفيش عدة متسجلة — سجّل الكراسي والخيام والعدة'} />`
        : groupBy(list, (i) => i.category, idx.cats.tool).map(([cat, its]) => html`<div class="grp" key=${cat}>
            <div class="grp-h">${cat} <i>${L.sum(its, (i) => i.qty)}</i></div>
            <div class="card tight">${its.map((i) => html`<${ItemRow} item=${i} key=${i.id} />`)}</div></div>`)}
    </main>`;
}

export function TemplatesSheet({ onPick, close }) {
  const { data } = useStore();
  return html`<${Sheet} title=${onPick ? 'اختار ليستة جاهزة' : 'الليستات الجاهزة'} sub="زي: شنطة التمرين، شنطة السباق" onClose=${close}>
    ${!onPick && html`<button class="btn" onClick=${() => openSheet(TemplateForm, {})}><${Icon} name="plus" size=${22} /> ليستة جديدة</button>`}
    ${data.templates.length === 0 ? html`<${Empty} icon="layers" text="لسه مفيش ليستات جاهزة. اعمل واحدة بالحاجات اللي بتطلع معاكو كل مرة." />`
      : html`<div class="card tight">${data.templates.map((t) => html`<button class="lrow" key=${t.id} onClick=${() => { if (onPick) { close(); onPick(t); } else openSheet(TemplateForm, { id: t.id }); }}>
          <span class="mic t-dark"><${Icon} name="layers" size=${18} /></span>
          <span class="grow"><b>${t.name}</b><small>${t.items.length} حاجة · ${L.sum(t.items, (x) => x.qty)} قطعة${onPick ? '' : ' · دوس عشان تعدّل'}</small></span>
          <${Icon} name="chev" size=${18} /></button>`)}</div>`}
  <//>`;
}

export function TemplateForm({ id, preset, close }) {
  const { idx, data } = useStore();
  const t = id ? data.templates.find((x) => x.id === id) : null;
  const [name, setName] = useState(t ? t.name : (preset && preset.name) || '');
  const [items, setItems] = useState(() => (t ? t.items : (preset && preset.items) || []).map((x) => ({ item_id: x.item_id, qty: x.qty })));
  const [busy, setBusy] = useState(false);
  const setQty = (iid, q) => setItems((a) => a.map((x) => (x.item_id === iid ? { ...x, qty: q } : x)));
  const remove = (iid) => setItems((a) => a.filter((x) => x.item_id !== iid));
  function add() {
    openSheet(ItemPicker, {
      title: 'ضيف للّيستة', kinds: ['tool', 'part', 'product'], limit: () => 999, exclude: (i) => items.some((x) => x.item_id === i.id), doneLabel: 'ضيف',
      onDone: (sel) => { setItems((a) => [...a, ...sel]); return true; },
    });
  }
  function addNew() {
    startNewItem({ kind: 'tool', onCreated: (newId, qty) => { setItems((a) => [...a, { item_id: newId, qty: qty || 1 }]); toast('اتسجلت واتضافت للّيستة — متنساش تحفظ'); } });
  }
  async function save() {
    if (!name.trim()) return toast('اكتب اسم الليستة', 'bad');
    if (!items.length) return toast('ضيف حاجات للّيستة', 'bad');
    setBusy(true);
    const r = await run(() => call('template_save', { p_id: id || null, p_name: name, p_items: items }), 'الليستة اتحفظت');
    setBusy(false);
    if (r.ok) close();
  }
  async function del() {
    if (!(await confirmBox({ title: 'مسح الليستة؟', text: t.name, ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('template_delete', { p_id: id }), 'اتمسحت');
    if (r.ok) close();
  }
  return html`<${Sheet} title=${id ? 'تعديل الليستة' : 'ليستة جديدة'} onClose=${close} full
    footer=${html`<div class="stack"><button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ الليستة'}</button>
      ${id && html`<button class="btn ghost" onClick=${del}><${Icon} name="trash" size=${18} /> مسح الليستة</button>`}</div>`}>
    <${Field} label="اسم الليستة" req><input class="input" value=${name} placeholder="مثلاً: شنطة التمرين" onInput=${(e) => setName(e.target.value)} /><//>
    <div class="grid2">
      <button class="btn dark sm" onClick=${add}><${Icon} name="plus" size=${18} /> من الجراش</button>
      <button class="btn ghost sm" onClick=${addNew}><${Icon} name="edit" size=${18} /> حاجة جديدة</button>
    </div>
    ${items.length === 0 ? html`<${Empty} icon="layers" text="الليستة فاضية" />`
      : tripGroups(items, idx).map(([g, xs]) => html`<div class="grp" key=${g}><div class="grp-h">${g} <i>${xs.length}</i></div>
        <div class="card tight">${xs.map((x) => {
          const i = idx.items.get(x.item_id);
          if (!i) return null;
          return html`<div class="trow" key=${x.item_id}>
            <div class="grow"><div class="irow-title">${i.name}${i.size && html`<span class="size">${i.size}</span>`}</div><div class="irow-sub">${i.code && html`<span class="code">${i.code}</span>`}${i.kind === 'part' && html`<span>${ownerText(i, idx)}</span>`}</div></div>
            <${Stepper} value=${x.qty} min=${1} onChange=${(v) => setQty(x.item_id, v)} />
            <button class="iconbtn light" onClick=${() => remove(x.item_id)} aria-label="شيل"><${Icon} name="x" size=${18} /></button>
          </div>`;
        })}</div></div>`)}
  <//>`;
}
