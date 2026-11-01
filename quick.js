/* quick.js — v28: «الكود يشتغل، والذكاء يفهم بس»
   زراير سريعة للموظف والإدارة من غير ما حد يكتب للمدير: خلصت، اشتريت، مشكلة، مستني.
   كل حاجة هنا ثابتة (كود)، مفيهاش ذكاء اصطناعي، فمينفعش تغلط. */
import { html, useState, useEffect, Icon, Sheet, Empty, Field, Chips, NumInput, toast } from './ui.js?v=28';
import { call, errText } from './api.js?v=28';
import { useStore, reload } from './store.js?v=28';
import * as L from './lib.js?v=28';
import { isOpenJob } from './jobs.js?v=28';
import { CATS } from './purchases.js?v=28';

const N = (s) => L.norm(String(s || ''));

/* اسم الشغلانة: العربية أو المنتج أو العنوان */
export function jobLabel(j, data) {
  const car = j.car_id && data.cars.find((c) => c.id === j.car_id);
  const pr = j.product_id && data.items.find((i) => i.id === j.product_id);
  return (car ? car.name : pr ? pr.name : j.title || '') + ' · ' + j.ref;
}

/* خطوات الشغل المفتوحة بالترتيب، وكل خطوة معاها: هي الدور ولا مستنية حد */
export function openSteps(data) {
  const out = [];
  for (const j of data.jobs.filter(isOpenJob)) {
    const steps = (j.lines || []).filter((l) => l.kind === 'task').sort((a, b) => (a.sort || 0) - (b.sort || 0));
    steps.forEach((l, i) => {
      if (l.done) return;
      const prev = steps.slice(0, i).reverse().find((x) => !x.done);
      out.push({ l, j, n: i + 1, prev, turn: !prev });
    });
  }
  return out;
}
/* خطواتي أنا (للإدارة: كل الخطوات) — اللي عليها الدور الأول */
export function mySteps(data) {
  const me = data.me || {};
  const all = openSteps(data).filter((x) => me.kind === 'admin' || x.l.staff_id === me.id);
  return all.sort((a, b) => (a.turn === b.turn ? 0 : a.turn ? -1 : 1));
}

/* نوع المشتريات من اسمها */
const CAT_WORDS = [
  ['خراطة', /خراط|مخرط|تخريط/],
  ['مسامير وصواميل', /مسمار|مسامير|صامول|صواميل|وردة|ورد |جوايط|جويط|بنط/],
  ['جلفنة ودهان', /جلفن|دهان|بوي[هة]|سبراي|اسبراي|معجون|برايمر/],
  ['نقل ومشاوير', /نقل|مشوار|توصيل|بنزين|سولار|اوبر|أوبر|توكتوك|تاكس/],
  ['شغل بره', /صنايعي|ليزر|تني|ثني|قص ليزر|كهربائي|ميكانيكي/],
  ['خامات', /صاج|ماسور|مواسير|حديد|زاوي[هة]|سلك|ارجون|أرجون|الومن|ألومن|استانلس|ستانلس|صفيح|بروفيل|خام|اسطوان|قضيب|بلت/],
];
export const guessCat = (item) => { const t = N(item); for (const [c, re] of CAT_WORDS) if (re.test(t)) return c; return 'تانية'; };

const MODES = [['done', 'خلصت', 'check'], ['buy', 'اشتريت', 'tag'], ['problem', 'مشكلة', 'alert'], ['wait', 'مستني', 'timer']];
export const QUICK = MODES;

export function QuickSheet({ mode: m0, close }) {
  const [mode, setMode] = useState(m0 || 'done');
  return html`<${Sheet} title="بسرعة" sub="من غير ما تكتب للمدير" onClose=${close}>
    <div class="qmodes">${MODES.map(([k, lb, ic]) => html`<button class=${'qmode ' + (mode === k ? 'on' : '')} onClick=${() => setMode(k)}><${Icon} name=${ic} size=${20} /><span>${lb}</span></button>`)}</div>
    ${mode === 'done' ? html`<${DonePane} />` : mode === 'buy' ? html`<${BuyPane} close=${close} />` : html`<${ProblemPane} wait=${mode === 'wait'} close=${close} key=${mode} />`}
  <//>`;
}

