/* app.js — نقطة البداية: الدخول والتابات */
import { html, render, useState, useEffect, Icon, Field, Segmented, Splash, ToastHost, SheetHost, BottomNav, toast, openSheet, closeAllSheets } from './ui.js?v=7';
import { SUPABASE_URL } from './config.js?v=7';
import { sb, rpcRaw, call, staffSession, lastRole, setToken, setUnauthorizedHandler, errText } from './api.js?v=7';
import { useStore, reload, resetStore, getStore, canInvoice } from './store.js?v=7';
import { HomeTab } from './home.js?v=7';
import { DriversTab } from './drivers.js?v=7';
import { ToolsTab } from './tools.js?v=7';
import { ExportTab } from './export.js?v=7';
import { TripsTab } from './trips.js?v=7';
import { InvoicesTab } from './invoices.js?v=7';
import { JobsTab, isOpenJob } from './jobs.js?v=7';
import { ItemSheet, startNewItem } from './items.js?v=7';

/* لو حصل خطأ غير متوقع نعرضه بدل شاشة بيضا */
function showFatal(msg) {
  let el = document.getElementById('fatal');
  if (!el) { el = document.createElement('div'); el.id = 'fatal'; document.body.appendChild(el); }
  el.innerHTML = '<div class="fatal-card"><b>حصلت مشكلة</b><pre dir="ltr"></pre><button onclick="location.reload()">إعادة تحميل</button></div>';
  el.querySelector('pre').textContent = String(msg).slice(0, 500);
}
window.addEventListener('error', (e) => {
  if (!e.error || /ResizeObserver|Script error/i.test(e.message || '')) return;
  showFatal(e.error.stack || e.message);
});
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); });

