/* push.js — إشعارات الموبايل (المدير بيبعت لكل موظف شغله وبيسأله خلص إيه) */
import { call } from './api.js?v=23';
import { fnCall } from './assistant.js?v=23';

// مفتاح الإشعارات العام بيتعمل على السيرفر أول مرة ويتحفظ هناك
let VKEY = null;
async function vapidKey() { if (!VKEY) VKEY = (await fnCall({ action: 'vapid' })).key; return VKEY; }

const toU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/* على الآيفون الإشعارات بتشتغل بس لو الابلكيشن متضاف للشاشة الرئيسية */
export function needsInstallOnIOS() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  return ios && !standalone;
}

export async function pushState() {
  if (needsInstallOnIOS()) return 'ios';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch (e) { return 'off'; }
}

async function save(sub) {
  const j = sub.toJSON();
  await call('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* موجود */ }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toU8(await vapidKey()) });
  await save(sub);
}

/* كل ما الابلكيشن يفتح: نربط الجهاز باللي داخل دلوقتي (لو اتغيّر الموظف على نفس الموبايل) */
export async function syncPush() {
  try {
    if ((await pushState()) !== 'on') return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) await save(sub);
  } catch (e) { /* مش مهم */ }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    try { await call('push_unsubscribe', { p_endpoint: sub.endpoint }); } catch (e) { /* ignore */ }
    await sub.unsubscribe();
  }
}
