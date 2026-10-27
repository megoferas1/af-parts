/* items.js — الحاجة نفسها: صفحتها، تسجيلها، دخول/خروج/جرد/تركيب، واختيار حاجات */
import { html, useState, useEffect, useMemo, Icon, Pill, Empty, Spinner, Field, Segmented, Chips, Stepper, SearchBox, Act, Sheet, SecTitle, openSheet, closeSheet, closeAllSheets, toast, confirmBox, NumInput } from './ui.js?v=8';
import { call, errText, photoUrl, uploadPhoto, removePhotoFile } from './api.js?v=8';
import { useStore, getStore, reload, ownerText, isAdmin, canInvoice, nextPartNo } from './store.js?v=8';
import * as L from './lib.js?v=8';
import { DriverForm, CarForm, DriverSheet } from './drivers.js?v=8';
import { StickerSheet, labelFor } from './stickers.js?v=8';
import { ScanSheet } from './qr.js?v=8';
import { MoveRow } from './log.js?v=8';
import { ShipmentForm } from './export.js?v=8';
import { fmtMoney } from './docs.js?v=8';
import { UnitsBlock, MakeSheet, makeUnits, unitLabel } from './units.js?v=8';

/* تنفيذ عملية + تحديث + رسالة */
export async function run(fn, okMsg) {
  try {
    const r = await fn();
    await reload().catch(() => {});
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    return { ok: true, r };
  } catch (e) {
    toast(errText(e), 'bad');
    return { ok: false, e };
  }
}

/* ---------- صف حاجة في ليستة ---------- */
export function Thumb({ item, size }) {
  const k = L.KIND[item.kind] || L.KIND.part;
  return html`<div class=${'thumb ' + (size || '') + ' k-' + item.kind}>
    ${item.photo_path ? html`<img src=${photoUrl(item.photo_path)} loading="lazy" alt="" />` : html`<${Icon} name=${k.icon} size=${size === 'lg' ? 34 : 22} />`}
  </div>`;
}

export function ItemRow({ item, onClick, showOwner = true, right, extra }) {
  const { idx } = useStore();
  if (!item) return null;
  const out = idx.outQty.get(item.id) || 0;
  const cond = L.COND[item.condition];
  return html`<button class="irow" onClick=${onClick || (() => openSheet(ItemSheet, { id: item.id }))}>
    <${Thumb} item=${item} />
    <div class="grow irow-main">
      <div class="irow-title">${item.name}${item.size && html`<span class="size">${item.size}</span>`}</div>
      <div class="irow-sub">
        ${item.part_no && html`<span class="pn">${item.part_no}</span>`}
        ${item.code && !item.part_no && html`<span class="code">${item.code}</span>`}
        ${showOwner && item.kind === 'part' && html`<span>${ownerText(item, idx)}</span>`}
        ${item.kind !== 'part' && item.category && html`<span>${item.category}</span>`}
        ${item.location && html`<span>📍 ${item.location}</span>`}
      </div>
      ${(item.condition === 'repair' || item.condition === 'damaged' || out > 0 || extra) && html`<div class="irow-tags">
        ${(item.condition === 'repair' || item.condition === 'damaged') && html`<${Pill} tone=${cond.tone}>${cond.label}<//>`}
        ${out > 0 && html`<${Pill} tone="dark" icon="truck">برا ${out}<//>`}
        ${extra}
      </div>`}
    </div>
    ${right !== undefined ? right : html`<div class=${'qty ' + (item.qty === 0 ? 'zero' : '')}><b class="num">${item.qty}</b><span>عندنا</span></div>`}
  </button>`;
}

