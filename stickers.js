/* stickers.js — طباعة استيكرات الـ QR */
import { html, useState, useEffect, Icon, Sheet, SecTitle, Chips, Spinner, Stepper, Field, NumInput, openSheet, toast, confirmBox } from './ui.js?v=15';
import { call, errText, canShareFile, shareFile, downloadFile } from './api.js?v=15';
import { ownerText, useStore, reload } from './store.js?v=15';
import { buildStickersPdf, buildSheetTestPdf, getSheet, saveSheet, perPage, SHEET_PRESETS, SHEET_FIELDS, fileFrom } from './docs.js?v=15';
import { loadQrGen, qrDataUrl, qrText } from './qr.js?v=15';

export function labelFor(item, idx) {
  return {
    code: item.code,
    title: item.name + (item.size ? ' · ' + item.size : ''),
    sub: item.kind === 'part' ? ownerText(item, idx) : item.kind === 'tool' ? 'عدة الجراش' + (item.category ? ' · ' + item.category : '') : (item.name_en || 'منتج تصدير'),
  };
}

/* استيكر لكل قطعة: القطعة اللي عددها 2 بتطلع مرتين بنفس الكود */
export const labelsByQty = (items, idx) => items.filter((i) => i.code).flatMap((i) => Array.from({ length: Math.max(1, Math.min(i.qty || 1, 50)) }, () => labelFor(i, idx)));

