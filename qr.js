/* qr.js — رسم الـ QR وقراءته بالكاميرا */
import { html, useState, useEffect, useRef, Icon, toast } from './ui.js';
import { loadScript } from './api.js';

const QRGEN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
const JSQR = 'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.js';

export const extractCode = (text) => {
  const m = String(text || '').toUpperCase().match(/AF-\d{3,}/);
  return m ? m[0] : '';
};
/* اللي بيتكتب جوه الـ QR: لينك الابلكيشن + الكود (لو اتعمله سكان بكاميرا الموبايل العادية يفتح الابلكيشن) */
export const qrText = (code) => location.origin + location.pathname.replace(/index\.html$/, '') + '#c=' + code;

export async function loadQrGen() { await loadScript(QRGEN, 'qrcode'); }

/* QR كصورة PNG (dataURL) — لازم loadQrGen الأول */
export function qrDataUrl(text, px = 360) {
  const qr = window.qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount(), margin = 2, cell = Math.max(2, Math.floor(px / (n + margin * 2)));
  const size = cell * (n + margin * 2);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
    if (qr.isDark(r, col)) ctx.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
  }
  return c.toDataURL('image/png');
}

/* قراءة QR من صورة (لو الكاميرا المباشرة مش شغالة) */
async function decodeFile(file) {
  await loadScript(JSQR, 'jsQR');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(d.data, c.width, c.height);
    return r ? r.data : '';
  } finally { URL.revokeObjectURL(url); }
}

/*
  شاشة السكان.
  onCode(code) → Promise<{ ok: bool, msg: string, done?: bool }>
  continuous: تفضل مفتوحة بعد كل سكان (للتحميل واللم)
*/
export function ScanSheet({ title, hint, onCode, continuous, close }) {
  const videoRef = useRef(null);
  const [state, setState] = useState('starting'); // starting | live | nocam
  const [last, setLast] = useState(null);
  const [manual, setManual] = useState('');
  const [count, setCount] = useState(0);
  const busy = useRef(false);
  const recent = useRef({});
  const alive = useRef(true);

  async function handle(raw) {
    const code = extractCode(raw);
    if (!code) { setLast({ ok: false, msg: 'ده مش استيكر من استيكراتنا' }); return; }
    const now = Date.now();
    if (recent.current[code] && now - recent.current[code] < 2500) return;
    recent.current[code] = now;
    if (busy.current) return;
    busy.current = true;
    try {
      const r = (await onCode(code)) || { ok: true, msg: code };
      if (!alive.current) return;
      setLast({ ...r, code });
      if (r.ok) setCount((c) => c + 1);
      try { navigator.vibrate && navigator.vibrate(r.ok ? 60 : [40, 60, 40]); } catch (e) { /* ignore */ }
      if (r.done || (!continuous && r.ok)) { alive.current = false; close(); }
    } catch (e) {
      setLast({ ok: false, msg: 'حصلت مشكلة، جرّب تاني' });
    } finally { busy.current = false; }
  }

  useEffect(() => {
    let stream = null, timer = null, detector = null, canvas = null;
    alive.current = true;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!alive.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        v.srcObject = stream; v.setAttribute('playsinline', ''); v.muted = true;
        await v.play();
        setState('live');
        if ('BarcodeDetector' in window) {
          try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
        }
        if (!detector) { await loadScript(JSQR, 'jsQR'); canvas = document.createElement('canvas'); }
        const tick = async () => {
          if (!alive.current) return;
          try {
            if (v.readyState >= 2 && !busy.current) {
              if (detector) {
                const r = await detector.detect(v);
                if (r && r[0]) await handle(r[0].rawValue);
              } else {
                const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(v, 0, 0, w, h);
                const d = ctx.getImageData(0, 0, w, h);
                const r = window.jsQR(d.data, w, h, { inversionAttempts: 'dontInvert' });
                if (r && r.data) await handle(r.data);
              }
            }
          } catch (e) { /* frame skipped */ }
          timer = setTimeout(tick, 180);
        };
        tick();
      } catch (e) {
        if (alive.current) setState('nocam');
      }
    })();
    return () => { alive.current = false; clearTimeout(timer); if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, []);

  async function fromPhoto(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const t = await decodeFile(f);
      if (t) handle(t); else setLast({ ok: false, msg: 'مش قادر أقرا الكود من الصورة، قرّب أكتر' });
    } catch (err) { toast('مقدرتش أقرا الصورة', 'bad'); }
  }
  function submitManual() {
    let c = manual.trim().toUpperCase();
    if (/^\d+$/.test(c)) c = 'AF-' + c.padStart(5, '0');
    if (!c) return;
    setManual('');
    handle(c);
  }

  return html`<div class="scan">
    <video ref=${videoRef} class="scan-video" playsinline muted></video>
    <div class="scan-top">
      <button class="iconbtn" onClick=${close} aria-label="قفل"><${Icon} name="x" size=${24} /></button>
      <div class="grow"><div class="scan-title">${title || 'سكان QR'}</div>${hint && html`<div class="scan-hint">${hint}</div>`}</div>
      ${continuous && html`<div class="scan-count num">${count}</div>`}
    </div>
    ${state === 'live' && html`<div class="scan-frame"><i></i><i></i><i></i><i></i></div>`}
    ${state === 'starting' && html`<div class="scan-msg"><div class="spin light"></div><div>بفتح الكاميرا...</div></div>`}
    ${state === 'nocam' && html`<div class="scan-msg">
      <${Icon} name="camera" size=${40} />
      <div>الكاميرا مش متاحة. اسمح للابلكيشن يستخدم الكاميرا من إعدادات الموبايل، أو صوّر الاستيكر.</div>
      <label class="btn">صوّر الاستيكر<input type="file" accept="image/*" capture="environment" hidden onChange=${fromPhoto} /></label>
    </div>`}
    <div class="scan-bottom">
      ${last && html`<div class=${'scan-result ' + (last.ok ? 'ok' : 'bad')}><${Icon} name=${last.ok ? 'check' : 'alert'} size=${20} /><span>${last.msg}</span></div>`}
      <div class="scan-manual">
        <input class="input ltr" placeholder="أو اكتب الكود: AF-00012" value=${manual} onInput=${(e) => setManual(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') submitManual(); }} />
        <button class="btn sm" onClick=${submitManual}>تم</button>
      </div>
      ${continuous && html`<button class="btn ghost light" onClick=${close}>خلصت</button>`}
    </div>
  </div>`;
}
