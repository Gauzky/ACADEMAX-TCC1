// =============================================
// Service Worker — AcadeMax PWA
// Estratégia: cache-first para assets estáticos, network-first para HTML
// =============================================
const CACHE_NAME = 'academax-v17';
const ASSETS = [
  '/',
  '/index.html',
  '/login',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install — pré-cacheia os arquivos principais
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// Activate — limpa caches antigos e toma controle
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — estratégia inteligente
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 1. Nunca intercepta chamadas à API (sempre vai na rede)
  if (url.pathname.startsWith('/api/')) return;

  // 2. Nunca intercepta chamadas do Google OAuth (precisa ir na rede)
  if (url.hostname.includes('accounts.google.com')) return;
  if (url.hostname.includes('googleusercontent.com')) return;

  // 3. Para GET apenas (não interceptar POST/PUT/DELETE)
  if (e.request.method !== 'GET') return;

  // 4. Estratégia para assets estáticos (cache-first)
  if (ASSETS.includes(url.pathname) || url.hostname !== 'academaxx.com.br') {
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 5. Estratégia para HTML (network-first, fallback pro cache)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
  );
});

// Permite atualização automática quando nova versão for publicada
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
