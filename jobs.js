/* jobs.js — شغل العربيات: كل عربية داخلة الجراش ليها أمر شغل
   الحالة، الشغل المطلوب، المسؤول، الساعات، الخامات، القطع اللي اتركبت، صور قبل وبعد، والفاتورة منه بدوسة */
import { html, useState, useEffect, useMemo, Icon, Pill, Empty, Spinner, Field, Chips, SearchBox, Segmented, Sheet, Hero, SecTitle, openSheet, toast, confirmBox, NumInput } from './ui.js?v=7';
import { call, errText, photoUrl, uploadJobPhoto, removePhotoFile } from './api.js?v=7';
import { useStore, getStore, reload, isAdmin, canInvoice } from './store.js?v=7';
import * as L from './lib.js?v=7';
import { run, ItemRow, InstallForm } from './items.js?v=7';
import { DriverForm, CarForm } from './drivers.js?v=7';
import { InvoiceForm, InvoiceSheet } from './invoices.js?v=7';
import { HeroScan } from './home.js?v=7';
import { ScanSheet } from './qr.js?v=7';

export const JOB_ST = {
  received: { label: 'استلمناها', tone: 'gray', icon: 'clip', sub: 'العربية دخلت الجراش ولسه ما بدأناش' },
  working: { label: 'شغالين فيها', tone: 'red', icon: 'wrench', sub: 'الشغل ماشي' },
  waiting: { label: 'مستنية قطع', tone: 'amber', icon: 'timer', sub: 'واقفة لحد ما قطعة أو خامة توصل' },
  ready: { label: 'جاهزة للتسليم', tone: 'green', icon: 'check', sub: 'الشغل خلص، مستنيين صاحبها ييجي' },
  delivered: { label: 'اتسلمت', tone: 'dark', icon: 'car', sub: 'صاحبها استلمها' },
  cancelled: { label: 'اتلغت', tone: 'gray', icon: 'x', sub: 'الشغل اتلغى' },
};
const STAGE = { before: 'قبل', during: 'أثناء', after: 'بعد' };
/* الخطوة الجاية في الشغل */
const NEXT = {
  received: ['working', 'ابدأ الشغل', 'wrench'],
  working: ['ready', 'العربية جاهزة', 'check'],
  waiting: ['working', 'القطع وصلت — كمّل الشغل', 'wrench'],
  ready: ['delivered', 'اتسلمت لصاحبها', 'car'],
};

export const isOpenJob = (j) => j.status !== 'delivered' && j.status !== 'cancelled';
export const isLate = (j) => isOpenJob(j) && j.status !== 'ready' && !!j.due_date && j.due_date < L.todayStr();
const tasksOf = (j) => (j.lines || []).filter((l) => l.kind === 'task');
const matsOf = (j) => (j.lines || []).filter((l) => l.kind === 'material');
const hoursOf = (j) => L.sum(j.hours || [], (h) => Number(h.hours) || 0);
const fmtH = (n) => (Math.round(n * 100) / 100).toString();
function jobParts(j, idx) {
  const car = j.car_id && idx.cars.get(j.car_id);
  const d = j.driver_id && idx.drivers.get(j.driver_id);
  return { car, d };
}
function jobHay(j, idx) {
  const { car, d } = jobParts(j, idx);
  return L.norm([j.ref, j.title, j.note, car && car.name, car && car.plate, d && d.name, d && d.phone].join(' '));
}

