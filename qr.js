/* qr.js — رسم الـ QR وقراءته بالكاميرا */
import { html, useState, useEffect, useRef, Icon, toast } from './ui.js?v=8';
import { loadScript } from './api.js?v=8';

const QRGEN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
/* قارئ الكود: نسخة جوه الابلكيشن نفسه، ولو وقعت لأي سبب نجيبه من النت */
const JSQR = ['./jsqr.js', 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js'];

/* الكاميرا الخلفية، ولو الموبايل رفض الإعدادات نطلب أي كاميرا */
async function openCamera() {
  const tries = [
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ];
  let err = null;
  for (const c of tries) {
    try { return await navigator.mediaDevices.getUserMedia(c); }
    catch (e) {
      err = e;
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break; // رفض الإذن: مفيش فايدة نجرب تاني
    }
  }
  throw err || new Error('nocam');
}

/* قارئ الكود: BarcodeDetector لو الموبايل فيه (أسرع)، وإلا jsQR */
async function makeReader() {
  try {
    if ('BarcodeDetector' in window) {
      const f = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : ['qr_code'];
      if (f.includes('qr_code')) {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        return { native: det };
      }
    }
  } catch (e) { /* نكمل بـ jsQR */ }
  await loadScript(JSQR, 'jsQR');
  return { native: null };
}

export const extractCode = (text) => {
  const m = String(text || '').toUpperCase().match(CODE_RE);
  return m ? m[0] : '';
};
/* AF-00016 (استيكر عادي) أو AF-ANG-001-0007 (قطعة تصدير) */
export const CODE_RE = /AF-(?:[A-Z0-9]{1,6}-\d{3,}-\d{4,}|\d{3,})/;
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
  const [state, setState] = useState('starting'); // starting | live | tap | nocam | denied | nolib
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

  const [errName, setErrName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const playRef = useRef(null);

  useEffect(() => {
    let stream = null, timer = null, canvas = null, reader = null, nativeFails = 0, on = true;
    alive.current = true;
    const stop = () => { clearTimeout(timer); if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } };
    const fail = (st, e) => {
      stop();
      if (!on) return;
      setErrName(e ? [e.name, e.message].filter(Boolean).join(': ').slice(0, 90) : '');
      setState(st);
    };
    // لو الابلكيشن راح في الخلفية والكاميرا وقفت، نفتحها تاني لما يرجع
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !stream) return;
      const t = stream.getVideoTracks()[0];
      if (!t || t.readyState === 'ended') setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    setState('starting');
    (async () => {
      // القارئ والكاميرا مع بعض
      const readerP = makeReader().catch((e) => { throw Object.assign(new Error('nolib'), { cause: e }); });
      readerP.catch(() => {});
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('nocam'), { name: 'NoMediaDevices' });
        stream = await openCamera();
      } catch (e) {
        return fail(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'nocam', e);
      }
      if (!on) return stop();
      try { reader = await readerP; } catch (e) { return fail('nolib', e); }
      if (!on) return stop();
      const v = videoRef.current;
      v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.setAttribute('autoplay', '');
      v.muted = true; v.playsInline = true;
      v.srcObject = stream;
      try { await v.play(); setState('live'); }
      catch (e) {
        // الآيفون أحياناً محتاج لمسة عشان يشغّل الفيديو
        playRef.current = async () => { try { await v.play(); setState('live'); } catch (er) { fail('nocam', er); } };
        setState('tap');
      }
      canvas = document.createElement('canvas');
      const tick = async () => {
        if (!on || !stream) return;
        try {
          if (v.readyState >= 2 && v.videoWidth && !busy.current) {
            let raw = '';
            if (reader.native) {
              try {
                const r = await reader.native.detect(v);
                if (r && r[0]) raw = r[0].rawValue;
              } catch (e) {
                if (++nativeFails > 5) { reader = { native: null }; await loadScript(JSQR, 'jsQR'); }
              }
            } else {
              const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w) || 480;
              if (canvas.width !== w) canvas.width = w;
              if (canvas.height !== h) canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              ctx.drawImage(v, 0, 0, w, h);
              const d = ctx.getImageData(0, 0, w, h);
              const r = window.jsQR(d.data, w, h, { inversionAttempts: 'dontInvert' });
              if (r && r.data) raw = r.data;
            }
            if (raw) await handle(raw);
          }
        } catch (e) { /* frame skipped */ }
        timer = setTimeout(tick, 160);
      };
      tick();
    })();
    return () => { on = false; alive.current = false; document.removeEventListener('visibilitychange', onVis); stop(); };
  }, [attempt]);

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
    ${state === 'tap' && html`<div class="scan-msg">
      <button class="btn" onClick=${() => playRef.current && playRef.current()}><${Icon} name="camera" size=${22} /> اضغط هنا تشغّل الكاميرا</button>
    </div>`}
    ${(state === 'nocam' || state === 'denied' || state === 'nolib') && html`<div class="scan-msg">
      <${Icon} name=${state === 'nolib' ? 'alert' : 'camera'} size=${40} />
      <div>${state === 'denied' ? 'الموبايل مش سامح للابلكيشن يستخدم الكاميرا. دوس "جرّب تاني" ولما يسألك اختار السماح. ولو مسألش، افتح إعدادات الموبايل:'
        : state === 'nolib' ? 'مقدرتش أشغّل قارئ الكود. اتأكد إن النت شغال وجرّب تاني.'
        : 'الكاميرا مش راضية تفتح. جرّب تاني، أو صوّر الاستيكر.'}</div>
      ${state === 'denied' && html`<div class="scan-path" dir="ltr">Settings › Safari › Camera › Allow</div>`}
      <div class="scan-btns">
        <button class="btn ghost light" onClick=${() => setAttempt((n) => n + 1)}><${Icon} name="undo" size=${20} /> جرّب تاني</button>
        <label class="btn">صوّر الاستيكر<input type="file" accept="image/*" capture="environment" hidden onChange=${fromPhoto} /></label>
      </div>
      ${errName && html`<div class="scan-err ltr-t">${errName}</div>`}
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
