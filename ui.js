/* ui.js — مكونات الواجهة المشتركة */
import { html, render, useState, useEffect, useRef, useMemo } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
export { html, render, useState, useEffect, useRef, useMemo };

/* ---------- أيقونات (SVG داخلي) ---------- */
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  car: '<path d="M5 17h14M5 17a2 2 0 1 1-4 0v-4l2.5-6h11L18 11h3a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M5.5 11H18"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12M7.5 4.3l9 5.1"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  timer: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l2 2M10 2h4M12 2v4"/>',
  truck: '<path d="M1 5h13v11H1zM14 9h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="4" height="4" rx=".5"/><rect x="13" y="7" width="4" height="4" rx=".5"/><rect x="7" y="13" width="4" height="4" rx=".5"/><path d="M13 13h4v4h-4z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  back: '<path d="m9 18 6-6-6-6"/>',
  chev: '<path d="m15 18-6-6 6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  in: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
  out: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 17v3h16v-3"/>',
  swap: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.5 1.3 2.8 2.5 2.8z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  dots: '<circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>',
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
};
export const Icon = ({ name, size = 22, stroke = 2, class: cls }) => html`<svg class=${'ic ' + (cls || '')} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: P[name] || P.info }}></svg>`;

/* ---------- Toast ---------- */
let toastSetter = () => {};
export const toast = (msg, kind) => toastSetter({ msg, kind: kind || 'ok', id: Date.now() + Math.random() });
export function ToastHost() {
  const [t, setT] = useState(null);
  const tmr = useRef(null);
  useEffect(() => {
    toastSetter = (v) => { setT(v); clearTimeout(tmr.current); tmr.current = setTimeout(() => setT(null), v.kind === 'bad' ? 4200 : 2600); };
    return () => { toastSetter = () => {}; };
  }, []);
  if (!t) return null;
  return html`<div class=${'toast ' + (t.kind === 'bad' ? 'bad' : '')} role="status" key=${t.id} onClick=${() => setT(null)}>
    <${Icon} name=${t.kind === 'bad' ? 'alert' : 'check'} size=${18} /><span>${t.msg}</span></div>`;
}

/* ---------- كومة الشاشات المنبثقة (Sheets) ---------- */
let stack = [];
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export function openSheet(C, props) {
  const key = 's' + Date.now() + Math.random().toString(36).slice(2, 6);
  stack = [...stack, { C, props: props || {}, key }];
  emit();
  return key;
}
export function closeSheet(key) {
  stack = key ? stack.filter((s) => s.key !== key) : stack.slice(0, -1);
  emit();
}
export function closeAllSheets() { stack = []; emit(); }
export function SheetHost() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  useEffect(() => { document.body.classList.toggle('noscroll', stack.length > 0); });
  return html`${stack.map((s) => html`<${s.C} key=${s.key} ...${s.props} close=${() => closeSheet(s.key)} />`)}`;
}

/* إطار الشاشة المنبثقة */
export function Sheet({ title, sub, onClose, children, footer, full }) {
  return html`<div class="sheet-back" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class=${'sheet ' + (full ? 'full' : '')} role="dialog">
      <div class="sheet-head">
        <div class="grow"><div class="h2">${title}</div>${sub && html`<div class="soft tiny">${sub}</div>`}</div>
        <button class="iconbtn light" onClick=${onClose} aria-label="إغلاق"><${Icon} name="x" size=${20} /></button>
      </div>
      <div class="sheet-body">${children}</div>
      ${footer && html`<div class="sheet-foot">${footer}</div>`}
    </div>
  </div>`;
}

/* تأكيد بسيط: await confirmBox({...}) → true/false أو قيمة الزرار */
export function confirmBox({ title, text, ok = 'تمام', cancel = 'رجوع', danger, choices }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v, close) => { if (done) return; done = true; close(); resolve(v); };
    openSheet(({ close }) => html`<${Sheet} title=${title} onClose=${() => finish(false, close)}>
      ${text && html`<div class="confirm-text">${text}</div>`}
      <div class="stack">
        ${(choices || [[true, ok, danger ? 'danger' : '']]).map(([v, label, tone]) => html`
          <button class=${'btn ' + (tone === 'danger' ? '' : tone === 'dark' ? 'dark' : tone === 'ghost' ? 'ghost' : '')} onClick=${() => finish(v, close)}>${label}</button>`)}
        <button class="btn ghost" onClick=${() => finish(false, close)}>${cancel}</button>
      </div>
    <//>`);
  });
}

/* ---------- عناصر صغيرة ---------- */
export const Pill = ({ tone = 'gray', children, icon }) => html`<span class=${'pill t-' + tone}>${icon && html`<${Icon} name=${icon} size=${13} />`}${children}</span>`;
export const Empty = ({ icon = 'info', text, children }) => html`<div class="empty"><${Icon} name=${icon} size=${30} /><span>${text}</span>${children}</div>`;
export const Spinner = ({ light }) => html`<div class=${'spin ' + (light ? 'light' : '')}></div>`;
export const Field = ({ label, hint, children, req }) => html`<div class="field"><span class="lbl">${label}${req && html`<b class="req"> *</b>`}</span>${children}${hint && html`<span class="hint">${hint}</span>`}</div>`;
export const Segmented = ({ value, onChange, items }) => html`<div class="seg">${items.map(([id, label, badge]) => html`<button type="button" class=${value === id ? 'on' : ''} onClick=${() => onChange(id)}>${label}${badge > 0 && html`<i>${badge}</i>`}</button>`)}</div>`;