/* تجميع حسب النوع */
export function groupBy(items, keyFn, order, nameFn) {
  const m = new Map();
  items.forEach((i) => { const k = keyFn(i) || 'من غير نوع'; if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
  const ent = [...m.entries()];
  const nm = nameFn || ((i) => i.name || '');
  ent.forEach(([, arr]) => arr.sort((a, b) => L.cmpName(nm(a), nm(b))));
  if (!order) return ent;
  const pos = (k) => (k === 'من غير نوع' ? 1e6 : k === 'تانية' ? 1e5 : order.indexOf(k) === -1 ? 5e4 : order.indexOf(k));
  return ent.sort((a, b) => pos(a[0]) - pos(b[0]));
}

/* ---------- صفحة الحاجة ---------- */
export function ItemSheet({ id, close }) {
  const { idx } = useStore();
  const item = idx && idx.items.get(id);
  const [moves, setMoves] = useState(null);
  const stamp = item ? item.updated_at + ':' + item.qty : '';
  useEffect(() => {
    if (!item) return;
    let off = false;
    call('moves_list', { p: { item_id: id, limit: 40 } }).then((r) => { if (!off) setMoves(r); }).catch(() => { if (!off) setMoves([]); });
    return () => { off = true; };
  }, [id, stamp]);

  if (!item) return html`<${Sheet} title="الحاجة" onClose=${close}><${Empty} icon="info" text="الحاجة دي اتمسحت" /><//>`;
  const out = idx.outQty.get(item.id) || 0;
  const prep = idx.prepQty.get(item.id) || 0;
  const ship = idx.shipQty.get(item.id) || 0;
  const cond = L.COND[item.condition];
  const driver = item.driver_id && idx.drivers.get(item.driver_id);
  const trips = (idx.outTrips.get(item.id) || []);

  const K = item.kind;
  return html`<${Sheet} title=${item.name} sub=${L.KIND[K].label} onClose=${close}>
    <div class="ihead">
      ${item.photo_path ? html`<img class="iphoto" src=${photoUrl(item.photo_path)} alt="" />` : html`<${Thumb} item=${item} size="lg" />`}
      <div class="grow">
        <div class="row wrap gap8">
          ${item.part_no && html`<span class="codechip pn">${item.part_no}</span>`}
          ${item.code && K !== 'product' && html`<span class="codechip">${item.code}</span>`}
          ${item.size && html`<${Pill} tone="dark">${item.size}<//>`}
          ${item.category && html`<${Pill}>${item.category}<//>`}
        </div>
        ${K === 'part' && driver ? html`<button class="ownerlink" onClick=${() => openSheet(DriverSheet, { id: driver.id })}>
            <${Icon} name="user" size=${16} />${ownerText(item, idx)}</button>`
          : K === 'part' ? html`<div class="owner"><${Icon} name="home" size=${16} />ملك الجراش</div>`
          : html`<div class="owner"><${Icon} name=${K === 'tool' ? 'wrench' : 'globe'} size=${16} />${ownerText(item, idx)}</div>`}
        ${K === 'product' && item.name_en && html`<div class="soft ltr-t">${item.name_en}</div>`}
      </div>
    </div>

    <div class="istats">
      <div class="istat big"><span>عندنا في الجراش</span><b class="num">${item.qty}</b></div>
      ${out > 0 && html`<div class="istat"><span>برا في طلعة</span><b class="num">${out}</b></div>`}
      ${prep > 0 && html`<div class="istat"><span>محجوز لطلعة</span><b class="num">${prep}</b></div>`}
      ${ship > 0 && html`<div class="istat"><span>في شحنة</span><b class="num">${ship}</b></div>`}
      ${K !== 'product' && html`<div class="istat"><span>الحالة</span><b><${Pill} tone=${cond.tone}>${cond.label}<//></b></div>`}
      ${K === 'product' && canInvoice() && html`<div class="istat"><span>السعر</span><b class=${item.price == null ? 'soft' : 'num'}>${item.price == null ? 'لسه' : fmtMoney(item.price, item.price_cur, 'ar')}</b></div>`}
    </div>
    ${(item.location || item.note) && html`<div class="card soft-card">
      ${item.location && html`<div class="row gap8"><${Icon} name="pin" size=${18} /><span>مكانها: <b>${item.location}</b></span></div>`}
      ${item.note && html`<div class="row gap8"><${Icon} name="info" size=${18} /><span>${item.note}</span></div>`}
    </div>`}
    ${trips.length > 0 && html`<div class="note warn"><${Icon} name="truck" size=${18} /><span>${trips.map((t) => `${t.trip.name} (${t.qty})`).join('، ')}</span></div>`}

    ${K === 'product' ? html`<div class="acts a3 big">
        <${Act} icon="plus" label="صنّعنا" tone="green" onClick=${() => openSheet(MakeSheet, { id })} />
        <${Act} icon="globe" label="شحن" tone="dark" disabled=${item.qty < 1} onClick=${() => openSheet(ShipmentForm, { itemId: id })} />
        <${Act} icon="plus" label="+1 قطعة" onClick=${() => makeUnits(item, 1)} />
      </div>
      <${SmallActs} id=${id} />
      <${UnitsBlock} item=${item} />`
    : K === 'part' ? html`<div class="acts a3 big">
        <${Act} icon="wrench" label="تركيب" tone="dark" disabled=${item.qty < 1} onClick=${() => openSheet(InstallForm, { id })} />
        <${Act} icon="out" label="خروج" tone="red" disabled=${item.qty < 1} onClick=${() => openSheet(OutChooser, { id, type: 'out' })} />
        <${Act} icon="printer" label="استيكر" onClick=${() => openSheet(StickerSheet, { labels: [labelFor(item, idx)], title: 'استيكر ' + item.code, copies: true })} />
      </div>
      <${SmallActs} id=${id} />`
    : html`<div class="acts a3 big">
        <${Act} icon="in" label=${L.IN_LABEL[K]} tone="green" onClick=${() => openSheet(MoveForm, { id, type: 'in' })} />
        <${Act} icon="out" label="خروج" tone="red" disabled=${item.qty < 1} onClick=${() => openSheet(MoveForm, { id, type: 'out' })} />
        <${Act} icon="list" label="جرد" onClick=${() => openSheet(MoveForm, { id, type: 'adjust' })} />
      </div>
      <${SmallActs} id=${id} />`}

    <${SecTitle}>اللي حصل فيها<//>
    ${moves === null ? html`<${Spinner} />` : moves.length === 0 ? html`<${Empty} icon="history" text="لسه مفيش حركات" />`
      : html`<div class="card tight">${moves.map((m) => html`<${MoveRow} m=${m} key=${m.id} compact />`)}</div>`}
  <//>`;
}

/* باقي الأوامر: صف صغير ظاهر تحت الزراير الكبيرة */
function SmallActs({ id }) {
  const { idx } = useStore();
  const item = idx.items.get(id);
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const K = item.kind;
  const go = (C, p) => openSheet(C, p);
  async function onPhoto(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    const r = await run(() => uploadPhoto(item.id, f), 'الصورة اتحفظت');
    setBusy(false);
  }
  async function del() {
    const ok = await confirmBox({ title: 'مسح ' + item.name + '؟', text: 'هتتمسح بكل السجل بتاعها' + (K === 'product' ? ' وأكواد قطعها' : item.code ? '، والاستيكر بتاعها يرجع فاضي' : '') + '. مفيش رجوع.', ok: 'امسح', danger: true });
    if (!ok) return;
    const r = await run(() => call('delete_item', { p_item: item.id }), 'اتمسحت');
    if (r.ok) { if (r.r && r.r.delete) removePhotoFile(r.r.delete); closeAllSheets(); }
  }
  return html`<div class="acts small">
      ${K === 'part' && html`<${Act} icon="in" label="دخول" tone="green" onClick=${() => go(MoveForm, { id, type: 'in' })} />`}
      ${K === 'part' && html`<${Act} icon="list" label="جرد" onClick=${() => go(MoveForm, { id, type: 'adjust' })} />`}
      <${Act} icon="edit" label="تعديل" onClick=${() => go(ItemForm, { id })} />
      <label class=${'act ' + (busy ? 'disabled' : '')}><span class="act-ic">${busy ? html`<div class="spin sm"></div>` : html`<${Icon} name="camera" size=${24} />`}</span><span class="act-lb">${item.photo_path ? 'غيّر الصورة' : 'صورة'}</span>
        <input type="file" accept="image/*" capture="environment" hidden onChange=${onPhoto} /></label>
      ${K === 'tool' && item.code && html`<${Act} icon="printer" label="استيكر" onClick=${() => go(StickerSheet, { labels: [labelFor(item, idx)], title: 'استيكر ' + item.code, copies: true })} />`}
      ${isAdmin() && html`<${Act} icon="trash" label="مسح" onClick=${del} />`}
    </div>`;
}

/* ---------- تسجيل / تعديل حاجة ---------- */
export function KindChooser({ code, onPick, close }) {
  return html`<${Sheet} title="دي إيه؟" sub=${code ? 'الاستيكر ' + code + ' لسه فاضي، سجّله' : 'اختار نوع الحاجة'} onClose=${close}>
    <div class="kinds">
      ${(code ? ['part', 'garage'] : ['part', 'garage', 'tool', 'product']).map((k) => html`<button class=${'kindbtn k-' + k} onClick=${() => { close(); if (k === 'garage') onPick('part', { garage: true }); else onPick(k); }}>
        <span class="kindbtn-ic"><${Icon} name=${k === 'garage' ? 'home' : L.KIND[k].icon} size=${30} /></span>
        <span><b>${k === 'garage' ? 'قطعة بتاعة الجراش' : L.KIND[k].label}</b><small>${k === 'part' ? 'قطعة بتاعة سواق' : k === 'garage' ? 'قطعة ملك الجراش، مش لسواق' : k === 'tool' ? 'عدة، كراسي، خيام…' : 'حاجة بنصنّعها للتصدير'}</small></span>
      </button>`)}
    </div>
  <//>`;
}

/* افتح التسجيل: لو النوع مش معروف نسأل الأول */
export function startNewItem(opts = {}) {
  if (opts.kind) return openSheet(ItemForm, opts);
  openSheet(KindChooser, { code: opts.code, onPick: (kind, extra) => openSheet(ItemForm, { ...opts, kind, preset: { ...(opts.preset || {}), ...(extra || {}) } }) });
}

export function ItemForm({ id, kind: kindIn, code, preset, scanNext, onCreated, close }) {
  const { idx } = useStore();
  const old = id ? idx.items.get(id) : null;
  const kind = old ? old.kind : kindIn || 'part';
  const P = preset || {};
  const [f, setF] = useState(() => old ? { ...old, part_no: old.part_no || '', price: old.price == null ? null : Number(old.price), price_cur: old.price_cur || 'USD' } : {
    name: '', name_en: '', category: P.category || '', size: '', driver_id: P.driver_id || '', car_id: P.car_id || '',
    qty: kind === 'product' ? 0 : 1, condition: kind === 'product' ? 'new' : 'used', location: P.location || '', note: '',
    part_no: kind === 'product' ? nextPartNo(P.category || '') : '', price: null, price_cur: 'USD',
  });
  const [pnAuto, setPnAuto] = useState(!old);
  const [garage, setGarage] = useState(old ? old.kind === 'part' && !old.driver_id : !!P.garage);
  const [newAbbr, setNewAbbr] = useState('');
  async function saveAbbr() {
    if (!newAbbr) return toast('اكتب الاختصار', 'bad');
    const r = await run(() => call('set_category_abbr', { p_kind: 'product', p_name: f.category, p_abbr: newAbbr }), 'اتحفظ الاختصار');
    if (r.ok) { setNewAbbr(''); if (pnAuto) setF((x) => ({ ...x, part_no: nextPartNo(x.category, id) })); }
  }
  const inv = canInvoice();
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cars = f.driver_id ? (idx.carsByDriver.get(f.driver_id) || []) : [];
  const cats = idx.cats[kind] || [];

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function pickPhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPhoto(file); setPreview(URL.createObjectURL(file));
  }
  function onDriver(v) {
    if (v === '__garage') { setGarage(true); setF((x) => ({ ...x, driver_id: '', car_id: '' })); return; }
    setGarage(false);
    if (v === '__new') return openSheet(DriverForm, { onSaved: (did) => setF((x) => ({ ...x, driver_id: did, car_id: '' })) });
    setF((x) => ({ ...x, driver_id: v, car_id: '' }));
  }
  function onCar(v) {
    if (v === '__new') return openSheet(CarForm, { driverId: f.driver_id, onSaved: (cid) => set('car_id', cid) });
    set('car_id', v);
  }
  async function addCat() {
    const n = (newCat || '').trim();
    if (!n) { setNewCat(null); return; }
    const r = await run(() => call('add_category', { p_kind: kind, p_name: n }));
    if (r.ok) set('category', n);
    setNewCat(null);
  }

  async function save(mode) {
    if (!f.name.trim()) return toast('اكتب اسم الحاجة', 'bad');
    if (kind === 'part' && !f.driver_id && !garage) return toast('اختار صاحب القطعة: سواق ولا الجراش', 'bad');
    setBusy(true);
    const body = { kind, name: f.name, name_en: f.name_en, category: f.category, size: f.size, driver_id: garage ? null : f.driver_id || null,
      car_id: f.car_id || null, qty: f.qty, condition: f.condition, location: f.location, note: f.note, code: id ? undefined : code };
    if (kind === 'product') body.part_no = (f.part_no || '').trim();
    let res;
    try {
      res = await call('save_item', { p_id: id || null, p: body });
    } catch (e) { setBusy(false); return toast(errText(e), 'bad'); }
    if (kind === 'product' && inv && (!old || Number(old.price) !== Number(f.price) || (old.price == null) !== (f.price == null) || old.price_cur !== f.price_cur)) {
      try { await call('set_item_price', { p_item: res.id, p_price: f.price, p_cur: f.price_cur }); } catch (e) { toast('اتحفظ، بس السعر ما اتحفظش: ' + errText(e), 'bad'); }
    }
    if (photo) {
      try { await uploadPhoto(res.id, photo); } catch (e) { toast('اتسجلت، بس الصورة ما اترفعتش', 'bad'); }
    }
    await reload().catch(() => {});
    setBusy(false);
    if (id) { toast('اتحفظ'); close(); return; }
    toast('اتسجلت ✓' + (res.part_no ? ' ' + res.part_no : res.code ? ' ' + res.code : ''));
    /* منتج جديد بعدد: كل قطعة خدت كود، فاستيكراتهم تطلع على طول */
    const newUnits = kind === 'product' ? (getStore().idx.unitsByItem.get(res.id) || []) : [];
    const printUnits = () => { const it = getStore().idx.items.get(res.id); if (it && newUnits.length) openSheet(StickerSheet, { labels: newUnits.map((u) => unitLabel(u.code, it)), title: 'استيكرات ' + it.name }); };
    if (mode === 'again') {
      setF((x) => ({ ...x, name: '', name_en: '', size: '', qty: kind === 'product' ? 0 : 1, note: '', price: null,
        part_no: kind === 'product' ? nextPartNo(x.category || '') : '' }));
      setPhoto(null); setPreview('');
      printUnits();
      return;
    }
    close();
    if (onCreated) { onCreated(res.id, f.qty); return; }
    if (mode === 'scan' && scanNext) { scanNext(); return; }
    openSheet(ItemSheet, { id: res.id });
    printUnits();
  }

  const title = id ? 'تعديل ' + old.name : kind === 'part' && garage ? 'تسجيل قطعة للجراش' : 'تسجيل ' + L.KIND[kind].label;
  return html`<${Sheet} title=${title} sub=${id ? (old.code || L.KIND[kind].label) : code ? 'الكود: ' + code + ' (من الاستيكر)' : kind === 'tool' ? 'العدة من غير كود' : 'هتاخد كود جديد أوتوماتيك'} onClose=${close}
    footer=${html`<div class="stack">
      <button class="btn bigbtn" disabled=${busy} onClick=${() => save('open')}>${busy ? 'لحظة...' : html`<${Icon} name="check" size=${22} /> حفظ`}</button>
      ${!id && code && scanNext && html`<button class="btn ghost" disabled=${busy} onClick=${() => save('scan')}><${Icon} name="scan" size=${20} /> حفظ وامسح الاستيكر اللي بعده</button>`}
      ${!id && !code && !onCreated && html`<button class="btn ghost" disabled=${busy} onClick=${() => save('again')}><${Icon} name="plus" size=${20} /> حفظ وسجّل حاجة تانية</button>`}
    </div>`}>

    ${kind === 'part' && html`
      <${Field} label="صاحبها" req>
        <select class="input" value=${garage ? '__garage' : f.driver_id} onChange=${(e) => onDriver(e.target.value)}>
          <option value="">— اختار —</option>
          <option value="__garage">ملك الجراش (مش لسواق)</option>
          ${getStore().data.drivers.map((d) => html`<option value=${d.id}>${d.name}</option>`)}
          <option value="__new">+ سواق جديد</option>
        </select><//>
      ${f.driver_id && html`<${Field} label="العربية" hint="لو السواق عنده كذا عربية، اختار بتاعة أنهي واحدة">
        <select class="input" value=${f.car_id || ''} onChange=${(e) => onCar(e.target.value)}>
          <option value="">— مش متحددة —</option>
          ${cars.map((c) => html`<option value=${c.id}>${c.name}</option>`)}
          <option value="__new">+ عربية جديدة</option>
        </select><//>`}`}

    <${Field} label=${kind === 'product' ? 'اسم المنتج (عربي)' : 'اسم الحاجة'} req>
      <input class="input" value=${f.name} placeholder=${kind === 'part' ? 'مثلاً: سوست أمامي' : kind === 'tool' ? 'مثلاً: كرسي بحر' : 'مثلاً: دراع تحكم'} onInput=${(e) => set('name', e.target.value)} /><//>
    ${kind === 'product' && html`<${Field} label="الاسم بالإنجليزي" hint="ده اللي بيظهر في الـ Packing List الإنجليزي">
      <input class="input ltr" value=${f.name_en} placeholder="e.g. Control Arm" onInput=${(e) => set('name_en', e.target.value)} /><//>`}

    <${Field} label="النوع">
      <${Chips} items=${[...cats, ...(f.category && !cats.includes(f.category) ? [f.category] : [])]} value=${f.category} onChange=${(v) => {
        const c = f.category === v ? '' : v;
        setF((x) => ({ ...x, category: c, part_no: kind === 'product' && pnAuto ? nextPartNo(c, id) : x.part_no }));
      }} />
      ${newCat === null ? html`<button type="button" class="linkbtn" onClick=${() => setNewCat('')}>+ نوع جديد</button>`
        : html`<div class="row gap8"><input class="input" placeholder="اسم النوع" value=${newCat} onInput=${(e) => setNewCat(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') addCat(); }} /><button type="button" class="btn sm" style="width:auto;padding:0 18px" onClick=${addCat}>ضيف</button></div>`}
    <//>
    ${kind === 'product' && inv && html`<${Field} label="السعر" hint="ده السعر الثابت، وتقدر تغيّره في كل فاتورة">
      <div class="row gap8">
        <${NumInput} value=${f.price} onChange=${(v) => set('price', v)} placeholder="0.00" />
        <div style="width:150px;flex:none"><${Segmented} value=${f.price_cur} onChange=${(v) => set('price_cur', v)} items=${[['USD', 'دولار'], ['EGP', 'جنيه']]} /></div>
      </div><//>`}
    <${Field} label=${kind === 'product' ? 'المقاس / الموديل' : 'المقاس / المواصفات'} hint="مثلاً: 8kg، 6 inch، 18×9.5، E36">
      <input class="input" value=${f.size} onInput=${(e) => set('size', e.target.value)} /><//>
    ${!id && html`<${Field} label=${kind === 'product' ? 'عندنا كام قطعة جاهزة دلوقتي؟' : 'العدد'} hint=${kind === 'product' ? 'كل قطعة هتاخد كود لوحدها واستيكرها هيطلعلك. لو لسه ما اتصنعش، سيبها 0' : ''}><${Stepper} value=${f.qty} min=${kind === 'product' ? 0 : 1} onChange=${(v) => set('qty', v)} big /><//>`}
    <${SecTitle}>تفاصيل (اختياري)<//>
    ${kind === 'product' && html`<${Field} label="رقم القطعة (Part No.)" hint=${id ? 'بيظهر في الفاتورة والـ Packing List' : 'الابلكيشن بيعمله لوحده من نوع المنتج: اختار النوع وهو يتظبط، أو غيّره بإيدك'}>
      <div class="row gap8">
        <input class="input ltr" value=${f.part_no} placeholder="AF-ENG-001" onInput=${(e) => { setPnAuto(false); set('part_no', e.target.value.toUpperCase()); }} />
        <button type="button" class="btn ghost sm" style="width:auto;padding:0 14px" onClick=${() => { setPnAuto(true); set('part_no', nextPartNo(f.category, id)); }}>اقترح</button>
      </div>
      ${f.category && !idx.abbr.get('product:' + f.category) && html`<div class="abbrfix">
        <span class="grow">النوع "${f.category}" ملوش اختصار، فالرقم طالع GEN. اكتب اختصار إنجليزي ليه (زي ENG):</span>
        <input class="input ltr abbr" maxlength="6" value=${newAbbr} onInput=${(e) => setNewAbbr(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <button type="button" class="btn sm" style="width:auto;padding:0 14px" onClick=${saveAbbr}>حفظ</button></div>`}<//>`}
    ${kind !== 'product' && html`<${Field} label="الحالة">
      <${Chips} items=${Object.entries(L.COND).map(([k, v]) => [k, v.label])} value=${f.condition} onChange=${(v) => set('condition', v)} /><//>`}
    <${Field} label="مكانها في الجراش">
      <input class="input" list="locs" value=${f.location} placeholder="مثلاً: رف 2" onInput=${(e) => set('location', e.target.value)} />
      <datalist id="locs">${idx.locations.map((l) => html`<option value=${l} />`)}</datalist>
      ${idx.locations.length > 0 && html`<${Chips} items=${idx.locations.slice(0, 8)} value=${f.location} onChange=${(v) => set('location', v)} />`}
    <//>
    <${Field} label="ملاحظات"><textarea class="input" rows="2" value=${f.note} onInput=${(e) => set('note', e.target.value)}></textarea><//>
    ${!id && html`<${Field} label="صورة (اختياري)">
      ${preview && html`<img class="pv" src=${preview} alt="" />`}
      <label class="btn ghost"><${Icon} name="camera" size=${20} /> ${preview ? 'غيّر الصورة' : 'صوّرها'}<input type="file" accept="image/*" capture="environment" hidden onChange=${pickPhoto} /></label>
    <//>`}
  <//>`;
}

/* ---------- خرجت إزاي؟ (القطع والمنتجات) ---------- */
export function OutChooser({ id, close }) {
  const { idx } = useStore();
  const item = idx.items.get(id);
  if (!item) return null;
  const K = item.kind;
  const driver = item.driver_id && idx.drivers.get(item.driver_id);
  const go = (Comp, props) => { close(); openSheet(Comp, props); };
  const opts = K === 'part' ? [
    ['install', 'wrench', 'تركيب', 'اتركبت على عربية السواق، وتسجّل القديمة اللي طلعت', () => go(InstallForm, { id })],
    ['ship', 'globe', 'شحن', 'هتتشحن لصاحبها أو لحد تاني، وبتتسجل في الشحنات', () => go(ShipmentForm, { itemId: id })],
    ...(driver ? [['owner', 'user', 'صاحبها خدها', driver.name + ' خدها من الجراش', () => go(MoveForm, { id, type: 'out', preset: 'صاحبها خدها' })]] : []),
  ] : [
    ['ship', 'globe', 'شحن لعميل', 'بتتسجل في الشحنات وتطلعلها Packing List', () => go(ShipmentForm, { itemId: id })],
  ];
  return html`<${Sheet} title="خرجت إزاي؟" sub=${L.bidi(item.name, item.size, item.code)} onClose=${close}>
    <div class="kinds">
      ${opts.map(([k, ic, lb, sub, fn]) => html`<button class=${'kindbtn out-' + k} key=${k} onClick=${fn}>
        <span class="kindbtn-ic"><${Icon} name=${ic} size=${28} /></span>
        <span><b>${lb}</b><small>${sub}</small></span>
      </button>`)}
    </div>
    <button type="button" class="linkbtn center" onClick=${() => go(MoveForm, { id, type: 'out' })}>سبب تاني؟</button>
  <//>`;
}

/* ---------- دخول / خروج / جرد ---------- */
export function MoveForm({ id, type, preset, close }) {
  const { idx } = useStore();
  const item = idx.items.get(id);
  const [qty, setQty] = useState(type === 'adjust' ? (item ? item.qty : 0) : type === 'out' && preset && item ? item.qty : 1);
  const [reason, setReason] = useState(preset || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const K = item.kind;
  const title = preset || (type === 'in' ? L.IN_LABEL[K] : type === 'out' ? 'خروج من الجراش' : 'جرد');
  async function save() {
    if (type === 'out' && !reason) return toast('اختار السبب', 'bad');
    setBusy(true);
    const n = [reason !== 'تانية' ? reason : '', note.trim()].filter(Boolean).join(' — ');
    const r = await run(() => call('item_move', { p_item: id, p_type: type, p_qty: qty, p_note: n }), 'اتسجل ✓');
    setBusy(false);
    if (r.ok) close();
  }
  const oneOnly = type === 'out' && item.qty === 1;
  return html`<${Sheet} title=${title} sub=${L.bidi(item.name, item.size, item.code)} onClose=${close}
    footer=${html`<button class=${'btn bigbtn ' + (type === 'out' ? '' : type === 'in' ? 'green' : 'dark')} disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'تسجيل'}</button>`}>
    <div class="note info"><${Icon} name="info" size=${18} /><span>عندنا دلوقتي: <b class="num">${item.qty}</b></span></div>
    ${!oneOnly && html`<${Field} label=${type === 'adjust' ? 'العدد الحقيقي اللي في الجراش' : type === 'in' ? 'كام واحدة دخلت؟' : 'كام واحدة خرجت؟'}>
      <${Stepper} value=${qty} min=${type === 'adjust' ? 0 : 1} max=${type === 'out' ? item.qty : 99999} onChange=${setQty} big /><//>`}
    ${type === 'out' && !preset && html`<${Field} label="خرجت ليه؟" req><${Chips} items=${L.OUT_REASONS[K]} value=${reason} onChange=${setReason} /><//>`}
    <${Field} label="ملاحظة (اختياري)"><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} placeholder=${type === 'in' ? 'مثلاً: جت مع العربية' : ''} /><//>
  <//>`;
}

/* ---------- القطعة القديمة اللي طلعت (للتركيب) ---------- */
export function OldPartFields({ value, onChange, maxQty, src }) {
  const v = value || { mode: '' };
  const set = (k, x) => onChange({ ...v, [k]: x });
  function scanSticker() {
    openSheet(ScanSheet, {
      title: 'امسح الاستيكر اللي لزقته على القديمة',
      onCode: async (code) => {
        const s = getStore();
        if (s.idx.byCode.has(code)) return { ok: false, msg: 'الاستيكر ده متسجل على حاجة تانية' };
        try {
          const r = await call('code_info', { p_code: code });
          if (r.status !== 'blank') return { ok: false, msg: 'الاستيكر ده مش من الاستيكرات الفاضية' };
        } catch (e) { return { ok: false, msg: errText(e) }; }
        onChange({ ...v, code });
        return { ok: true, msg: 'تمام: ' + code };
      },
    });
  }
  return html`<div class="stack">
    <${Field} label="القطعة القديمة اللي طلعت راحت فين؟" req>
      <div class="radios">
        ${[['keep', 'فضلت في الجراش', 'هتتسجل باسم نفس السواق'], ['driver', 'السواق خدها', ''], ['trash', 'اترمت', ''], ['none', 'مفيش قديمة', 'كانت مكان فاضي']].map(([k, lb, sub]) => html`
          <button type="button" class=${'radio ' + (v.mode === k ? 'on' : '')} onClick=${() => onChange({ ...v, mode: k, qty: v.qty || maxQty, condition: v.condition || 'used' })}>
            <i></i><span><b>${lb}</b>${sub && html`<small>${sub}</small>`}</span></button>`)}
      </div><//>
    ${v.mode === 'keep' && html`<div class="card soft-card stack">
      ${maxQty > 1 && html`<${Field} label="عددها"><${Stepper} value=${v.qty || maxQty} min=${1} onChange=${(x) => set('qty', x)} /><//>`}
      <${Field} label="حالتها"><${Chips} items=${Object.entries(L.COND).filter(([k]) => k !== 'new').map(([k, x]) => [k, x.label])} value=${v.condition || 'used'} onChange=${(x) => set('condition', x)} /><//>
      <${Field} label="مقاسها" hint=${src && src.size ? 'الجديدة مقاسها ' + src.size : ''}><input class="input" value=${v.size || ''} onInput=${(e) => set('size', e.target.value)} /><//>
      <${Field} label="هتتحط فين؟"><input class="input" value=${v.location || ''} onInput=${(e) => set('location', e.target.value)} placeholder="مثلاً: رف القديم" /><//>
      <div class="row gap8 wrap">
        ${v.code ? html`<span class="codechip">${v.code}</span><button type="button" class="linkbtn" onClick=${() => set('code', '')}>شيله</button>`
          : html`<button type="button" class="btn ghost sm" onClick=${scanSticker}><${Icon} name="scan" size=${18} /> لزقت عليها استيكر؟ امسحه</button>`}
      </div>
      ${!v.code && html`<div class="hint">لو ما لزقتش استيكر، هتاخد كود جديد وتقدر تطبعله استيكر بعدين.</div>`}
    </div>`}
  </div>`;
}

/* ---------- تركيب ---------- */
export function InstallForm({ id, carId, driverId, close }) {
  const { idx } = useStore();
  const item = idx.items.get(id);
  const [qty, setQty] = useState(item ? item.qty : 1);
  const [car, setCar] = useState(carId || (item ? item.car_id || '' : ''));
  const [old, setOld] = useState({ mode: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [drv, setDrv] = useState(item && !item.driver_id ? driverId || '' : '');
  if (!item) return null;
  const garage = !item.driver_id;                         // قطعة الجراش بتتركب على عربية أي سواق
  const owner = garage ? drv : item.driver_id;
  const cars = owner ? idx.carsByDriver.get(owner) || [] : [];
  async function save() {
    if (garage && !drv) return toast('اختار السواق اللي هتتركب على عربيته', 'bad');
    if (!car) return toast('اختار العربية', 'bad');
    if (!old.mode) return toast('قول القطعة القديمة راحت فين', 'bad');
    setBusy(true);
    const r = await run(() => call('install_part', { p_item: id, p_qty: qty, p_car: car, p_note: note, p_old: old.mode === 'keep' ? { ...old, qty: old.qty || qty } : { mode: old.mode } }),
      (res) => 'اتركبت ✓' + (res && res.old_code ? ' — والقديمة اتسجلت ' + res.old_code : ''));
    setBusy(false);
    if (r.ok) close();
  }
  return html`<${Sheet} title="تركيب على العربية" sub=${L.bidi(item.name, item.size, item.code)} onClose=${close}
    footer=${html`<button class="btn bigbtn dark" disabled=${busy} onClick=${save}><${Icon} name="wrench" size=${22} /> ${busy ? 'لحظة...' : 'اتركبت'}</button>`}>
    ${item.qty > 1 && html`<${Field} label="كام واحدة اتركبت؟"><${Stepper} value=${qty} min=${1} max=${item.qty} onChange=${setQty} big /><//>`}
    ${garage && html`<${Field} label="هتتركب لمين؟" req hint="القطعة دي ملك الجراش، وهتتسجل في كشف السواق ده">
      <select class="input" value=${drv} onChange=${(e) => { setDrv(e.target.value); setCar(''); }}>
        <option value="">— اختار السواق —</option>${getStore().data.drivers.map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select><//>`}
    ${owner && html`<${Field} label="على أنهي عربية؟" req>
      ${cars.length ? html`<${Chips} items=${cars.map((c) => [c.id, c.name])} value=${car} onChange=${setCar} />`
        : html`<div class="hint">السواق ده لسه ملوش عربيات متسجلة</div>`}
      <button type="button" class="linkbtn" onClick=${() => openSheet(CarForm, { driverId: owner, onSaved: setCar })}>+ عربية جديدة</button>
    <//>`}
    <${OldPartFields} value=${old} onChange=${setOld} maxQty=${qty} src=${item} />
    <${Field} label="ملاحظة (اختياري)"><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} /><//>
  <//>`;
}

/* ---------- اختيار حاجات (للطلعات والشحنات والليستات) ---------- */
export function ItemPicker({ title, kinds = ['part', 'tool', 'product'], limit, exclude, onDone, doneLabel = 'ضيف', close }) {
  const { idx, data } = useStore();
  const [kind, setKind] = useState(kinds[0]);
  const [q, setQ] = useState('');
  const [drv, setDrv] = useState('');
  const [sel, setSel] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const maxOf = (i) => (limit ? limit(i) : i.qty);
  const list = useMemo(() => {
    let arr = idx.kinds[kind] || [];
    if (kind === 'part' && drv) arr = arr.filter((i) => (drv === '__garage' ? !i.driver_id : i.driver_id === drv));
    if (q) arr = arr.filter((i) => L.matches(idx.hay.get(i.id), q));
    if (exclude) arr = arr.filter((i) => !exclude(i));
    return arr.slice().sort((a, b) => (maxOf(b) > 0) - (maxOf(a) > 0) || L.cmpName(a.name, b.name));
  }, [idx, kind, q, drv]);
  const toggle = (i) => setSel((m) => { const n = new Map(m); if (n.has(i.id)) n.delete(i.id); else n.set(i.id, Math.min(1, maxOf(i)) || 1); return n; });
  const setQ2 = (i, v) => setSel((m) => { const n = new Map(m); n.set(i.id, v); return n; });
  async function done() {
    setBusy(true);
    const ok = await onDone([...sel.entries()].map(([item_id, qty]) => ({ item_id, qty })));
    setBusy(false);
    if (ok !== false) close();
  }
  const total = [...sel.values()].reduce((a, b) => a + b, 0);
  return html`<${Sheet} title=${title || 'اختار الحاجات'} onClose=${close} full
    footer=${html`<button class="btn bigbtn" disabled=${busy || sel.size === 0} onClick=${done}>${busy ? 'لحظة...' : `${doneLabel} (${sel.size} حاجة · ${total} قطعة)`}</button>`}>
    ${kinds.length > 1 && html`<${Segmented} value=${kind} onChange=${setKind} items=${kinds.map((k) => [k, L.KIND[k].plural])} />`}
    ${kind === 'part' && html`<select class="input" value=${drv} onChange=${(e) => setDrv(e.target.value)}>
      <option value="">كل القطع</option><option value="__garage">قطع الجراش</option>${data.drivers.map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select>`}
    <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر بالاسم أو المقاس أو الكود" />
    ${list.length === 0 ? html`<${Empty} icon="search" text="مفيش حاجات هنا" />` : html`<div class="card tight">
      ${list.map((i) => {
        const on = sel.has(i.id), mx = maxOf(i);
        return html`<div class=${'pick ' + (on ? 'on' : '') + (mx < 1 ? ' dis' : '')} key=${i.id}>
          <button class="pick-main" disabled=${mx < 1} onClick=${() => toggle(i)}>
            <span class="tick">${on && html`<${Icon} name="check" size=${16} stroke=${3} />`}</span>
            <div class="grow"><div class="irow-title">${i.name}${i.size && html`<span class="size">${i.size}</span>`}</div>
              <div class="irow-sub">${i.code && html`<span class="code">${i.code}</span>`}${i.kind === 'part' && html`<span>${ownerText(i, idx)}</span>`}<span>متاح: <b class="num">${mx}</b></span></div></div>
          </button>
          ${on && mx > 1 && html`<div class="pick-qty"><${Stepper} value=${sel.get(i.id)} min=${1} max=${mx} onChange=${(v) => setQ2(i, v)} /></div>`}
        </div>`;
      })}
    </div>`}
  <//>`;
}
