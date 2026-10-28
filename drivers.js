/* drivers.js — السواقين وعربياتهم وقطعهم */
import { html, useState, useMemo, Icon, Empty, Spinner, Field, Chips, SearchBox, Act, Sheet, SecTitle, Hero, openSheet, toast, confirmBox } from './ui.js?v=14';
import { call, errText } from './api.js?v=14';
import { useStore, reload } from './store.js?v=14';
import * as L from './lib.js?v=14';
import { ItemRow, ItemSheet, startNewItem, run, groupBy } from './items.js?v=14';
import { StickerSheet, labelsByQty, FileReady } from './stickers.js?v=14';
import { buildPdf, buildXlsx, fileFrom, safeName } from './docs.js?v=14';
import { HeroScan } from './home.js?v=14';
import { JobCard, JobForm, CarJobsSheet, isOpenJob } from './jobs.js?v=14';

export function DriversTab() {
  const { data, idx } = useStore();
  const parts = idx.kinds.part;
  return html`
    <${Hero} title="السواقين وقطعهم" sub=${`${data.drivers.length} سواق · ${L.sum(parts, (p) => p.qty)} قطعة عندنا`} right=${html`<${HeroScan} />`} />
    <main class="body">
      <button class="btn" onClick=${() => openSheet(DriverForm, { onSaved: (id) => openSheet(DriverSheet, { id }) })}><${Icon} name="plus" size=${22} /> سواق جديد</button>
      <button class="dcard garage" onClick=${() => openSheet(GaragePartsSheet)}>
        <span class="avatar"><${Icon} name="home" size=${22} /></span>
        <span class="grow"><b>قطع الجراش</b><small>قطع ملك الجراش، مش لسواق</small></span>
        <span class="qty"><b class="num">${L.sum(idx.garageParts, (i) => i.qty)}</b><span>قطعة</span></span>
      </button>
      <${DriverList} />
    </main>`;
}

/* قطع السواقين: صفحة لوحدها من الرئيسية — السواقين اللي ليهم قطع عندنا الأول */
export function DriverPartsSheet({ close }) {
  const { idx } = useStore();
  const drv = idx.kinds.part.filter((i) => i.driver_id);
  return html`<${Sheet} title="قطع السواقين" sub=${`${L.sum(drv, (i) => i.qty)} قطعة عندنا`} onClose=${close} full>
    <div class="grid2">
      <button class="btn sm" onClick=${() => startNewItem({ kind: 'part' })}><${Icon} name="plus" size=${18} /> قطعة جديدة</button>
      <button class="btn ghost sm" onClick=${() => openSheet(DriverForm, { onSaved: (id) => openSheet(DriverSheet, { id }) })}><${Icon} name="user" size=${18} /> سواق جديد</button>
    </div>
    <${DriverList} sorted />
  <//>`;
}

/* ليستة السواقين بعدد قطعهم — بتدوّر بالاسم أو التليفون أو العربية أو اسم/كود القطعة */
function DriverList({ sorted }) {
  const { data, idx } = useStore();
  const [q, setQ] = useState('');
  const have = (d) => L.sum(idx.itemsByDriver.get(d.id) || [], (i) => i.qty);
  const list = useMemo(() => {
    const xs = data.drivers.filter((d) => {
      if (!q) return true;
      const cars = (idx.carsByDriver.get(d.id) || []).map((c) => c.name).join(' ');
      return L.matches(d.name + ' ' + d.phone + ' ' + cars, q) || (idx.itemsByDriver.get(d.id) || []).some((i) => L.matches(idx.hay.get(i.id), q));
    });
    return sorted ? xs.slice().sort((a, b) => have(b) - have(a)) : xs;
  }, [data, q, sorted]);
  return html`
    <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر على سواق، عربية، أو قطعة" />
    ${list.length === 0 ? html`<${Empty} icon="users" text=${q ? 'مفيش حاجة كده' : 'لسه مفيش سواقين — ضيف أول سواق'} />`
      : html`<div class="dgrid">${list.map((d) => {
        const n = have(d);
        const cars = idx.carsByDriver.get(d.id) || [];
        return html`<button class=${'dcard' + (sorted && !n ? ' faded' : '')} key=${d.id} onClick=${() => openSheet(DriverSheet, { id: d.id })}>
          <span class="avatar">${d.name.trim().charAt(0)}</span>
          <span class="grow"><b>${d.name}</b><small>${cars.length ? cars.map((c) => c.name).join('، ') : 'من غير عربيات'}</small></span>
          <span class="qty"><b class="num">${n}</b><span>قطعة</span></span>
        </button>`;
      })}</div>`}`;
}

