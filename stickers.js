/* stickers.js — طباعة استيكرات الـ QR */
import { html, useState, useEffect, Icon, Sheet, Chips, Spinner, toast } from './ui.js';
import { call, errText, canShareFile, shareFile, downloadFile } from './api.js';
import { ownerText } from './store.js';
import { buildStickersPdf, fileFrom, PER_PAGE } from './docs.js';
import { loadQrGen, qrDataUrl, qrText } from './qr.js';

export function labelFor(item, idx) {
  return {
    code: item.code,
    title: item.name + (item.size ? ' · ' + item.size : ''),
    sub: item.kind === 'part' ? ownerText(item, idx) : item.kind === 'tool' ? 'عدة الجراش' + (item.category ? ' · ' + item.category : '') : (item.name_en || 'منتج تصدير'),
  };
}

/* جاهز للمشاركة: الملف اتعمل، والزرار بيبعته فوراً (عشان الموبايل يسمح بالمشاركة) */
export function FileReady({ file, text }) {
  const share = canShareFile(file);
  return html`<div class="ready">
    <div class="ready-file"><${Icon} name=${/\.pdf$/i.test(file.name) ? 'file' : 'sheet'} size=${28} /><div class="grow"><b>${file.name}</b><small>${Math.max(1, Math.round(file.size / 1024))} KB</small></div></div>
    ${share && html`<button class="btn bigbtn green" onClick=${() => shareFile(file, text)}><${Icon} name="share" size=${22} /> ابعت (واتساب أو غيره)</button>`}
    <button class=${'btn ' + (share ? 'ghost' : 'bigbtn')} onClick=${() => downloadFile(file)}><${Icon} name="download" size=${20} /> نزّل الملف</button>
  </div>`;
}

export function StickerSheet({ labels, title, close }) {
  const [file, setFile] = useState(null);
  const [prog, setProg] = useState(null);
  const [pv, setPv] = useState('');
  useEffect(() => { loadQrGen().then(() => labels[0] && setPv(qrDataUrl(qrText(labels[0].code), 240))).catch(() => {}); }, []);
  const pages = Math.ceil(labels.length / PER_PAGE);
  async function make() {
    setProg([0, labels.length]);
    try {
      const blob = await buildStickersPdf(labels, (a, b) => setProg([a, b]));
      setFile(fileFrom(blob, `AF-Parts-stickers-${labels[0].code}${labels.length > 1 ? '-' + labels[labels.length - 1].code : ''}.pdf`));
    } catch (e) { toast('مقدرتش أجهّز الملف: ' + errText(e), 'bad'); }
    setProg(null);
  }
  const l0 = labels[0] || {};
  return html`<${Sheet} title=${title || 'طباعة استيكرات'} sub=${`${labels.length} استيكر · ${pages} ${pages === 1 ? 'ورقة' : 'ورق'} A4`} onClose=${close}>
    <div class="sticker-pv">
      ${pv ? html`<img src=${pv} alt="" />` : html`<div class="spin"></div>`}
      <div class="grow"><img class="sp-logo" src="assets/logo-full.png" alt="" /><b class="ltr-t">${l0.code}</b>
        ${l0.title ? html`<span>${l0.title}</span>` : html`<i class="line"></i>`}${l0.sub ? html`<small>${l0.sub}</small>` : html`<i class="line"></i>`}</div>
    </div>
    <div class="note info"><${Icon} name="printer" size=${18} /><span>استخدم ورق استيكر A4 فيه <b>21 استيكر (63.5 × 38.1 مم)</b>، واطبع بمقاس <b>100% / Actual size</b> مش "Fit to page".</span></div>
    ${file ? html`<${FileReady} file=${file} text="استيكرات AF Parts" />`
      : prog ? html`<div class="center-t"><${Spinner} /><div class="soft">بجهّز ${prog[0]} من ${prog[1]}...</div></div>`
        : html`<button class="btn bigbtn" onClick=${make}><${Icon} name="printer" size=${22} /> جهّز ملف الطباعة</button>`}
  <//>`;
}

export function BlankStickersSheet({ close }) {
  const [n, setN] = useState(1);
  const [labels, setLabels] = useState(null);
  const [busy, setBusy] = useState(false);
  async function reserve() {
    setBusy(true);
    try {
      const codes = await call('reserve_codes', { p_count: n * PER_PAGE });
      setLabels(codes.map((code) => ({ code })));
    } catch (e) { toast(errText(e), 'bad'); }
    setBusy(false);
  }
  if (labels) return html`<${StickerSheet} labels=${labels} title="استيكرات فاضية" close=${close} />`;
  return html`<${Sheet} title="استيكرات فاضية" sub="اطبعها وسيبها جنبك، وأي حاجة تيجي الزق عليها واحد وامسحه" onClose=${close}
    footer=${html`<button class="btn bigbtn" disabled=${busy} onClick=${reserve}>${busy ? 'لحظة...' : `اعمل ${n * PER_PAGE} كود جديد`}</button>`}>
    <div class="steps">
      <div><b>١</b><span>اطبع الورق ده على ورق استيكر A4.</span></div>
      <div><b>٢</b><span>أول ما حاجة تدخل الجراش، الزق عليها استيكر.</span></div>
      <div><b>٣</b><span>اعمل سكان، والابلكيشن هيفتحلك صفحة التسجيل والكود متكتب.</span></div>
    </div>
    <div class="field"><span class="lbl">كام ورقة؟</span>
      <${Chips} items=${[[1, 'ورقة (21)'], [2, '2 ورق (42)'], [3, '3 ورق (63)'], [5, '5 ورق (105)']]} value=${n} onChange=${setN} /></div>
  <//>`;
}
