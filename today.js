/* today.js — «شغلي النهارده» للموظف، و«خطة الأيام» للإدارة، وزرار الإشعارات */
import { html, useState, useEffect, Icon, Sheet, Empty, Pill, toast } from './ui.js?v=28';
import { call, errText } from './api.js?v=28';
import { useStore } from './store.js?v=28';
import * as L from './lib.js?v=28';
import { run } from './items.js?v=28';
import { isOpenJob } from './jobs.js?v=28';
import { pushState, enablePush, needsInstallOnIOS } from './push.js?v=28';
import { QuickSheet, QUICK, openSteps, jobLabel } from './quick.js?v=28';
import { openSheet } from './ui.js?v=28';

const DAYS = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
export const dayName = (d) => { const t = L.todayStr(); if (d === t) return 'النهارده'; if (d === L.addDays(t, 1)) return 'بكرة'; return DAYS[new Date(d + 'T12:00:00').getDay()] + ' ' + d.slice(8) + '/' + d.slice(5, 7); };

/* كل الشغلانات اللي لسه في العربيات اللي في الجراش */
export function openTasks(data) {
  const cars = new Map(data.cars.map((c) => [c.id, c.name]));
  return data.jobs.filter(isOpenJob).flatMap((j) => (j.lines || []).filter((l) => l.kind === 'task')
    .map((l) => ({ ...l, job: j, car: cars.get(j.car_id) || j.title || j.ref })));
}

function TaskRow({ t, showWho, staff }) {
  const [busy, setBusy] = useState(false);
  async function done() { setBusy(true); await run(() => call('job_line_done', { p_id: t.id, p_done: !t.done }), t.done ? 'رجعت لسه' : 'برافو ✓'); setBusy(false); }
  const who = showWho && (staff.find((s) => s.id === t.staff_id) || {}).name;
  return html`<div class="task">
    <button class=${'tick ' + (t.done ? 'on' : '')} disabled=${busy} onClick=${done} aria-label=${t.done ? 'لسه' : 'خلصت'}>${t.done && html`<${Icon} name="check" size=${18} stroke=${3} />`}</button>
    <div class="task-main grow"><b class=${t.done ? 'done' : ''} dir="auto">${t.title}</b>
      <small dir="auto">${t.job.ref} · ${t.car}${who ? ' · ' + who : ''}${t.plan_date && t.plan_date < L.todayStr() && !t.done ? ' · متأخرة من ' + dayName(t.plan_date) : ''}</small></div>
  </div>`;
}

function MyStep({ l, n, of, wait, j }) {
  const [busy, setBusy] = useState(false);
  async function done() {
    setBusy(true);
    const r = await run(() => call('job_line_done', { p_id: l.id, p_done: true }), 'برافو ✓');
    if (r.ok) import('./assistant.js?v=28').then((m) => m.turnNotify(j.id)).catch(() => {});
    setBusy(false);
  }
  return html`<div class=${'step' + (wait ? '' : ' now')}>
    <button class="tick" disabled=${busy} onClick=${done} aria-label="خلصت"></button>
    <div class="step-t grow"><span dir="auto">${n}. ${l.errand ? '🚚 ' : ''}${l.title}</span>
      <small class=${wait ? '' : 'now'} dir="auto">${wait ? '⏳ ' + wait : 'عليك دلوقتي'}${l.note ? ' · ' + l.note : ''}</small></div>
  </div>`;
}

