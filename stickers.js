/* stickers.js — طباعة استيكرات الـ QR */
import { html, useState, useEffect, Icon, Sheet, SecTitle, Chips, Spinner, Stepper, Field, toast } from './ui.js?v=11';
import { call, errText, canShareFile, shareFile, downloadFile } from './api.js?v=11';
import { ownerText } from './store.js?v=11';
import { buildStickersPdf, fileFrom, PER_PAGE } from './docs.js?v=11';
import { loadQrGen, qrDataUrl, qrText } from './qr.js?v=11';

export function labelFor(item, idx) {
  return {
    code: item.code,
    title: item.name + (item.size ? ' · ' + item.size : ''),
    sub: item.kind === 'part' ? ownerText(item, idx) : item.kind === 'tool' ? 'عدة الجراش' + (item.category ? ' · ' + item.category : '') : (item.name_en || 'منتج تصدير'),
  };
}

/* استيكر لكل قطعة: القطعة اللي عددها 2 بتطلع مرتين بنفس الكود */
export const labelsByQty = (items, idx) => items.filter((i) => i.code).flatMap((i) => Array.from({ length: Math.max(1, Math.min(i.qty || 1, 50)) }, () => labelFor(i, idx)));

/* جاهز للمشاركة: الملف اتعمل، والزرار بيبعته فوراً (عشان الموبايل يسمح بالمشاركة) */
export function FileReady({ file, text }) {
  const share = canShareFile(file);
  return html`<div class="ready">
    <div class="ready-file"><${Icon} name=${/\.pdf$/i.test(file.name) ? 'file' : 'sheet'} size=${28} /><div class="grow"><b>${file.name}</b><small>${Math.max(1, Math.round(file.size / 1024))} KB</small></div></div>
    ${share && html`<button class="btn bigbtn green" onClick=${() => shareFile(file, text)}><${Icon} name="share" size=${22} /> ابعت (واتساب أو غيره)</button>`}
    <button class=${'btn ' + (share ? 'ghost' : 'bigbtn')} onClick=${() => downloadFile(file)}><${Icon} name="download" size=${20} /> نزّل الملف</button>
  </div>`;
}

/* طباعة استيكرات: copies = يسأل كام نسخة من نفس الكود (قطع السواقين والجراش) — ولو رقم، بيبدأ بيه (عدد القطعة) */
export function StickerSheet({ labels: base, title, copies, close }) {
  const [n, setN] = useState(typeof copies === 'number' ? Math.max(1, Math.min(copies, 63)) : 1);
  const [start, setStart] = useState(0);
  const [file, setFile] = useState(null);
  const [prog, setProg] = useState(null);
  const [pv, setPv] = useState('');
  useEffect(() => { loadQrGen().then(() => base[0] && setPv(qrDataUrl(qrText(base[0].code), 240))).catch(() => {}); }, []);
  const labels = copies && base.length === 1 ? Array.from({ length: n }, () => base[0]) : base;
  const pages = Math.ceil((labels.length + start) / PER_PAGE);
  const reset = (fn) => (v) => { fn(v); setFile(null); };
  async function make() {
    setProg([0, labels.length]);
    try {
      const blob = await buildStickersPdf(labels, (a, b) => setProg([a, b]), start);
      const a = labels[0].code, z = labels[labels.length - 1].code;
      setFile(fileFrom(blob, `AF-Parts-stickers-${a}${z !== a ? '-' + z : labels.length > 1 ? '-x' + labels.length : ''}.pdf`));
    } catch (e) { toast('مقدرتش أجهّز الملف: ' + errText(e), 'bad'); }
    setProg(null);
  }
  const l0 = base[0] || {};
  return html`<${Sheet} title=${title || 'طباعة استيكرات'} sub=${`${labels.length} استيكر · ${pages} ${pages === 1 ? 'ورقة' : 'ورق'} A4`} onClose=${close}>
    <div class="sticker-pv">
      ${pv ? html`<img src=${pv} alt="" />` : html`<div class="spin"></div>`}
      <div class="grow"><img class="sp-logo" src="logo-full.png" alt="" /><b class=${'ltr-t' + (String(l0.code || '').length > 10 ? ' long' : '')}>${l0.code}</b>
        ${l0.title ? html`<span>${l0.title}</span>` : html`<i class="line"></i>`}${l0.sub ? html`<small>${l0.sub}</small>` : html`<i class="line"></i>`}</div>
    </div>
    ${copies && base.length === 1 && html`<${Field} label="كام نسخة من الكود ده؟" hint="مثلاً لو القطعة اتنين، اطبع 2 والزق على كل واحدة">
      <${Stepper} value=${n} min=${1} max=${63} onChange=${reset(setN)} big /><//>`}
    <${Field} label="تبدأ من أنهي مربع في الورقة؟" hint="لو الورقة اتطبع منها قبل كده، دوس على أول مربع فاضي">
      <div class="sheetpick">${Array.from({ length: PER_PAGE }, (_, i) => html`<button type="button" key=${i}
        class=${i < start ? 'used' : i < start + labels.length ? 'fill' : ''} onClick=${() => reset(setStart)(i)}>${i < start ? '' : i < start + labels.length ? '●' : ''}</button>`)}</div><//>
    <div class="note info"><${Icon} name="printer" size=${18} /><span>ورق استيكر A4 فيه <b>21 استيكر (F-21: 64.5 × 40 مم)</b>، واطبع بمقاس <b>100% / Actual size</b>.</span></div>
    ${file ? html`<${FileReady} file=${file} text="استيكرات AF Parts" />`
      : prog ? html`<div class="center-t"><${Spinner} /><div class="soft">بجهّز ${prog[0]} من ${prog[1]}...</div></div>`
        : html`<button class="btn bigbtn" onClick=${make}><${Icon} name="printer" size=${22} /> جهّز ملف الطباعة</button>`}
  <//>`;
}