/* =================================================================== التاب */
export function JobsTab() {
  const { data, idx } = useStore();
  const [f, setF] = useState('open');
  const [q, setQ] = useState('');
  const open = data.jobs.filter(isOpenJob);
  const n = (fn) => open.filter(fn).length;
  const ready = n((j) => j.status === 'ready');
  const chips = [
    ['open', `في الجراش (${open.length})`],
    ['working', `شغالة (${n((j) => j.status === 'working' || j.status === 'received')})`],
    ['waiting', `مستنية قطع (${n((j) => j.status === 'waiting')})`],
    ['ready', `جاهزة (${ready})`],
    ['done', 'اتسلمت'],
  ];
  let list;
  if (q.trim()) list = data.jobs.filter((j) => L.matches(jobHay(j, idx), q));
  else if (f === 'open') list = open;
  else if (f === 'working') list = open.filter((j) => j.status === 'working' || j.status === 'received');
  else if (f === 'done') list = data.jobs.filter((j) => !isOpenJob(j));
  else list = open.filter((j) => j.status === f);
  list = list.slice().sort((a, b) => isLate(b) - isLate(a));
  return html`
    <${Hero} title="شغل العربيات" sub=${`${open.length} عربية في الجراش · ${ready} جاهزة للتسليم`} right=${html`<${HeroScan} />`} />
    <main class="body">
      <button class="btn" onClick=${() => openSheet(JobForm, {})}><${Icon} name="plus" size=${22} /> استلام عربية</button>
      ${data.jobs.length > 0 && html`<${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر بالعربية أو السواق أو رقم أمر الشغل" />
        ${!q.trim() && html`<${Chips} items=${chips} value=${f} onChange=${setF} wrap=${false} />`}`}
      ${list.length === 0 ? html`<${Empty} icon="clip" text=${q.trim() ? 'مفيش حاجة كده' : !data.jobs.length ? 'لسه مفيش عربيات. أول ما عربية تدخل الجراش، دوس "استلام عربية".' : f === 'done' ? 'لسه مفيش عربيات اتسلمت' : 'مفيش عربيات هنا'} />`
        : html`<div class="stack">${list.map((j) => html`<${JobCard} j=${j} key=${j.id} />`)}</div>`}
    </main>`;
}

export function JobCard({ j }) {
  const { idx } = useStore();
  const st = JOB_ST[j.status] || JOB_ST.received;
  const { car, d } = jobParts(j, idx);
  const tasks = tasksOf(j), done = tasks.filter((l) => l.done).length;
  const late = isLate(j);
  return html`<button class=${'tcard jcard j-' + j.status} onClick=${() => openSheet(JobSheet, { id: j.id })}>
    <span class="tcard-ic"><${Icon} name=${st.icon} size=${24} /></span>
    <span class="grow"><b>${car ? car.name : j.title}</b>
      <small>${L.bidi(d && d.name, car ? j.title : '')}</small>
      ${tasks.length > 0 && isOpenJob(j) && html`<span class="bar"><i style=${'width:' + Math.round((done / tasks.length) * 100) + '%'}></i></span><small>${done} من ${tasks.length} خلصت</small>`}
    </span>
    <span class="jcard-side"><${Pill} tone=${st.tone}>${st.label}<//>
      ${late ? html`<${Pill} tone="red" icon="alert">متأخرة<//>` : j.due_date && isOpenJob(j) ? html`<small>تسليم ${L.fmtDateShort(j.due_date)}</small>` : ''}
      <small class="ltr-t">${j.ref}</small></span>
  </button>`;
}

/* =================================================================== استلام عربية / تعديل */
export function JobForm({ id, preset, close }) {
  const { data, idx } = useStore();
  const old = id ? idx.jobs.get(id) : null;
  const base = old || preset || {};
  const [drv, setDrv] = useState(base.driver_id || '');
  const [car, setCar] = useState(() => {
    if (base.car_id) return base.car_id;
    const cs = base.driver_id ? idx.carsByDriver.get(base.driver_id) || [] : [];
    return cs.length === 1 ? cs[0].id : '';
  });
  const [title, setTitle] = useState(base.title || '');
  const [tasks, setTasks] = useState('');
  const [due, setDue] = useState(base.due_date || '');
  const [staff, setStaff] = useState(base.staff_id || '');
  const [note, setNote] = useState(base.note || '');
  const [busy, setBusy] = useState(false);
  function pickDriver(v) {
    setDrv(v);
    const cs = (v && getStore().idx.carsByDriver.get(v)) || [];
    setCar(cs.length === 1 ? cs[0].id : '');
  }
  const cars = drv ? idx.carsByDriver.get(drv) || [] : [];
  const other = car && data.jobs.find((x) => x.car_id === car && x.id !== id && isOpenJob(x));
  async function save() {
    if (!drv) return toast('اختار صاحب العربية', 'bad');
    if (!car) return toast('اختار العربية', 'bad');
    if (!title.trim()) return toast('اكتب المطلوب يتعمل في العربية', 'bad');
    setBusy(true);
    try {
      const p = { driver_id: drv, car_id: car, title: title.trim(), note, staff_id: staff || null, due_date: due || null };
      if (!id) p.tasks = tasks.split('\n').map((t) => t.replace(/^[\s\-•*\d.)]+/, '').trim()).filter(Boolean);
      const r = await call('job_save', { p_id: id || null, p });
      await reload().catch(() => {});
      toast(id ? 'اتحفظ' : 'العربية اتسجلت ' + r.ref);
      close();
      if (!id) openSheet(JobSheet, { id: r.id });
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<${Sheet} title=${old ? 'تعديل ' + old.ref : 'استلام عربية'} sub=${old ? '' : 'أمر شغل جديد'} onClose=${close} full
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : html`<${Icon} name="check" size=${22} /> ${old ? 'حفظ' : 'استلمنا العربية'}`}</button>`}>
    <${Field} label="صاحب العربية" req>
      <select class="input" value=${drv} onChange=${(e) => pickDriver(e.target.value)}>
        <option value="">— اختار السواق —</option>${data.drivers.map((d) => html`<option value=${d.id}>${d.name}</option>`)}</select>
      <button type="button" class="linkbtn" onClick=${() => openSheet(DriverForm, { onSaved: pickDriver })}>+ سواق جديد</button>
    <//>
    ${drv && html`<${Field} label="العربية" req>
      ${cars.length ? html`<${Chips} items=${cars.map((c) => [c.id, c.name])} value=${car} onChange=${setCar} />`
        : html`<div class="hint">السواق ده لسه ملوش عربيات متسجلة</div>`}
      <button type="button" class="linkbtn" onClick=${() => openSheet(CarForm, { driverId: drv, onSaved: setCar })}>+ عربية جديدة</button>
    <//>`}
    ${other && html`<div class="note warn"><${Icon} name="alert" size=${18} /><span>العربية دي عليها أمر شغل مفتوح (${other.ref}: ${other.title})</span></div>`}
    <${Field} label="المطلوب" req hint="باختصار، مثلاً: رول كيج + كيت زاوية"><input class="input" value=${title} onInput=${(e) => setTitle(e.target.value)} /><//>
    ${!old && html`<${Field} label="الشغل بالتفصيل (اختياري)" hint="كل سطر شغلانة، وهتعلّم عليها وانت بتخلص">
      <textarea class="input" rows="4" dir="auto" value=${tasks} placeholder=${'لحام الرول كيج\nتركيب كيت الزاوية\nضبط الزوايا'} onInput=${(e) => setTasks(e.target.value)}></textarea><//>`}
    <div class="grid2">
      <${Field} label="ميعاد التسليم"><input class="input" type="date" value=${due} onInput=${(e) => setDue(e.target.value)} /><//>
      <${Field} label="المسؤول"><select class="input" value=${staff} onChange=${(e) => setStaff(e.target.value)}>
        <option value="">— محدش —</option>${data.staff.map((s) => html`<option value=${s.id}>${s.name}</option>`)}</select><//>
    </div>
    <${Field} label="ملاحظات"><textarea class="input" rows="2" dir="auto" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea><//>
  <//>`;
}

