/* sw.js — بيخلي الابلكيشن يتنزّل على الشاشة الرئيسية (من غير تخزين قديم) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
