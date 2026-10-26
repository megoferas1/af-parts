/* docs.js — كشوفات PDF و Excel واستيكرات الـ QR (من غير سيرفر) */
import { loadScript } from './api.js';
import { loadQrGen, qrDataUrl, qrText } from './qr.js';

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const FONT = 'Tajawal';

async function fontsReady() {
  try {
    await Promise.all([document.fonts.load(`400 24px ${FONT}`), document.fonts.load(`700 24px ${FONT}`), document.fonts.load(`800 24px ${FONT}`)]);
  } catch (e) { /* هيستخدم خط الجهاز */ }
}
const logos = {};
/* لوجو الكشوفات = AF Fabworks الأصلي، ولوجو الاستيكرات = AF Parts */
function loadLogo(src = 'logo-fabworks.png') {
  if (!logos[src]) {
    logos[src] = new Promise((resolve) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = src;
    });
  }
  return logos[src];
}
async function jsPDFCtor() {
  await loadScript(JSPDF);
  return window.jspdf.jsPDF;
}

/* ===================================================================
   كشف PDF: بنرسم الصفحات على Canvas (عشان العربي يطلع مظبوط) ونحطها في PDF
   spec = { dir, title, subtitle, meta: [[k, v]], sections: [{ title, columns: [{ key, label, w, align }], rows, empty }],
            footer, signatures: [label] }
   =================================================================== */
const PW = 1240, PH = 1754, M = 64;
const C = { ink: '#111216', mute: '#6b6f7a', line: '#e3e4e8', red: '#d4060b', head: '#17181c', zebra: '#f6f6f8' };