/* ===================== الدخول ===================== */
function Login({ onIn }) {
  const [role, setRole] = useState(lastRole.get());
  const [list, setList] = useState(null);
  const [sid, setSid] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpcRaw('public_staff').then(setList).catch(() => setList([])); }, []);

  async function staffLogin() {
    if (!sid) return toast('اختار اسمك', 'bad');
    if (!pin) return toast('اكتب الرقم السري', 'bad');
    setBusy(true);
    try {
      const r = await rpcRaw('staff_login', { p_staff: sid, p_pin: pin });
      if (r.ok) { staffSession.set(r.token); lastRole.set('staff'); onIn(r.token); return; }
      if (r.error === 'locked') toast(`محاولات كتير — جرّب تاني بعد ${r.minutes} دقيقة`, 'bad');
      else if (r.error === 'wrong_pin') toast(r.left > 0 ? `الرقم السري غلط (باقي ${r.left} محاولات)` : 'الرقم السري غلط', 'bad');
      else toast('مقدرناش ندخلك، كلم الإدارة', 'bad');
      setPin('');
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  async function adminLogin() {
    if (!email.trim() || !pass) return toast('اكتب الإيميل وكلمة السر', 'bad');
    setBusy(true);
    try {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
      if (error) { toast('الإيميل أو كلمة السر غلط', 'bad'); setBusy(false); return; }
      const ok = await rpcRaw('is_admin');
      if (!ok) { await sb.auth.signOut(); toast('الحساب ده مش أدمن', 'bad'); setBusy(false); return; }
      lastRole.set('admin'); onIn(''); return;
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  const enter = (fn) => (e) => { if (e.key === 'Enter') fn(); };
  return html`<div class="login">
    <div class="login-cover"><img src="logo-full.png" alt="AF PARTS" /></div>
    <div class="login-card">
      <${Segmented} value=${role} onChange=${setRole} items=${[['staff', 'موظف'], ['admin', 'الإدارة']]} />
      ${role === 'staff' ? html`
        <${Field} label="اختار اسمك">
          <select class="input" value=${sid} onChange=${(e) => setSid(e.target.value)}>
            <option value="">${list === null ? 'لحظة...' : '— اختار —'}</option>
            ${(list || []).map((s) => html`<option value=${s.id}>${s.name}</option>`)}
          </select><//>
        ${list && list.length === 0 && html`<div class="soft tiny center-t">مفيش موظفين لسه — الإدارة تضيفهم من الإعدادات.</div>`}
        ${sid && html`<${Field} label="الرقم السري">
          <input class="input pin" type="password" inputmode="numeric" maxlength="8" value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown=${enter(staffLogin)} /><//>`}
        <button class="btn bigbtn" disabled=${busy || !sid} onClick=${staffLogin}><${Icon} name="lock" size=${22} /> دخول</button>` : html`
        <${Field} label="الإيميل"><input class="input ltr" type="email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} /><//>
        <${Field} label="كلمة السر"><input class="input ltr" type="password" autocomplete="current-password" value=${pass} onInput=${(e) => setPass(e.target.value)} onKeyDown=${enter(adminLogin)} /><//>
        <button class="btn bigbtn" disabled=${busy} onClick=${adminLogin}><${Icon} name="lock" size=${22} /> دخول الإدارة</button>`}
    </div>
  </div>`;
}

/* ===================== الابلكيشن ===================== */
function codeFromHash() { const m = location.hash.match(/c=(AF-\d+)/i); return m ? m[1].toUpperCase() : ''; }

async function openCode(code) {
  const s = getStore();
  const it = s.idx && s.idx.byCode.get(code);
  if (it) return openSheet(ItemSheet, { id: it.id });
  try {
    const r = await call('code_info', { p_code: code });
    if (r.status === 'blank') return startNewItem({ code });
    if (r.status === 'item') return openSheet(ItemSheet, { id: r.item_id });
    toast('الكود ده مش من استيكراتنا', 'bad');
  } catch (e) { toast(errText(e), 'bad'); }
}

function Main({ onLogout }) {
  const S = useStore();
  const [tab, setTab] = useState('home');
  useEffect(() => {
    reload().catch(() => {});
    let last = Date.now();
    const vis = () => { if (document.visibilityState === 'visible' && Date.now() - last > 20000) { last = Date.now(); reload().catch(() => {}); } };
    document.addEventListener('visibilitychange', vis);
    const t = setInterval(() => { if (document.visibilityState === 'visible') { last = Date.now(); reload().catch(() => {}); } }, 90000);
    return () => { document.removeEventListener('visibilitychange', vis); clearInterval(t); };
  }, []);
  /* فتح كود من اللينك (لو الاستيكر اتعمله سكان بكاميرا الموبايل العادية) */
  useEffect(() => {
    if (!S.data) return;
    const go = () => { const c = codeFromHash(); if (!c) return; history.replaceState(null, '', location.pathname); openCode(c); };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [!!S.data]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!S.data) {
    return html`<${Splash} text=${S.err ? errText({ message: S.err }) : 'لحظة...'}>
      ${S.err && html`<div class="splash-act"><button class="btn" onClick=${() => reload().catch(() => {})}>حاول تاني</button><button class="btn ghost light" onClick=${onLogout}>خروج</button></div>`}<//>`;
  }
  const active = S.data.trips.filter((t) => t.status !== 'closed').length;
  const drafts = S.data.shipments.filter((s) => s.status === 'draft').length;
  const openJobs = S.data.jobs.filter(isOpenJob).length;
  const nav = [
    { id: 'home', icon: 'home', label: 'الرئيسية' },
    { id: 'jobs', icon: 'clip', label: 'الشغل', badge: openJobs },
    { id: 'drivers', icon: 'car', label: 'السواقين' },
    { id: 'tools', icon: 'wrench', label: 'العدة' },
    { id: 'export', icon: 'globe', label: 'التصدير', badge: drafts },
    { id: 'trips', icon: 'flag', label: 'الطلعات', badge: active },
    ...(canInvoice() ? [{ id: 'invoices', icon: 'file', label: 'الفواتير' }] : []),
  ];
  return html`<div class="app">
    ${tab === 'home' && html`<${HomeTab} onGo=${setTab} onLogout=${onLogout} />`}
    ${tab === 'jobs' && html`<${JobsTab} />`}
    ${tab === 'drivers' && html`<${DriversTab} />`}
    ${tab === 'tools' && html`<${ToolsTab} />`}
    ${tab === 'export' && html`<${ExportTab} />`}
    ${tab === 'trips' && html`<${TripsTab} />`}
    ${tab === 'invoices' && canInvoice() && html`<${InvoicesTab} />`}
    <${BottomNav} items=${nav} tab=${tab} onGo=${setTab} />
  </div>`;
}

function Root() {
  const [view, setView] = useState('boot');
  useEffect(() => { const b = document.getElementById('boot'); if (b) b.remove(); }, []);
  async function logout() {
    closeAllSheets();
    const tok = staffSession.token;
    if (tok) { try { await rpcRaw('staff_logout', { p_token: tok }); } catch (e) { /* ignore */ } }
    staffSession.clear();
    try { await sb.auth.signOut(); } catch (e) { /* ignore */ }
    setToken(''); resetStore(); setView('login');
  }
  useEffect(() => {
    setUnauthorizedHandler(() => { toast('انتهت الجلسة، ادخل تاني', 'bad'); logout(); });
    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (data && data.session) {
          let ok = false;
          try { ok = await rpcRaw('is_admin'); } catch (e) { ok = false; }
          if (ok) { setToken(''); return setView('main'); }
          await sb.auth.signOut();
        }
      } catch (e) { /* كمّل للموظف */ }
      const tok = staffSession.token;
      if (tok) { setToken(tok); setView('main'); } else setView('login');
    })();
  }, []);

  let body;
  if (SUPABASE_URL.includes('YOUR-PROJECT')) body = html`<${Splash} text="لسه ما ظبطتش ملف config.js (رابط Supabase والمفتاح)" />`;
  else if (view === 'boot') body = html`<${Splash} />`;
  else if (view === 'login') body = html`<${Login} onIn=${(tok) => { setToken(tok); setView('main'); }} />`;
  else body = html`<${Main} onLogout=${logout} />`;
  return html`${body}<${SheetHost} /><${ToastHost} />`;
}

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
render(html`<${Root} />`, document.getElementById('app'));