/* الإدارة: كل موظف شغال على إيه دلوقتي، واللي واقف بمشكلة (كله من الكود) */
function NowBoard({ data }) {
  const steps = openSteps(data).filter((x) => x.turn);
  const probs = openSteps(data).filter((x) => x.l.problem);
  const rows = data.staff.map((s) => ({ s, now: steps.filter((x) => x.l.staff_id === s.id) }));
  const noOne = steps.filter((x) => !x.l.staff_id);
  return html`<div class="sec-title"><span class="grow">دلوقتي</span><small class="soft">مين على إيه</small></div>
    <div class="card tight">${rows.map(({ s, now }) => html`<div class="lrow" key=${s.id}>
      <span class="grow"><b>${s.name}</b><small dir="auto">${now.length ? now.slice(0, 2).map((x) => x.l.title + ' ← ' + x.j.ref).join(' · ') + (now.length > 2 ? ' · و' + (now.length - 2) + ' كمان' : '') : 'فاضي — مفيش خطوة عليه دلوقتي'}</small></span>
      <b class=${'num ' + (now.length ? '' : 'soft')}>${now.length}</b></div>`)}
      ${noOne.length > 0 && html`<div class="lrow"><span class="grow"><b class="red-t">من غير موظف</b><small dir="auto">${noOne.slice(0, 3).map((x) => x.l.title + ' ← ' + x.j.ref).join(' · ')}</small></span><b class="num red-t">${noOne.length}</b></div>`}
    </div>
    ${probs.length > 0 && html`<div class="sec-title"><span class="grow red-t">واقف بمشكلة</span><${Pill} tone="red">${probs.length}<//></div>
      <div class="card tight">${probs.map((x) => html`<div class="lrow" key=${x.l.id}><span class="grow"><b dir="auto">${x.l.title}</b><small dir="auto" class="red-t">⚠️ ${x.l.problem}</small><small dir="auto">${jobLabel(x.j, data)}${x.l.staff_id ? ' · ' + ((data.staff.find((s) => s.id === x.l.staff_id) || {}).name || '') : ''}</small></span></div>`)}</div>`}`;
}