/* =================================================================== أمر الشغل */
export function JobSheet({ id, close }) {
  const { data, idx } = useStore();
  const [extra, setExtra] = useState(null);       // أمر شغل قديم مش في الليستة
  const [parts, setParts] = useState(null);
  const [busy, setBusy] = useState('');
  const [nt, setNt] = useState('');
  const inList = idx.jobs.get(id);
  const j = inList || extra;
  useEffect(() => {
    if (inList) return;
    let off = false;
    call('job_get', { p_id: id }).then((r) => { if (!off) setExtra(r); }).catch(() => { if (!off) setExtra(false); });
    return () => { off = true; };
  }, [id, data]);
  useEffect(() => {
    if (!j) return;
    if (!j.car_id) { setParts([]); return; }
    let off = false;
    call('job_parts', { p_job: id }).then((r) => { if (!off) setParts(r); }).catch(() => { if (!off) setParts([]); });
    return () => { off = true; };
  }, [id, data, j && j.status]);

  if (!j) return html`<${Sheet} title="أمر الشغل" onClose=${close}>${extra === false ? html`<${Empty} icon="clip" text="أمر الشغل ده اتمسح" />` : html`<${Spinner} />`}<//>`;
  const st = JOB_ST[j.status] || JOB_ST.received;
  const { car, d } = jobParts(j, idx);
  const tasks = tasksOf(j), mats = matsOf(j), done = tasks.filter((l) => l.done).length;
  const staff = j.staff_id && data.staff.find((s) => s.id === j.staff_id);
  const wa = d && L.waNumber(d.phone);
  const late = isLate(j);
  const next = NEXT[j.status];
  const installs = (parts || []).filter((m) => m.type !== 'removed');
  const removed = (parts || []).filter((m) => m.type === 'removed');

  async function setStatus(s) {
    if (s === 'ready' && tasks.length > done) {
      const ok = await confirmBox({ title: 'العربية جاهزة؟', text: `فيه ${tasks.length - done} شغلانة لسه ما اتعلّمش عليها إنها خلصت.`, ok: 'أيوه جاهزة' });
      if (!ok) return;
    }
    if (s === 'cancelled' && !(await confirmBox({ title: 'إلغاء أمر الشغل؟', text: 'هيتقفل ويتشال من العربيات اللي في الجراش. تقدر ترجّعه بعدين.', ok: 'إلغاء أمر الشغل', danger: true }))) return;
    setBusy('st');
    await run(() => call('job_set_status', { p_id: j.id, p_status: s }), s === 'ready' ? 'العربية جاهزة ✓ — ابعت لصاحبها' : s === 'delivered' ? 'اتسلمت ✓' : 'اتغيرت لـ: ' + JOB_ST[s].label);
    setBusy('');
  }
  async function toggle(l) { await run(() => call('job_line_done', { p_id: l.id, p_done: !l.done })); }
  async function addTask(title) {
    const t = (title || nt).trim();
    if (!t) return toast('اكتب الشغلانة', 'bad');
    setBusy('task');
    const r = await run(() => call('job_line_add', { p_job: j.id, p: { kind: 'task', title: t } }));
    if (r.ok) setNt('');
    setBusy('');
  }
  const onPhoto = (stage) => async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy('ph-' + stage);
    let ok = 0;
    for (const f of files) {
      try { await uploadJobPhoto(j.id, f, stage); ok++; } catch (err) { toast('صورة ما اترفعتش: ' + errText(err), 'bad'); }
    }
    await reload().catch(() => {});
    if (ok) toast(ok === 1 ? 'الصورة اتحفظت' : `${ok} صور اتحفظت`);
    setBusy('');
  };
  async function makeInvoice() {
    setBusy('inv');
    let ps = parts;
    if (!ps && j.car_id) { try { ps = await call('job_parts', { p_job: j.id }); } catch (e) { ps = []; } }
    setBusy('');
    openSheet(InvoiceForm, { preset: invoiceFromJob(j, ps || []) });
  }
  async function del() {
    if (!(await confirmBox({ title: 'مسح ' + j.ref + '؟', text: 'أمر الشغل هيتمسح بالشغل والساعات والصور. الفاتورة لو اتعملت هتفضل. مفيش رجوع.', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('job_delete', { p_id: j.id }), 'اتمسح');
    if (r.ok) { ((r.r && r.r.delete) || []).forEach(removePhotoFile); close(); }
  }

  const phList = j.photos || [];
  return html`<${Sheet} title=${car ? car.name : j.title} sub=${L.bidi(j.ref, d && d.name)} onClose=${close} full
    footer=${html`<div class="grid2">
      ${wa ? html`<a class=${'btn sm ' + (j.status === 'ready' ? 'green' : 'ghost')} href=${'https://wa.me/' + wa + '?text=' + encodeURIComponent(waText(j, idx))} target="_blank" rel="noopener"><${Icon} name="chat" size=${19} /> ${j.status === 'ready' ? 'ابعت إنها جاهزة' : 'واتساب لصاحبها'}</a>`
        : html`<button class="btn ghost sm" disabled><${Icon} name="chat" size=${19} /> مفيش تليفون</button>`}
      ${canInvoice() ? (j.invoice && j.invoice.id ? html`<button class="btn dark sm" onClick=${() => openSheet(InvoiceSheet, { id: j.invoice.id })}><${Icon} name="file" size=${19} /> ${j.invoice.ref}</button>`
          : html`<button class="btn dark sm" disabled=${busy === 'inv'} onClick=${makeInvoice}><${Icon} name="file" size=${19} /> ${busy === 'inv' ? 'لحظة...' : 'اعمل فاتورة'}</button>`)
        : html`<button class="btn ghost sm" onClick=${() => openSheet(JobForm, { id: j.id })}><${Icon} name="edit" size=${19} /> تعديل</button>`}
    </div>`}>

    <div class="row gap8 wrap"><${Pill} tone=${st.tone} icon=${st.icon}>${st.label}<//>
      ${late && html`<${Pill} tone="red" icon="alert">متأخرة<//>`}
      ${j.invoice && html`<${Pill} tone="green" icon="file">${j.invoice.ref}<//>`}</div>
    ${next && html`<button class=${'btn bigbtn ' + (next[0] === 'ready' ? 'green' : next[0] === 'delivered' ? 'dark' : '')} disabled=${busy === 'st'} onClick=${() => setStatus(next[0])}>
      <${Icon} name=${next[2]} size=${22} /> ${busy === 'st' ? 'لحظة...' : next[1]}</button>`}
    ${j.status === 'working' && html`<button class="btn ghost sm" disabled=${busy === 'st'} onClick=${() => setStatus('waiting')}><${Icon} name="timer" size=${18} /> مستنية قطع</button>`}
    <button class="linkbtn" onClick=${() => openSheet(StatusSheet, { cur: j.status, onPick: setStatus })}><${Icon} name="swap" size=${15} /> غيّر الحالة</button>

    <div class="card soft-card jinfo">
      <span>المطلوب</span><b dir="auto">${j.title}</b>
      ${d && html`<span>صاحبها</span><b>${d.name}${d.phone && html` · <a class="ltr-t" href=${'tel:' + d.phone}>${d.phone}</a>`}</b>`}
      ${car && car.plate && html`<span>اللوحة</span><b>${car.plate}</b>`}
      <span>المسؤول</span><b>${staff ? staff.name : '—'}</b>
      <span>استلمناها</span><b>${L.fmtDateTime(j.created_at)}${j.created_by ? ' · ' + j.created_by : ''}</b>
      ${j.due_date && html`<span>التسليم</span><b class=${late ? 'red-t' : ''}>${L.fmtDate(j.due_date)}</b>`}
      ${j.delivered_at && html`<span>اتسلمت</span><b>${L.fmtDateTime(j.delivered_at)}</b>`}
      ${j.note && html`<span>ملاحظات</span><b dir="auto">${j.note}</b>`}
    </div>
    ${canInvoice() && html`<button class="linkbtn" onClick=${() => openSheet(JobForm, { id: j.id })}><${Icon} name="edit" size=${15} /> تعديل بيانات أمر الشغل</button>`}

    <${SecTitle} right=${tasks.length ? html`<span class="num">${done}/${tasks.length}</span>` : ''}>الشغل المطلوب<//>
    <div class="card tight">
      ${tasks.length > 0 && html`<span class="bar big"><i style=${'width:' + Math.round((done / tasks.length) * 100) + '%'}></i></span>`}
      ${tasks.map((l) => html`<div class="task" key=${l.id}>
        <button class=${'tick ' + (l.done ? 'on' : '')} onClick=${() => toggle(l)} aria-label=${l.done ? 'لسه' : 'خلصت'}>${l.done && html`<${Icon} name="check" size=${18} stroke=${3} />`}</button>
        <button class="task-main grow" onClick=${() => openSheet(LineForm, { line: l })}>
          <b class=${l.done ? 'done' : ''} dir="auto">${l.title}</b>
          ${l.done && html`<small>✓ ${L.bidi(l.done_by, L.fmtDateTime(l.done_at))}</small>`}</button>
      </div>`)}
      <div class="addrow">
        <input class="input" dir="auto" placeholder="ضيف شغلانة..." value=${nt} onInput=${(e) => setNt(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') addTask(); }} />
        <button class="btn sm dark" disabled=${busy === 'task'} onClick=${() => addTask()}><${Icon} name="plus" size=${20} /></button>
      </div>
      ${data.price_items.some((x) => x.kind === 'labor') && html`<button class="linkbtn" onClick=${() => openSheet(ListPick, { job: j, kind: 'labor' })}><${Icon} name="list" size=${15} /> من ليستة المصنعيات</button>`}
    </div>

    <${SecTitle}>الخامات اللي اتصرفت<//>
    ${mats.length > 0 && html`<div class="card tight">${mats.map((l) => html`<button class="lrow" key=${l.id} onClick=${() => openSheet(LineForm, { line: l })}>
      <span class="grow"><b dir="auto">${l.title}</b></span><b class="task-q"><span class="num">${fmtH(Number(l.qty))}</span>${l.unit ? ' ' + l.unit : ''}</b></button>`)}</div>`}
    <button class="btn ghost sm" onClick=${() => openSheet(ListPick, { job: j, kind: 'material' })}><${Icon} name="plus" size=${18} /> خامة اتصرفت (سلك لحام، أرجون، مواسير...)</button>

    <${SecTitle}>القطع اللي اتركبت<//>
    ${parts === null ? html`<${Spinner} />` : installs.length === 0 && removed.length === 0 ? html`<div class="hint">لما تركّب قطعة على العربية دي وهي في الجراش، هتظهر هنا لوحدها.</div>`
      : html`<div class="card tight">
        ${installs.map((m) => html`<div class="trow" key=${m.id}><div class="grow"><div class="irow-title">${m.name}${m.size && html`<span class="size">${m.size}</span>`}</div>
          <div class="irow-sub">${m.code && html`<span class="code">${m.code}</span>`}<span>${m.garage ? 'من قطع الجراش' : 'بتاعة السواق'}</span><span>${L.fmtDateTime(m.created_at)}</span></div></div>
          <b class="num">${m.amount}</b></div>`)}
        ${removed.map((m) => html`<div class="trow faded" key=${m.id}><div class="grow"><div class="irow-title">طلعت: ${m.name}</div><div class="irow-sub"><span>${m.note}</span></div></div><b class="num">${m.amount}</b></div>`)}
      </div>`}
    ${car && isOpenJob(j) && html`<button class="btn ghost sm" onClick=${() => openSheet(PartPick, { job: j })}><${Icon} name="wrench" size=${18} /> ركّب قطعة على العربية دي</button>`}

    <${SecTitle} right=${(j.hours || []).length ? html`<span class="num">${fmtH(hoursOf(j))} ساعة</span>` : ''}>ساعات الشغل<//>
    ${(j.hours || []).length > 0 && html`<div class="card tight">${j.hours.map((h) => html`<div class="trow" key=${h.id}>
      <div class="grow"><div class="irow-title">${h.staff_name || '—'}</div><div class="irow-sub"><span>${L.fmtDate(h.work_date)}</span>${h.note && html`<span dir="auto">${h.note}</span>`}</div></div>
      <b class="num">${fmtH(Number(h.hours))} س</b>
      <button class="iconbtn light" aria-label="شيل" onClick=${async () => { if (await confirmBox({ title: 'شيل الساعات دي؟', ok: 'شيل', danger: true })) run(() => call('job_hours_delete', { p_id: h.id }), 'اتشالت'); }}><${Icon} name="x" size=${16} /></button>
    </div>`)}</div>`}
    <button class="btn ghost sm" onClick=${() => openSheet(HoursForm, { job: j })}><${Icon} name="timer" size=${18} /> سجّل ساعات شغل</button>

    <${SecTitle}>الصور (${phList.length})<//>
    <div class="photobtns">${Object.entries(STAGE).map(([k, lb]) => html`<label class=${'btn ghost sm ' + (busy === 'ph-' + k ? 'disabled' : '')} key=${k}>
      ${busy === 'ph-' + k ? html`<div class="spin sm"></div>` : html`<${Icon} name="camera" size=${18} />`} ${lb}
      <input type="file" accept="image/*" multiple hidden onChange=${onPhoto(k)} /></label>`)}</div>
    ${phList.length > 0 && html`<div class="pgrid">${phList.map((ph) => html`<button key=${ph.id} onClick=${() => openSheet(PhotoView, { ph, job: j })}>
      <img src=${photoUrl(ph.path)} loading="lazy" alt="" /><i>${STAGE[ph.stage] || ''}</i></button>`)}</div>`}

    ${canInvoice() && j.invoice && j.invoice.id && html`<button class="linkbtn" onClick=${makeInvoice}><${Icon} name="layers" size=${15} /> فاتورة تانية من أمر الشغل ده</button>`}
    ${!isOpenJob(j) && html`<button class="linkbtn" onClick=${() => setStatus('working')}><${Icon} name="undo" size=${15} /> رجّعها للشغل</button>`}
    ${isAdmin() && html`<button class="linkbtn danger" onClick=${del}><${Icon} name="trash" size=${15} /> مسح أمر الشغل</button>`}
  <//>`;
}

/* تغيير الحالة يدوي */
function StatusSheet({ cur, onPick, close }) {
  return html`<${Sheet} title="حالة العربية" onClose=${close}>
    <div class="radios">${Object.entries(JOB_ST).map(([k, x]) => html`<button type="button" class=${'radio ' + (k === cur ? 'on' : '')} key=${k}
      onClick=${() => { close(); if (k !== cur) onPick(k); }}><i></i><span><b>${x.label}</b><small>${x.sub}</small></span></button>`)}</div>
  <//>`;
}

/* تعديل شغلانة / خامة */
function LineForm({ line, close }) {
  const [title, setTitle] = useState(line.title);
  const [qty, setQty] = useState(Number(line.qty));
  const [busy, setBusy] = useState(false);
  const mat = line.kind === 'material';
  async function save() {
    if (!title.trim()) return toast('اكتب الاسم', 'bad');
    if (!(qty > 0)) return toast('الكمية غلط', 'bad');
    setBusy(true);
    const r = await run(() => call('job_line_update', { p_id: line.id, p: { title: title.trim(), qty } }), 'اتحفظ');
    setBusy(false);
    if (r.ok) close();
  }
  async function del() {
    if (!(await confirmBox({ title: 'شيل "' + line.title + '"؟', ok: 'شيل', danger: true }))) return;
    const r = await run(() => call('job_line_delete', { p_id: line.id }), 'اتشالت');
    if (r.ok) close();
  }
  return html`<${Sheet} title=${mat ? 'الخامة' : 'الشغلانة'} onClose=${close}
    footer=${html`<div class="stack"><button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
      <button class="btn ghost" onClick=${del}><${Icon} name="trash" size=${18} /> شيلها</button></div>`}>
    <${Field} label=${mat ? 'الخامة' : 'الشغلانة'} req><input class="input" dir="auto" value=${title} onInput=${(e) => setTitle(e.target.value)} /><//>
    ${(mat || Number(line.qty) !== 1) && html`<${Field} label=${'الكمية' + (line.unit ? ' (' + line.unit + ')' : '')}><${NumInput} value=${qty} onChange=${setQty} /><//>`}
    ${line.done && html`<div class="note ok"><${Icon} name="check" size=${18} /><span>${L.bidi('خلصت', line.done_by, L.fmtDateTime(line.done_at))}</span></div>`}
  <//>`;
}

/* اختيار من ليستة الأسعار: مصنعيات (شغلانة) أو خامات (بكمية) */
function ListPick({ job, kind, close }) {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [free, setFree] = useState({ title: '', unit: '' });
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const mat = kind === 'material';
  const list = data.price_items.filter((x) => x.kind === kind && (!q || L.matches([x.name, x.name_en, x.part_no].join(' '), q)));
  async function add(p, name) {
    setBusy(true);
    const r = await run(() => call('job_line_add', { p_job: job.id, p: { kind: mat ? 'material' : 'task', ...p } }), 'اتضاف: ' + name);
    setBusy(false);
    if (r.ok) { setN((x) => x + 1); setSel(null); setQty(1); setFree({ title: '', unit: '' }); }
  }
  return html`<${Sheet} title=${mat ? 'خامة اتصرفت' : 'من ليستة المصنعيات'} sub=${n ? `ضفت ${n}` : ''} onClose=${close} full
    footer=${html`<button class="btn bigbtn" onClick=${close}>${n ? `خلصت (${n})` : 'رجوع'}</button>`}>
    ${sel ? html`<div class="card stack">
        <b dir="auto">${sel.name}</b>
        <${Field} label=${'الكمية' + (sel.unit ? ' (' + sel.unit + ')' : '')}><${NumInput} value=${qty} onChange=${setQty} /><//>
        <div class="grid2"><button class="btn" disabled=${busy || !(qty > 0)} onClick=${() => add({ price_item_id: sel.id, qty }, sel.name)}><${Icon} name="plus" size=${20} /> ضيف</button>
          <button class="btn ghost" onClick=${() => setSel(null)}>رجوع</button></div></div>`
    : html`
      ${mat && html`<div class="card soft-card stack">
        <${Field} label="خامة مش في الليستة"><input class="input" dir="auto" value=${free.title} placeholder="مثلاً: ماسورة 40 مم" onInput=${(e) => setFree((x) => ({ ...x, title: e.target.value }))} /><//>
        <div class="grid2"><${Field} label="الكمية"><${NumInput} value=${qty} onChange=${setQty} /><//>
          <${Field} label="الوحدة"><input class="input" value=${free.unit} placeholder="متر، كيلو..." onInput=${(e) => setFree((x) => ({ ...x, unit: e.target.value }))} /><//></div>
        <button class="btn dark sm" disabled=${busy || !free.title.trim() || !(qty > 0)} onClick=${() => add({ title: free.title.trim(), unit: free.unit.trim(), qty }, free.title.trim())}><${Icon} name="plus" size=${18} /> ضيف</button>
      </div>`}
      ${data.price_items.some((x) => x.kind === kind) && html`<${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر في الليستة" />`}
      ${list.length === 0 ? html`<${Empty} icon=${mat ? 'box' : 'wrench'} text=${mat ? 'لسه مفيش خامات في ليستة الأسعار' : 'لسه مفيش مصنعيات في ليستة الأسعار'} />`
        : html`<div class="card tight">${list.map((x) => html`<button class="lrow" key=${x.id} onClick=${() => (mat ? (setSel(x), setQty(1)) : add({ price_item_id: x.id }, x.name))}>
          <span class="grow"><b dir="auto">${x.name}</b>${x.unit && html`<small>لكل ${x.unit}</small>`}</span><${Icon} name="plus" size=${18} /></button>`)}</div>`}`}
  <//>`;
}

/* ساعات شغل */
function HoursForm({ job, close }) {
  const { data } = useStore();
  const me = data.me.kind === 'staff' ? data.me.id : '';
  const [staff, setStaff] = useState(me || (data.staff[0] && data.staff[0].id) || '');
  const [hours, setHours] = useState(null);
  const [date, setDate] = useState(L.todayStr());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!(hours > 0 && hours <= 24)) return toast('اكتب عدد الساعات', 'bad');
    setBusy(true);
    const r = await run(() => call('job_hours_add', { p_job: job.id, p: { staff_id: staff || null, hours, work_date: date, note } }), 'الساعات اتسجلت');
    setBusy(false);
    if (r.ok) close();
  }
  return html`<${Sheet} title="ساعات شغل" sub=${job.ref} onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'سجّل'}</button>`}>
    <${Field} label="مين اشتغل؟">${data.staff.length ? html`<${Chips} items=${data.staff.map((s) => [s.id, s.name])} value=${staff} onChange=${setStaff} />` : html`<div class="hint">مفيش موظفين متسجلين — الساعات هتتسجل باسمك</div>`}<//>
    <${Field} label="كام ساعة؟" req>
      <${Chips} items=${[1, 2, 3, 4, 6, 8].map((h) => [h, h + ' س'])} value=${hours} onChange=${setHours} />
      <${NumInput} value=${hours} onChange=${setHours} placeholder="أو اكتب الرقم (مثلاً 2.5)" /><//>
    <div class="grid2">
      <${Field} label="اليوم"><input class="input" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /><//>
      <${Field} label="ملاحظة"><input class="input" value=${note} onInput=${(e) => setNote(e.target.value)} /><//>
    </div>
  <//>`;
}

/* ركّب قطعة على عربية أمر الشغل: قطع السواق نفسه أو قطع الجراش */
function PartPick({ job, close }) {
  const { idx } = useStore();
  const [q, setQ] = useState('');
  const d = job.driver_id && idx.drivers.get(job.driver_id);
  const ok = (i) => i.kind === 'part' && i.qty > 0 && (!i.driver_id || i.driver_id === job.driver_id);
  const all = idx.kinds.part.filter(ok).filter((i) => !q || L.matches(idx.hay.get(i.id), q));
  const mine = all.filter((i) => i.driver_id), garage = all.filter((i) => !i.driver_id);
  const pick = (i) => { close(); openSheet(InstallForm, { id: i.id, carId: job.car_id, driverId: job.driver_id }); };
  function scan() {
    openSheet(ScanSheet, {
      title: 'امسح استيكر القطعة',
      onCode: async (code) => {
        const it = getStore().idx.byCode.get(code);
        if (!it) return { ok: false, msg: 'الكود ده مش على قطعة متسجلة' };
        if (it.kind !== 'part') return { ok: false, msg: 'دي مش قطعة' };
        if (it.driver_id && it.driver_id !== job.driver_id) return { ok: false, msg: 'القطعة دي بتاعة سواق تاني' };
        if (it.qty < 1) return { ok: false, msg: 'القطعة دي مش في الجراش دلوقتي' };
        setTimeout(() => pick(it), 60);
        return { ok: true, msg: it.name };
      },
    });
  }
  const row = (i) => html`<${ItemRow} item=${i} key=${i.id} showOwner=${false} onClick=${() => pick(i)} />`;
  return html`<${Sheet} title="ركّب قطعة" sub=${(idx.cars.get(job.car_id) || {}).name} onClose=${close} full>
    <button class="btn dark" onClick=${scan}><${Icon} name="scan" size=${22} /> امسح استيكر القطعة</button>
    <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر بالاسم أو المقاس أو الكود" />
    ${all.length === 0 ? html`<${Empty} icon="search" text=${q ? 'مفيش حاجة كده' : 'مفيش قطع في الجراش للعربية دي'} />` : html`
      ${mine.length > 0 && html`<${SecTitle}>قطع ${d ? d.name : 'السواق'} (${mine.length})<//><div class="card tight">${mine.map(row)}</div>`}
      ${garage.length > 0 && html`<${SecTitle}>قطع الجراش (${garage.length})<//><div class="card tight">${garage.map(row)}</div>`}`}
  <//>`;
}

function PhotoView({ ph, job, close }) {
  async function del() {
    if (!(await confirmBox({ title: 'مسح الصورة؟', ok: 'امسح', danger: true }))) return;
    const r = await run(() => call('job_photo_delete', { p_id: ph.id }), 'اتمسحت');
    if (r.ok) { if (r.r && r.r.delete) removePhotoFile(r.r.delete); close(); }
  }
  return html`<${Sheet} title=${'صورة ' + (STAGE[ph.stage] || '')} sub=${L.bidi(job.ref, ph.created_by, L.fmtDateTime(ph.created_at))} onClose=${close} full
    footer=${html`<div class="grid2"><a class="btn ghost sm" href=${photoUrl(ph.path)} target="_blank" rel="noopener"><${Icon} name="download" size=${18} /> افتحها</a>
      <button class="btn ghost sm" onClick=${del}><${Icon} name="trash" size=${18} /> امسح</button></div>`}>
    <img class="pview" src=${photoUrl(ph.path)} alt="" />
  <//>`;
}

/* سجل العربية: كل أوامر الشغل اللي اتعملتلها */
export function CarJobsSheet({ carId, close }) {
  const { idx, data } = useStore();
  const [list, setList] = useState(null);
  const car = idx.cars.get(carId);
  useEffect(() => {
    let off = false;
    call('car_jobs', { p_car: carId }).then((r) => { if (!off) setList(r); }).catch(() => { if (!off) setList([]); });
    return () => { off = true; };
  }, [carId, data]);
  return html`<${Sheet} title=${'سجل ' + (car ? car.name : 'العربية')} sub="كل الشغل اللي اتعمل فيها" onClose=${close} full>
    ${list === null ? html`<${Spinner} />` : list.length === 0 ? html`<${Empty} icon="clip" text="لسه مفيش شغل اتعمل في العربية دي" />`
      : html`<div class="card tight">${list.map((x) => { const st = JOB_ST[x.status] || JOB_ST.received; return html`<button class="lrow" key=${x.id} onClick=${() => openSheet(JobSheet, { id: x.id })}>
          <span class="grow"><b dir="auto">${x.title}</b><small>${L.bidi(x.ref, L.fmtDateTime(x.created_at))}</small></span><${Pill} tone=${st.tone}>${st.label}<//></button>`; })}</div>`}
  <//>`;
}

/* =================================================================== واتساب + فاتورة */
function waText(j, idx) {
  const { car, d } = jobParts(j, idx);
  const S = getStore().data.settings || {};
  const co = S.company_ar || 'AF Fabworks';
  const first = d && d.name ? d.name.trim().split(/\s+/)[0] : '';
  const hi = 'أهلاً' + (first ? ' ' + first : '') + '،';
  const car_ = car ? 'عربيتك ' + car.name : 'عربيتك';
  const done = tasksOf(j).filter((l) => l.done).map((l) => '• ' + l.title);
  switch (j.status) {
    case 'received': return `${hi} استلمنا ${car_} في ${co}. رقم أمر الشغل ${j.ref}${j.due_date ? '، وميعاد التسليم ' + L.fmtDate(j.due_date) : ''}.`;
    case 'working': return `${hi} بدأنا الشغل في ${car_} 🔧`;
    case 'waiting': return `${hi} ${car_} مستنية قطع، وهنكمّل الشغل أول ما توصل.`;
    case 'ready': return `${hi} ${car_} جاهزة للاستلام من ${co} ✅` + (done.length ? '\n\nاللي اتعمل:\n' + done.join('\n') : '');
    case 'delivered': return `شكراً${first ? ' يا ' + first : ''}، ${car_} اتسلمت. لو احتجت أي حاجة إحنا موجودين.`;
    default: return `${hi} بخصوص ${car_} (${j.ref}).`;
  }
}

/* فاتورة جاية من أمر الشغل: الشغل + الخامات + قطع الجراش اللي اتركبت */
export function invoiceFromJob(j, parts) {
  const { idx } = getStore();
  const { car, d } = jobParts(j, idx);
  const lines = [];
  (j.lines || []).forEach((l) => {
    const x = l.price_item_id && idx.priceItems.get(l.price_item_id);
    if (x) {
      lines.push({ kind: x.kind, ref_id: x.id, part_no: x.part_no || '', desc_ar: l.title, desc_en: x.name_en || l.title, qty: Number(l.qty) || 1,
        unit: l.unit || x.unit || '', src_price: x.price != null ? Number(x.price) : null, src_cur: x.price_cur || 'EGP', manual: false });
    } else {
      lines.push({ kind: 'free', ref_id: null, part_no: '', desc_ar: l.title, desc_en: l.title, qty: Number(l.qty) || 1, unit: l.unit || '', src_price: null, price: null });
    }
  });
  const gp = new Map();
  (parts || []).forEach((m) => {
    if (!m.garage || m.type === 'removed') return;
    const g = gp.get(m.item_id) || { name: [m.name, m.size].filter(Boolean).join(' '), qty: 0 };
    g.qty += Number(m.amount) || 0;
    gp.set(m.item_id, g);
  });
  gp.forEach((g) => lines.push({ kind: 'free', ref_id: null, part_no: '', desc_ar: g.name, desc_en: g.name, qty: g.qty || 1, unit: '', src_price: null, price: null }));
  return {
    lang: 'ar', currency: 'EGP', driver_id: (d && d.id) || null, job_id: j.id,
    bill: { name: (d && d.name) || '', phone: (d && d.phone) || '', address: '', country: '',
      extra: car ? 'العربية: ' + [car.name, car.plate].filter(Boolean).join(' · ') : '' },
    notes: 'أمر شغل ' + j.ref + ' — ' + j.title,
    lines,
  };
}
