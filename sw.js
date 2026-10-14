// Service worker: хранит файлы приложения, чтобы Копилка открывалась без интернета.
// При выпуске новой версии поменяйте VERSION — телефон подтянет свежие файлы.
const VERSION = 'kopilka-v4';
const FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './app.js', './config.js', './util.js', './money.js', './crypto.js', './store.js', './icons.js', './cloud.js',
  './state.js', './entry.js', './home.js', './ops.js', './debts.js', './analytics.js', './settings.js',
  './secret.js', './onboarding.js', './updates.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // курсы, облако — напрямую в сеть
  if (url.pathname.endsWith('/version.json')) return; // проверка обновлений всегда идёт в сеть
  // свои файлы: сначала сеть (чтобы обновления доезжали), без сети — из кэша
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