export async function buildPdf(spec) {
  await fontsReady();
  const logo = await loadLogo();
  const rtl = spec.dir !== 'ltr';
  const pages = [];
  let ctx, y;
  const F = (w, s) => `${w} ${s}px ${FONT}, Tahoma, Arial, sans-serif`;

  const xs = (x) => (rtl ? PW - x : x);              // تحويل الإحداثي للاتجاه
  const align = (a) => (a === 'center' ? 'center' : rtl ? (a === 'end' ? 'left' : 'right') : (a === 'end' ? 'right' : 'left'));

  function newPage(first) {
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH);
    ctx.direction = rtl ? 'rtl' : 'ltr';
    ctx.textBaseline = 'alphabetic';
    pages.push(c);
    y = M;
    if (first) {
      // اللوجو (AF Fabworks) فوق، والعنوان تحته
      if (logo) {
        const lh = 92, lw = lh * (logo.width / logo.height);
        ctx.drawImage(logo, rtl ? PW - M - lw : M, y, lw, lh);
        y += lh + 34;
      }
      ctx.fillStyle = C.ink; ctx.textAlign = rtl ? 'right' : 'left';
      ctx.font = F(800, 44); ctx.fillText(spec.title || '', xs(M), y + 40);
      if (spec.subtitle) {
        ctx.fillStyle = C.mute; ctx.font = F(500, 24);
        ctx.textAlign = rtl ? 'left' : 'right';
        ctx.fillText(spec.subtitle, rtl ? M : PW - M, y + 40);
      }
      y += 66;
      // سطر أحمر
      ctx.fillStyle = C.red; ctx.fillRect(M, y, PW - 2 * M, 5); y += 30;
      // البيانات
      const meta = spec.meta || [];
      const colW = (PW - 2 * M) / 2;
      meta.forEach(([k, v], i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const bx = M + col * colW;
        const yy = y + row * 46 + 30;
        ctx.textAlign = rtl ? 'right' : 'left';
        ctx.fillStyle = C.mute; ctx.font = F(500, 23);
        const kx = rtl ? PW - bx : bx;
        ctx.fillText(k + ':', kx, yy);
        const kw = ctx.measureText(k + ':  ').width;
        ctx.fillStyle = C.ink; ctx.font = F(700, 25);
        ctx.fillText(String(v == null ? '' : v), rtl ? kx - kw : kx + kw, yy);
      });
      y += Math.ceil(meta.length / 2) * 46 + 30;
    } else {
      ctx.fillStyle = C.mute; ctx.font = F(600, 22); ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(spec.title || '', xs(M), y + 22);
      y += 52;
    }
  }

  function wrap(text, maxW, font) {
    ctx.font = font;
    const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines.length = 3; lines[2] += '…'; }
    return lines;
  }

  function tableHeader(cols, widths) {
    const h = 54;
    ctx.fillStyle = C.head; ctx.fillRect(M, y, PW - 2 * M, h);
    ctx.fillStyle = '#fff'; ctx.font = F(700, 22);
    let x = M;
    cols.forEach((c, i) => {
      const w = widths[i];
      ctx.textAlign = align(c.align);
      const tx = c.align === 'center' ? x + w / 2 : (c.align === 'end' ? x + w - 12 : x + 12);
      ctx.fillText(c.label, rtl ? PW - tx : tx, y + 35);
      x += w;
    });
    y += h;
  }

  newPage(true);
  for (const sec of spec.sections || []) {
    if (y + 150 > PH - M - 60) newPage(false);
    // عنوان القسم
    ctx.fillStyle = C.ink; ctx.font = F(800, 30); ctx.textAlign = rtl ? 'right' : 'left';
    ctx.fillText(sec.title || '', xs(M), y + 34);
    if (sec.note) { ctx.fillStyle = C.mute; ctx.font = F(500, 22); const tw = (ctx.font = F(800, 30), ctx.measureText((sec.title || '') + '   ').width); ctx.font = F(500, 22); ctx.fillText(sec.note, xs(M + tw), y + 34); }
    y += 54;
    const cols = sec.columns;
    const totalW = cols.reduce((s, c) => s + (c.w || 1), 0);
    const widths = cols.map((c) => ((c.w || 1) / totalW) * (PW - 2 * M));
    if (!sec.rows || !sec.rows.length) {
      ctx.fillStyle = C.zebra; ctx.fillRect(M, y, PW - 2 * M, 70);
      ctx.fillStyle = C.mute; ctx.font = F(500, 24); ctx.textAlign = 'center';
      ctx.fillText(sec.empty || '—', PW / 2, y + 44);
      y += 100;
      continue;
    }
    tableHeader(cols, widths);
    sec.rows.forEach((row, ri) => {
      const fontRow = F(row._bold ? 700 : 500, 22);
      const cells = cols.map((c, i) => wrap(row[c.key], widths[i] - 24, fontRow));
      const lines = Math.max(...cells.map((l) => l.length));
      const h = Math.max(50, lines * 30 + 20);
      if (y + h > PH - M - 60) { newPage(false); tableHeader(cols, widths); }
      if (ri % 2 === 1) { ctx.fillStyle = C.zebra; ctx.fillRect(M, y, PW - 2 * M, h); }
      ctx.fillStyle = C.line; ctx.fillRect(M, y + h - 1, PW - 2 * M, 1);
      let x = M;
      cols.forEach((c, i) => {
        const w = widths[i];
        ctx.fillStyle = row._tone && c.key === row._toneKey ? row._tone : C.ink;
        ctx.font = fontRow; ctx.textAlign = align(c.align);
        const tx = c.align === 'center' ? x + w / 2 : (c.align === 'end' ? x + w - 12 : x + 12);
        cells[i].forEach((ln, li) => ctx.fillText(ln, rtl ? PW - tx : tx, y + 33 + li * 30));
        x += w;
      });
      y += h;
    });
    if (sec.total) {
      ctx.fillStyle = C.ink; ctx.font = F(800, 24); ctx.textAlign = rtl ? 'left' : 'right';
      ctx.fillText(sec.total, rtl ? M : PW - M, y + 36);
      y += 50;
    }
    y += 34;
  }

  if (spec.signatures && spec.signatures.length) {
    if (y + 170 > PH - M - 60) newPage(false);
    y += 40;
    const n = spec.signatures.length, gap = 60, w = (PW - 2 * M - gap * (n - 1)) / n;
    spec.signatures.forEach((s, i) => {
      const bx = M + i * (w + gap);
      ctx.fillStyle = C.ink; ctx.fillRect(rtl ? PW - bx - w : bx, y + 80, w, 2);
      ctx.fillStyle = C.mute; ctx.font = F(600, 22); ctx.textAlign = 'center';
      ctx.fillText(s, rtl ? PW - bx - w / 2 : bx + w / 2, y + 114);
    });
    y += 140;
  }

  // الفوتر ورقم الصفحة
  pages.forEach((c, i) => {
    const g = c.getContext('2d');
    g.direction = rtl ? 'rtl' : 'ltr';
    g.fillStyle = C.line; g.fillRect(M, PH - M - 30, PW - 2 * M, 2);
    g.fillStyle = C.mute; g.font = F(500, 20);
    g.textAlign = rtl ? 'right' : 'left';
    g.fillText(spec.footer || '', rtl ? PW - M : M, PH - M + 4);
    g.textAlign = rtl ? 'left' : 'right';
    g.fillText(rtl ? `صفحة ${i + 1} من ${pages.length}` : `Page ${i + 1} of ${pages.length}`, rtl ? M : PW - M, PH - M + 4);
  });

  const jsPDF = await jsPDFCtor();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pages.forEach((c, i) => {
    if (i > 0) doc.addPage();
    doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  });
  return doc.output('blob');
}

