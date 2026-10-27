/* home.js — الرئيسية + السكان العام + البحث */
import { html, useState, useEffect, useMemo, Icon, Empty, Spinner, SearchBox, Sheet, SecTitle, Hero, openSheet, toast, confirmBox } from './ui.js?v=7';
import { call, errText } from './api.js?v=7';
import { useStore, getStore, isAdmin, canInvoice } from './store.js?v=7';
import * as L from './lib.js?v=7';
import { ItemRow, ItemSheet, startNewItem } from './items.js?v=7';
import { ScanSheet } from './qr.js?v=7';
import { TripCard } from './trips.js?v=7';
import { BlankStickersSheet } from './stickers.js?v=7';
import { LogSheet, MoveRow } from './log.js?v=7';
import { DriverSheet } from './drivers.js?v=7';
import { AdminSheet } from './admin.js?v=7';
import { isOpenJob, isLate } from './jobs.js?v=7';

/* السكان العام: يفتح الحاجة، أو يسجّل استيكر فاضي */
export function scanOpen() {
  openSheet(ScanSheet, {
    title: 'سكان QR',
    hint: 'وجّه الكاميرا على الاستيكر',
    onCode: async (code) => {
      const s = getStore();
      const it = s.idx.byCode.get(code);
      if (it) { setTimeout(() => openSheet(ItemSheet, { id: it.id }), 60); return { ok: true, msg: it.name }; }
      try {
        const r = await call('code_info', { p_code: code });
        if (r.status === 'item') { setTimeout(() => openSheet(ItemSheet, { id: r.item_id }), 60); return { ok: true, msg: code }; }
        if (r.status === 'blank') { setTimeout(() => startNewItem({ code, scanNext: scanOpen }), 60); return { ok: true, msg: 'استيكر فاضي — سجّله' }; }
        return { ok: false, msg: 'الكود ده مش من استيكراتنا' };
      } catch (e) { return { ok: false, msg: errText(e) }; }
    },
  });
}

export const HeroScan = () => html`<button class="iconbtn scanbtn" onClick=${scanOpen} aria-label="سكان"><${Icon} name="scan" size=${22} /></button>`;

export function HomeTab({ onGo, onLogout }) {
  const { data, idx } = useStore();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    if (!q.trim()) return null;
    const items = data.items.filter((i) => L.matches(idx.hay.get(i.id), q)).slice(0, 60);
    const drivers = data.drivers.filter((d) => L.matches(d.name + ' ' + d.phone, q)).slice(0, 10);
    return { items, drivers };
  }, [q, data]);

  const active = data.trips.filter((t) => t.status !== 'closed');
  const sumQ = (arr) => L.sum(arr, (i) => i.qty);
  const tiles = [
    ['drivers', 'car', 'السواقين وقطعهم', `${data.drivers.length} سواق · ${sumQ(idx.kinds.part)} قطعة`, 'red'],
    ['tools', 'wrench', 'العدة', `${idx.kinds.tool.length} حاجة`, 'dark'],
    ['export', 'globe', 'التصدير', `${sumQ(idx.kinds.product)} قطعة متخزنة`, 'gray'],
    ['trips', 'flag', 'الطلعات', active.length ? `${active.length} شغالة دلوقتي` : 'سباقات وتمرينات', 'amber'],
    ...(canInvoice() ? [['invoices', 'file', 'الفواتير والأسعار', `${data.invoices.filter((v) => !v.paid).length} لسه ما اتدفعتش`, 'green']] : []),
  ];
  const me = data.me;
  const jobs = data.jobs.filter(isOpenJob);
  const jReady = jobs.filter((j) => j.status === 'ready').length, jLate = jobs.filter(isLate).length;
  return html`
    <${Hero} title=${'أهلاً، ' + (me.kind === 'admin' ? 'الإدارة' : me.name)} sub=${L.fmtDate(L.todayStr())}
      right=${html`${isAdmin() && html`<button class="iconbtn" onClick=${() => openSheet(AdminSheet)} aria-label="الإعدادات"><${Icon} name="settings" size=${21} /></button>`}
        <button class="iconbtn" onClick=${() => openSheet(AccountSheet, { onLogout })} aria-label="حسابي"><${Icon} name="user" size=${21} /></button>`} />
    <main class="body">
      <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر على أي حاجة: اسم، كود، مقاس، سواق..." />
      ${results ? html`
        ${results.drivers.length > 0 && html`<${SecTitle}>سواقين<//><div class="card tight">${results.drivers.map((d) => html`<button class="lrow" key=${d.id} onClick=${() => openSheet(DriverSheet, { id: d.id })}>
            <span class="avatar sm">${d.name.trim().charAt(0)}</span><span class="grow"><b>${d.name}</b><small>${(idx.itemsByDriver.get(d.id) || []).length} قطعة</small></span><${Icon} name="chev" size=${18} /></button>`)}</div>`}
        <${SecTitle}>حاجات (${results.items.length})<//>
        ${results.items.length === 0 ? html`<${Empty} icon="search" text="مفيش حاجة بالاسم ده" />` : html`<div class="card tight">${results.items.map((i) => html`<${ItemRow} item=${i} key=${i.id} />`)}</div>`}`
      : html`
        <button class="btn bigbtn scanbig" onClick=${scanOpen}><${Icon} name="scan" size=${28} /> سكان QR</button>
        <button class="jobbar" onClick=${() => onGo('jobs')}>
          <span class="jobbar-ic"><${Icon} name="clip" size=${26} /></span>
          <span class="grow"><b>شغل العربيات</b><small>${jobs.length ? `${jobs.length} عربية في الجراش` : 'مفيش عربيات في الجراش دلوقتي'}${jReady ? ` · ${jReady} جاهزة` : ''}${jLate ? ` · ${jLate} متأخرة` : ''}</small></span>
          <${Icon} name="chev" size=${20} />
        </button>
        <div class=${'tiles' + (tiles.length % 2 ? ' odd' : '')}>${tiles.map(([id, icon, label, sub, tone]) => html`<button class=${'tile t-' + tone + (id === 'trips' && active.length ? ' live' : '')} key=${id} onClick=${() => onGo(id)}>
          <span class="tile-ic"><${Icon} name=${icon} size=${30} /></span><b>${label}</b><small>${sub}</small></button>`)}</div>
        <button class="btn ghost" onClick=${() => openSheet(MoreSheet)}><${Icon} name="history" size=${20} /> آخر الحركات والاستيكرات</button>`}
    </main>`;
}

