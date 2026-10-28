/* admin.js — إعدادات الإدارة: الموظفين، الأنواع، بيانات الشركة */
import { html, useState, useEffect, Icon, Empty, Spinner, Field, Segmented, Sheet, Pill, openSheet, toast, confirmBox, NumInput } from './ui.js?v=10';
import { rpcRaw, call, errText } from './api.js?v=10';
import { useStore, reload } from './store.js?v=10';
import * as L from './lib.js?v=10';
import { run } from './items.js?v=10';

export function AdminSheet({ close }) {
  const [seg, setSeg] = useState('staff');
  return html`<${Sheet} title="الإعدادات" sub="للإدارة بس" onClose=${close} full>
    <${Segmented} value=${seg} onChange=${setSeg} items=${[['staff', 'الموظفين'], ['cats', 'الأنواع'], ['company', 'الشركة'], ['invoice', 'الفواتير']]} />
    ${seg === 'staff' && html`<${StaffPanel} />`}
    ${seg === 'cats' && html`<${CatsPanel} />`}
    ${seg === 'company' && html`<${CompanyPanel} />`}
    ${seg === 'invoice' && html`<${InvoicePanel} />`}
  <//>`;
}

function StaffPanel() {
  const [list, setList] = useState(null);
  const load = () => rpcRaw('admin_staff').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  return html`<div class="stack">
    <div class="note info"><${Icon} name="info" size=${18} /><span>كل موظف بيدخل باسمه ورقم سري، وكل حاجة بيعملها بتتسجل باسمه.</span></div>
    <button class="btn" onClick=${() => openSheet(StaffForm, { onDone: load })}><${Icon} name="plus" size=${22} /> موظف جديد</button>
    ${list === null ? html`<${Spinner} />` : list.length === 0 ? html`<${Empty} icon="users" text="لسه مفيش موظفين" />`
      : html`<div class="card tight">${list.map((s) => html`<button class="lrow" key=${s.id} onClick=${() => openSheet(StaffForm, { s, onDone: load })}>
          <span class="avatar sm">${s.name.charAt(0)}</span><span class="grow"><b>${s.name}</b>${s.can_invoice && html`<small>بيعمل فواتير</small>`}</span>
          ${s.can_invoice && html`<${Pill} tone="green">فواتير<//>`}<${Icon} name="key" size=${18} /></button>`)}</div>`}
  </div>`;
}

function StaffForm({ s, onDone, close }) {
  const [name, setName] = useState(s ? s.name : '');
  const [pin, setPin] = useState('');
  const [inv, setInv] = useState(s ? !!s.can_invoice : false);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!name.trim()) return toast('اكتب الاسم', 'bad');
    if (!s && !/^\d{4,8}$/.test(pin)) return toast('الرقم السري من 4 لـ 8 أرقام', 'bad');
    if (pin && !/^\d{4,8}$/.test(pin)) return toast('الرقم السري من 4 لـ 8 أرقام', 'bad');
    setBusy(true);
    try {
      const sid = await rpcRaw('admin_save_staff', { p_id: s ? s.id : null, p_name: name, p_pin: pin || null });
      if (inv !== (s ? !!s.can_invoice : false)) await rpcRaw('admin_set_staff_invoice', { p_id: sid || (s && s.id), p_on: inv });
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
    <label class="check big"><input type="checkbox" checked=${inv} onChange=${(e) => setInv(e.target.checked)} />
      <span><b>يقدر يعمل فواتير</b><small>يشوف الأسعار ويعمل فواتير ويعدّلها (المسح للإدارة بس)</small></span></label>
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

/* إعدادات الفواتير */
function InvoicePanel() {
  const { data } = useStore();
  const [f, setF] = useState({ inv_tax: Number(data.settings.inv_tax || 0), inv_payment: data.settings.inv_payment || '', inv_terms_ar: data.settings.inv_terms_ar || '', inv_terms_en: data.settings.inv_terms_en || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    setBusy(true);
    try { await rpcRaw('admin_save_settings', { p: { ...f, inv_tax: f.inv_tax || 0 } }); await reload(); toast('اتحفظ'); } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  return html`<div class="stack">
    <div class="note info"><${Icon} name="info" size=${18} /><span>دي الحاجات اللي بتتحط لوحدها في كل فاتورة جديدة، وتقدر تغيّرها في الفاتورة نفسها.</span></div>
    <${Field} label="الضريبة الافتراضية %" hint="سيبها 0 لو مفيش ضريبة"><${NumInput} value=${f.inv_tax} onChange=${(v) => set('inv_tax', v)} placeholder="0" /><//>
    <${Field} label="بيانات الدفع (الحساب البنكي)" hint="بتظهر في الفاتورة لو علّمت عليها — مثلاً اسم البنك والـ IBAN والـ SWIFT">
      <textarea class="input ltr" rows="4" value=${f.inv_payment} onInput=${(e) => set('inv_payment', e.target.value)}></textarea><//>
    <${Field} label="الشروط (عربي)"><textarea class="input" rows="2" value=${f.inv_terms_ar} placeholder="مثلاً: الضمان على المصنعية 3 شهور" onInput=${(e) => set('inv_terms_ar', e.target.value)}></textarea><//>
    <${Field} label="Terms (English)"><textarea class="input ltr" rows="2" value=${f.inv_terms_en} placeholder="e.g. Payment due within 14 days." onInput=${(e) => set('inv_terms_en', e.target.value)}></textarea><//>
    <button class="btn bigbtn" disabled=${busy} onClick=${save}>${busy ? 'لحظة...' : 'حفظ'}</button>
  </div>`;
}