/* خلصت: دوسة على الخطوة */
function DonePane() {
  const { data } = useStore();
  const list = mySteps(data);
  const [busy, setBusy] = useState('');
  const admin = (data.me || {}).kind === 'admin';
  async function done(x) {
    setBusy(x.l.id);
    try {
      await call('job_line_done', { p_id: x.l.id, p_done: true });
      import('./assistant.js?v=28').then((m) => m.turnNotify(x.j.id)).catch(() => {});
      await reload();
      toast('برافو ✓ ' + x.l.title);
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy('');
  }
  if (!list.length) return html`<${Empty} icon="check" text="مفيش خطوات مفتوحة 👌" />`;
  return html`<div class="card tight jsteps">${list.map((x) => html`<div class=${'step' + (x.turn ? ' now' : '')} key=${x.l.id}>
    <button class="tick" disabled=${!!busy} onClick=${() => done(x)} aria-label="خلصت">${busy === x.l.id ? html`<div class="spin sm"></div>` : ''}</button>
    <div class="step-t grow"><span dir="auto">${x.l.errand ? '🚚 ' : ''}${x.l.title}</span>
      <small class=${x.turn ? 'now' : ''} dir="auto">${jobLabel(x.j, data)}${admin && x.l.staff_id ? ' · ' + ((data.staff.find((s) => s.id === x.l.staff_id) || {}).name || '') : ''}</small>${!x.turn && html`<small dir="auto">⏳ مستنية «${x.prev.title}»</small>`}</div>
  </div>`)}</div>`;
}

/* اشتريت: الحاجة + السعر + على أنهي شغلانة */
function BuyPane({ close }) {
  const { data } = useStore();
  const mine = mySteps(data);
  const jobs = data.jobs.filter(isOpenJob);
  const [f, setF] = useState({ item: '', price: null, qty: 1, job: (mine[0] && mine[0].j.id) || '', shop: '', cat: '' });
  const [last, setLast] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cat = f.cat || guessCat(f.item);
  useEffect(() => {
    setLast(null);
    const it = f.item.trim(); if (it.length < 3) return;
    const t = setTimeout(() => call('last_prices', { p_items: [it] }).then((r) => setLast((r || [])[0] || null)).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [f.item]);
  async function save() {
    if (!f.item.trim()) return toast('اكتب اشتريت إيه', 'bad');
    if (!(f.price >= 0) || f.price === null) return toast('اكتب السعر', 'bad');
    setBusy(true);
    try {
      await call('expense_add', { p: { item: f.item.trim(), qty: f.qty || 1, price: f.price, cat, shop: f.shop.trim(), job_id: f.job || null } });
      await reload();
      toast('اتسجلت ✓ ' + f.item.trim() + ' بـ ' + f.price);
      setF((x) => ({ ...x, item: '', price: null, qty: 1, cat: '' }));
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`
    <${Field} label="اشتريت إيه؟" req><input class="input" dir="auto" placeholder="مثلاً: مسامير 14 × 1.5" value=${f.item} onInput=${(e) => set('item', e.target.value)} /><//>
    <div class="grid2">
      <${Field} label="دفعت كام (جنيه)" req><${NumInput} value=${f.price} onChange=${(v) => set('price', v)} placeholder="السعر" /><//>
      <${Field} label="العدد"><${NumInput} value=${f.qty} onChange=${(v) => set('qty', v)} /><//>
    </div>
    ${last && Number(last.price) > 0 && html`<div class="note info"><${Icon} name="info" size=${16} /><span>آخر مرة: ${Math.round(last.price)} ج${Number(last.qty) !== 1 ? ' لـ ' + Number(last.qty) : ''}${last.shop ? ' من ' + last.shop : ''}${last.date ? ' (' + L.fmtDate(last.date) + ')' : ''}</span></div>`}
    <${Field} label="على أنهي شغلانة؟"><select class="input" value=${f.job} onChange=${(e) => set('job', e.target.value)}>
      <option value="">مصاريف عامة (مش على شغلانة)</option>
      ${jobs.map((j) => html`<option value=${j.id} key=${j.id}>${jobLabel(j, data)}</option>`)}</select><//>
    <${Field} label="النوع"><${Chips} items=${CATS} value=${cat} onChange=${(v) => set('cat', v)} /><//>
    <${Field} label="المحل (لو تعرفه)"><input class="input" dir="auto" value=${f.shop} onInput=${(e) => set('shop', e.target.value)} /><//>
    <button class="btn dark" disabled=${busy} onClick=${save}><${Icon} name="check" size=${20} /> ${busy ? 'لحظة...' : 'سجّل'}</button>
    <small class="soft">لو معاك صورة الفاتورة ابعتها للمدير في الشات 📷</small>`;
}

/* مشكلة أو مستني حاجة: على أنهي خطوة، وإيه السبب — الإدارة يجيلها إشعار */
function ProblemPane({ wait, close }) {
  const { data } = useStore();
  const list = mySteps(data);
  const [sel, setSel] = useState(list[0] ? list[0].l.id : '');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const QUICKW = wait ? ['قطعة', 'خامة', 'الخراط', 'الجلفنة', 'حد يساعدني'] : ['عطل في العدة', 'مش فاهم المطلوب', 'المقاس غلط', 'ناقص حاجة'];
  async function save() {
    const x = list.find((y) => y.l.id === sel);
    if (!x) return toast('اختار الخطوة', 'bad');
    if (!why.trim()) return toast(wait ? 'مستني إيه؟' : 'إيه المشكلة؟', 'bad');
    setBusy(true);
    try {
      await call('job_line_problem', { p_id: x.l.id, p_reason: (wait ? 'مستني: ' : '') + why.trim() });
      import('./assistant.js?v=28').then((m) => m.fnCall({ action: 'notify', problem_line: x.l.id })).catch(() => {});
      await reload();
      toast('وصلت للإدارة ✓');
      close();
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  if (!list.length) return html`<${Empty} icon="check" text="مفيش خطوات مفتوحة" />`;
  return html`
    <${Field} label="في أنهي خطوة؟"><div class="card tight">${list.slice(0, 12).map((x) => html`<button class=${'lrow pickrow ' + (sel === x.l.id ? 'on' : '')} key=${x.l.id} onClick=${() => setSel(x.l.id)}>
      <span class=${"qradio " + (sel === x.l.id ? "on" : "")}></span><span class="grow"><b dir="auto">${x.l.title}</b><small dir="auto">${jobLabel(x.j, data)}</small></span></button>`)}</div><//>
    <${Field} label=${wait ? 'مستني إيه؟' : 'إيه المشكلة؟'} req>
      <div class="chips">${QUICKW.map((w) => html`<button class="chip" onClick=${() => setWhy(w)}>${w}</button>`)}</div>
      <input class="input" dir="auto" value=${why} placeholder="اكتب باختصار" onInput=${(e) => setWhy(e.target.value)} /><//>
    <button class="btn red" disabled=${busy} onClick=${save}><${Icon} name="send" size=${18} /> ${busy ? 'لحظة...' : 'ابعت للإدارة'}</button>`;
}