/* آخر الحركات + الاستيكرات الفاضية (برا الرئيسية عشان تفضل بسيطة) */
function MoreSheet({ close }) {
  const [recent, setRecent] = useState(null);
  useEffect(() => {
    let off = false;
    call('moves_list', { p: { limit: 12 } }).then((r) => { if (!off) setRecent(r); }).catch(() => { if (!off) setRecent([]); });
    return () => { off = true; };
  }, []);
  return html`<${Sheet} title="آخر الحركات والاستيكرات" onClose=${close} full>
    <div class="grid2">
      <button class="btn dark sm" onClick=${() => openSheet(BlankStickersSheet)}><${Icon} name="qr" size=${18} /> استيكرات فاضية</button>
      <button class="btn ghost sm" onClick=${() => openSheet(LogSheet)}><${Icon} name="history" size=${18} /> السجل كله</button>
    </div>
    <${SecTitle}>آخر الحركات<//>
    ${recent === null ? html`<${Spinner} />` : recent.length === 0 ? html`<${Empty} icon="history" text="لسه مفيش حركات" />`
      : html`<div class="card tight">${recent.map((m) => html`<${MoveRow} m=${m} key=${m.id} />`)}</div>`}
  <//>`;
}

function AccountSheet({ onLogout, close }) {
  const { data } = useStore();
  async function out() {
    if (!(await confirmBox({ title: 'تسجيل خروج؟', ok: 'خروج' }))) return;
    close(); onLogout();
  }
  return html`<${Sheet} title="حسابي" onClose=${close}>
    <div class="who"><span class="avatar">${(data.me.name || '?').charAt(0)}</span><div><b>${data.me.name}</b><div class="soft tiny">${data.me.kind === 'admin' ? 'الإدارة' : 'موظف'}</div></div></div>
    <div class="note info"><${Icon} name="info" size=${18} /><span>عشان تحط الابلكيشن على الشاشة الرئيسية: من المتصفح دوس "مشاركة" ثم "إضافة إلى الشاشة الرئيسية".</span></div>
    <button class="btn ghost" onClick=${() => location.reload()}><${Icon} name="refresh" size=${20} /> تحديث الابلكيشن</button>
    <button class="btn dark" onClick=${out}><${Icon} name="logout" size=${20} /> تسجيل خروج</button>
  <//>`;
}