export function Chips({ items, value, onChange, multi, wrap = true }) {
  const isOn = (v) => (multi ? (value || []).includes(v) : value === v);
  return html`<div class=${'chips ' + (wrap ? '' : 'nowrap')}>${items.map((it) => {
    const [v, label, tone] = Array.isArray(it) ? it : [it, it];
    return html`<button type="button" class=${'chip ' + (isOn(v) ? 'on ' : '') + (tone ? 't-' + tone : '')} onClick=${() => onChange(v)}>${label}</button>`;
  })}</div>`;
}

export function Stepper({ value, onChange, min = 0, max = 9999, big }) {
  const v = Number(value) || 0;
  const set = (n) => onChange(Math.max(min, Math.min(max, n)));
  return html`<div class=${'stepper ' + (big ? 'big' : '')}>
    <button type="button" onClick=${() => set(v + 1)} disabled=${v >= max} aria-label="زوّد"><${Icon} name="plus" size=${22} stroke=${2.6} /></button>
    <input class="num" inputmode="numeric" value=${v} onInput=${(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); set(Number.isFinite(n) ? n : min); }} />
    <button type="button" onClick=${() => set(v - 1)} disabled=${v <= min} aria-label="قلّل"><${Icon} name="minus" size=${22} stroke=${2.6} /></button>
  </div>`;
}

export function SearchBox({ value, onChange, placeholder, autofocus }) {
  const ref = useRef(null);
  useEffect(() => { if (autofocus && ref.current) setTimeout(() => ref.current && ref.current.focus(), 250); }, []);
  return html`<div class="search"><${Icon} name="search" size=${20} />
    <input ref=${ref} type="search" placeholder=${placeholder || 'دوّر...'} value=${value} onInput=${(e) => onChange(e.target.value)} />
    ${value && html`<button class="search-x" onClick=${() => onChange('')} aria-label="مسح"><${Icon} name="x" size=${16} /></button>`}
  </div>`;
}

/* زرار كبير بأيقونة وكلمة (للأوامر الأساسية) */
export const Act = ({ icon, label, onClick, tone, disabled, sub }) => html`<button type="button" class=${'act ' + (tone || '')} onClick=${onClick} disabled=${disabled}>
  <span class="act-ic"><${Icon} name=${icon} size=${24} /></span><span class="act-lb">${label}</span>${sub && html`<span class="act-sub">${sub}</span>`}</button>`;

export function Hero({ title, sub, right, back }) {
  return html`<header class="hero">
    <div class="hero-top">
      ${back ? html`<button class="iconbtn" onClick=${back} aria-label="رجوع"><${Icon} name="back" size=${22} /></button>`
        : html`<div class="brand"><img src="logo-mark.png" alt="AF" /><span>AF PARTS</span></div>`}
      <div class="row gap8">${right}</div>
    </div>
    ${title && html`<h1 class="hero-title">${title}</h1>`}
    ${sub && html`<div class="hero-sub">${sub}</div>`}
  </header>`;
}

export function BottomNav({ items, tab, onGo }) {
  return html`<nav class=${'nav' + (items.length > 6 ? ' n7' : '')}>${items.map((it) => html`<button class=${tab === it.id ? 'on' : ''} onClick=${() => onGo(it.id)}>
    <span class="nav-ic"><${Icon} name=${it.icon} size=${23} />${it.badge > 0 && html`<i class="cnt">${it.badge > 9 ? '9+' : it.badge}</i>`}</span><span class="nav-lb">${it.label}</span></button>`)}</nav>`;
}

export const Splash = ({ text, children }) => html`<div class="splash"><img src="logo-full.png" alt="AF PARTS" /><div class="spin light"></div>${text && html`<div class="soft-light">${text}</div>`}${children}</div>`;

/* صف عنوان قسم */
export const SecTitle = ({ children, right }) => html`<div class="sec-title"><span class="grow">${children}</span>${right}</div>`;

/* رقم بكسور (أسعار وكميات): بيقبل الأرقام العربي والإنجليزي */
export const parseNum = (t) => {
  const s = String(t == null ? '' : t).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.').replace(/[,،\s]/g, '');
  if (s === '' || s === '.') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
export function NumInput({ value, onChange, placeholder, cls, disabled }) {
  const show = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
  const [txt, setTxt] = useState(show(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { last.current = value; setTxt(show(value)); } }, [value]);
  return html`<input class=${'input ltr num-in ' + (cls || '')} inputmode="decimal" placeholder=${placeholder || ''} value=${txt} disabled=${disabled}
    onInput=${(e) => { const t = e.target.value.replace(/[^0-9٠-٩.,٫]/g, ''); setTxt(t); const n = parseNum(t); last.current = n; onChange(n); }} />`;
}
