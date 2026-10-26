/* admin.js — إعدادات الإدارة: الموظفين، الأنواع، بيانات الشركة */
import { html, useState, useEffect, Icon, Empty, Spinner, Field, Segmented, Sheet, openSheet, toast, confirmBox } from './ui.js';
import { rpcRaw, call, errText } from './api.js';
import { useStore, reload } from './store.js';
import * as L from './lib.js';
import { run } from './items.js';

export function AdminSheet({ close }) {
  const [seg, setSeg] = useState('staff');
  return html`<${Sheet} title="الإعدادات" sub="للإدارة بس" onClose=${close} full>
    <${Segmented} value=${seg} onChange=${setSeg} items=${[['staff', 'الموظفين'], ['cats', 'الأنواع'], ['company', 'بيانات الشركة']]} />
    ${seg === 'staff' && html`<${StaffPanel} />`}
    ${seg === 'cats' && html`<${CatsPanel} />`}
    ${seg === 'company' && html`<${CompanyPanel} />`}
  <//>`;
}

function StaffPanel() {
  const [list, setList] = useState(null);
  const load = () => rpcRaw('public_staff').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  return html`<div class="stack">
    <div class="note info"><${Icon} name="info" size=${18} /><span>كل موظف بيدخل باسمه ورقم سري، وكل حاجة بيعملها بتتسجل باسمه.</span></div>
    <button class="btn" onClick=${() => openSheet(StaffForm, { onDone: load })}><${Icon} name="plus" size=${22} /> موظف جديد</button>
    ${list === null ? html`<${Spinner} />` : list.length === 0 ? html`<${Empty} icon="users" text="لسه مفيش موظفين" />`
      : html`<div class="card tight">${list.map((s) => html`<button class="lrow" key=${s.id} onClick=${() => openSheet(StaffForm, { s, onDone: load })}>
          <span class="avatar sm">${s.name.charAt(0)}</span><span class="grow"><b>${s.name}</b></span><${Icon} name="key" size=${18} /></button>`)}</div>`}
  </div>`;
}

function StaffForm({ s, onDone, close }) {
  const [name, setName] = useState(s ? s.name : '');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) return toast('اكتب الاسم', 'bad');
    if (!s && !/^\d{4,8}$/.test(pin)) return toast('الرقم السري من 4 لـ 8 أرقام', 'bad');
    if (pin && !/^\d{4,8}$/.test(pin)) return toast('الرقم السري من 4 لـ 8 أرقام', 'bad');
    setBusy(true);
    try {
      await rpcRaw('admin_save_staff', { p_id: s ? s.id : null, p_name: name, p_pin: pin || null });
      toast(s ? 'اتحفظ' : `اتضاف — الرقم السري: ${pin}`);
      onDone && onDone(); close();
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  async function remove() {
    if (!(await confirmBox({ title: 'شيل ' + s.name + '؟', text: 'مش هيقدر يدخل تاني، بس كل اللي عمله هيفضل في السجل.', ok: 'شيله', danger: true }))) return;
    try { await rpcRaw('admin_remove_staff', { p_id: s.id }); toast('اتشال'); onDone && onDone(); close(); } catch (e) { toast(errText(e), 'bad'); }
  }
  return html`<${Sheet} title=${s ? s.name : 'موظف جديد'} onClose=${close}
    footer=${html`<div class="stack"><button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
      ${s && html`<button class="btn ghost" onClick=${remove}><${Icon} name="trash" size=${18} /> شيل الموظف</button>`}</div>`}>
    <${Field} label="الاسم" req><input class="input" value=${name} onInput=${(e) => setName(e.target.value)} /><//>
    <${Field} label=${s ? 'رقم سري جديد (سيبه فاضي لو مش عايز تغيّره)' : 'الرقم السري'} req=${!s} hint="من 4 لـ 8 أرقام، ادّيه للموظف">
      <input class="input pin" inputmode="numeric" maxlength="8" value=${pin} onInput=${(e) => setPin(e.target.value.replace(/\D/g, ''))} /><//>
  <//>`;
}

function CatsPanel() {
  const { data } = useStore();
  const [kind, setKind] = useState('part');
  const [nw, setNw] = useState('');
  const list = data.categories.filter((c) => c.kind === kind);
  async function add() {
    if (!nw.trim()) return;
    const r = await run(() => call('add_category', { p_kind: kind, p_name: nw }), 'اتضاف');
    if (r.ok) setNw('');
  }
  async function del(c) {
    if (!(await confirmBox({ title: `مسح "${c.name}"؟`, text: 'الحاجات اللي متسجلة بالنوع ده هتفضل زي ما هي.', ok: 'امسح', danger: true }))) return;
    await run(() => call('delete_category', { p_kind: kind, p_name: c.name }), 'اتمسح');
  }
  return html`<div class="stack">
    <${Segmented} value=${kind} onChange=${setKind} items=${Object.entries(L.KIND).map(([k, v]) => [k, v.plural])} />
    <div class="row gap8"><input class="input" placeholder="نوع جديد" value=${nw} onInput=${(e) => setNw(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') add(); }} />
      <button class="btn sm" style="width:auto;padding:0 20px" onClick=${add}>ضيف</button></div>
    <div class="card tight">${list.map((c) => html`<div class="lrow" key=${c.name}><span class="grow"><b>${c.name}</b></span>
      <button class="iconbtn light" onClick=${() => del(c)} aria-label="مسح"><${Icon} name="trash" size=${17} /></button></div>`)}</div>
  </div>`;
}

function CompanyPanel() {
  const { data } = useStore();
  const [f, setF] = useState({ ...data.settings });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    try { await rpcRaw('admin_save_settings', { p: f }); await reload(); toast('اتحفظ'); } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<div class="stack">
    <div class="note info"><${Icon} name="info" size=${18} /><span>البيانات دي بتظهر في الكشوفات والـ Packing List.</span></div>
    <${Field} label="اسم الشركة (عربي)"><input class="input" value=${f.company_ar} onInput=${(e) => set('company_ar', e.target.value)} /><//>
    <${Field} label="Company name (English)"><input class="input ltr" value=${f.company_en} onInput=${(e) => set('company_en', e.target.value)} /><//>
    <${Field} label="العنوان (عربي)"><input class="input" value=${f.address_ar} onInput=${(e) => set('address_ar', e.target.value)} /><//>
    <${Field} label="Address (English)"><input class="input ltr" value=${f.address_en} onInput=${(e) => set('address_en', e.target.value)} /><//>
    <div class="grid2">
      <${Field} label="التليفون"><input class="input ltr" value=${f.phone} onInput=${(e) => set('phone', e.target.value)} /><//>
      <${Field} label="الإيميل"><input class="input ltr" value=${f.email} onInput=${(e) => set('email', e.target.value)} /><//>
    </div>
    <button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
  </div>`;
}
