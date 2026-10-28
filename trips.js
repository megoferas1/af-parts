/* trips.js — الطلعات: سباق / تمرين / طلعة تانية */
import { html, useState, Icon, Pill, Empty, Field, Chips, Stepper, Segmented, Sheet, SecTitle, Hero, openSheet, toast, confirmBox, Spinner } from './ui.js?v=14';
import { call, errText } from './api.js?v=14';
import { useStore, getStore, reload, ownerText } from './store.js?v=14';
import * as L from './lib.js?v=14';
import { ItemSheet, ItemPicker, OldPartFields, Thumb, run, groupBy, startNewItem } from './items.js?v=14';
import { TemplatesSheet, TemplateForm } from './tools.js?v=14';
import { ScanSheet } from './qr.js?v=14';
import { FileReady } from './stickers.js?v=14';
import { buildPdf, buildXlsx, fileFrom, safeName } from './docs.js?v=14';
import { HeroScan } from './home.js?v=14';

const okOf = (x) => x.qty - x.damaged - x.installed - x.used - x.lost;

export function tripProgress(t) {
  const n = t.items.length;
  if (t.status === 'prep') return { done: t.items.filter((x) => x.loaded).length, n, word: 'طالع معانا' };
  if (t.status === 'out') return { done: t.items.filter((x) => x.packed).length, n, word: 'اتحمّل للرجوع' };
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

export function TripsTab({ back }) {
  const { data } = useStore();
  const active = data.trips.filter((t) => t.status !== 'closed');
  const closed = data.trips.filter((t) => t.status === 'closed');
  return html`
    <${Hero} back=${back} title="الطلعات" sub="سباقات وتمرينات وأي طلعة" right=${html`<${HeroScan} />`} />
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
  const guess = (kd) => { const w = kd === 'race' ? 'سباق' : kd === 'practice' ? 'تمرين' : null; const m = w && data.templates.find((x) => x.name.includes(w)); return m ? m.id : ''; };
  const [tpl, setTpl] = useState(() => (id ? '' : guess('practice')));
  const [tplTouched, setTplTouched] = useState(false);
  const pickKind = (kd) => { setKind(kd); if (!tplTouched) setTpl(guess(kd)); };
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
    <${Field} label="نوعها"><${Chips} items=${Object.entries(L.TRIP_KIND).map(([k, v]) => [k, v.label])} value=${kind} onChange=${pickKind} /><//>
    <${Field} label="اسمها" hint="لو سبتها فاضية هتتسمى بالنوع والتاريخ"><input class="input" value=${name} placeholder="مثلاً: بطولة الدريفت — الجولة 3" onInput=${(e) => setName(e.target.value)} /><//>
    <div class="grid2">
      <${Field} label="المكان"><input class="input" value=${place} placeholder="مثلاً: القطامية" onInput=${(e) => setPlace(e.target.value)} /><//>
      <${Field} label="التاريخ"><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /><//>
    </div>
    ${!id && data.templates.length > 0 && html`<${Field} label="الليستة الجاهزة" hint="الحاجات اللي فيها هتتحط في الطلعة، وانت تعلّم على اللي طالع بس">
      <${Chips} items=${[['', 'من غير ليستة'], ...data.templates.map((x) => [x.id, x.name + ' (' + x.items.length + ')'])]} value=${tpl} onChange=${(v) => { setTplTouched(true); setTpl(v); }} /><//>`}
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
/* تقسيم حاجات الطلعة: العدة بأقسامها / قطع كل سواق / المنتجات — بنفس ترتيب الأقسام */
export function tripGroups(items, idx) {
  const it = (x) => idx.items.get(x.item_id) || {};
  const nm = (x) => it(x).name || '';
  const g = [];
  const tools = items.filter((x) => it(x).kind === 'tool');
  groupBy(tools, (x) => it(x).category, idx.cats.tool, nm).forEach(([cat, xs]) => g.push([cat, xs]));
  const byDrv = new Map();
  items.forEach((x) => { const i = it(x); if (i.kind === 'part') { if (!byDrv.has(i.driver_id)) byDrv.set(i.driver_id, []); byDrv.get(i.driver_id).push(x); } });
  byDrv.forEach((xs, did) => g.push([did ? 'قطع ' + ((idx.drivers.get(did) || {}).name || '') : 'قطع الجراش', xs.sort((a, b) => L.cmpName(nm(a), nm(b)))]));
  const prods = items.filter((x) => it(x).kind === 'product').sort((a, b) => L.cmpName(nm(a), nm(b)));
  if (prods.length) g.push(['منتجات', prods]);
  return g;
}

const WORD = {
  prep: { done: 'طالع معانا', scan: 'سكان وعلّم', scanTitle: 'طالع معانا: ', scanHint: 'امسح كل حاجة وهي بتتحط في العربية', ok: '✓ طالعة: ',
    hint: 'علّم على كل حاجة طالعة معاكم. اللي مش متعلّم عليه مش هيطلع ومش هيظهر في الرجوع.' },
  out: { done: 'اتحمّل في العربية', scan: 'سكان وحمّل', scanTitle: 'اتحمّل للرجوع: ', scanHint: 'امسح كل حاجة وهي بتتحمّل في العربية', ok: '✓ اتحمّلت: ',
    hint: 'وانتو راجعين علّم على كل حاجة اتحمّلت في العربية. لو حاجة اتكسرت أو اتركبت أو خلصت، دوس على اسمها.' },
};

export function TripSheet({ id, close }) {
  const { data, idx } = useStore();
  const t = data.trips.find((x) => x.id === id) || idx.trips.get(id);
  const [ov, setOv] = useState({});        // تعليم فوري قبل ما السيرفر يرد
  const [busy, setBusy] = useState(false);
  const [onlyLeft, setOnlyLeft] = useState(false);
  if (!t) return html`<${Sheet} title="الطلعة" onClose=${close}><${Empty} text="الطلعة دي اتمسحت" /><//>`;
  const field = t.status === 'prep' ? 'loaded' : 'packed';
  const W = WORD[t.status] || WORD.out;
  const isOn = (x) => (ov[x.item_id] !== undefined ? ov[x.item_id] : x[field]);
  const pr = { done: t.items.filter(isOn).length, n: t.items.length };
  const k = L.TRIP_KIND[t.kind], st = L.TRIP_STATUS[t.status];

  async function tickMany(xs, v) {
    const ids = xs.map((x) => x.item_id);
    setOv((o) => { const n = { ...o }; ids.forEach((i) => { n[i] = v; }); return n; });
    try {
      if (ids.length === 1) await call('trip_check', { p_trip: id, p_item: ids[0], p_field: field, p_value: v });
      else await call('trip_check_many', { p_trip: id, p_items: ids, p_field: field, p_value: v });
      await reload();
    } catch (e) { toast(errText(e), 'bad'); }
    setOv((o) => { const n = { ...o }; ids.forEach((i) => { delete n[i]; }); return n; });
  }
  function scan() {
    const prep = t.status === 'prep';
    openSheet(ScanSheet, {
      continuous: true,
      title: W.scanTitle + t.name,
      hint: W.scanHint,
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
            return { ok: true, msg: W.ok + item.name };
          }
          if (!prep) return { ok: false, msg: `${item.name} مش في ليستة الطلعة دي` };
          if (item.qty < 1) return { ok: false, msg: `${item.name}: مفيش منها في الجراش` };
          await call('trip_add', { p_trip: id, p_items: [{ item_id: item.id, qty: 1 }], p_loaded: true });
          await reload();
          return { ok: true, msg: 'اتضافت للطلعة: ' + item.name };
        } catch (e) { return { ok: false, msg: errText(e) }; }
      },
    });
  }
  const tpl = t.template_id && data.templates.find((x) => x.id === t.template_id);
  /* اللي يتضاف للطلعة يتحفظ في الليستة الجاهزة كمان */
  async function keepInTemplate(sel) {
    if (!tpl) return '';
    try { const n = await call('template_add_items', { p_template: tpl.id, p_items: sel }); return n > 0 ? ' ولـ ' + tpl.name : ''; } catch (e) { return ''; }
  }
  function addItems() {
    const prep = t.status === 'prep';
    openSheet(ItemPicker, {
      title: prep ? 'ضيف من الجراش' : 'حاجات طلعت زيادة',
      kinds: ['tool', 'part', 'product'],
      limit: (i) => (prep ? i.qty - (idx.prepQty.get(i.id) || 0) : i.qty),
      onDone: async (sel) => {
        try { await call('trip_add', { p_trip: id, p_items: sel, p_loaded: !prep }); const also = await keepInTemplate(sel); await reload(); toast('اتضافت للطلعة' + also); return true; }
        catch (e) { toast(errText(e), 'bad'); return false; }
      },
    });
  }
  function addNew() {
    startNewItem({
      onCreated: async (newId, qty) => {
        try { const sel = [{ item_id: newId, qty: qty || 1 }]; await call('trip_add', { p_trip: id, p_items: sel, p_loaded: true }); const also = await keepInTemplate(sel); await reload(); toast('اتسجلت واتضافت للطلعة' + also + ' ✓'); }
        catch (e) { toast(errText(e), 'bad'); }
      },
    });
  }
  function fromTemplate() {
    openSheet(TemplatesSheet, {
      onPick: async (tp) => {
        try { const short = await call('trip_apply_template', { p_trip: id, p_template: tp.id }); await reload(); toast('اتحطت ' + tp.name); if (short.length) showShortages(short); }
        catch (e) { toast(errText(e), 'bad'); }
      },
    });
  }
  async function depart() {
    const left = t.items.filter((x) => !isOn(x)).length;
    if (pr.done === 0) return toast('علّم على الحاجات اللي طالعة معاكم الأول', 'bad');
    if (left > 0) {
      const ok = await confirmBox({ title: `هيطلع ${pr.done} حاجة بس`, text: `${left} حاجة ما اتعلّمش عليها، مش هتطلع ومش هتظهر في ليستة الرجوع.`,
        choices: [[true, `تمام، طلعنا (${pr.done})`, 'dark']], cancel: 'استنى، أرجع أعلّم' });
      if (!ok) return;
    } else if (!(await confirmBox({ title: 'طلعنا؟', text: `${t.items.length} حاجة هتخرج من الجراش على الطلعة.`, ok: 'طلعنا' }))) return;
    setBusy(true);
    await run(() => call('trip_depart', { p_trip: id, p_mode: 'drop' }), 'يلا بينا 🚚 — الحاجات اتسجلت إنها برا');
    setBusy(false); setOnlyLeft(false);
  }
  async function finish() {
    const left = t.items.filter((x) => !isOn(x)).length;
    let mode = 'ok';
    if (left > 0) {
      mode = await confirmBox({ title: `فيه ${left} حاجة ما اتعلّمش إنها اتحمّلت`, text: 'لو مش لاقيينها، سجّلها ضايعة.',
        choices: [['lost', `سجّلهم ضايعين (${left})`, 'danger'], ['ok', 'دول اتحمّلوا، نسيت أعلّم', 'ghost']] });
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

  const closed = t.status === 'closed';
  const groups = tripGroups(t.items, idx)
    .map(([g, xs]) => [g, xs, onlyLeft && !closed ? xs.filter((x) => !isOn(x)) : xs])
    .filter(([, , shown]) => shown.length > 0);
  const totals = closed ? {
    ok: L.sum(t.items, (x) => x.ok), damaged: L.sum(t.items, (x) => x.damaged), installed: L.sum(t.items, (x) => x.installed),
    used: L.sum(t.items, (x) => x.used), lost: L.sum(t.items, (x) => x.lost),
  } : null;

  return html`<${Sheet} title=${t.name} sub=${L.bidi(k.label, L.fmtDate(t.trip_date), t.place)} onClose=${close} full
    footer=${t.status === 'prep' ? html`<button class="btn bigbtn" disabled=${busy || !t.items.length} onClick=${depart}><${Icon} name="truck" size=${24} /> طلعنا (${pr.done} حاجة)</button>`
      : t.status === 'out' ? html`<button class="btn bigbtn green" disabled=${busy} onClick=${finish}><${Icon} name="home" size=${22} /> رجعنا — قفل الطلعة</button>`
        : html`<button class="btn bigbtn dark" onClick=${() => openSheet(TripReportSheet, { id })}><${Icon} name="file" size=${22} /> كشف الطلعة PDF / Excel</button>`}>

    <div class="tsteps">
      ${[['prep', 'التجهيز'], ['out', 'هناك والرجوع'], ['closed', 'رجعنا']].map(([s, lb], i) => {
        const order = { prep: 0, out: 1, closed: 2 }, cur = order[t.status];
        return html`<div class=${'tstep ' + (i < cur ? 'done' : i === cur ? 'cur' : '')}><b>${i < cur ? '✓' : i + 1}</b><span>${lb}</span></div>`;
      })}
    </div>

    ${!closed && html`<div class="card prog">
      <div class="spread"><b>${W.done} ${pr.done} من ${pr.n}</b><${Pill} tone=${st.tone}>${st.label}<//></div>
      <span class="bar big"><i style=${'width:' + (pr.n ? (pr.done / pr.n) * 100 : 0) + '%'}></i></span>
      <button class=${'btn ' + (t.items.some((x) => (idx.items.get(x.item_id) || {}).code) ? 'bigbtn' : 'ghost sm')} onClick=${scan}><${Icon} name="scan" size=${22} /> ${W.scan}</button>
      <div class="hint center-t">${W.hint}</div>
    </div>`}

    ${t.status === 'prep' && t.items.length === 0 && html`<div class="grid3">
      <button class="btn ghost sm" onClick=${fromTemplate}><${Icon} name="layers" size=${18} /> ليستة جاهزة</button>
      <button class="btn ghost sm" onClick=${addItems}><${Icon} name="plus" size=${18} /> من الجراش</button>
      <button class="btn ghost sm" onClick=${addNew}><${Icon} name="edit" size=${18} /> حاجة جديدة</button>
    </div>`}

    ${closed && html`<div class="tsum">
      <div><b class="num">${totals.ok}</b><span>رجع سليم</span></div>
      <div class="r"><b class="num">${totals.damaged}</b><span>رجع تالف</span></div>
      <div><b class="num">${totals.installed}</b><span>اتركب</span></div>
      <div><b class="num">${totals.used}</b><span>اتصرف</span></div>
      <div class="r"><b class="num">${totals.lost}</b><span>ضاع</span></div>
    </div>`}

    ${!closed && t.items.length > 0 && html`<${Segmented} value=${onlyLeft ? 'left' : 'all'} onChange=${(v) => setOnlyLeft(v === 'left')}
      items=${[['all', `الكل (${pr.n})`], ['left', `لسه ما اتعلّمش (${pr.n - pr.done})`]]} />`}

    ${t.items.length === 0 ? html`<${Empty} icon="truck" text="الطلعة فاضية — اختار ليستة جاهزة أو ضيف حاجات أو اعمل سكان" />`
      : groups.length === 0 ? html`<${Empty} icon="check" text="كله متعلّم عليه ✓" />`
      : groups.map(([g, xs, shown]) => {
        const done = xs.filter(isOn).length, all = done === xs.length;
        return html`<div class="grp" key=${g}>
          <div class="grp-h">${g} <i class=${all && !closed ? 'ok' : ''}>${closed ? xs.length : done + '/' + xs.length}</i>
            ${!closed && html`<button class="grp-act" onClick=${() => tickMany(all ? xs : xs.filter((x) => !isOn(x)), !all)}>${all ? 'شيل العلامة' : 'علّم الكل'}</button>`}
          </div>
          <div class="card tight">${shown.map((x) => html`<${TripItemRow} key=${x.item_id} t=${t} x=${x} on=${isOn(x)} onTick=${(v) => tickMany([x], v)} />`)}</div></div>`;
      })}

    ${!closed && t.items.length > 0 && html`<div class="card addcard">
      <div class="h3">${t.status === 'out' ? 'حاجة طلعت ومش في الليستة؟' : 'عايز تضيف حاجة؟'}</div>
      <div class="grid2">
        <button class="btn dark sm" onClick=${addItems}><${Icon} name="plus" size=${18} /> من الجراش</button>
        <button class="btn ghost sm" onClick=${addNew}><${Icon} name="edit" size=${18} /> حاجة جديدة</button>
      </div>
      <div class="hint">${tpl ? `هتتضاف للطلعة دي ولـ "${tpl.name}" كمان، فتظهرلك المرة الجاية.` : 'هتتضاف للطلعة دي.'}</div>
    </div>`}

    ${t.status !== 'closed' && html`<div class="row gap8 wrap">
      ${t.status === 'prep' && t.items.length > 0 && html`<button class="linkbtn" onClick=${fromTemplate}><${Icon} name="layers" size=${15} /> ضيف ليستة جاهزة تانية</button>`}
      <button class="linkbtn" onClick=${() => openSheet(TripForm, { id })}><${Icon} name="edit" size=${15} /> تعديل البيانات</button>
      <button class="linkbtn" onClick=${() => openSheet(TripReportSheet, { id })}><${Icon} name="file" size=${15} /> ${t.status === 'prep' ? 'اطبع الليستة' : 'كشف الطلعة'}</button>
      ${t.status === 'prep' && t.items.length > 0 && html`<button class="linkbtn" onClick=${() => openSheet(TemplateForm, { preset: { name: L.TRIP_KIND[t.kind].label, items: t.items } })}><${Icon} name="save" size=${15} /> احفظها كليستة جاهزة</button>`}
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
      <div class="irow-sub">${i.code && html`<span class="code">${i.code}</span>`}${i.kind === 'part' && i.car_id && html`<span>${(idx.cars.get(i.car_id) || {}).name}</span>`}${t.status === 'prep' && i.qty < x.qty && html`<span class="neg">عندنا ${i.qty} بس</span>`}</div>
      ${oc && html`<div class="irow-tags"><${Pill} tone=${x.lost || x.damaged ? 'red' : 'amber'}>${oc}<//></div>`}
      ${closed && !oc && html`<div class="irow-tags"><${Pill} tone="green">رجعت سليمة<//></div>`}
    </button>
    ${t.status === 'prep' && i.qty > 1 ? html`<${Stepper} value=${x.qty} min=${1} max=${i.qty} onChange=${setQty} />` : html`<div class="qty"><b class="num">${x.qty}</b></div>`}
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
  return html`<${Sheet} title=${i.name} sub=${L.bidi(i.code, 'طالع ' + x.qty)} onClose=${close}
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
      const ordered = [];
      const secOf = new Map();
      tripGroups(t.items, idx).forEach(([g, xs]) => xs.forEach((x) => { ordered.push(x); secOf.set(x.item_id, g); }));
      const rows = ordered.map((x, n) => {
        const i = idx.items.get(x.item_id) || {};
        const res = t.status === 'closed' ? (outcomeText(x, i.kind) || 'رجعت سليمة') : t.status === 'out' ? (x.packed ? 'اتحمّلت' + (outcomeText(x, i.kind) ? ' — ' + outcomeText(x, i.kind) : '') : 'لسه') : (x.loaded ? '✓ طالع' : '☐');
        return { n: n + 1, code: i.code || '—', name: i.name + (i.size ? ' (' + i.size + ')' : ''), owner: i.kind === 'part' ? ownerText(i, idx) : secOf.get(x.item_id), qty: x.qty, res };
      });
      const title = `${k.label}: ${t.name}`;
      const meta = [['النوع', k.label], ['التاريخ', L.fmtDate(t.trip_date)], ['المكان', t.place || '—'], ['الحالة', L.TRIP_STATUS[t.status].label],
        ['عدد الحاجات', t.items.length + ' حاجة / ' + L.sum(t.items, (x) => x.qty) + ' قطعة'], ['اتطبع', L.nowStamp()]];
      const resLabel = t.status === 'prep' ? 'طالع؟' : t.status === 'out' ? 'اتحمّل للرجوع؟' : 'النتيجة';
      if (fmt === 'pdf') {
        const blob = await buildPdf({ dir: 'rtl', title, subtitle: S.company_ar, meta, footer: `${S.company_ar} — ${S.address_ar}`,
          sections: [{ title: t.status === 'prep' ? 'ليستة الطلعة' : 'كل اللي طلع', columns: [
            { key: 'n', label: '#', w: 0.5, align: 'center' }, { key: 'code', label: 'الكود', w: 1.3 }, { key: 'name', label: 'الحاجة', w: 3 },
            { key: 'owner', label: 'القسم / صاحبها', w: 2.2 }, { key: 'qty', label: 'العدد', w: 0.8, align: 'center' }, { key: 'res', label: resLabel, w: 2.2 }], rows }],
          signatures: ['المسؤول عن الطلوع', 'المسؤول عن الرجوع'] });
        setFile(fileFrom(blob, safeName(t.name + ' ' + t.trip_date) + '.pdf'));
      } else {
        const blob = buildXlsx([{ name: 'الطلعة', rtl: true, title, meta, columns: [{ label: '#', w: 5 }, { label: 'الكود', w: 12 }, { label: 'الحاجة', w: 30 }, { label: 'القسم / صاحبها', w: 24 }, { label: 'العدد', w: 8 }, { label: resLabel, w: 26 }],
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
