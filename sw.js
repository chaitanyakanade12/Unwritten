/* UNWRITTEN service worker: keeps the site working offline.
   Network first (so your edits show up straight away), cache as the fallback. */
const CACHE = 'unwritten-v32'; /* mobile polish */
const FILES = [
  './', 'index.html', 'style.css', 'script.js', 'sync.js', 'firebase-config.js', 'manifest.webmanifest', 'favicon-16.png', 'favicon-32.png', 'icon-192.png', 'icon-512.png',
  'fonts/anton-latin-400-normal.woff2',
  'fonts/kalam-latin-400-normal.woff2', 'fonts/kalam-devanagari-400-normal.woff2',
  'fonts/kalam-latin-700-normal.woff2', 'fonts/kalam-devanagari-700-normal.woff2',
  'fonts/mukta-latin-400-normal.woff2', 'fonts/mukta-devanagari-400-normal.woff2',
  'fonts/mukta-latin-600-normal.woff2', 'fonts/mukta-devanagari-600-normal.woff2',
  'fonts/mukta-latin-800-normal.woff2', 'fonts/mukta-devanagari-800-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
