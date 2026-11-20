// Service Worker — AcadeMax PWA
const CACHE_NAME = 'academax-v3';
const ASSETS = [
  '/', '/index.html', '/login.html', '/style.css', '/app.js', '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).then(res => {
    const clone = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
    return res;
  }).catch(() => caches.match(e.request)));
});