export function BlankStickersSheet({ close }) {
  const [blank, setBlank] = useState(null);
  const [n, setN] = useState(1);
  const [labels, setLabels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    call('blank_codes', {}).then((r) => setBlank(r || [])).catch((e) => { toast(errText(e), 'bad'); setBlank([]); });
  }, []);
  async function reserve() {
    setBusy(true);
    try {
      const codes = await call('reserve_codes', { p_count: n * PER_PAGE });
      setLabels(codes.map((code) => ({ code })));
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  if (labels) return html`<${StickerSheet} labels=${labels} title="استيكرات فاضية" close=${close} />`;
  const toggle = (c) => setSel((x) => { const y = new Set(x); y.has(c) ? y.delete(c) : y.add(c); return y; });
  /* من كود لكود: بيقارن بالرقم اللي في آخر الكود (AF-00045 = 45) */
  const num = (c) => { const m = String(c).match(/(\d+)\s*$/); return m ? +m[1] : NaN; };
  function markRange() {
    const a = num(from), b = num(to || from);
    if (isNaN(a) || isNaN(b)) return toast('اكتب رقم الكود، زي 45 أو AF-00045', 'bad');
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const hit = blank.filter((c) => num(c) >= lo && num(c) <= hi);
    if (!hit.length) return toast('مفيش أكواد فاضية في النطاق ده', 'bad');
    setSel((x) => new Set([...x, ...hit]));
    toast(`اتعلّم ${hit.length} كود`);
  }
  const picked = blank ? blank.filter((c) => sel.has(c)) : [];
  return html`<${Sheet} title="استيكرات فاضية" sub="اطبعها وسيبها جنبك، وأي حاجة تيجي الزق عليها واحد وامسحه" onClose=${close}>
    <div class="steps">
      <div><b>١</b><span>اطبع الورق ده على ورق استيكر A4.</span></div>
      <div><b>٢</b><span>أول ما حاجة تدخل الجراش، الزق عليها استيكر.</span></div>
      <div><b>٣</b><span>اعمل سكان، والابلكيشن هيفتحلك صفحة التسجيل والكود متكتب.</span></div>
    </div>

    <${SecTitle}>الأكواد الفاضية اللي عندك${blank ? ` (${blank.length})` : ''}<//>
    ${!blank ? html`<${Spinner} />`
      : blank.length === 0 ? html`<div class="note info"><${Icon} name="info" size=${18} /><span>كل الأكواد اللي اتطبعت قبل كده اتسجلت على حاجات. اعمل أكواد جديدة من تحت.</span></div>`
      : html`<div class="note info"><${Icon} name="qr" size=${18} /><span>دي أكواد اتطبعت قبل كده ولسه مش متسجلة على أي قطعة. دوس على اللي عايز تطبعه، أو اكتب من كود لكود.</span></div>
        <div class="grid2 range">
          <${Field} label="من كود"><input class="input ltr" inputmode="numeric" value=${from} placeholder="45" onInput=${(e) => setFrom(e.target.value)} /><//>
          <${Field} label="لحد كود"><input class="input ltr" inputmode="numeric" value=${to} placeholder="60" onInput=${(e) => setTo(e.target.value)} /><//>
        </div>
        <button class="btn ghost sm" onClick=${markRange}><${Icon} name="check" size=${18} /> علّم الأكواد دي</button>
        <div class="row gap8">
          <button class="linkbtn" onClick=${() => setSel(new Set(blank))}>اختار الكل</button>
          <button class="linkbtn" disabled=${!sel.size} onClick=${() => setSel(new Set())}>شيل الكل</button>
        </div>
        <div class="unitgrid">${blank.map((c) => html`<button type="button" class=${'unitchip pick' + (sel.has(c) ? ' on' : '')} key=${c} onClick=${() => toggle(c)}>
          <b class="ltr-t">${c}</b>${sel.has(c) && html`<small>✓</small>`}</button>`)}</div>
        <button class="btn dark" disabled=${!picked.length} onClick=${() => setLabels(picked.map((code) => ({ code })))}><${Icon} name="printer" size=${20} /> ${picked.length ? `اطبع اللي اخترته (${picked.length})` : 'اختار الأكواد الأول'}</button>`}

    <${SecTitle}>أكواد جديدة<//>
    <div class="field"><span class="lbl">كام ورقة؟</span>
      <${Chips} items=${[[1, 'ورقة (21)'], [2, '2 ورق (42)'], [3, '3 ورق (63)'], [5, '5 ورق (105)']]} value=${n} onChange=${setN} /></div>
    <button class="btn" disabled=${busy} onClick=${reserve}>${busy ? 'لحظة...' : html`<${Icon} name="plus" size=${20} /> اعمل ${n * PER_PAGE} كود جديد`}</button>
  <//>`;
}
