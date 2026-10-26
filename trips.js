/* trips.js — الطلعات: سباق / تمرين / طلعة تانية */
import { html, useState, Icon, Pill, Empty, Field, Chips, Stepper, Sheet, SecTitle, Hero, openSheet, toast, confirmBox, Spinner } from './ui.js';
import { call, errText } from './api.js';
import { useStore, getStore, reload, ownerText } from './store.js';
import * as L from './lib.js';
import { ItemSheet, ItemPicker, OldPartFields, Thumb, run } from './items.js';
import { TemplatesSheet, TemplateForm } from './tools.js';
import { ScanSheet } from './qr.js';
import { FileReady } from './stickers.js';
import { buildPdf, buildXlsx, fileFrom, safeName } from './docs.js';
import { HeroScan } from './home.js';

const okOf = (x) => x.qty - x.damaged - x.installed - x.used - x.lost;

export function tripProgress(t) {
  const n = t.items.length;
  if (t.status === 'prep') return { done: t.items.filter((x) => x.loaded).length, n, word: 'اتحمّل' };
  if (t.status === 'out') return { done: t.items.filter((x) => x.packed).length, n, word: 'اتلمّ' };
  return { done: n, n, word: 'رجع' };
}

export function TripCard({ t }) {
  const k = L.TRIP_KIND[t.kind], st = L.TRIP_STATUS[t.status], pr = tripProgress(t);
  return html`<button class=${'tcard s-' + t.status} onClick=${() => openSheet(TripSheet, { id: t.id })}>
    <span class="tcard-ic"><${Icon} name=${k.icon} size=${24} /></span>
    <span class="grow">
      <b>${t.name}</b>
      <small>${L.bidi(k.label, L.fmtDateShort(t.trip_date), t.place)}</small>
      ${t.status !== 'closed' && html`<span class="bar"><i style=${'width:' + (pr.n ? (pr.done / pr.n) * 100 : 0) + '%'}></i></span>
        <small>${pr.word} ${pr.done} من ${pr.n}</small>`}
    </span>
    <${Pill} tone=${st.tone}>${st.label}<//>
  </button>`;
}

export function TripsTab() {
  const { data } = useStore();
  const active = data.trips.filter((t) => t.status !== 'closed');
  const closed = data.trips.filter((t) => t.status === 'closed');
  return html`
    <${Hero} title="الطلعات" sub="سباقات وتمرينات وأي طلعة" right=${html`<${HeroScan} />`} />
    <main class="body">
      <button class="btn bigbtn" onClick=${() => openSheet(TripForm, {})}><${Icon} name="plus" size=${24} /> طلعة جديدة</button>
      ${active.length > 0 && html`<${SecTitle}>شغالة دلوقتي<//><div class="stack">${active.map((t) => html`<${TripCard} t=${t} key=${t.id} />`)}</div>`}
      <${SecTitle}>اللي خلصت<//>
      ${closed.length === 0 ? html`<${Empty} icon="flag" text="لسه مفيش طلعات خلصت" />`
        : html`<div class="stack">${closed.map((t) => html`<${TripCard} t=${t} key=${t.id} />`)}</div>`}
    </main>`;
}

export function TripForm({ id, close }) {
  const { data } = useStore();
  const t = id ? data.trips.find((x) => x.id === id) : null;
  const [kind, setKind] = useState(t ? t.kind : 'practice');
  const [name, setName] = useState(t ? t.name : '');
  const [place, setPlace] = useState(t ? t.place : '');
  const [date, setDate] = useState(t ? t.trip_date : L.todayStr());
  const [tpl, setTpl] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const nm = name.trim() || `${L.TRIP_KIND[kind].label} ${L.fmtDateShort(date)}${place ? ' — ' + place : ''}`;
    setBusy(true);
    try {
      const tid = await call('trip_save', { p_id: id || null, p: { kind, name: nm, place, trip_date: date } });
      let short = [];
      if (!id && tpl) short = await call('trip_apply_template', { p_trip: tid, p_template: tpl });
      await reload().catch(() => {});
      toast(id ? 'اتحفظ' : 'الطلعة اتعملت');
      close();
      if (!id) { openSheet(TripSheet, { id: tid }); if (short.length) showShortages(short); }
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title=${id ? 'تعديل الطلعة' : 'طلعة جديدة'} onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : id ? 'حفظ' : 'ابدأ الطلعة'}</button>`}>
    <${Field} label="نوعها"><${Chips} items=${Object.entries(L.TRIP_KIND).map(([k, v]) => [k, v.label])} value=${kind} onChange=${setKind} /><//>
    <${Field} label="اسمها" hint="لو سبتها فاضية هتتسمى بالنوع والتاريخ"><input class="input" value=${name} placeholder="مثلاً: بطولة الدريفت — الجولة 3" onInput=${(e) => setName(e.target.value)} /><//>
    <div class="grid2">
      <${Field} label="المكان"><input class="input" value=${place} placeholder="مثلاً: القطامية" onInput=${(e) => setPlace(e.target.value)} /><//>
      <${Field} label="التاريخ"><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /><//>
    </div>
    ${!id && data.templates.length > 0 && html`<${Field} label="ابدأ بليستة جاهزة؟ (اختياري)">
      <${Chips} items=${data.templates.map((x) => [x.id, x.name])} value=${tpl} onChange=${(v) => setTpl(tpl === v ? '' : v)} /><//>`}
  <//>`;
}

