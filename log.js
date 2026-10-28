/* log.js — سجل الحركات */
import { html, useState, useEffect, Icon, Empty, Spinner, Sheet, Chips, openSheet, confirmBox } from './ui.js?v=12';
import { call } from './api.js?v=12';
import { useStore, isAdmin } from './store.js?v=12';
import * as L from './lib.js?v=12';
import { ItemSheet, run } from './items.js?v=12';

export function MoveRow({ m, compact, onUndo }) {
  const { idx } = useStore();
  const info = L.moveInfo(m);
  const driver = m.driver_id && idx && idx.drivers.get(m.driver_id);
  const canUndo = isAdmin() && m.is_last && ['in', 'out', 'adjust'].includes(m.type) && onUndo;
  const amt = m.amount > 0 ? (m.delta > 0 ? '+' : m.delta < 0 ? '−' : '') + m.amount : '';
  return html`<div class="mrow">
    <span class=${'mic t-' + info.tone}><${Icon} name=${info.icon} size=${18} /></span>
    <div class="grow">
      <div class="mrow-title">${info.label}${amt && html` <b class="num ltr-t">${amt}</b>`}</div>
      ${!compact && html`<button class="mrow-item" onClick=${() => openSheet(ItemSheet, { id: m.item_id })}>${L.bidi(m.code, m.item_name + (m.item_size ? ' (' + m.item_size + ')' : ''), driver && driver.name)}</button>`}
      ${m.note && html`<div class="mrow-note" dir="auto">${m.note}</div>`}
      <div class="mrow-meta">${m.actor_name || '—'} · ${L.fmtDateTime(m.created_at)}${compact ? ' · بقى عندنا ' + m.qty_after : ''}</div>
    </div>
    ${canUndo && html`<button class="iconbtn light" title="تراجع" onClick=${() => onUndo(m)}><${Icon} name="undo" size=${18} /></button>`}
  </div>`;
}

export function LogSheet({ close }) {
  const [group, setGroup] = useState('');
  const [list, setList] = useState(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  async function load(reset) {
    setBusy(true);
    try {
      const before = !reset && list && list.length ? list[list.length - 1].id : null;
      const r = await call('moves_list', { p: { group, before, limit: 60 } });
      setList((x) => (reset || !x ? r : [...x, ...r]));
      setMore(r.length === 60);
    } catch (e) { if (reset) setList([]); }
    setBusy(false);
  }
  useEffect(() => { setList(null); load(true); }, [group]);
  async function undo(m) {
    const ok = await confirmBox({ title: 'تراجع عن الحركة دي؟', text: `${L.moveInfo(m).label} ${m.amount} — ${m.item_name}. الكمية هترجع زي ما كانت والحركة هتتمسح من السجل.`, ok: 'تراجع', danger: true });
    if (!ok) return;
    const r = await run(() => call('undo_move', { p_move: m.id }), 'اتلغت');
    if (r.ok) load(true);
  }
  return html`<${Sheet} title="السجل" sub="كل حاجة دخلت أو خرجت أو اتغيرت" onClose=${close} full>
    <${Chips} items=${L.MOVE_GROUPS} value=${group} onChange=${setGroup} wrap=${false} />
    ${list === null ? html`<${Spinner} />` : list.length === 0 ? html`<${Empty} icon="history" text="مفيش حركات" />`
      : html`<div class="card tight">${list.map((m) => html`<${MoveRow} m=${m} key=${m.id} onUndo=${undo} />`)}</div>`}
    ${more && html`<button class="btn ghost" disabled=${busy} onClick=${() => load(false)}>${busy ? 'لحظة...' : 'هات أقدم'}</button>`}
  <//>`;
}