/* استيكرات قطع كتير: تختار القطع اللي عايزها (وعدد نسخ كل واحدة)، وبعدين تطبع أو تضيف لورقة الطباعة */
export function PickStickersSheet({ items, title, close }) {
  const { idx } = useStore();
  const its = items.filter((i) => i.code);
  const [sel, setSel] = useState(() => new Map());
  const toggle = (i) => setSel((m) => { const n = new Map(m); n.has(i.id) ? n.delete(i.id) : n.set(i.id, Math.max(1, Math.min(i.qty || 1, 50))); return n; });
  const setCopies = (i, v) => setSel((m) => { const n = new Map(m); n.set(i.id, v); return n; });
  const all = its.length > 0 && sel.size === its.length;
  const selectAll = () => setSel(all ? new Map() : new Map(its.map((i) => [i.id, Math.max(1, Math.min(i.qty || 1, 50))])));
  const total = [...sel.values()].reduce((a, b) => a + b, 0);
  function next() {
    const labels = its.filter((i) => sel.has(i.id)).flatMap((i) => Array.from({ length: sel.get(i.id) }, () => labelFor(i, idx)));
    openSheet(StickerSheet, { labels, title });
  }
  return html`<${Sheet} title=${title || 'استيكرات'} sub="اختار القطع اللي عايز تطبع استيكراتها" onClose=${close} full
    footer=${html`<button class="btn bigbtn" disabled=${!sel.size} onClick=${next}><${Icon} name="printer" size=${22} /> ${sel.size ? `كمّل (${sel.size} قطعة · ${total} استيكر)` : 'اختار قطعة الأول'}</button>`}>
    ${its.length === 0 ? html`<div class="note info"><${Icon} name="info" size=${18} /><span>مفيش قطع ليها كود هنا.</span></div>` : html`
      <button class="btn ghost sm" onClick=${selectAll}><${Icon} name=${all ? 'x' : 'check'} size=${18} /> ${all ? 'شيل الكل' : `اختار الكل (${its.length})`}</button>
      <div class="card tight">${its.map((i) => {
        const on = sel.has(i.id);
        return html`<div class=${'pick' + (on ? ' on' : '')} key=${i.id}>
          <button class="pick-main" onClick=${() => toggle(i)}>
            <span class="tick">${on && html`<${Icon} name="check" size=${16} stroke=${3} />`}</span>
            <div class="grow"><div class="irow-title">${i.name}${i.size && html`<span class="size">${i.size}</span>`}</div>
              <div class="irow-sub"><span class="code">${i.code}</span><span>${ownerText(i, idx)}</span><span>عندنا: <b class="num">${i.qty}</b></span></div></div>
          </button>
          ${on && html`<div class="pick-qty"><span class="soft tiny grow">كام استيكر؟</span><${Stepper} value=${sel.get(i.id)} min=${1} max=${63} onChange=${(v) => setCopies(i, v)} /></div>`}
        </div>`;
      })}</div>`}
  <//>`;
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

/* طباعة استيكرات: copies = يسأل كام نسخة من نفس الكود (قطع السواقين والجراش) — ولو رقم، بيبدأ بيه (عدد القطعة) */
export function StickerSheet({ labels: base, title, copies, onPrinted, close }) {
  const [n, setN] = useState(typeof copies === 'number' ? Math.max(1, Math.min(copies, 63)) : 1);
  const [start, setStart] = useState(0);
  const [file, setFile] = useState(null);
  const [prog, setProg] = useState(null);
  const [pv, setPv] = useState('');
  const [sheet, setSheet] = useState(getSheet);
  useEffect(() => { loadQrGen().then(() => base[0] && setPv(qrDataUrl(qrText(base[0].code), 240))).catch(() => {}); }, []);
  const labels = copies && base.length === 1 ? Array.from({ length: n }, () => base[0]) : base;
  const per = perPage(sheet);
  const pages = Math.ceil((labels.length + start) / per);
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
  /* ورقة الطباعة المشتركة: نفس الكود بيتجمع بعدد نسخه */
  async function addToQueue() {
    const m = new Map();
    labels.forEach((l) => { const x = m.get(l.code); if (x) x.copies++; else m.set(l.code, { code: l.code, title: l.title || '', sub: l.sub || '', copies: 1 }); });
    try {
      await call('pq_add', { p_labels: [...m.values()] });
      await reload().catch(() => {});
      toast(`اتضاف ${labels.length} استيكر لورقة الطباعة ✓`);
      close();
    } catch (e) { toast(errText(e), 'bad'); }
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
      <div class="sheetpick" style=${{ gridTemplateColumns: `repeat(${sheet.cols}, 1fr)` }}>${Array.from({ length: per }, (_, i) => html`<button type="button" key=${i}
        class=${i < start ? 'used' : i < start + labels.length ? 'fill' : ''} onClick=${() => reset(setStart)(i)}>${i < start ? '' : i < start + labels.length ? '●' : ''}</button>`)}</div><//>
    <div class="note info"><${Icon} name="printer" size=${18} /><span>ورق استيكر A4 فيه ${per} استيكر، والمقاس المتظبط دلوقتي <b dir="ltr" style="unicode-bidi: isolate">${sheet.w} × ${sheet.h}</b> مم. اطبع بمقاس <b>100% / Actual size</b>.</span></div>
    <button class="btn ghost sm" onClick=${() => openSheet(SheetSetup, { onSaved: (v) => { setSheet(v); setFile(null); } })}><${Icon} name="settings" size=${18} /> الطباعة مش جاية على الاستيكر؟ ظبّط المقاس</button>
    ${!onPrinted && !file && html`<button class="btn ghost" onClick=${addToQueue}><${Icon} name="plus" size=${20} /> ضيف لورقة الطباعة (واطبع بعدين مع غيره)</button>`}
    ${file && onPrinted && html`<button class="btn dark" onClick=${async () => { if (await onPrinted()) close(); }}><${Icon} name="check" size=${20} /> اتطبعت؟ شيلهم من ورقة الطباعة</button>`}
    ${file ? html`<${FileReady} file=${file} text="استيكرات AF Parts" />`
      : prog ? html`<div class="center-t"><${Spinner} /><div class="soft">بجهّز ${prog[0]} من ${prog[1]}...</div></div>`
        : html`<button class="btn bigbtn" onClick=${make}><${Icon} name="printer" size=${22} /> جهّز ملف الطباعة</button>`}
  <//>`;
}

export function BlankStickersSheet({ close }) {
  const per = perPage();
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
      const codes = await call('reserve_codes', { p_count: n * per });
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
      <${Chips} items=${[1, 2, 3, 5].map((k) => [k, `${k === 1 ? 'ورقة' : k + ' ورق'} (${k * per})`])} value=${n} onChange=${setN} /></div>
    <button class="btn" disabled=${busy} onClick=${reserve}>${busy ? 'لحظة...' : html`<${Icon} name="plus" size=${20} /> اعمل ${n * per} كود جديد`}</button>
  <//>`;
}

/* ظبط مقاس ورق الاستيكر: بيتحفظ على الجهاز اللي بيطبع (كل طابعة بتزق شوية) */
export function SheetSetup({ onSaved, close }) {
  const [v, setV] = useState(getSheet);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const put = (k) => (x) => { setV((o) => ({ ...o, [k]: k === 'cols' || k === 'rows' ? Math.max(1, Math.min(12, Math.round(x || 1))) : x == null ? 0 : Math.round(x * 10) / 10 })); setFile(null); };
  const nudge = (k, d) => put(k)(Math.max(0, (v[k] || 0) + d));
  const preset = Object.keys(SHEET_PRESETS).find((k) => SHEET_FIELDS.every((f) => SHEET_PRESETS[k][f] === v[f])) || '';
  async function test() {
    setBusy(true);
    try { setFile(fileFrom(await buildSheetTestPdf(v), 'AF-Parts-test-sheet.pdf')); } catch (e) { toast('مقدرتش أجهّز الورقة: ' + errText(e), 'bad'); }
    setBusy(false);
  }
  function save() { saveSheet(v); toast('اتحفظ المقاس ✓'); if (onSaved) onSaved(v); close(); }
  const num = (k, label) => html`<${Field} label=${label}><${NumInput} value=${v[k]} onChange=${put(k)} /><//>`;
  return html`<${Sheet} title="ظبط مقاس ورق الاستيكر" sub="المقاس ده بيتحفظ على الجهاز ده بس" onClose=${close}
    footer=${html`<button class="btn bigbtn" onClick=${save}><${Icon} name="check" size=${22} /> حفظ المقاس</button>`}>
    <div class="steps">
      <div><b>١</b><span>اطبع «ورقة تجربة» على ورق عادي، بمقاس 100%.</span></div>
      <div><b>٢</b><span>قيس المسطرة اللي في المربع رقم 2: لازم تبقى 5 سم بالظبط. لو أقل، الطابعة بتصغّر، وظبّطها على 100%.</span></div>
      <div><b>٣</b><span>حط الورقة فوق ورق الاستيكر قدام النور، وزق الطباعة بالأسهم لحد ما المربعات تيجي على الاستيكرات.</span></div>
    </div>
    <${Field} label="نوع الورق"><${Chips} items=${Object.keys(SHEET_PRESETS).map((k) => [k, k])} value=${preset} onChange=${(k) => { setV({ ...SHEET_PRESETS[k] }); setFile(null); }} /><//>
    <${SecTitle}>زق الطباعة (1 مم كل دوسة)<//>
    <div class="nudge">
      <button class="btn ghost sm" onClick=${() => nudge('top', -1)}>⬆ لفوق</button>
      <button class="btn ghost sm" onClick=${() => nudge('top', 1)}>⬇ لتحت</button>
      <button class="btn ghost sm" onClick=${() => nudge('left', 1)}>➡ يمين</button>
      <button class="btn ghost sm" onClick=${() => nudge('left', -1)}>⬅ شمال</button>
    </div>
    <${SecTitle}>المقاسات بالمللي (لو قستها بالمسطرة)<//>
    <div class="grid2">
      ${num('w', 'عرض الاستيكر')}${num('h', 'طول الاستيكر')}
      ${num('top', 'من فوق الورقة لأول استيكر')}${num('left', 'من شمال الورقة لأول استيكر')}
      ${num('gapX', 'المسافة بين العواميد')}${num('gapY', 'المسافة بين الصفوف')}
      ${num('cols', 'عدد الاستيكرات بالعرض')}${num('rows', 'عدد الاستيكرات بالطول')}
    </div>
    ${file ? html`<${FileReady} file=${file} text="ورقة تجربة الاستيكرات" />`
      : html`<button class="btn dark" disabled=${busy} onClick=${test}><${Icon} name="printer" size=${20} /> ${busy ? 'لحظة...' : 'اطبع ورقة تجربة'}</button>`}
    <button class="linkbtn" onClick=${() => { setV({ ...SHEET_PRESETS['F-25'] }); setFile(null); }}>رجّع المقاس الأصلي (F-25)</button>
  <//>`;
}

/* ورقة الطباعة: كل اللي اتجمع من أي موبايل، تعدّل النسخ وتطبعهم مرة واحدة */
export function PrintQueueSheet({ close }) {
  const { data } = useStore();
  const q = data.print_queue || [];
  const total = q.reduce((a, x) => a + x.copies, 0);
  const per = perPage();
  async function setCopies(x, n) {
    try { await call('pq_set', { p_id: x.id, p_copies: n }); await reload().catch(() => {}); } catch (e) { toast(errText(e), 'bad'); }
  }
  async function clearAll() {
    if (!(await confirmBox({ title: 'تفضّي ورقة الطباعة؟', text: 'كل الاستيكرات اللي اتجمعت هتتشال (الأكواد نفسها مش بتتمسح).', ok: 'فضّيها', danger: true }))) return;
    try { await call('pq_clear', { p_ids: null }); await reload().catch(() => {}); toast('اتفضّت'); } catch (e) { toast(errText(e), 'bad'); }
  }
  function print() {
    const ids = q.map((x) => x.id);
    const labels = q.flatMap((x) => Array.from({ length: x.copies }, () => ({ code: x.code, title: x.title, sub: x.sub })));
    openSheet(StickerSheet, { labels, title: 'ورقة الطباعة', onPrinted: async () => {
      try { await call('pq_clear', { p_ids: ids }); await reload().catch(() => {}); toast('اتشالوا من ورقة الطباعة ✓'); return true; } catch (e) { toast(errText(e), 'bad'); return false; }
    } });
  }
  return html`<${Sheet} title="ورقة الطباعة" sub=${q.length ? `${total} استيكر · ${Math.ceil(total / per)} ${Math.ceil(total / per) === 1 ? 'ورقة' : 'ورق'}` : 'فاضية'} onClose=${close}
    footer=${q.length > 0 && html`<button class="btn bigbtn" onClick=${print}><${Icon} name="printer" size=${22} /> اطبعهم كلهم (${total})</button>`}>
    ${q.length === 0 ? html`<div class="note info"><${Icon} name="info" size=${18} /><span>لسه مفيش حاجة. من أي قطعة دوس «استيكر» وبعدين «ضيف لورقة الطباعة»، وكل اللي يتجمع يظهر هنا لأي حد فيكم.</span></div>`
      : html`<div class="card tight">${q.map((x) => html`<div class="pqrow" key=${x.id}>
          <div class="grow"><b class="ltr-t">${x.code}</b><small>${[x.title, x.added_by && 'ضافه ' + x.added_by].filter(Boolean).join(' · ')}</small></div>
          <${Stepper} value=${x.copies} min=${1} max=${500} onChange=${(n) => setCopies(x, n)} />
          <button class="pqx" aria-label="شيل" onClick=${() => setCopies(x, 0)}><${Icon} name="x" size=${18} /></button>
        </div>`)}</div>
        <button class="linkbtn danger" onClick=${clearAll}><${Icon} name="trash" size=${15} /> فضّي الورقة كلها</button>`}
  <//>`;
}

/* زرار ورقة الطباعة: ظاهر فوق الشريط اللي تحت طول ما فيها حاجة */
export function PrintQueueFab() {
  const { data } = useStore();
  const q = (data && data.print_queue) || [];
  if (!q.length) return null;
  const total = q.reduce((a, x) => a + x.copies, 0);
  return html`<button class="pqfab" onClick=${() => openSheet(PrintQueueSheet)}><${Icon} name="printer" size=${20} /> ورقة الطباعة <b>${total}</b></button>`;
}