export function TodaySheet({ close }) {
  const { data } = useStore();
  const me = data.me || {};
  const today = L.todayStr();
  const all = openTasks(data);
  if (me.kind !== 'admin') {
    // كل شغلانة لوحدها، وخطواتي فيها بالترتيب: اللي عليا دلوقتي، واللي مستنية حد قبلي
    const jobs = data.jobs.filter(isOpenJob).map((j) => {
      const steps = (j.lines || []).filter((l) => l.kind === 'task').sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const mine = steps.map((l, i) => ({ l, i, prev: steps.slice(0, i).reverse().find((x) => !x.done) })).filter((x) => x.l.staff_id === me.id && !x.l.done);
      return { j, steps, mine, car: (data.cars.find((c) => c.id === j.car_id) || {}).name || j.title || j.ref };
    }).filter((x) => x.mine.length);
    const nm = (id) => (data.staff.find((s) => s.id === id) || {}).name || 'حد';
    const doneToday = all.filter((t) => t.staff_id === me.id && t.done && t.done_at && L.ymd(new Date(t.done_at)) === today);
    return html`<${Sheet} title="شغلي" sub="بالترتيب — دوس على المربع لما تخلص" onClose=${close}>
      <div class="qrow">${QUICK.filter(([k]) => k !== 'done').map(([k, lb, ic]) => html`<button class="qbtn" key=${k} onClick=${() => openSheet(QuickSheet, { mode: k })}><${Icon} name=${ic} size=${20} /><span>${lb}</span></button>`)}</div>
      ${jobs.length === 0 && html`<${Empty} icon="check" text="مفيش شغل عليك دلوقتي 👌" />`}
      ${jobs.map(({ j, steps, mine, car }) => html`<div key=${j.id}><div class="sec-title"><span class="grow">${car}</span><small class="soft">${j.ref}</small></div>
        <div class="card tight jsteps">${mine.map(({ l, i, prev }) => html`<${MyStep} key=${l.id} l=${l} n=${i + 1} of=${steps.length}
          wait=${prev && (prev.staff_id === me.id ? 'بعد «' + prev.title + '»' : (prev.staff_id ? 'مستنية ' + nm(prev.staff_id) + ' يخلص «' + prev.title + '»' : 'مستنية «' + prev.title + '» تخلص'))} j=${j} />`)}</div></div>`)}
      ${doneToday.length > 0 && html`<div class="sec-title"><span class="grow">خلصت النهارده</span><${Pill} tone="green">${doneToday.length}<//></div><div class="card tight">${doneToday.map((t) => html`<${TaskRow} t=${t} key=${t.id} staff=${data.staff} />`)}</div>`}
    <//>`;
  }
  const [day, setDay] = useState(today);
  // الجمعة أجازة (زي ابلكيشن الحضور)
  const days = Array.from({ length: 8 }, (_, i) => L.addDays(today, i)).filter((d) => d === today || new Date(d + 'T12:00:00').getDay() !== 5).slice(0, 7);
  const pending = all.filter((t) => !t.done);
  const onDay = (t) => (day === today ? (t.plan_date && t.plan_date <= today) : t.plan_date === day);
  const people = data.staff.map((s) => ({ s, list: pending.filter((t) => t.staff_id === s.id && onDay(t)) }));
  const noDay = pending.filter((t) => !t.plan_date);
  const noOne = pending.filter((t) => !t.staff_id);
  return html`<${Sheet} title="خطة الشغل" sub="مين عليه إيه كل يوم — قول للمدير «قسّم شغل الأسبوع» يقسّمه" onClose=${close}>
    <${NowBoard} data=${data} />
    <div class="chips nowrap">${days.map((d) => html`<button class=${'chip ' + (d === day ? 'on' : '')} onClick=${() => setDay(d)}>${dayName(d)} <small>${pending.filter((t) => (d === today ? t.plan_date && t.plan_date <= today : t.plan_date === d)).length || ''}</small></button>`)}</div>
    ${people.filter((p) => p.list.length).length === 0 && html`<${Empty} icon="cal" text=${'مفيش شغل متقسّم على ' + dayName(day)} />`}
    ${people.filter((p) => p.list.length).map((p) => html`<div key=${p.s.id}><div class="sec-title"><span class="grow">${p.s.name}</span><${Pill}>${p.list.length}<//></div>
      <div class="card tight">${p.list.map((t) => html`<${TaskRow} t=${t} key=${t.id} staff=${data.staff} />`)}</div></div>`)}
    ${(noDay.length > 0 || noOne.length > 0) && html`<div class="note info"><${Icon} name="info" size=${18} /><span>${[noDay.length && noDay.length + ' شغلانة من غير يوم', noOne.length && noOne.length + ' من غير موظف'].filter(Boolean).join(' · ')}. قول للمدير «قسّم الشغل على الأسبوع».</span></div>`}
  <//>`;
}

/* كارت تفعيل الإشعارات في الرئيسية (بيختفي لما تتفعل) */
export function PushCard() {
  const [st, setSt] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setSt); }, []);
  if (!st || st === 'on' || st === 'unsupported') return null;
  if (st === 'ios') return html`<div class="note info"><${Icon} name="bell" size=${18} /><span>عشان المدير يبعتلك شغلك كل يوم: من Safari دوس زرار المشاركة ↑ وبعدين «Add to Home Screen»، وافتح الابلكيشن من الأيقونة.</span></div>`;
  if (st === 'denied') return html`<div class="note warn"><${Icon} name="bell" size=${18} /><span>الإشعارات مقفولة. افتحها من إعدادات الموبايل للابلكيشن ده.</span></div>`;
  async function on() {
    setBusy(true);
    try { await enablePush(); toast('الإشعارات اشتغلت ✓'); setSt('on'); } catch (e) { toast(e && e.message === 'denied' ? 'لازم توافق على الإشعارات' : errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<button class="aibar push" disabled=${busy} onClick=${on}>
    <span class="aibar-ic"><${Icon} name="bell" size=${22} /></span>
    <span class="grow"><b>${busy ? 'لحظة...' : 'شغّل الإشعارات'}</b><small>المدير هيبعتلك شغلك كل يوم ويسألك خلصت إيه</small></span></button>`;
}