function showShortages(short) {
  const { idx } = getStore();
  openSheet(({ close }) => html`<${Sheet} title="فيه حاجات مش كفاية" sub="اتحط الموجود بس" onClose=${close}>
    <div class="card tight">${short.map((s) => { const i = idx.items.get(s.item_id); return html`<div class="trow"><div class="grow"><b>${i ? i.name : '—'}</b><div class="irow-sub"><span>عايزين ${s.wanted}</span><span>اتحط ${s.got}</span></div></div><${Pill} tone="amber">ناقص ${s.wanted - s.got}<//></div>`; })}</div>
    <button class="btn" onClick=${close}>تمام</button>
  <//>`);
}

/* ===================== صفحة الطلعة ===================== */
export function TripSheet({ id, close }) {
  const { data, idx } = useStore();
  const t = data.trips.find((x) => x.id === id) || idx.trips.get(id);
  const [ov, setOv] = useState({});        // تعليم فوري قبل ما السيرفر يرد
  const [busy, setBusy] = useState(false);
  if (!t) return html`<${Sheet} title="الطلعة" onClose=${close}><${Empty} text="الطلعة دي اتمسحت" /><//>`;
  const field = t.status === 'prep' ? 'loaded' : 'packed';
  const isOn = (x) => (ov[x.item_id] !== undefined ? ov[x.item_id] : x[field]);
  const pr = { done: t.items.filter(isOn).length, n: t.items.length };
  const k = L.TRIP_KIND[t.kind], st = L.TRIP_STATUS[t.status];

  async function tick(x, v) {
    setOv((o) => ({ ...o, [x.item_id]: v }));
    try { await call('trip_check', { p_trip: id, p_item: x.item_id, p_field: field, p_value: v }); await reload(); }
    catch (e) { toast(errText(e), 'bad'); }
    setOv((o) => { const n = { ...o }; delete n[x.item_id]; return n; });
  }
  function scan() {
    const prep = t.status === 'prep';
    openSheet(ScanSheet, {
      continuous: true,
      title: (prep ? 'حمّل: ' : 'لمّ: ') + t.name,
      hint: prep ? 'امسح كل حاجة وهي بتتحط في العربية' : 'امسح كل حاجة وهي بتتلم',
      onCode: async (code) => {
        const s = getStore();
        const item = s.idx.byCode.get(code);
        if (!item) {
          try { const r = await call('code_info', { p_code: code }); if (r.status === 'blank') return { ok: false, msg: 'الاستيكر ده لسه فاضي، سجّله الأول' }; } catch (e) { /* ignore */ }
          return { ok: false, msg: 'الكود ده مش متسجل عندنا' };
        }
        const trip = s.data.trips.find((x) => x.id === id);
        const x = trip && trip.items.find((y) => y.item_id === item.id);
        try {
          if (x) {
            if (x[field]) return { ok: true, msg: `متعلّم عليها قبل كده: ${item.name}` };
            await call('trip_check', { p_trip: id, p_item: item.id, p_field: field, p_value: true });
            await reload();
            return { ok: true, msg: (prep ? '✓ اتحملت: ' : '✓ اتلمّت: ') + item.name };
          }
          if (!prep) return { ok: false, msg: `${item.name} مش في ليستة الطلعة دي` };
          if (item.qty < 1) return { ok: false, msg: `${item.name}: مفيش منها في الجراش` };
          await call('trip_add', { p_trip: id, p_items: [{ item_id: item.id, qty: 1 }], p_loaded: true });
          await reload();
          return { ok: true, msg: 'اتضافت للطلعة واتحملت: ' + item.name };
        } catch (e) { return { ok: false, msg: errText(e) }; }
      },
    });
  }
  function addItems() {
    const prep = t.status === 'prep';
    openSheet(ItemPicker, {
      title: prep ? 'ضيف للطلعة' : 'حاجات طلعت زيادة',
      kinds: ['tool', 'part', 'product'],
      limit: (i) => (prep ? i.qty - (idx.prepQty.get(i.id) || 0) : i.qty),
      onDone: async (sel) => {
        try { await call('trip_add', { p_trip: id, p_items: sel, p_loaded: !prep }); await reload(); toast('اتضافت'); return true; }
        catch (e) { toast(errText(e), 'bad'); return false; }
      },
    });
  }
  function fromTemplate() {
    openSheet(TemplatesSheet, {
      onPick: async (tp) => {
        try { const short = await call('trip_apply_template', { p_trip: id, p_template: tp.id }); await reload(); toast('اتحطت الليستة'); if (short.length) showShortages(short); }
        catch (e) { toast(errText(e), 'bad'); }
      },
    });
  }
  async function depart() {
    const left = t.items.filter((x) => !isOn(x)).length;
    let mode = 'all';
    if (left > 0) {
      mode = await confirmBox({ title: `فيه ${left} حاجة ما اتعلّمش إنها اتحملت`, text: 'تعمل فيهم إيه؟',
        choices: [['drop', `شيلهم من الطلعة (${left})`, 'dark'], ['all', 'اعتبرهم اتحملوا', 'ghost']] });
      if (!mode) return;
    } else if (!(await confirmBox({ title: 'طلعنا؟', text: `${t.items.length} حاجة هتخرج من الجراش على الطلعة.`, ok: 'طلعنا' }))) return;
    setBusy(true);
    await run(() => call('trip_depart', { p_trip: id, p_mode: mode }), 'يلا بينا 🚚 — الحاجات اتسجلت إنها برا');
    setBusy(false);
  }
  async function finish() {
    const left = t.items.filter((x) => !isOn(x)).length;
    let mode = 'ok';
    if (left > 0) {
      mode = await confirmBox({ title: `فيه ${left} حاجة ما اتلمّتش`, text: 'لو هي فعلاً مش معاكو، سجّلها ضايعة.',
        choices: [['lost', `سجّلهم ضايعين (${left})`, 'danger'], ['ok', 'دول رجعوا، نسيت أعلّم', 'ghost']] });
      if (!mode) return;
    } else if (!(await confirmBox({ title: 'رجعنا؟', text: 'كل الحاجات هترجع للجراش حسب اللي علّمت عليه.', ok: 'رجعنا' }))) return;
    setBusy(true);
    await run(() => call('trip_close', { p_trip: id, p_unpacked: mode }), (r) => 'حمد لله على السلامة ✓' + (r && r.clones ? ` — ${r.clones} حاجة تالفة اتسجلت لوحدها` : ''));
    setBusy(false);
  }
  async function delTrip() {
    if (!(await confirmBox({ title: 'مسح الطلعة؟', text: 'الحاجات هتفضل في الجراش زي ما هي.', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('trip_delete', { p_trip: id }), 'اتمسحت');
    if (r.ok) close();
  }

  /* تقسيم الحاجات: العدة / قطع كل سواق / المنتجات */
  const groups = (() => {
    const g = [];
    const tools = t.items.filter((x) => (idx.items.get(x.item_id) || {}).kind === 'tool');
    if (tools.length) g.push(['العدة', tools]);
    const byDrv = new Map();
    t.items.forEach((x) => { const i = idx.items.get(x.item_id); if (i && i.kind === 'part') { if (!byDrv.has(i.driver_id)) byDrv.set(i.driver_id, []); byDrv.get(i.driver_id).push(x); } });
    byDrv.forEach((xs, did) => g.push(['قطع ' + ((idx.drivers.get(did) || {}).name || ''), xs]));
    const prods = t.items.filter((x) => (idx.items.get(x.item_id) || {}).kind === 'product');
    if (prods.length) g.push(['منتجات', prods]);
    return g;
  })();

  const closed = t.status === 'closed';
  const totals = closed ? {
    ok: L.sum(t.items, (x) => x.ok), damaged: L.sum(t.items, (x) => x.damaged), installed: L.sum(t.items, (x) => x.installed),
    used: L.sum(t.items, (x) => x.used), lost: L.sum(t.items, (x) => x.lost),
  } : null;

  return html`<${Sheet} title=${t.name} sub=${L.bidi(k.label, L.fmtDate(t.trip_date), t.place)} onClose=${close} full
    footer=${t.status === 'prep' ? html`<button class="btn bigbtn" disabled=${busy || !t.items.length} onClick=${depart}><${Icon} name="truck" size=${24} /> طلعنا (${t.items.length} حاجة)</button>`
      : t.status === 'out' ? html`<button class="btn bigbtn green" disabled=${busy} onClick=${finish}><${Icon} name="home" size=${22} /> رجعنا — قفل الطلعة</button>`
        : html`<button class="btn bigbtn dark" onClick=${() => openSheet(TripReportSheet, { id })}><${Icon} name="file" size=${22} /> كشف الطلعة PDF / Excel</button>`}>

    <div class="tsteps">
      ${[['prep', 'التحضير والتحميل'], ['out', 'هناك واللمّ'], ['closed', 'رجعنا']].map(([s, lb], i) => {
        const order = { prep: 0, out: 1, closed: 2 }, cur = order[t.status];
        return html`<div class=${'tstep ' + (i < cur ? 'done' : i === cur ? 'cur' : '')}><b>${i < cur ? '✓' : i + 1}</b><span>${lb}</span></div>`;
      })}
    </div>

    ${!closed && html`<div class="card prog">
      <div class="spread"><b>${t.status === 'prep' ? 'اتحمّل' : 'اتلمّ'} ${pr.done} من ${pr.n}</b><${Pill} tone=${st.tone}>${st.label}<//></div>
      <span class="bar big"><i style=${'width:' + (pr.n ? (pr.done / pr.n) * 100 : 0) + '%'}></i></span>
      <button class="btn bigbtn" onClick=${scan}><${Icon} name="scan" size=${24} /> ${t.status === 'prep' ? 'سكان وحمّل' : 'سكان ولمّ'}</button>
      <div class="hint center-t">${t.status === 'prep' ? 'أو دوس على الدايرة جنب كل حاجة وهي بتتحط في العربية' : 'أو دوس على الدايرة جنب كل حاجة اتلمّت، ولو حاجة اتكسرت أو اتركبت دوس عليها'}</div>
    </div>`}

    ${t.status === 'prep' && html`<div class="grid3">
      <button class="btn ghost sm" onClick=${addItems}><${Icon} name="plus" size=${18} /> ضيف</button>
      <button class="btn ghost sm" onClick=${fromTemplate}><${Icon} name="layers" size=${18} /> ليستة جاهزة</button>
      <button class="btn ghost sm" disabled=${!t.items.length} onClick=${() => openSheet(TemplateForm, { preset: { name: L.TRIP_KIND[t.kind].label, items: t.items } })}><${Icon} name="save" size=${18} /> احفظها</button>
    </div>`}
    ${t.status === 'out' && html`<button class="btn ghost sm" onClick=${addItems}><${Icon} name="plus" size=${18} /> حاجة طلعت ومش في الليستة</button>`}

    ${closed && html`<div class="tsum">
      <div><b class="num">${totals.ok}</b><span>رجع سليم</span></div>
      <div class="r"><b class="num">${totals.damaged}</b><span>رجع تالف</span></div>
      <div><b class="num">${totals.installed}</b><span>اتركب</span></div>
      <div><b class="num">${totals.used}</b><span>اتصرف</span></div>
      <div class="r"><b class="num">${totals.lost}</b><span>ضاع</span></div>
    </div>`}

    ${t.items.length === 0 ? html`<${Empty} icon="truck" text="الطلعة فاضية — ضيف حاجات أو اختار ليستة جاهزة أو اعمل سكان" />`
      : groups.map(([g, xs]) => html`<div class="grp" key=${g}><div class="grp-h">${g} <i>${xs.length}</i></div>
          <div class="card tight">${xs.map((x) => html`<${TripItemRow} key=${x.item_id} t=${t} x=${x} on=${isOn(x)} onTick=${(v) => tick(x, v)} />`)}</div></div>`)}

    ${t.status !== 'closed' && html`<div class="row gap8 wrap">
      <button class="linkbtn" onClick=${() => openSheet(TripForm, { id })}><${Icon} name="edit" size=${15} /> تعديل البيانات</button>
      <button class="linkbtn" onClick=${() => openSheet(TripReportSheet, { id })}><${Icon} name="file" size=${15} /> ${t.status === 'prep' ? 'اطبع ليستة التحميل' : 'كشف الطلعة'}</button>
      ${t.status === 'prep' && html`<button class="linkbtn danger" onClick=${delTrip}><${Icon} name="trash" size=${15} /> مسح الطلعة</button>`}
    </div>`}
  <//>`;
}

function outcomeText(x, kind) {
  const parts = [];
  const ok = okOf(x);
  if (x.damaged) parts.push(`${x.damaged} تالفة`);
  if (x.installed) parts.push(`${x.installed} اتركبت`);
  if (x.used) parts.push(`${x.used} اتصرفت`);
  if (x.lost) parts.push(`${x.lost} ضاعت`);
  if (!parts.length) return '';
  if (ok > 0) parts.unshift(`${ok} سليمة`);
  return parts.join(' · ');
}

function TripItemRow({ t, x, on, onTick }) {
  const { idx } = useStore();
  const i = idx.items.get(x.item_id);
  if (!i) return null;
  const oc = outcomeText(x, i.kind);
  async function setQty(v) { await run(() => call('trip_set_qty', { p_trip: t.id, p_item: i.id, p_qty: v })); }
  async function remove() {
    if (!(await confirmBox({ title: `شيل ${i.name} من الطلعة؟`, text: t.status === 'out' ? 'هترجع للجراش.' : '', ok: 'شيل' }))) return;
    await run(() => call('trip_remove', { p_trip: t.id, p_item: i.id }), 'اتشالت');
  }
  const closed = t.status === 'closed';
  return html`<div class=${'trow ' + (on && !closed ? 'on' : '')}>
    ${!closed && html`<button class=${'tick big ' + (on ? 'on' : '')} onClick=${() => onTick(!on)} aria-label="علّم">${on && html`<${Icon} name="check" size=${20} stroke=${3} />`}</button>`}
    <button class="grow trow-main" onClick=${() => (t.status === 'out' ? openSheet(OutcomeSheet, { tripId: t.id, itemId: i.id }) : openSheet(ItemSheet, { id: i.id }))}>
      <div class="irow-title">${i.name}${i.size && html`<span class="size">${i.size}</span>`}</div>
      <div class="irow-sub"><span class="code">${i.code}</span>${i.kind === 'part' && i.car_id && html`<span>${(idx.cars.get(i.car_id) || {}).name}</span>`}${i.kind === 'tool' && i.category && html`<span>${i.category}</span>`}</div>
      ${oc && html`<div class="irow-tags"><${Pill} tone=${x.lost || x.damaged ? 'red' : 'amber'}>${oc}<//></div>`}
      ${closed && !oc && html`<div class="irow-tags"><${Pill} tone="green">رجعت سليمة<//></div>`}
    </button>
    ${t.status === 'prep' ? html`<${Stepper} value=${x.qty} min=${1} max=${i.qty} onChange=${setQty} />` : html`<div class="qty"><b class="num">${x.qty}</b></div>`}
    ${t.status !== 'closed' && html`<button class="iconbtn light" onClick=${remove} aria-label="شيل"><${Icon} name="x" size=${18} /></button>`}
  </div>`;
}

/* حالة الحاجة في الرجوع */
function OutcomeSheet({ tripId, itemId, close }) {
  const { data, idx } = useStore();
  const t = data.trips.find((y) => y.id === tripId);
  const x = t && t.items.find((y) => y.item_id === itemId);
  const i = idx.items.get(itemId);
  const [v, setV] = useState(() => (x ? { damaged: x.damaged, installed: x.installed, used: x.used, lost: x.lost } : {}));
  const [old, setOld] = useState(() => (x && x.old) || { mode: '' });
  const [busy, setBusy] = useState(false);
  if (!t || !x || !i) return null;
  const isPart = i.kind === 'part';
  const opts = [['ok', 'رجعت سليمة', 'green'], ['damaged', 'رجعت تالفة', 'red'], ...(isPart ? [['installed', 'اتركبت على العربية', 'dark']] : []),
    ['used', i.kind === 'product' ? 'اتباعت / اتدّت' : 'اتصرفت (خلصت)', 'amber'], ['lost', 'ضاعت', 'red']];
  const others = (v.damaged || 0) + (v.installed || 0) + (v.used || 0) + (v.lost || 0);
  const ok = x.qty - others;
  const single = x.qty === 1;
  const cur = single ? (opts.find(([k]) => k !== 'ok' && v[k] > 0) || ['ok'])[0] : null;
  function pick(k) { setV({ damaged: 0, installed: 0, used: 0, lost: 0, ...(k !== 'ok' ? { [k]: 1 } : {}) }); }
  function setN(k, n) { setV((o) => { const nv = { ...o, [k]: n }; const s = (nv.damaged || 0) + (nv.installed || 0) + (nv.used || 0) + (nv.lost || 0); return s > x.qty ? o : nv; }); }
  async function save() {
    if (v.installed > 0 && !old.mode) return toast('قول القطعة القديمة راحت فين', 'bad');
    setBusy(true);
    try {
      await call('trip_outcome', { p_trip: tripId, p_item: itemId, p: { ...v, old: v.installed > 0 ? { ...old, qty: old.qty || v.installed } : null } });
      if (ok + (v.damaged || 0) > 0) await call('trip_check', { p_trip: tripId, p_item: itemId, p_field: 'packed', p_value: true });
      await reload();
      toast('اتسجل ✓'); close();
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title=${i.name} sub=${`${i.code} · طالع ${x.qty}`} onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'تمام'}</button>`}>
    ${single ? html`<${Field} label="حصل فيها إيه؟"><div class="radios">${opts.map(([k, lb]) => html`
        <button type="button" class=${'radio ' + (cur === k ? 'on' : '')} onClick=${() => pick(k)}><i></i><span><b>${lb}</b></span></button>`)}</div><//>`
      : html`<div class="note ok"><${Icon} name="check" size=${18} /><span>رجع سليم: <b class="num">${ok}</b> من ${x.qty}</span></div>
        ${opts.filter(([k]) => k !== 'ok').map(([k, lb]) => html`<div class="spread"><b>${lb}</b><${Stepper} value=${v[k] || 0} min=${0} max=${x.qty} onChange=${(n) => setN(k, n)} /></div>`)}`}
    ${v.installed > 0 && html`<${OldPartFields} value=${old} onChange=${setOld} maxQty=${v.installed} src=${i} />`}
  <//>`;
}

/* ===================== كشف الطلعة ===================== */
export function TripReportSheet({ id, close }) {
  const { data, idx } = useStore();
  const t = data.trips.find((x) => x.id === id);
  const [fmt, setFmt] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  if (!t) return null;
  const k = L.TRIP_KIND[t.kind];
  async function make() {
    setBusy(true); setFile(null);
    try {
      const S = data.settings;
      const rows = t.items.map((x, n) => {
        const i = idx.items.get(x.item_id) || {};
        const res = t.status === 'closed' ? (outcomeText(x, i.kind) || 'رجعت سليمة') : t.status === 'out' ? (x.packed ? 'اتلمّت' + (outcomeText(x, i.kind) ? ' — ' + outcomeText(x, i.kind) : '') : 'لسه') : (x.loaded ? 'اتحملت' : '☐');
        return { n: n + 1, code: i.code, name: i.name + (i.size ? ' (' + i.size + ')' : ''), owner: ownerText(i, idx), qty: x.qty, res };
      });
      const title = `${k.label}: ${t.name}`;
      const meta = [['النوع', k.label], ['التاريخ', L.fmtDate(t.trip_date)], ['المكان', t.place || '—'], ['الحالة', L.TRIP_STATUS[t.status].label],
        ['عدد الحاجات', t.items.length + ' حاجة / ' + L.sum(t.items, (x) => x.qty) + ' قطعة'], ['اتطبع', L.nowStamp()]];
      const resLabel = t.status === 'prep' ? 'اتحملت؟' : t.status === 'out' ? 'اتلمّت؟' : 'النتيجة';
      if (fmt === 'pdf') {
        const blob = await buildPdf({ dir: 'rtl', title, subtitle: S.company_ar, meta, footer: `${S.company_ar} — ${S.address_ar}`,
          sections: [{ title: t.status === 'prep' ? 'ليستة التحميل' : 'كل اللي طلع', columns: [
            { key: 'n', label: '#', w: 0.5, align: 'center' }, { key: 'code', label: 'الكود', w: 1.3 }, { key: 'name', label: 'الحاجة', w: 3 },
            { key: 'owner', label: 'صاحبها', w: 2.2 }, { key: 'qty', label: 'العدد', w: 0.8, align: 'center' }, { key: 'res', label: resLabel, w: 2.2 }], rows }],
          signatures: ['المسؤول عن التحميل', 'المسؤول عن اللمّ'] });
        setFile(fileFrom(blob, safeName(t.name + ' ' + t.trip_date) + '.pdf'));
      } else {
        const blob = buildXlsx([{ name: 'الطلعة', rtl: true, title, meta, columns: [{ label: '#', w: 5 }, { label: 'الكود', w: 12 }, { label: 'الحاجة', w: 30 }, { label: 'صاحبها', w: 24 }, { label: 'العدد', w: 8 }, { label: resLabel, w: 26 }],
          rows: rows.map((r) => [r.n, r.code, r.name, r.owner, r.qty, r.res]) }]);
        setFile(fileFrom(blob, safeName(t.name + ' ' + t.trip_date) + '.xlsx'));
      }
    } catch (e) { toast('مقدرتش أجهّز الكشف: ' + errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title="كشف الطلعة" sub=${t.name} onClose=${close}>
    <${Field} label="نوع الملف"><${Chips} items=${[['pdf', 'PDF'], ['xlsx', 'Excel']]} value=${fmt} onChange=${(v) => { setFmt(v); setFile(null); }} /><//>
    ${file ? html`<${FileReady} file=${file} text=${t.name} />`
      : html`<button class="btn bigbtn dark" disabled=${busy} onClick=${make}>${busy ? 'بجهّز...' : html`<${Icon} name="file" size=${22} /> جهّز الكشف`}</button>`}
  <//>`;
}