/* قطع ملك الجراش (من غير سواق) */
export function GaragePartsSheet({ close }) {
  const { idx } = useStore();
  const [q, setQ] = useState('');
  const its = idx.garageParts.filter((i) => !q || L.matches(idx.hay.get(i.id), q));
  const have = its.filter((i) => i.qty > 0), gone = its.filter((i) => i.qty === 0);
  return html`<${Sheet} title="قطع الجراش" sub=${`${L.sum(idx.garageParts, (i) => i.qty)} قطعة`} onClose=${close} full>
    <div class="grid2">
      <button class="btn sm" onClick=${() => startNewItem({ kind: 'part', preset: { garage: true } })}><${Icon} name="plus" size=${18} /> قطعة جديدة</button>
      <button class="btn ghost sm" disabled=${!have.length} onClick=${() => openSheet(StickerSheet, { labels: labelsByQty(have, idx), title: 'استيكرات قطع الجراش' })}><${Icon} name="printer" size=${18} /> استيكرات</button>
    </div>
    ${idx.garageParts.length > 0 && html`<${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر في قطع الجراش" />`}
    ${have.length === 0 && gone.length === 0 ? html`<${Empty} icon="home" text=${q ? 'مفيش حاجة كده' : 'لسه مفيش قطع للجراش. سجّلها من هنا أو اعمل سكان لاستيكر فاضي واختار "قطعة بتاعة الجراش".'} />`
      : groupBy(have, (i) => i.category, idx.cats.part).map(([cat, xs]) => html`<div class="grp" key=${cat}>
          <div class="grp-h">${cat} <i>${L.sum(xs, (i) => i.qty)}</i></div>
          <div class="card tight">${xs.map((i) => html`<${ItemRow} item=${i} key=${i.id} showOwner=${false} />`)}</div></div>`)}
    ${gone.length > 0 && html`<${SecTitle}>خلصت (${gone.length})<//><div class="card tight">${gone.map((i) => html`<${ItemRow} item=${i} key=${i.id} showOwner=${false} />`)}</div>`}
  <//>`;
}

export function DriverSheet({ id, close }) {
  const { idx, data } = useStore();
  const d = idx.drivers.get(id);
  const [car, setCar] = useState('');
  const [showGone, setShowGone] = useState(false);
  if (!d) return html`<${Sheet} title="السواق" onClose=${close}><${Empty} text="السواق ده اتمسح" /><//>`;
  const cars = idx.carsByDriver.get(id) || [];
  const all = idx.itemsByDriver.get(id) || [];
  const mine = car ? all.filter((i) => i.car_id === car) : all;
  const here = mine.filter((i) => i.qty > 0 || (idx.outQty.get(i.id) || 0) > 0);
  const gone = mine.filter((i) => !here.includes(i));
  const wa = L.waNumber(d.phone);
  async function del() {
    if (all.length) return toast('السواق ده عليه قطع متسجلة، مينفعش يتمسح', 'bad');
    if (!(await confirmBox({ title: 'مسح ' + d.name + '؟', text: 'هيتمسح هو وعربياته.', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('delete_driver', { p_id: id }), 'اتمسح');
    if (r.ok) close();
  }
  const carObj = car && idx.cars.get(car);
  /* أوامر الشغل المفتوحة لعربياته (أو للعربية المختارة) */
  const jobs = data.jobs.filter((j) => isOpenJob(j) && (car ? j.car_id === car : j.driver_id === id || cars.some((c) => c.id === j.car_id)));
  return html`<${Sheet} title=${d.name} sub=${d.phone || 'من غير تليفون'} onClose=${close} full>
    ${d.phone && html`<div class="row gap8">
      <a class="btn ghost sm" href=${'tel:' + d.phone}><${Icon} name="phone" size=${18} /> اتصال</a>
      ${wa && html`<a class="btn ghost sm" href=${'https://wa.me/' + wa} target="_blank" rel="noopener"><${Icon} name="chat" size=${18} /> واتساب</a>`}
    </div>`}
    <div class="acts">
      <${Act} icon="plus" label="قطعة جديدة" tone="red" onClick=${() => startNewItem({ kind: 'part', preset: { driver_id: id, car_id: car || '' } })} />
      <${Act} icon="file" label="كشف للسواق" tone="dark" onClick=${() => openSheet(DriverReportSheet, { id })} />
      <${Act} icon="printer" label="استيكرات" disabled=${!here.length} onClick=${() => openSheet(StickerSheet, { labels: labelsByQty(here, idx), title: 'استيكرات ' + d.name })} />
      <${Act} icon="edit" label="تعديل" onClick=${() => openSheet(DriverForm, { id })} />
    </div>

    <${SecTitle}>العربيات<//>
    <div class="chips nowrap">
      <button class=${'chip ' + (!car ? 'on' : '')} onClick=${() => setCar('')}>الكل (${all.length})</button>
      ${cars.map((c) => html`<button class=${'chip ' + (car === c.id ? 'on' : '')} onClick=${() => setCar(c.id)}>${c.name} (${all.filter((i) => i.car_id === c.id).length})</button>`)}
      <button class="chip add" onClick=${() => openSheet(CarForm, { driverId: id, onSaved: setCar })}>+ عربية</button>
    </div>
    ${carObj && html`<button class="linkbtn" onClick=${() => openSheet(CarForm, { id: carObj.id, driverId: id })}><${Icon} name="edit" size=${15} /> تعديل ${carObj.name}</button>`}

    <${SecTitle} right=${carObj ? html`<button class="linkbtn" onClick=${() => openSheet(CarJobsSheet, { carId: carObj.id })}><${Icon} name="history" size=${15} /> سجل العربية</button>` : ''}>شغل العربيات<//>
    ${jobs.length > 0 && html`<div class="stack">${jobs.map((j) => html`<${JobCard} j=${j} key=${j.id} />`)}</div>`}
    <button class="btn ghost sm" disabled=${!cars.length} onClick=${() => openSheet(JobForm, { preset: { driver_id: id, car_id: car || '' } })}><${Icon} name="clip" size=${18} /> ${cars.length ? 'استلام عربية في الجراش' : 'ضيف عربية الأول عشان تستلمها'}</button>

    <${SecTitle}>القطع اللي عندنا (${here.length})<//>
    ${here.length === 0 ? html`<${Empty} icon="car" text="مفيش قطع ليه عندنا دلوقتي" />`
      : groupBy(here, (i) => i.category, idx.cats.part).map(([cat, its]) => html`<div class="grp" key=${cat}>
          <div class="grp-h">${cat} <i>${its.length}</i></div>
          <div class="card tight">${its.map((i) => html`<${ItemRow} item=${i} key=${i.id} showOwner=${!car} />`)}</div></div>`)}
    ${gone.length > 0 && html`<button class="linkbtn" onClick=${() => setShowGone(!showGone)}>${showGone ? 'خبّي' : 'وريني'} القطع اللي خرجت أو اتركبت (${gone.length})</button>
      ${showGone && html`<div class="card tight faded">${gone.map((i) => html`<${ItemRow} item=${i} key=${i.id} showOwner=${!car} />`)}</div>`}`}
    ${!all.length && html`<button class="linkbtn danger" onClick=${del}><${Icon} name="trash" size=${15} /> مسح السواق</button>`}
  <//>`;
}

export function DriverForm({ id, onSaved, close }) {
  const { idx } = useStore();
  const d = id ? idx.drivers.get(id) : null;
  const [name, setName] = useState(d ? d.name : '');
  const [phone, setPhone] = useState(d ? d.phone : '');
  const [note, setNote] = useState(d ? d.note : '');
  const [carName, setCarName] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) return toast('اكتب اسم السواق', 'bad');
    setBusy(true);
    try {
      const did = await call('save_driver', { p_id: id || null, p_name: name, p_phone: phone, p_note: note });
      if (!id && carName.trim()) await call('save_car', { p_id: null, p_driver: did, p_name: carName, p_plate: '', p_note: '' });
      await reload().catch(() => {});
      toast('اتحفظ');
      close();
      if (onSaved) onSaved(did);
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title=${id ? 'تعديل السواق' : 'سواق جديد'} onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>`}>
    <${Field} label="الاسم" req><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} /><//>
    <${Field} label="التليفون (للواتساب)"><input class="input ltr" inputmode="tel" value=${phone} placeholder="01xxxxxxxxx" onInput=${(e) => setPhone(e.target.value)} /><//>
    ${!id && html`<${Field} label="أول عربية (اختياري)" hint="تقدر تضيف عربيات تانية بعدين"><input class="input" value=${carName} placeholder="مثلاً: BMW E36 الأحمر" onInput=${(e) => setCarName(e.target.value)} /><//>`}
    <${Field} label="ملاحظات"><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} /><//>
  <//>`;
}

export function CarForm({ id, driverId, onSaved, close }) {
  const { idx } = useStore();
  const c = id ? idx.cars.get(id) : null;
  const [name, setName] = useState(c ? c.name : '');
  const [plate, setPlate] = useState(c ? c.plate : '');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) return toast('اكتب اسم العربية', 'bad');
    setBusy(true);
    try {
      const cid = await call('save_car', { p_id: id || null, p_driver: driverId, p_name: name, p_plate: plate, p_note: '' });
      await reload().catch(() => {});
      toast('اتحفظت'); close();
      if (onSaved) onSaved(cid);
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  async function del() {
    if (!(await confirmBox({ title: 'مسح ' + c.name + '؟', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('delete_car', { p_id: id }), 'اتمسحت');
    if (r.ok) close();
  }
  return html`<${Sheet} title=${id ? 'تعديل العربية' : 'عربية جديدة'} sub=${(idx.drivers.get(driverId) || {}).name} onClose=${close}
    footer=${html`<div class="stack"><button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
      ${id && html`<button class="btn ghost" onClick=${del}><${Icon} name="trash" size=${18} /> مسح العربية</button>`}</div>`}>
    <${Field} label="اسم العربية" req hint="الماركة والموديل واللون، عشان تتعرف بسهولة"><input class="input" value=${name} placeholder="مثلاً: Nissan S14 البيضا" onInput=${(e) => setName(e.target.value)} /><//>
    <${Field} label="رقم اللوحة (اختياري)"><input class="input" value=${plate} onInput=${(e) => setPlate(e.target.value)} /><//>
  <//>`;
}

/* ---------- كشف السواق PDF / Excel ---------- */
export function DriverReportSheet({ id, close }) {
  const { idx, data } = useStore();
  const d = idx.drivers.get(id);
  const [period, setPeriod] = useState('month');
  const [from, setFrom] = useState(L.addDays(L.todayStr(), -30));
  const [to, setTo] = useState(L.todayStr());
  const [fmt, setFmt] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  if (!d) return null;
  const range = () => {
    const t = L.todayStr();
    if (period === 'month') return [t.slice(0, 8) + '01', t, 'الشهر ده'];
    if (period === '3m') return [L.addDays(t, -90), t, 'آخر 3 شهور'];
    if (period === 'all') return [null, null, 'من الأول'];
    return [from, to, `من ${L.fmtDate(from)} لـ ${L.fmtDate(to)}`];
  };
  async function make() {
    setBusy(true); setFile(null);
    try {
      const [f, t, plabel] = range();
      const moves = await call('moves_list', { p: { driver_id: id, from: f, to: t, limit: 2000 } });
      const items = (idx.itemsByDriver.get(id) || []).filter((i) => i.qty > 0 || (idx.outQty.get(i.id) || 0) > 0);
      const carName = (i) => (i.car_id && idx.cars.get(i.car_id) ? idx.cars.get(i.car_id).name : '—');
      const S = data.settings;
      const title = 'كشف قطع: ' + d.name;
      const totalHere = L.sum(items, (i) => i.qty), totalOut = L.sum(items, (i) => idx.outQty.get(i.id) || 0);
      const meta = [['السواق', d.name], ['التليفون', d.phone || '—'], ['تاريخ الكشف', L.nowStamp()], ['الفترة', plabel],
        ['قطع عندنا في الجراش', totalHere], ['برا في طلعة', totalOut]];
      const rowsHere = items.map((i, n) => ({
        n: n + 1, code: i.code, name: i.name, cat: i.category || '—', size: i.size || '—', car: carName(i),
        qty: i.qty + ((idx.outQty.get(i.id) || 0) ? ` (+${idx.outQty.get(i.id)} برا)` : ''), cond: L.COND[i.condition].label, loc: i.location || '—',
      }));
      const rowsMv = moves.slice().reverse().map((m) => ({
        date: L.fmtDateTime(m.created_at), code: m.code, name: m.item_name + (m.item_size ? ' (' + m.item_size + ')' : ''),
        what: L.moveInfo(m).label, amt: m.amount || '', note: m.note || '', by: m.actor_name,
      }));
      const footer = `${S.company_ar} — ${S.address_ar}${S.phone ? ' — ' + S.phone : ''}`;
      if (fmt === 'pdf') {
        const blob = await buildPdf({
          dir: 'rtl', title, subtitle: S.company_ar, meta, footer,
          sections: [
            { title: 'القطع اللي عندنا دلوقتي', empty: 'مفيش قطع عندنا للسواق ده',
              columns: [{ key: 'n', label: '#', w: 0.5, align: 'center' }, { key: 'code', label: 'الكود', w: 1.3 }, { key: 'name', label: 'القطعة', w: 2.4 },
                { key: 'cat', label: 'النوع', w: 1.3 }, { key: 'size', label: 'المقاس', w: 1.2 }, { key: 'car', label: 'العربية', w: 1.6 },
                { key: 'qty', label: 'العدد', w: 1, align: 'center' }, { key: 'cond', label: 'الحالة', w: 1.2 }, { key: 'loc', label: 'المكان', w: 1.2 }],
              rows: rowsHere },
            { title: 'كل اللي حصل', note: plabel, empty: 'مفيش حركات في الفترة دي',
              columns: [{ key: 'date', label: 'الوقت', w: 1.6 }, { key: 'code', label: 'الكود', w: 1.2 }, { key: 'name', label: 'القطعة', w: 2.2 },
                { key: 'what', label: 'اللي حصل', w: 1.9 }, { key: 'amt', label: 'العدد', w: 0.7, align: 'center' }, { key: 'note', label: 'تفاصيل', w: 2.6 }, { key: 'by', label: 'بواسطة', w: 1.1 }],
              rows: rowsMv },
          ],
        });
        setFile(fileFrom(blob, safeName('كشف ' + d.name + ' ' + L.todayStr()) + '.pdf'));
      } else {
        const blob = buildXlsx([
          { name: 'اللي عندنا', rtl: true, title, meta,
            columns: [{ label: '#', w: 5 }, { label: 'الكود', w: 12 }, { label: 'القطعة', w: 26 }, { label: 'النوع', w: 14 }, { label: 'المقاس', w: 12 },
              { label: 'العربية', w: 18 }, { label: 'عندنا', w: 8 }, { label: 'برا في طلعة', w: 10 }, { label: 'الحالة', w: 12 }, { label: 'المكان', w: 14 }, { label: 'ملاحظات', w: 24 }],
            rows: items.map((i, n) => [n + 1, i.code, i.name, i.category, i.size, carName(i), i.qty, idx.outQty.get(i.id) || 0, L.COND[i.condition].label, i.location, i.note]) },
          { name: 'كل اللي حصل', rtl: true, title: title + ' — ' + plabel,
            columns: [{ label: 'الوقت', w: 20 }, { label: 'الكود', w: 12 }, { label: 'القطعة', w: 26 }, { label: 'اللي حصل', w: 22 }, { label: 'العدد', w: 8 }, { label: 'تفاصيل', w: 40 }, { label: 'بواسطة', w: 14 }],
            rows: rowsMv.map((r) => [r.date, r.code, r.name, r.what, r.amt === '' ? '' : Number(r.amt), r.note, r.by]) },
        ]);
        setFile(fileFrom(blob, safeName('كشف ' + d.name + ' ' + L.todayStr()) + '.xlsx'));
      }
    } catch (e) { toast('مقدرتش أجهّز الكشف: ' + errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title=${'كشف ' + d.name} sub="القطع اللي عندنا + كل اللي حصل" onClose=${close}>
    <${Field} label="الفترة (للحركات)">
      <${Chips} items=${[['month', 'الشهر ده'], ['3m', 'آخر 3 شهور'], ['all', 'من الأول'], ['custom', 'أختار بنفسي']]} value=${period} onChange=${(v) => { setPeriod(v); setFile(null); }} /><//>
    ${period === 'custom' && html`<div class="grid2">
      <${Field} label="من"><input class="input" type="date" value=${from} onInput=${(e) => { setFrom(e.target.value); setFile(null); }} /><//>
      <${Field} label="لحد"><input class="input" type="date" value=${to} onInput=${(e) => { setTo(e.target.value); setFile(null); }} /><//></div>`}
    <${Field} label="نوع الملف"><${Chips} items=${[['pdf', 'PDF (للعرض)'], ['xlsx', 'Excel (للتعديل)']]} value=${fmt} onChange=${(v) => { setFmt(v); setFile(null); }} /><//>
    ${file ? html`<${FileReady} file=${file} text=${'كشف قطع ' + d.name + ' — ' + data.settings.company_ar} />`
      : html`<button class="btn bigbtn dark" disabled=${busy} onClick=${make}>${busy ? html`<div class="spin sm light"></div> بجهّز الكشف...` : html`<${Icon} name="file" size=${22} /> جهّز الكشف`}</button>`}
  <//>`;
}
