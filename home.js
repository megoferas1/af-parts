/* home.js — الرئيسية + السكان العام + البحث */
import { html, useState, useMemo, Icon, Empty, SearchBox, SecTitle, Sheet, Hero, openSheet, confirmBox } from './ui.js?v=13';
import { call, errText } from './api.js?v=13';
import { useStore, getStore, isAdmin, canInvoice } from './store.js?v=13';
import * as L from './lib.js?v=13';
import { ItemRow, ItemSheet, startNewItem } from './items.js?v=13';
import { ScanSheet } from './qr.js?v=13';
import { UnitSheet } from './units.js?v=13';
import { TripCard } from './trips.js?v=13';
import { DriverSheet, DriverPartsSheet, GaragePartsSheet } from './drivers.js?v=13';
import { BlankStickersSheet } from './stickers.js?v=13';
import { LogSheet } from './log.js?v=13';
import { AdminSheet } from './admin.js?v=13';
import { isOpenJob, isLate } from './jobs.js?v=13';

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
        if (r.status === 'unit') { setTimeout(() => openSheet(UnitSheet, { code: r.code, itemId: r.item_id }), 60); return { ok: true, msg: code }; }
        if (r.status === 'blank') { setTimeout(() => startNewItem({ code, scanNext: scanOpen }), 60); return { ok: true, msg: 'استيكر فاضي — سجّله' }; }
        return { ok: false, msg: 'الكود ده مش من استيكراتنا' };
      } catch (e) { return { ok: false, msg: errText(e) }; }
    },
  });
}

export const HeroScan = () => html`<button class="iconbtn scanbtn" onClick=${scanOpen} aria-label="سكان"><${Icon} name="scan" size=${22} /></button>`;

/* الرئيسية: كل حاجة ظاهرة ومتقسمة — سكان، العربيات، القطع اللي عندنا، والأقسام التانية */
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
  const me = data.me;
  const jobs = data.jobs.filter(isOpenJob);
  const jReady = jobs.filter((j) => j.status === 'ready').length, jLate = jobs.filter(isLate).length;
  /* القطع اللي في الجراش دلوقتي: بتاعة السواقين / بتاعة الجراش */
  const drvParts = idx.kinds.part.filter((i) => i.driver_id && i.qty > 0);
  const drvCount = new Set(drvParts.map((i) => i.driver_id)).size;
  const garQty = L.sum(idx.garageParts, (i) => i.qty);
  const tiles = [
    ['tools', 'wrench', 'العدة', `${idx.kinds.tool.length} حاجة · ليستات السباق`, 'dark', () => onGo('tools')],
    ...(canInvoice() ? [['invoices', 'file', 'الفواتير والأسعار', `${data.invoices.filter((v) => !v.paid).length} لسه ما اتدفعتش`, 'green', () => onGo('invoices')]] : []),
    ['blank', 'qr', 'استيكرات فاضية', 'اطبع ورق وسيبه جنبك', 'gray', () => openSheet(BlankStickersSheet)],
    ['log', 'history', 'السجل', 'كل حركة بالاسم والوقت', 'amber', () => openSheet(LogSheet)],
  ];
  return html`
    <${Hero} title=${'أهلاً، ' + (me.kind === 'admin' ? 'الإدارة' : me.name)} sub=${L.fmtDate(L.todayStr())}
      right=${html`${isAdmin() && html`<button class="iconbtn" onClick=${() => openSheet(AdminSheet)} aria-label="الإعدادات"><${Icon} name="settings" size=${21} /></button>`}
        <button class="iconbtn" onClick=${() => openSheet(AccountSheet, { onLogout })} aria-label="حسابي"><${Icon} name="user" size=${21} /></button>`} />
    <main class="body">
      <${SearchBox} value=${q} onChange=${setQ} placeholder="دوّر على أي حاجة: اسم، كود، سواق..." />
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
        ${active.length > 0 && html`<div class="stack">${active.map((t) => html`<${TripCard} t=${t} key=${t.id} />`)}</div>`}

        <${SecTitle}>القطع اللي عندنا في الجراش<//>
        <div class="partbtns">
          <button class="pcard" onClick=${() => openSheet(DriverPartsSheet)}>
            <span class="pcard-ic"><${Icon} name="car" size=${26} /></span>
            <b>قطع السواقين</b>
            <small><b class="num">${L.sum(drvParts, (i) => i.qty)}</b> قطعة · ${drvCount} سواق</small>
          </button>
          <button class="pcard dark" onClick=${() => openSheet(GaragePartsSheet)}>
            <span class="pcard-ic"><${Icon} name="home" size=${26} /></span>
            <b>قطع الجراش</b>
            <small><b class="num">${garQty}</b> قطعة</small>
          </button>
        </div>

        <${SecTitle}>أقسام تانية<//>
        <div class="tiles small">${tiles.map(([id, icon, label, sub, tone, fn]) => html`<button class=${'tile t-' + tone} key=${id} onClick=${fn}>
          <span class="tile-ic"><${Icon} name=${icon} size=${24} /></span><b>${label}</b><small>${sub}</small></button>`)}</div>`}
    </main>`;
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