/* ===================================================================
   Excel (.xlsx) بسيط من غير مكتبات
   sheets = [{ name, rtl, title, meta: [[k, v]], columns: [{ label, w }], rows: [[...]] }]
   =================================================================== */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function sheetXml(sh) {
  const rows = [];
  let r = 0;
  const cell = (ci, v, style) => {
    const ref = colName(ci) + (r + 1);
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  };
  if (sh.title) { rows.push(`<row r="${r + 1}" ht="26" customHeight="1">${cell(0, sh.title, 2)}</row>`); r++; }
  (sh.meta || []).forEach(([k, v]) => { rows.push(`<row r="${r + 1}">${cell(0, k, 4)}${cell(1, v, 0)}</row>`); r++; });
  if (sh.title || (sh.meta || []).length) { r++; }
  const headRow = r + 1;
  rows.push(`<row r="${r + 1}" ht="22" customHeight="1">${sh.columns.map((c, i) => cell(i, c.label, 1)).join('')}</row>`); r++;
  sh.rows.forEach((row) => { rows.push(`<row r="${r + 1}">${row.map((v, i) => cell(i, v, 3)).join('')}</row>`); r++; });
  const cols = sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 14}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"${sh.rtl ? ' rightToLeft="1"' : ''}><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF6B6F7A"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17181C"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9DBE0"/></left><right style="thin"><color rgb="FFD9DBE0"/></right><top style="thin"><color rgb="FFD9DBE0"/></top><bottom style="thin"><color rgb="FFD9DBE0"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

let CRC;
function crc32(buf) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  for (const [name, text] of files) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nameB.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function buildXlsx(sheets) {
  const names = sheets.map((s, i) => (s.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files);
}

/* ===================================================================
   استيكرات QR على ورق A4 (3 × 7 = 21 استيكر، مقاس 63.5 × 38.1 مم)
   labels = [{ code, title, sub }]
   =================================================================== */
const SHEET = { cols: 3, rows: 7, w: 63.5, h: 38.1, left: 7.25, top: 15.15, gapX: 2.5 };
export const PER_PAGE = SHEET.cols * SHEET.rows;

async function labelImage(lab, logo) {
  const W = 750, H = 450; // ~300dpi
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  // QR على الشمال
  const qr = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = qrDataUrl(qrText(lab.code), 400); });
  const qs = 380;
  g.drawImage(qr, 22, (H - qs) / 2, qs, qs);
  // النصوص على اليمين
  const x0 = 22 + qs + 18, x1 = W - 26, tw = x1 - x0;
  g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#111';
  if (logo) {
    const lh = 104, lw = lh * (logo.width / logo.height);
    g.drawImage(logo, x1 - lw, 26, lw, lh);
  }
  g.direction = 'ltr'; g.textAlign = 'center';
  g.font = `800 58px ${FONT}, Arial, sans-serif`;
  g.fillText(lab.code, x0 + tw / 2, 196);
  g.direction = 'rtl'; g.textAlign = 'right';
  const fit = (text, size, weight, yy) => {
    let s = size;
    g.font = `${weight} ${s}px ${FONT}, Tahoma, sans-serif`;
    while (g.measureText(text).width > tw && s > 22) { s -= 2; g.font = `${weight} ${s}px ${FONT}, Tahoma, sans-serif`; }
    let t = text;
    while (g.measureText(t).width > tw && t.length > 2) t = t.slice(0, -2) + '…';
    g.fillText(t, x1, yy);
  };
  if (lab.title) fit(lab.title, 40, 700, 268); else { g.strokeStyle = '#bbb'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, 280); g.lineTo(x1, 280); g.stroke(); }
  if (lab.sub) { g.fillStyle = '#555'; fit(lab.sub, 32, 500, 324); } else if (!lab.title) { g.beginPath(); g.moveTo(x0, 350); g.lineTo(x1, 350); g.stroke(); }
  if (lab.extra) { g.fillStyle = '#555'; fit(lab.extra, 30, 500, 372); }
  return c.toDataURL('image/jpeg', 0.92);
}

export async function buildStickersPdf(labels, onProgress) {
  await Promise.all([fontsReady(), loadQrGen()]);
  const logo = await loadLogo('logo-report.png');
  const jsPDF = await jsPDFCtor();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  for (let i = 0; i < labels.length; i++) {
    const p = i % PER_PAGE;
    if (i > 0 && p === 0) doc.addPage();
    const col = p % SHEET.cols, row = Math.floor(p / SHEET.cols);
    const x = SHEET.left + col * (SHEET.w + SHEET.gapX), y = SHEET.top + row * SHEET.h;
    const img = await labelImage(labels[i], logo);
    doc.addImage(img, 'JPEG', x + 1.2, y + 1.2, SHEET.w - 2.4, SHEET.h - 2.4, undefined, 'FAST');
    if (onProgress) onProgress(i + 1, labels.length);
  }
  return doc.output('blob');
}

export const fileFrom = (blob, name) => new File([blob], name, { type: blob.type });
export const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'AF-Parts';
